import * as THREE from 'three';
import { ASSETS, MARS_RADIUS, COLORS } from '../config.js';
import { Mars } from './Mars.js';
import { SkyCrane } from './SkyCrane.js';
import { Rover } from './Rover.js';
import { Dust } from './Dust.js';
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
  }

  async load() {
    const loader = new THREE.TextureLoader();
    const load = (url) =>
      new Promise((res, rej) => loader.load(url, res, undefined, rej));

    const [marsColor, milkyWay] = await Promise.all([
      load(ASSETS.marsColor),
      load(ASSETS.starsMilkyWay),
    ]);

    // Starfield background: equirectangular Milky Way map on the scene
    // background (replaces the point-based starfield from the prototype).
    milkyWay.mapping = THREE.EquirectangularReflectionMapping;
    milkyWay.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = milkyWay;
    this.scene.backgroundIntensity = 0.35; // dim so stars read as deep space

    this.mars = new Mars(marsColor);
    this.mars.setSunDirection(this.sunDirection);
    this.scene.add(this.mars.group);

    // Skycrane + rover (both hidden until their beats).
    this.skycrane = new SkyCrane();
    this.rover = new Rover();
    await Promise.all([this.skycrane.load(), this.rover.load()]);
    this.scene.add(this.skycrane.group);
    this.scene.add(this.rover.group);

    // Touchdown dust (three.quarks).
    this.dust = new Dust(this.scene);

    return this;
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
