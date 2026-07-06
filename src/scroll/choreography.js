import * as THREE from 'three';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import {
  MARS_SPIN_LOCK,
  SKYCRANE_START_ALT,
  SKYCRANE_END_ALT,
} from '../config.js';

gsap.registerPlugin(ScrollTrigger);

// Camera keyframes along the scroll journey. Each is a full camera state; the
// GSAP timeline interpolates between them with scrub. Distances are in world
// units (MARS_RADIUS = 10), so e.g. dist 40 ≈ 4 planet radii out.
//
// Story arc (CLAUDE.md): deep space → Mars grows → drop toward the limb to hand
// off to the skycrane descent (Phase 3 continues from the `approach` state).
const CAM = {
  hero:     { dist: 40, height: 5,  lookY: 0,   fov: 42 },
  transit:  { dist: 30, height: 2,  lookY: 0,   fov: 42 },
  approach: { dist: 21, height: -3, lookY: 3,   fov: 46 },
};

// Reused temporaries so the per-frame camera math allocates nothing.
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const _gp = new THREE.Vector3(); // global camera pos
const _gl = new THREE.Vector3(); // global look target
const _dp = new THREE.Vector3(); // descent camera pos
const _dl = new THREE.Vector3(); // descent look target
const _fp = new THREE.Vector3(); // final (blended) pos
const _fl = new THREE.Vector3(); // final (blended) look
const _site = new THREE.Vector3();
const _n = new THREE.Vector3();
const _e = new THREE.Vector3();
const _nn = new THREE.Vector3();
const _tp = new THREE.Vector3(); // top-down camera pos
const _tl = new THREE.Vector3(); // top-down look target

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

    // Live camera state, seeded at the hero keyframe. The timeline mutates this
    // object; applyCamera() reads it every frame. `spin` = Mars rotation (rad),
    // `descent` = 0..1 skycrane descent, `touchdown` = 0..1 touchdown → rover
    // reveal → fly-away → top-down cut.
    this.state = { ...CAM.hero, spin: 0, descent: 0, touchdown: 0 };

    // The scene calls this each rendered frame — apply whatever the scrubbed
    // timeline last wrote into this.state.
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

  _applyCamera(frame) {
    const s = this.state;

    // Mars spin is always scroll-driven (deterministic), never time-driven.
    this.scene.mars.setSpin(s.spin);

    // Global framing: camera on +Z looking at the planet's centre.
    _gp.set(0, s.height, s.dist);
    _gl.set(0, s.lookY, 0);

    const sky = this.scene.skycrane;
    const d = s.descent;

    if (d <= 0.0005) {
      // Pre-descent: simple global framing, skycrane hidden.
      if (sky) sky.group.visible = false;
      this.camera.position.copy(_gp);
      this.camera.lookAt(_gl);
      this._applyFov(s.fov);
      return;
    }

    // --- Descent: everything is anchored to the landing site's WORLD position,
    // which the Mars surface reports directly (tilt + locked spin included), so
    // the skycrane targets the identical point on every replay. ---------------
    if (sky) sky.group.visible = true;
    this.scene.mars.getLandingWorldPosition(_site);

    // Orthonormal basis at the site: N out of the surface, E/Nn tangent.
    _n.copy(_site).normalize();
    _e.copy(WORLD_UP).cross(_n);
    if (_e.lengthSq() < 1e-6) _e.set(1, 0, 0);
    _e.normalize();
    _nn.copy(_n).cross(_e).normalize();

    // Skycrane altitude: hold high while the camera swings in, then descend.
    const altT = smooth01((d - 0.12) / 0.88);
    const alt = THREE.MathUtils.lerp(SKYCRANE_START_ALT, SKYCRANE_END_ALT, altT);
    const td = s.touchdown;
    const elapsed = frame ? frame.elapsed : 0;

    if (sky) {
      if (td <= 0.0005) {
        // Descending: track to the surface, retros ramp up on final approach.
        sky.placeAt(_site, _n, alt);
        sky.setOpacity(1);
        sky.setThrust(smooth01((d - 0.55) / 0.45), elapsed);
      } else {
        // Fly-away: climb and peel off strongly along the tangent (not toward
        // the overhead camera) and fade out EARLY, so it clears the frame before
        // the rover reveal. The stage does NOT stay on the ground (CLAUDE.md).
        const fly = smooth01((td - 0.03) / 0.32);
        sky.placeAt(_site, _n, alt); // resets orientation
        sky.group.position
          .copy(_site)
          .addScaledVector(_n, alt + fly * 4.5)
          .addScaledVector(_e, fly * 9.0);
        sky.setOpacity(1 - smooth01((td - 0.05) / 0.28));
        sky.setThrust(1 - smooth01(td / 0.2), elapsed);
      }
    }

    // Rover: stand it on the exact landing point; reveal once the stage is gone.
    const rover = this.scene.rover;
    if (rover) {
      rover.placeAt(_site, _n);
      rover.setReveal(smooth01((td - 0.38) / 0.5));
    }

    // Dust: anchor to the (deterministic) site once, fire on the touchdown frame.
    const dust = this.scene.dust;
    if (dust) {
      if (!this._dustSited) {
        dust.setSite(_site, _n);
        this._dustSited = true;
      }
      if (td > 0.04 && !this._burstFired) {
        dust.fire();
        this._burstFired = true;
      } else if (td < 0.02) {
        this._burstFired = false; // allow re-fire if scrolled back up
      }
    }

    // Site-relative tracking camera. Kept ABOVE the stage's altitude (camElev >
    // alt) and aimed low, so we look DOWN onto the Martian surface with the
    // stage descending against terrain — never up at it against empty space.
    // It arcs slightly inward and drops as the stage descends (parallax/follow).
    const eOff = THREE.MathUtils.lerp(5.0, 3.4, altT);
    const nOff = THREE.MathUtils.lerp(2.6, 2.2, altT);
    const camElev = alt * 0.35 + 7.2; // well above the stage → steep look-down
    _dp
      .copy(_site)
      .addScaledVector(_n, camElev)
      .addScaledVector(_e, eOff)
      .addScaledVector(_nn, nOff);
    // Aim near the ground just under the descending stage.
    _dl.copy(_site).addScaledVector(_n, alt * 0.35);

    // Blend from the global approach framing into the descent framing over the
    // first third of the descent, so the hand-off reads as a fly-to, not a cut.
    const bd = smooth01(d / 0.35);
    _fp.lerpVectors(_gp, _dp, bd);
    _fl.lerpVectors(_gl, _dl, bd);

    // After touchdown, crane smoothly up to a top-down overhead view. This is an
    // eased transition (smooth01), not a hard jump-cut — Phase 4 criterion. It
    // starts once the stage has flown clear so it doesn't fight the fly-away.
    const topBlend = smooth01((td - 0.42) / 0.55);
    if (topBlend > 0.0001) {
      _tp
        .copy(_site)
        .addScaledVector(_n, 13.0)
        .addScaledVector(_e, 1.4); // slight offset off the exact nadir
      _tl.copy(_site);
      _fp.lerp(_tp, topBlend);
      _fl.lerp(_tl, topBlend);
    }

    this.camera.position.copy(_fp);
    this.camera.lookAt(_fl);
    this._applyFov(THREE.MathUtils.lerp(s.fov, 50, bd));
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
    // One scrubbed timeline scoped to #story's OWN start/end (top top → bottom
    // bottom). This deliberately avoids keying the camera to a *neighboring*
    // section's trigger, which is the early-fire bug called out in CLAUDE.md.
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: '#story',
        start: 'top top',
        end: 'bottom bottom',
        scrub: 1,
      },
    });

    // Mars spins (scroll-driven) toward its locked angle, reaching it exactly as
    // approach ends — so the landing site is fixed before descent begins.
    tl.to(s, { ...CAM.transit, spin: MARS_SPIN_LOCK * 0.6, duration: 1 })
      .to(s, { ...CAM.approach, spin: MARS_SPIN_LOCK, duration: 1 })
      // Descent: base framing + spin held constant; `descent` drives the
      // skycrane and the site-relative camera in _applyCamera().
      .to(s, { descent: 1, duration: 1.4 })
      // Touchdown: dust burst, skycrane fly-away, rover reveal, and the eased
      // crane up to the top-down view (all derived from `touchdown`).
      .to(s, { touchdown: 1, duration: 1.5 });

    this.cameraTimeline = tl;
  }

  // Per-beat copy visibility. Each beat fades in as it approaches viewport
  // center and back out as it leaves — so at most one beat's copy is ever fully
  // opaque, guaranteeing no overlap at any scroll position (Phase 2 criterion).
  // Scoped to each beat's OWN trigger span (top bottom → bottom top).
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
          // How centered this beat is: 1 when its middle crosses the viewport
          // middle, 0 at the extremes of its travel.
          const p = self.progress; // 0..1 across the beat's full travel
          const centered = 1 - Math.abs(p - 0.5) * 2; // peak at p=0.5

          // Remap through a narrow smoothstep so a beat is only near-opaque
          // while it genuinely owns the frame. At a crossover both neighbours
          // sit at centered≈0.5 → opacity≈0.34, i.e. a real crossfade rather
          // than two headlines competing (Phase 2 no-overlap criterion).
          const t = gsap.utils.clamp(0, 1, (centered - 0.32) / 0.46);
          const opacity = t * t * (3 - 2 * t); // smoothstep
          gsap.set(beat.children, {
            opacity,
            // subtle lift as copy settles into / leaves frame
            y: (1 - opacity) * 24 * (p < 0.5 ? 1 : -1),
          });
        },
      });
    });
  }

  _setupReducedMotion() {
    // No smooth scroll, no scrub. Park the camera at the approach framing and
    // leave all copy visible; the page becomes a plain vertical read.
    Object.assign(this.state, CAM.transit);
    gsap.set('.beat > *', { opacity: 1, y: 0 });
    document.querySelector('.scroll-cue')?.style.setProperty('display', 'none');
  }
}
