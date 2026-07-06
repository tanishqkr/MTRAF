// Shared scene constants. Kept in one place so camera choreography and object
// placement agree on units.

import * as THREE from 'three';

export const ASSETS = {
  marsColor: '/assets/textures/8k_mars.jpg',
  stars: '/assets/textures/8k_stars.jpg',
  starsMilkyWay: '/assets/textures/8k_stars_milky_way.jpg',
  perseverance: '/assets/models/perseverance.glb',
  skycrane: '/assets/models/skycrane.glb',
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

// Skycrane hover height above the landing point on the terrain, and how far the
// rover is lowered beneath the stage on the bridle (scaled real 7.5 m tether).
export const SURFACE_HOVER_START = 14; // stage height when the surface fades in
export const SURFACE_HOVER_END = 4.2; // stage height at the moment of touchdown
export const TETHER_LENGTH = 3.0; // rover hang distance below the stage

// Martian daytime sky: butterscotch/tan (pink-red only near sunrise/sunset).
export const SKY = {
  horizon: new THREE.Color('#E8B27C'), // warm dusty tan at the horizon
  zenith: new THREE.Color('#B5744A'), // darker rust-tan overhead
  fog: new THREE.Color('#D89A6A'), // haze/fog + the dust-transition overlay
  sun: new THREE.Color('#FFE9CE'),
};
