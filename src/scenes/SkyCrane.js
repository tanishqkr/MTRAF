import * as THREE from 'three';
import { createGLTFLoader } from './gltf.js';
import { COLORS } from '../config.js';

const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
// ── Flame plume tuning — safe to tweak by eye ──────────────────────────────
// WIDTH / LENGTH: the size of the "rectangle" — plume thickness and how long it
//   gets at full throttle.
const FLAME_WIDTH = 0.4;
const FLAME_LENGTH = 1.05;

// Per-flame POSITION [x, y, z] in the stage's local space — where each plume's
// nozzle sits. Defaults are the four engine nozzles measured off the GLB
// (scripts/probe-skycrane.mjs), so every plume attaches to its thruster. Nudge
// any single one (e.g. raise y, or shift x/z) to line its plume up exactly.
const FLAME_POS = [
  [0.8, -0.72, 1.2], // idx0 — front-right
  [1.13, -0.72, -1.22], // idx1 — back-right
  [-0.4, -0.72, 1.04], // idx2 — front-left
  [-0.91, -0.72, -0.94], // idx3 — back-left
];

// Per-flame lean, in radians, applied as a screen-space sprite rotation. Sprite
// rotation is a 2D SCREEN rotation (not a 3D tilt), so "outward" depends on the
// viewing angle — there is no camera-independent formula that stays correct as
// the shot moves. But the retros are only ever seen during the descent +
// touchdown, where the camera azimuth barely changes, so a fixed value per
// flame (tuned by eye against a REAL descent-camera frame, scripts/flame-
// check.mjs) reads correctly the whole time. Order matches FLAME_POS above.
// Positive swings the plume tip one screen way, negative the other — just tune
// each until all four splay away from the body.
const FLAME_ROT = [-0.28, 0.28, -0.28, 0.28];

// The MARS2020 descent stage ("skycrane"). Loads the GLB, normalizes its scale
// and orientation so its thrusters point along local -Y, and carries its own
// retro-thruster VFX (two additive flame sprites + a glow light) rebuilt in 3D
// from the prototype's 2D two-flame look.
export class SkyCrane {
  constructor() {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.model = null;
    this.ready = false;
    this._targetHeight = 2.4; // world units, roughly a quarter of… tuned to Mars R=10
  }

  async load() {
    const loader = createGLTFLoader();
    const gltf = await loader.loadAsync('/assets/models/skycrane.glb');
    const model = gltf.scene;

    // Normalize: center on origin and scale to a consistent height regardless
    // of the source model's native units.
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    this.nativeSize = size.clone();
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = this._targetHeight / maxDim;
    model.scale.setScalar(scale);
    model.position.sub(center.multiplyScalar(scale));

    // Slightly boost material response so it reads against the dark limb.
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        if (o.material && 'metalness' in o.material) {
          o.material.envMapIntensity = 1.2;
        }
      }
    });

    // Collect materials so the stage can fade out as it flies away.
    this._materials = [];
    model.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material.transparent = true;
        this._materials.push(o.material);
      }
    });

    this.model = model;
    this.group.add(model);

    this._buildThrusters();

    this.ready = true;
    return this;
  }

  _buildThrusters() {
    this.thrusterGroup = new THREE.Group();
    this.group.add(this.thrusterGroup);

    // Four retro plumes, one per engine nozzle (positions in FLAME_POS above).
    //
    // Each plume is a camera-facing SPRITE painted with a soft teardrop texture
    // (see makeFlameTexture): feathered at the throat (no chopped flat top),
    // feathered at the edges (reads as fire, not a solid spike), tapering to a
    // soft point. Additive blending over the sky lets only the hot core glow.
    // The sprite's pivot is its TOP so the plume hangs down from the nozzle.

    // Shared teardrop texture; one material PER flame so each can lean outward
    // independently (SpriteMaterial.rotation is per-material, not per-sprite).
    const flameTex = makeFlameTexture();

    this.flames = [];
    for (let i = 0; i < FLAME_POS.length; i++) {
      const [px, py, pz] = FLAME_POS[i];
      const mat = new THREE.SpriteMaterial({
        map: flameTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
      });
      // Fixed per-flame lean, tuned for the descent/touchdown view (see FLAME_ROT).
      mat.rotation = FLAME_ROT[i] || 0;
      const s = new THREE.Sprite(mat);
      s.center.set(0.5, 1.0); // pivot at TOP-centre: plume hangs down from nozzle
      s.position.set(px, py, pz);
      s.renderOrder = 3;
      this.thrusterGroup.add(s);
      this.flames.push(s);
    }

    // A real light so the plumes actually cast warm glow on the model + ground.
    this.thrustLight = new THREE.PointLight(COLORS.ochre.clone(), 0, 10, 2);
    this.thrustLight.position.set(0, -1.1, 0); // just below the nozzle plane
    this.thrusterGroup.add(this.thrustLight);
  }

  // Place the stage at `altitude` above the surface point `site`, standing up
  // along the surface normal `normal` (both world-space).
  placeAt(site, normal, altitude) {
    this.group.position.copy(site).addScaledVector(normal, altitude);
    _q.setFromUnitVectors(UP, normal);
    this.group.quaternion.copy(_q);
  }

  // opacity: 0..1 — fade the whole stage (used during fly-away).
  setOpacity(opacity) {
    if (!this._materials) return;
    for (const m of this._materials) m.opacity = opacity;
  }

  // thrust: 0..1 — ramps the retro plumes up during final approach. (The lean of
  // each plume is fixed at build time from FLAME_ROT; only size/opacity animate.)
  setThrust(thrust, elapsed = 0) {
    if (!this.ready) return;
    const flicker = 0.82 + 0.18 * Math.sin(elapsed * 34);
    const op = thrust * flicker * 0.9;
    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i];
      f.material.opacity = op;
      // Plume lengthens with throttle; width holds so it stays a slim plume.
      // Per-flame phase so the four flicker independently.
      const h =
        (0.5 + FLAME_LENGTH * thrust) * (0.94 + 0.08 * Math.sin(elapsed * 26 + i));
      f.scale.set(FLAME_WIDTH, h, 1);
    }
    this.thrustLight.intensity = thrust * 7 * flicker;
  }
}

// Soft teardrop plume for the retro sprites: white-hot at the throat fading
// through orange to a deep-red soft point, feathered on every edge so nothing
// reads as a hard line. Built pixel-by-pixel: a vertical alpha envelope (soft
// throat → hot core → soft tip) times a radial half-width falloff (teardrop).
function makeFlameTexture() {
  const W = 96;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1); // 0 throat (top) → 1 tip (bottom)
    let va;
    if (v < 0.12) va = v / 0.12; // soft throat — no chopped flat top
    else if (v < 0.45) va = 1; // hot core
    else va = Math.max(0, 1 - (v - 0.45) / 0.55); // taper to soft point
    // Teardrop: widest just below the throat, narrowing to a point at the tip.
    const hw = 0.5 * (0.35 + 0.65 * (1 - v)) * (0.5 + 0.5 * va);
    let r, g, b;
    if (v < 0.35) {
      const k = v / 0.35;
      r = 255;
      g = 250 - 70 * k;
      b = 210 - 130 * k;
    } else {
      const k = (v - 0.35) / 0.65;
      r = 255 - 30 * k;
      g = 180 - 140 * k;
      b = 80 - 60 * k;
    }
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1) - 0.5;
      const d = hw > 1e-4 ? Math.abs(u) / hw : 2;
      const ha = d >= 1 ? 0 : 1 - d * d; // soft radial falloff
      const idx = (y * W + x) * 4;
      img.data[idx] = r;
      img.data[idx + 1] = g;
      img.data[idx + 2] = b;
      img.data[idx + 3] = Math.round(va * ha * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
