import * as THREE from 'three';
import { MARS_RADIUS, ATMO_RADIUS, COLORS, LANDING_SITE } from '../config.js';
import {
  atmosphereVertexShader,
  atmosphereFragmentShader,
} from '../shaders/atmosphere.js';
import { isMobile, downsampleTexture } from '../util/device.js';

// The planet: a real image-textured sphere (no procedural noise — see CLAUDE.md)
// plus a separate back-face additive Fresnel atmosphere shell for soft haze.
export class Mars {
  constructor(marsColorTexture) {
    this.group = new THREE.Group();

    // --- Surface ---------------------------------------------------------
    marsColorTexture.colorSpace = THREE.SRGBColorSpace;
    marsColorTexture.anisotropy = 8;
    // The equirectangular map wraps seamlessly by construction; keep default
    // wrapping and let the sphere UVs meet at the back.
    marsColorTexture.wrapS = THREE.RepeatWrapping;

    // Perf pass: the 8K map is ~128MB of GPU memory. Phones can't afford that,
    // so downsample to 2K there (desktop keeps the full 8K).
    const mobile = isMobile();
    if (mobile) {
      marsColorTexture = downsampleTexture(THREE, marsColorTexture, 2048);
    }

    // 256² was overkill for a smooth sphere at this scale; 144² (mobile 96²)
    // reads identically at a fraction of the triangles.
    const seg = mobile ? 96 : 144;
    const geometry = new THREE.SphereGeometry(MARS_RADIUS, seg, seg);
    const material = new THREE.MeshStandardMaterial({
      map: marsColorTexture,
      roughness: 0.95,
      metalness: 0.0,
      // A touch of the map as a bump source gives the terminator some grit
      // without a dedicated normal map.
      bumpMap: marsColorTexture,
      bumpScale: 0.6,
    });
    this.surface = new THREE.Mesh(geometry, material);
    // Tip Mars' axis slightly for a more dimensional read.
    this.surface.rotation.z = THREE.MathUtils.degToRad(25.19);
    this.group.add(this.surface);

    // --- Atmosphere shell -----------------------------------------------
    const atmoGeometry = new THREE.SphereGeometry(ATMO_RADIUS, 96, 96);
    this.atmosphereMaterial = new THREE.ShaderMaterial({
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      uniforms: {
        uColorInner: { value: COLORS.ochre.clone() },
        uColorOuter: { value: COLORS.rust.clone() },
        uSunDirection: { value: new THREE.Vector3(1, 0.15, 0.6).normalize() },
        uPower: { value: 4.2 },
        uIntensity: { value: 1.15 },
        uCameraPos: { value: new THREE.Vector3() },
      },
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.atmosphere = new THREE.Mesh(atmoGeometry, this.atmosphereMaterial);
    this.group.add(this.atmosphere);

    // --- Landing anchor --------------------------------------------------
    // An empty parented to the SURFACE mesh at the landing lat/lon, so it
    // inherits Mars' axial tilt AND scroll-driven spin. We read its world
    // position each frame rather than recomputing trig — that guarantees the
    // skycrane targets exactly the same surface point on every replay.
    const local = latLonToVector3(
      LANDING_SITE.latDeg,
      LANDING_SITE.lonDeg,
      MARS_RADIUS,
    );
    this.landingAnchor = new THREE.Object3D();
    this.landingAnchor.position.copy(local);
    this.surface.add(this.landingAnchor);
  }

  // World-space position of the landing site (includes tilt + current spin).
  getLandingWorldPosition(target) {
    return this.landingAnchor.getWorldPosition(target);
  }

  // Deterministic scroll-driven spin (radians about Mars' local axis).
  setSpin(radians) {
    this.surface.rotation.y = radians;
  }

  setSunDirection(dir) {
    this.atmosphereMaterial.uniforms.uSunDirection.value.copy(dir).normalize();
  }

  // Called each frame with the live camera so the Fresnel tracks the view
  // (avoids the classic glow-offset-when-panning bug). Spin is driven by the
  // choreographer (scroll-linked), NOT here — see setSpin().
  update(dt, cameraPosition) {
    this.atmosphereMaterial.uniforms.uCameraPos.value.copy(cameraPosition);
  }
}

// Latitude/longitude (degrees) → position on a sphere of the given radius,
// in the sphere's local frame. Matches the equirectangular texture wrap well
// enough to place a marker "roughly at Jezero" per the plan.
function latLonToVector3(latDeg, lonDeg, radius) {
  const phi = THREE.MathUtils.degToRad(90 - latDeg); // polar angle from +Y
  const theta = THREE.MathUtils.degToRad(lonDeg);
  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}
