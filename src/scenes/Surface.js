import * as THREE from 'three';
import { SURFACE_ORIGIN, SURFACE_SIZE, SKY, COLORS } from '../config.js';

// Ground-level Martian landscape (Phase 8 surface stage): a displaced heightfield
// terrain under a butterscotch sky dome with exponential fog. Procedural so it's
// self-contained (no new asset licensing). Lives at SURFACE_ORIGIN, far from the
// orbital globe, so the two stages never interact.
//
// NOTE: this is a *ground* heightfield, not the planet's base color map — the
// "real textures, not procedural noise" rule in CLAUDE.md is about the globe,
// which still uses the 8K image. Displacement for a landscape you fly down to is
// the standard approach.
export class Surface {
  constructor() {
    this.group = new THREE.Group();
    this.group.position.copy(SURFACE_ORIGIN);
    this.group.visible = false;

    this._buildSky();
    this._buildTerrain();
    this._buildRocks();
  }

  // Terrain height (local surface-space) at x,z — shared by displacement AND rock
  // /rover placement so everything sits ON the ground, not floating.
  heightAt(x, z) {
    return (
      fbm(x * 0.012 + 11.3, z * 0.012 - 4.1, 5) * 6.0 - // broad dunes
      3.0 +
      fbm(x * 0.06 + 2.0, z * 0.06 + 9.0, 3) * 0.9 // finer ripples
    );
  }

  _buildSky() {
    // Gradient dome: brighter tan at the horizon, dustier rust overhead.
    const geo = new THREE.SphereGeometry(SURFACE_SIZE * 1.4, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uHorizon: { value: SKY.horizon.clone() },
        uZenith: { value: SKY.zenith.clone() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uHorizon;
        uniform vec3 uZenith;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y * 1.4 + 0.15, 0.0, 1.0);
          // ease so the warm band hugs the horizon
          h = pow(h, 0.6);
          gl_FragColor = vec4(mix(uHorizon, uZenith, h), 1.0);
        }
      `,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.group.add(this.sky);
  }

  _buildTerrain() {
    const seg = 200;
    const geo = new THREE.PlaneGeometry(SURFACE_SIZE, SURFACE_SIZE, seg, seg);
    geo.rotateX(-Math.PI / 2); // lie flat in the XZ plane, +Y up

    const pos = geo.attributes.position;
    const colorA = new THREE.Color('#7A2B0A'); // shadowed low ground
    const colorB = new THREE.Color('#C1440E'); // mid rust
    const colorC = new THREE.Color('#E0995A'); // sunlit dune crests
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = this.heightAt(x, z);
      pos.setY(i, y);

      // Mottled color by height + a little noise so it isn't a flat wash.
      const t = THREE.MathUtils.clamp((y + 4) / 9, 0, 1);
      const grit = fbm(x * 0.3, z * 0.3, 2);
      c.copy(colorA).lerp(colorB, THREE.MathUtils.clamp(t * 1.6, 0, 1));
      c.lerp(colorC, THREE.MathUtils.clamp((t - 0.55) * 2.2, 0, 1));
      c.offsetHSL(0, 0, (grit - 0.5) * 0.12);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.97,
      metalness: 0.0,
    });
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    this.group.add(this.terrain);
  }

  _buildRocks() {
    // Scattered basalt boulders near the landing zone, instanced for cheapness.
    const count = 120;
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#3a2318'),
      roughness: 1.0,
      metalness: 0.0,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    let seed = 99;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let i = 0; i < count; i++) {
      // cluster more densely near the landing point, sparse far out
      const r = Math.pow(rand(), 0.5) * SURFACE_SIZE * 0.42;
      const a = rand() * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const sc = 0.12 + rand() * 0.6;
      p.set(x, this.heightAt(x, z) + sc * 0.35, z);
      q.setFromEuler(
        new THREE.Euler(rand() * 3, rand() * 6, rand() * 3),
      );
      s.set(sc, sc * (0.6 + rand() * 0.5), sc);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.rocks = mesh;
    this.group.add(mesh);
  }

  // World-space position of a point on the terrain at local (x,z).
  worldPoint(x, z, target) {
    return target.set(
      SURFACE_ORIGIN.x + x,
      SURFACE_ORIGIN.y + this.heightAt(x, z),
      SURFACE_ORIGIN.z + z,
    );
  }

  setVisible(v) {
    this.group.visible = v;
  }
}

// --- seamless value-noise fbm (plane space, no UV seam concerns) ------------
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
function noise2(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const cc = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return (
    a * (1 - ux) * (1 - uy) +
    b * ux * (1 - uy) +
    cc * (1 - ux) * uy +
    d * ux * uy
  );
}
function fbm(x, y, oct) {
  let total = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < oct; o++) {
    total += noise2(x * freq, y * freq) * amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return total;
}
