// Shared scene constants. Kept in one place so camera choreography and object
// placement agree on units.

import * as THREE from 'three';

export const ASSETS = {
  marsColor: '/assets/textures/8k_mars.jpg',
  stars: '/assets/textures/8k_stars.jpg',
  starsMilkyWay: '/assets/textures/8k_stars_milky_way.jpg',
  perseverance: '/assets/models/perseverance.glb',
  skycrane: '/assets/models/skycrane.glb',
  // Real Jezero Crater terrain (CTX camera DTM, martinjpratt, CC-BY — see
  // CREDITS.md). Its elevation is baked into the surface heightfield so the
  // ground has real Martian relief; the grayscale CTX image is NOT used (we keep
  // the Rock029 PBR colour + butterscotch fog).
  jezeroDtm: '/assets/models/jezero_crater_ctx_dtm.glb',
  // Ground-stage PBR material (ambientCG Rock 029, CC0). Tiled across the
  // surface terrain — see CREDITS.md.
  marsGround: {
    color: '/assets/textures/mars_ground/Rock029_2K-JPG_Color.jpg',
    normal: '/assets/textures/mars_ground/Rock029_2K-JPG_NormalGL.jpg',
    roughness: '/assets/textures/mars_ground/Rock029_2K-JPG_Roughness.jpg',
  },
};

// Mars radius in world units. Everything else is expressed relative to this.
export const MARS_RADIUS = 10;

// Atmosphere shell sits just above the surface.
export const ATMO_RADIUS = MARS_RADIUS * 1.028;

// Palette (mirrors the CSS design tokens in src/styles/tokens.css).
export const COLORS = {
  void: new THREE.Color('#05040A'),
  rust: new THREE.Color('#C1440E'),
  ochre: new THREE.Color('#E3B23C'),
  signal: new THREE.Color('#4CE0D2'),
  bone: new THREE.Color('#F2EFE9'),
};

// Landing target — roughly Jezero Crater (18.44°N, 77.45°E), where Perseverance
// actually set down. Used by the descent sequence in Phase 3.
export const LANDING_SITE = { latDeg: 18.44, lonDeg: 77.45 };

// Mars spin (radians) locked in by the time descent begins, chosen so the
// landing site sits on the lit, camera-facing side for the descent handoff.
// Scroll-driven (never time-driven) so the site is deterministic every replay.
export const MARS_SPIN_LOCK = 0.22;

// Skycrane descent altitudes above the surface, in world units. Kept modest
// relative to MARS_RADIUS (10) so the stage always reads as hovering just above
// the surface, never detached in space.
export const SKYCRANE_START_ALT = 5.0;
export const SKYCRANE_END_ALT = 0.4;

// ---------------------------------------------------------------------------
// Surface stage (Phase 8). A ground-level Martian landscape lives FAR below the
// orbital globe so the two never interact; the camera + models teleport here
// during the dust-haze transition. Everything below is in world units where the
// rover is ~0.9 tall.
// ---------------------------------------------------------------------------
export const SURFACE_ORIGIN = new THREE.Vector3(0, -2000, 0);
export const SURFACE_SIZE = 600; // terrain plane extent (fog hides the edges)

// The landing point on the terrain, in Surface local coords (heightAt is sampled
// here). Kept at the terrain centre so the rock cluster + camera framing agree.
export const SURFACE_LANDING = { x: 0, z: 0 };

// Rover hang height above the ground (world units) across the surface descent:
// starts high on the bridle, ends just above the dirt, then touchdown eases it
// the final bit down to 0 (wheels on the ground).
export const SURFACE_ROVER_HANG_START = 8.5;
export const SURFACE_ROVER_HANG_TOUCH = 0.15;

// The bridle length: gap between the skycrane's origin and the rover's origin.
// Must be big enough to clear BOTH models (skycrane ~2.4 tall, rover ~2.3 tall)
// AND leave a visible span of cord between them — otherwise the stage sits right
// on top of the rover and the tether vanishes.
export const TETHER_LENGTH = 5.6;

// Exponential fog for the ground stage — thick enough to hide the terrain edge
// and sell the dusty butterscotch air, thin enough to see the landing.
export const SURFACE_FOG_DENSITY = 0.0052;

// How the real Jezero DTM is baked into the surface heightfield. A square-ish
// region of the DTM (local model units) is cropped and mapped onto the terrain:
//   cx, cz         — crop centre in DTM local X/Z (the landing site sits here)
//   halfX, halfZ   — half-extents of the crop (DTM units); unequal = mild stretch
//   relief         — total vertical relief in WORLD units (vertical exaggeration)
//   gridN          — resolution of the baked heightmap grid
//   yawDeg         — rotate the crop so the highest terrain faces the camera
// Tunable by eye against screenshots (scripts/descent.mjs / reveal-shot.mjs).
export const SURFACE_DTM = {
  cx: 0.0,
  cz: 0.5,
  halfX: 1.6,
  halfZ: 2.2,
  relief: 45,
  gridN: 128,
  yawDeg: 0,
};

// Martian daytime sky: butterscotch/tan (pink-red only near sunrise/sunset).
export const SKY = {
  horizon: new THREE.Color('#E8B27C'), // warm dusty tan at the horizon
  zenith: new THREE.Color('#B5744A'), // darker rust-tan overhead
  fog: new THREE.Color('#D89A6A'), // haze/fog + the dust-transition overlay
  sun: new THREE.Color('#FFE9CE'),
};
