import * as THREE from 'three';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import {
  MARS_SPIN_LOCK,
  SKYCRANE_START_ALT,
  SURFACE_LANDING,
  SURFACE_ROVER_HANG_START,
  SURFACE_ROVER_HANG_TOUCH,
  TETHER_LENGTH,
} from '../config.js';

gsap.registerPlugin(ScrollTrigger);

// Camera keyframes for the ORBITAL stage (Mars as a globe in space). Each is a
// full camera state; the GSAP timeline interpolates between them with scrub.
// Distances are in world units (MARS_RADIUS = 10), so dist 40 ≈ 4 radii out.
const CAM = {
  hero:     { dist: 40, height: 5,  lookY: 0,   fov: 42 },
  transit:  { dist: 30, height: 2,  lookY: 0,   fov: 42 },
  approach: { dist: 21, height: -3, lookY: 3,   fov: 46 },
};

// Altitude the orbital skycrane sinks to before the dust-haze takes over. It
// NEVER lands on the globe — the low-res planet texture looks bad up close, so
// the haze swaps us to the ground-level surface first (CLAUDE.md).
const ORBIT_MIN_ALT = 1.6;

// Real-time globe spin rate (rad/s) during the intro — a slow, continuous turn
// that runs regardless of scroll and settles when the skycrane arrives.
const MARS_SPIN_RATE = 0.06;

const TWO_PI = Math.PI * 2;

// Reused temporaries so the per-frame camera math allocates nothing.
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const _gp = new THREE.Vector3(); // global camera pos
const _gl = new THREE.Vector3(); // global look target
const _dp = new THREE.Vector3(); // descent camera pos / tether top
const _dl = new THREE.Vector3(); // descent look target / tether bottom
const _fp = new THREE.Vector3(); // final (blended) pos
const _fl = new THREE.Vector3(); // final (blended) look
const _site = new THREE.Vector3();
const _n = new THREE.Vector3();
const _e = new THREE.Vector3();
const _nn = new THREE.Vector3();
const _tp = new THREE.Vector3(); // surface drone camera pos
const _tl = new THREE.Vector3(); // surface drone look target

const lerp = THREE.MathUtils.lerp;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth01 = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)',
).matches;

export class Choreographer {
  constructor(scene) {
    this.scene = scene;
    this.camera = scene.camera;
    this.lookTarget = new THREE.Vector3(0, 0, 0);
    this.reducedMotion = prefersReducedMotion;
    this.hazeEl = document.getElementById('haze');

    // Live camera + sequence state, seeded at the hero keyframe. The scrubbed
    // timeline mutates this object; _applyCamera() reads it every frame.
    //   spin           — Mars rotation (rad), scroll-driven → deterministic site
    //   orbitDescent   — 0..1 orbital skycrane sinks toward the globe limb
    //   haze           — 0..1..0 full-screen butterscotch crossfade
    //   stage          — 0 orbital · 1 surface (flips under the haze peak)
    //   surfaceDescent — 0..1 skycrane lowers the rover on the bridle
    //   touchdown      — 0..1 last ignition → dust → bridle cut → wheels down
    //   flyaway        — 0..1 descent stage climbs away and exits
    //   reveal         — 0..1 camera settles / slow-orbits on the landed rover
    // Accumulated real-time globe spin (rad), advanced each frame during the
    // intro; frozen + eased to the locked orientation once the skycrane shows.
    this._autoSpin = 0;

    this.state = {
      ...CAM.hero,
      orbitDescent: 0,
      haze: 0,
      stage: 0,
      surfaceDescent: 0,
      touchdown: 0,
      flyaway: 0,
      reveal: 0,
    };

    scene.onFrame = (frame) => this._applyCamera(frame);

    if (prefersReducedMotion) {
      this._setupReducedMotion();
    } else {
      this._setupLenis();
      this._setupCameraTimeline();
      this._setupCopyFades();
    }
  }

  _applyFov(fov) {
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  _applyHaze(h) {
    if (this.hazeEl) this.hazeEl.style.opacity = h.toFixed(3);
  }

  _applyCamera(frame) {
    const s = this.state;
    const surface = s.stage >= 0.5;

    // Swap globe↔landscape behind the haze (idempotent; only fires on change).
    this.scene.setStage(surface);
    this._applyHaze(s.haze);

    if (surface) this._applySurface(s, frame);
    else this._applyOrbital(s, frame);
  }

  // ---- ORBITAL stage: Mars globe in space, skycrane approaching -----------
  _applyOrbital(s, frame) {
    const sky = this.scene.skycrane;
    const rover = this.scene.rover;
    const d = s.orbitDescent;

    // Globe spin: a continuous real-time turn during the intro (independent of
    // scroll). Once the skycrane appears (d>0) it eases from wherever it happens
    // to be to the LOCKED site orientation and holds — so the landing stays
    // deterministic (site always ends at MARS_SPIN_LOCK) even though the intro
    // spin is free-running. LOCK + 2πk ≡ LOCK, k chosen for the shortest settle.
    if (d <= 0.001) {
      this._autoSpin += (frame ? frame.dt : 0) * MARS_SPIN_RATE;
      this.scene.mars.setSpin(this._autoSpin);
    } else {
      const target =
        MARS_SPIN_LOCK + TWO_PI * Math.round((this._autoSpin - MARS_SPIN_LOCK) / TWO_PI);
      this.scene.mars.setSpin(lerp(this._autoSpin, target, smooth01(d / 0.25)));
    }

    _gp.set(0, s.height, s.dist);
    _gl.set(0, s.lookY, 0);

    // Surface-only props are never shown against the globe.
    if (rover) rover.group.visible = false;
    if (this.scene.tether) this.scene.tether.setVisible(false);

    if (d <= 0.0005) {
      if (sky) sky.group.visible = false;
      this.camera.position.copy(_gp);
      this.camera.lookAt(_gl);
      this._applyFov(s.fov);
      return;
    }

    // Everything is anchored to the landing site's WORLD position (tilt + locked
    // spin included), so the skycrane targets the same point on every replay.
    if (sky) sky.group.visible = true;
    this.scene.mars.getLandingWorldPosition(_site);

    _n.copy(_site).normalize();
    _e.copy(WORLD_UP).cross(_n);
    if (_e.lengthSq() < 1e-6) _e.set(1, 0, 0);
    _e.normalize();
    _nn.copy(_n).cross(_e).normalize();

    // Hold high while the stage fades in, then descend — so the entrance is a
    // slow drift-in from altitude, not a pop.
    const altT = smooth01((d - 0.25) / 0.75);
    const alt = lerp(SKYCRANE_START_ALT, ORBIT_MIN_ALT, altT);
    if (sky) {
      sky.placeAt(_site, _n, alt);
      // Slide in laterally along the tangent while fading up, so it approaches
      // the site rather than appearing on top of it.
      sky.group.position.addScaledVector(_e, (1 - altT) * 3.5);
      sky.setOpacity(smooth01(d / 0.3));
      // No retro plume against the globe — it's just cruising in up here, and a
      // downward burn while it's tilted over the limb reads wrong. The retros
      // only fire in the surface descent.
      sky.setThrust(0, frame ? frame.elapsed : 0);
    }

    // Site-relative tracking camera, kept above the stage and aimed low so we
    // look DOWN onto the limb (never up at the stage against empty space).
    const eOff = lerp(5.0, 3.4, altT);
    const nOff = lerp(2.6, 2.2, altT);
    const camElev = alt * 0.35 + 7.2;
    _dp
      .copy(_site)
      .addScaledVector(_n, camElev)
      .addScaledVector(_e, eOff)
      .addScaledVector(_nn, nOff);
    _dl.copy(_site).addScaledVector(_n, alt * 0.35);

    // Slower blend from the global framing so the hand-off eases in gradually.
    const bd = smooth01(d / 0.55);
    _fp.lerpVectors(_gp, _dp, bd);
    _fl.lerpVectors(_gl, _dl, bd);

    this.camera.position.copy(_fp);
    this.camera.lookAt(_fl);
    this._applyFov(lerp(s.fov, 50, bd));
  }

  // ---- SURFACE stage: ground-level landscape, bridle descent, touchdown ----
  _applySurface(s, frame) {
    const surf = this.scene.surface;
    const sky = this.scene.skycrane;
    const rover = this.scene.rover;
    const tether = this.scene.tether;
    const elapsed = frame ? frame.elapsed : 0;

    // Landing point on the terrain (world space). The surface is axis-aligned,
    // so the surface normal is world-up and the tangents are world X/Z.
    surf.worldPoint(SURFACE_LANDING.x, SURFACE_LANDING.z, _site);
    _n.copy(WORLD_UP);
    _e.set(1, 0, 0);
    _nn.set(0, 0, 1);

    const sd = smooth01(s.surfaceDescent);
    const td = smooth01(s.touchdown);
    const fly = smooth01(s.flyaway);
    const rv = smooth01(s.reveal);

    // The rover rides down on the bridle, then settles the last bit to the
    // ground at touchdown. The stage always hovers TETHER_LENGTH above it, and
    // climbs sharply away once the cords are cut.
    const hang =
      lerp(SURFACE_ROVER_HANG_START, SURFACE_ROVER_HANG_TOUCH, sd) * (1 - td);
    const craneAlt = hang + TETHER_LENGTH + fly * 42;

    if (sky) {
      sky.group.visible = fly < 0.999;
      sky.placeAt(_site, _n, craneAlt);
      // Retros ramp on final approach, full burn at the last ignition, then a
      // climb burn that cuts as the stage fades out of frame.
      let thrust = smooth01((sd - 0.45) / 0.55) * 0.7;
      if (td > 0.001) thrust = 1; // last ignition
      if (fly > 0.001) thrust = 1 - smooth01((fly - 0.2) / 0.6);
      sky.setThrust(thrust, elapsed);
      sky.setOpacity(1 - smooth01((fly - 0.2) / 0.55));
    }

    // The rover is VISIBLE on the tether the whole way down (the core fix — it
    // is not revealed only at touchdown). It lands in its natural pose and STAYS
    // put; the camera (not the rover) moves in to a front close-up on the reveal.
    if (rover) {
      rover.placeAt(_site, _n);
      rover.group.position.copy(_site).addScaledVector(_n, hang);
      rover.setReveal(1);
    }

    // Bridle: 3 cords + umbilical from the stage underside to the rover deck.
    // Pyro bolts cut it at the moment of touchdown. Endpoints are tuned to the
    // models: the top sits up into the stage belly (not down among the leg
    // nozzles), the bottom on the rover's deck — so the cords read as attached.
    if (tether) {
      const cut = td > 0.02;
      tether.setVisible(!cut);
      if (!cut) {
        _dp.copy(_site).addScaledVector(_n, craneAlt - 0.6); // stage belly
        _dl.copy(_site).addScaledVector(_n, hang + 1.15); // rover deck
        tether.update(_dp, _dl);
      }
    }

    // Dust kicked off the terrain at the last ignition (re-sited to the ground).
    const dust = this.scene.dust;
    if (dust) {
      if (!this._surfaceDustSited) {
        dust.setSite(_site, _n);
        this._surfaceDustSited = true;
      }
      if (td > 0.04 && !this._surfaceBurstFired) {
        dust.fire();
        this._surfaceBurstFired = true;
      } else if (td < 0.02) {
        this._surfaceBurstFired = false; // allow re-fire on scroll-back
      }
    }

    // Drone camera. Two framings, blended by the reveal:
    //  • COLUMN (descent + touchdown): look at the MIDDLE of the tether column
    //    and hold a wide pull-back so BOTH the skycrane (up top) and the rover
    //    (below, on the bridle) stay in frame the whole way down — not just at
    //    touchdown. The look target tracks `hang`, so it follows them down.
    //  • HERO (reveal): swoop down to a low, tight close-up on the rover (the
    //    skycrane has fired its last burn and climbed away by then).
    const colH = hang + 3.6; // mid-column: rover at `hang`, stage ~7 above it
    const R = lerp(14, 4.5, rv);
    const EL = lerp(3.2, 0.85, rv); // low hero angle at the end
    // Angle sweeps from the descent-tracking side around to ~+Z (the rover's
    // front) at a slight 3/4 offset.
    const A = lerp(-0.6 + sd * 0.15, 1.2, rv);
    _tl.copy(_site).addScaledVector(_n, lerp(colH, 1.0, rv));
    _tp
      .copy(_tl)
      .addScaledVector(_e, Math.cos(A) * R)
      .addScaledVector(_nn, Math.sin(A) * R)
      .addScaledVector(_n, EL);

    this.camera.position.copy(_tp);
    this.camera.lookAt(_tl);
    this._applyFov(lerp(52, 46, rv));
  }

  _setupLenis() {
    this.lenis = new Lenis({
      lerp: 0.11,
      wheelMultiplier: 0.9,
      smoothWheel: true,
    });
    this.lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => this.lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  _setupCameraTimeline() {
    const s = this.state;
    // One scrubbed timeline scoped to #story's OWN start/end (avoids the
    // neighbor-trigger early-fire bug called out in CLAUDE.md).
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: '#story',
        start: 'top top',
        end: 'bottom bottom',
        scrub: 1,
      },
    });

    tl
      // Orbital: Mars grows. Its spin is NOT scroll-driven — it turns on a real-
      // time clock (see _applyOrbital), independent of the scrollbar, and settles
      // to the locked orientation once the skycrane appears.
      .to(s, { ...CAM.transit, duration: 1 })
      .to(s, { ...CAM.approach, duration: 1 })
      // Skycrane eases in from far and sinks toward the globe limb over a long
      // stretch of scroll (never lands — see ORBIT_MIN_ALT).
      .to(s, { orbitDescent: 1, duration: 2.4 })
      // Dust-haze whites out, THEN we hard-swap globe→surface underneath it,
      // THEN it clears to reveal the ground-level landscape ("breaking through
      // cloud"). The swap is invisible because haze === 1 across it.
      .to(s, { haze: 1, duration: 0.6 })
      .to(s, { stage: 1, duration: 0.001 })
      .to(s, { haze: 0, duration: 0.6 })
      // Surface: lower the rover on the bridle toward the terrain.
      .to(s, { surfaceDescent: 1, duration: 1.6 })
      // Last ignition: thrust spike, dust burst, bridle cut, wheels down.
      .to(s, { touchdown: 1, duration: 0.7 })
      // Descent stage climbs away and exits — deliberately unhurried so the
      // departure doesn't feel rushed.
      .to(s, { flyaway: 1, duration: 1.35 }, '>-0.1')
      // Rover drives forward on its own terrain as the camera settles.
      .to(s, { reveal: 1, duration: 1.6 }, '<0.35');

    this.cameraTimeline = tl;
  }

  // Per-beat copy visibility. Each beat fades in as it nears viewport center and
  // back out as it leaves, so at most one beat's copy is ever fully opaque
  // (Phase 2 no-overlap criterion). Scoped to each beat's OWN trigger span.
  _setupCopyFades() {
    const beats = gsap.utils.toArray('.beat');
    beats.forEach((beat) => {
      const hasCopy = beat.querySelector('.eyebrow, h1, h2, .lede');
      if (!hasCopy) return;

      ScrollTrigger.create({
        trigger: beat,
        start: 'top bottom',
        end: 'bottom top',
        onUpdate: (self) => {
          const p = self.progress;
          const centered = 1 - Math.abs(p - 0.5) * 2;
          const t = gsap.utils.clamp(0, 1, (centered - 0.32) / 0.46);
          const opacity = t * t * (3 - 2 * t);
          gsap.set(beat.children, {
            opacity,
            y: (1 - opacity) * 24 * (p < 0.5 ? 1 : -1),
          });
        },
      });
    });
  }

  _setupReducedMotion() {
    // No smooth scroll, no scrub. Park at the orbital approach framing and leave
    // all copy visible; the page becomes a plain vertical read.
    Object.assign(this.state, CAM.transit);
    gsap.set('.beat > *', { opacity: 1, y: 0 });
    document.querySelector('.scroll-cue')?.style.setProperty('display', 'none');
  }
}
