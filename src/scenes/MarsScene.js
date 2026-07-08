import * as THREE from 'three';
import {
  ASSETS,
  MARS_RADIUS,
  COLORS,
  SKY,
  SURFACE_FOG_DENSITY,
  SURFACE_DTM,
} from '../config.js';
import { Mars } from './Mars.js';
import { SkyCrane } from './SkyCrane.js';
import { Rover } from './Rover.js';
import { Dust } from './Dust.js';
import { Surface, sampleDTMHeightfield } from './Surface.js';
import { Tether } from './Tether.js';
import { createGLTFLoader } from './gltf.js';
import { isMobile } from '../util/device.js';

// Owns the renderer, camera, lighting, starfield and the planet. Exposes a
// render loop and a hook (onFrame) for scroll-driven choreography added in
// later phases.
export class MarsScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.onFrame = null; // set by the choreographer (Phase 2+)

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    // Cap DPR lower on phones — fewer fragments to shade at their high native
    // pixel ratios, which is where the fill cost actually hurts.
    this._maxDpr = isMobile() ? 1.5 : 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this._maxDpr));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      42,
      window.innerWidth / window.innerHeight,
      0.1,
      2000,
    );
    // Phase 1 framing: pulled back, looking at the planet from a low angle so
    // the terminator and limb haze are both visible.
    this.camera.position.set(0, 4, MARS_RADIUS * 3.1);
    this.camera.lookAt(0, 0, 0);

    this._buildLights();

    window.addEventListener('resize', () => this._onResize());
  }

  _buildLights() {
    // Sun: one strong directional key. Low ambient so the day/night terminator
    // stays visible (the first prototype washed this out — don't repeat that).
    this.sunDirection = new THREE.Vector3(1, 0.15, 0.6).normalize();

    this.sun = new THREE.DirectionalLight('#FFF3E6', 3.4);
    this.sun.position.copy(this.sunDirection).multiplyScalar(50);
    this.scene.add(this.sun);

    // Very low fill so the night side isn't pure black but stays clearly dark.
    this.ambient = new THREE.AmbientLight(COLORS.rust.clone(), 0.06);
    this.scene.add(this.ambient);

    // A faint cool bounce from the starfield side, keeps the dark limb readable.
    this.rim = new THREE.DirectionalLight(COLORS.signal.clone(), 0.12);
    this.rim.position.set(-40, -10, -30);
    this.scene.add(this.rim);

    // Orbital lights we toggle off once we're on the ground.
    this._orbitalLights = [this.sun, this.ambient, this.rim];

    // --- Surface-stage lighting (off until the ground swap) --------------
    // Warm high sun for the butterscotch daytime look, plus a sky-tinted
    // hemisphere fill so shadowed dune faces stay readable (not crushed black
    // like the orbital night side).
    this.surfaceSun = new THREE.DirectionalLight('#FFE9CE', 3.0);
    this.surfaceSun.position.set(30, 60, 20);
    this.surfaceSun.visible = false;
    this.scene.add(this.surfaceSun);

    this.surfaceFill = new THREE.HemisphereLight(
      SKY.horizon.clone(), // sky term: warm tan from above
      COLORS.rust.clone(), // ground term: rust bounce from below
      0.9,
    );
    this.surfaceFill.visible = false;
    this.scene.add(this.surfaceFill);

    this._surfaceLights = [this.surfaceSun, this.surfaceFill];
  }

  async load() {
    const loader = new THREE.TextureLoader();
    const load = (url) =>
      new Promise((res, rej) => loader.load(url, res, undefined, rej));

    const [marsColor, milkyWay, groundColor, groundNormal, groundRough] =
      await Promise.all([
        load(ASSETS.marsColor),
        load(ASSETS.starsMilkyWay),
        load(ASSETS.marsGround.color),
        load(ASSETS.marsGround.normal),
        load(ASSETS.marsGround.roughness),
      ]);

    // Tile the ground PBR set across the terrain. ~14-unit tiles (terrain is
    // SURFACE_SIZE units, rover ~1.7) so detail reads at ground level; high
    // anisotropy keeps it sharp at the grazing "drone" angle.
    const REPEAT = 44;
    for (const t of [groundColor, groundNormal, groundRough]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(REPEAT, REPEAT);
      t.anisotropy = 8;
    }
    groundColor.colorSpace = THREE.SRGBColorSpace;

    // Bake the real Jezero CTX DTM into a heightfield the surface will use for
    // its terrain shape (rover/rocks/camera all read the same heightAt). If the
    // DTM fails to load, heightData stays null and Surface uses procedural dunes.
    let heightData = null;
    try {
      const gltf = await createGLTFLoader().loadAsync(ASSETS.jezeroDtm);
      heightData = sampleDTMHeightfield(gltf.scene, THREE, SURFACE_DTM);
    } catch (e) {
      console.warn('Jezero DTM load failed; using procedural terrain.', e);
    }

    // Starfield background: equirectangular Milky Way map on the scene
    // background (replaces the point-based starfield from the prototype).
    milkyWay.mapping = THREE.EquirectangularReflectionMapping;
    milkyWay.colorSpace = THREE.SRGBColorSpace;
    this.milkyWay = milkyWay; // kept so setStage() can restore it after the swap
    this.scene.background = milkyWay;
    this.scene.backgroundIntensity = 0.35; // dim so stars read as deep space

    this.mars = new Mars(marsColor);
    this.mars.setSunDirection(this.sunDirection);
    this.scene.add(this.mars.group);

    // Ground-level Martian landscape (Phase 8 surface stage). Hidden until the
    // dust-haze swap; lives far below the globe so the two never interact.
    this.surface = new Surface({
      color: groundColor,
      normal: groundNormal,
      roughness: groundRough,
      heightData,
    });
    this.scene.add(this.surface.group);

    // Skycrane + rover (both hidden until their beats).
    this.skycrane = new SkyCrane();
    this.rover = new Rover();
    await Promise.all([this.skycrane.load(), this.rover.load()]);
    this.scene.add(this.skycrane.group);
    this.scene.add(this.rover.group);

    // Bridle tether (3 cords + umbilical) — the rover hangs from it on the way
    // down. Hidden until the surface descent.
    this.tether = new Tether();
    this.tether.setVisible(false);
    this.scene.add(this.tether.group);

    // Solid butterscotch sky colour + fog for the ground stage, created once and
    // swapped in by setStage() (kept null on the orbital scene).
    this._surfaceBackground = SKY.zenith.clone();
    this._surfaceFog = new THREE.FogExp2(SKY.fog.clone(), SURFACE_FOG_DENSITY);

    // Touchdown dust (three.quarks).
    this.dust = new Dust(this.scene);

    this._stageIsSurface = false;

    return this;
  }

  // Hard swap between the orbital globe and the ground-level surface, hidden by
  // the choreographer's full-screen dust-haze. Idempotent + guarded so it only
  // does the work on an actual transition, not every frame (CLAUDE.md: two
  // stages, swapped behind the haze — never a continuous fly-down).
  setStage(surface) {
    if (surface === this._stageIsSurface) return;
    this._stageIsSurface = surface;

    // Planet + starfield off on the ground; landscape + fog + warm sun on.
    if (this.mars) this.mars.group.visible = !surface;
    if (this.surface) this.surface.setVisible(surface);

    this.scene.background = surface ? this._surfaceBackground : this.milkyWay;
    this.scene.fog = surface ? this._surfaceFog : null;

    for (const l of this._orbitalLights) l.visible = !surface;
    for (const l of this._surfaceLights) l.visible = surface;
  }

  start() {
    this.renderer.setAnimationLoop(() => this._tick());
  }

  // Reduced-motion path: the scene never animates, so draw it a couple of times
  // (to settle the camera + atmosphere uniforms) and then stop — no reason to
  // burn a 60fps render loop on a static image.
  renderStatic() {
    this._tick();
    this._tick();
  }

  _tick() {
    const dt = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();

    // Apply scroll-driven camera first so the atmosphere Fresnel reads the
    // up-to-date camera position this same frame.
    if (this.onFrame) this.onFrame({ dt, elapsed });
    if (this.mars) this.mars.update(dt, this.camera.position);
    if (this.dust) this.dust.update(dt);

    this.renderer.render(this.scene, this.camera);
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this._maxDpr));
  }
}
