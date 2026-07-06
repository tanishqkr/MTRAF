import * as THREE from 'three';
import { createGLTFLoader } from './gltf.js';
import { COLORS } from '../config.js';

const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();

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

    const flameTex = makeFlameTexture();
    const half = this._targetHeight * 0.5;

    // Two canted retro plumes below the stage (matches the real descent
    // engines' outward cant and the prototype's two-flame motif).
    this.flames = [];
    for (const dx of [-0.28, 0.28]) {
      const mat = new THREE.SpriteMaterial({
        map: flameTex,
        color: COLORS.ochre.clone(),
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      });
      const flame = new THREE.Sprite(mat);
      flame.scale.set(0.5, 1.1, 1);
      flame.position.set(dx, -half - 0.35, 0);
      this.thrusterGroup.add(flame);
      this.flames.push(flame);
    }

    // A real light so the plume actually casts warm glow on the model + ground.
    this.thrustLight = new THREE.PointLight(COLORS.ochre.clone(), 0, 8, 2);
    this.thrustLight.position.set(0, -half - 0.5, 0);
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

  // thrust: 0..1 — ramps the retro plumes up during final approach.
  setThrust(thrust, elapsed = 0) {
    if (!this.ready) return;
    const flicker = 0.85 + 0.15 * Math.sin(elapsed * 40);
    for (const f of this.flames) {
      f.material.opacity = thrust * flicker;
      f.scale.y = 1.1 * (0.7 + 0.5 * thrust);
    }
    this.thrustLight.intensity = thrust * 6 * flicker;
  }
}

// Small radial-gradient sprite texture for a soft plume (no external asset).
function makeFlameTexture() {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,220,150,0.9)');
  g.addColorStop(0.6, 'rgba(225,120,40,0.35)');
  g.addColorStop(1.0, 'rgba(120,40,10,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
