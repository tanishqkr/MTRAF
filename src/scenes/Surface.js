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
  // opts: { color, normal, roughness } tiled THREE.Textures for a real PBR
  // ground, plus optional `heightData` (a baked Jezero-DTM heightfield from
  // sampleDTMHeightfield). Without maps the terrain falls back to the procedural
  // rust palette; without heightData it falls back to procedural fbm dunes.
  constructor(opts = {}) {
    const { heightData = null, ...groundMaps } = opts;
    this.groundMaps = groundMaps && groundMaps.color ? groundMaps : null;
    this.hm = heightData; // { grid, N, scale, baseY } or null
    this.group = new THREE.Group();
    this.group.position.copy(SURFACE_ORIGIN);
    this.group.visible = false;

    this._buildSky();
    this._buildTerrain();
    this._buildRocks();
  }

  // Terrain height (local surface-space) at x,z — shared by displacement AND rock
  // /rover placement so everything sits ON the ground, not floating. When a real
  // Jezero DTM heightfield is baked in, it drives the shape; otherwise procedural
  // fbm dunes are the fallback.
  heightAt(x, z) {
    if (this.hm) {
      const u = x / SURFACE_SIZE + 0.5;
      const w = z / SURFACE_SIZE + 0.5;
      return (bilinearGrid(this.hm.grid, this.hm.N, u, w) - this.hm.baseY) * this.hm.scale;
    }
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
    const textured = !!this.groundMaps;
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

      const t = THREE.MathUtils.clamp((y + 4) / 9, 0, 1);
      const grit = fbm(x * 0.3, z * 0.3, 2);
      if (textured) {
        // The PBR map carries the colour; vertex colours become a SUBTLE warm
        // brightness modulation (large-scale, low-freq) that breaks up the tile
        // repetition — crests catch light, hollows sit darker.
        const shade = 0.68 + t * 0.5 + (grit - 0.5) * 0.18;
        c.setRGB(shade, shade * 0.93, shade * 0.85);
      } else {
        // Procedural fallback: the saturated rust palette does all the colour.
        c.copy(colorA).lerp(colorB, THREE.MathUtils.clamp(t * 1.6, 0, 1));
        c.lerp(colorC, THREE.MathUtils.clamp((t - 0.55) * 2.2, 0, 1));
        c.offsetHSL(0, 0, (grit - 0.5) * 0.12);
      }
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
    if (textured) {
      const { color, normal, roughness } = this.groundMaps;
      mat.map = color;
      mat.normalMap = normal;
      mat.roughnessMap = roughness;
      mat.roughness = 1.0;
      mat.normalScale.set(1.15, 1.15);
      // Warm rust tint pushes the brown rock toward Martian red without
      // crushing its brightness.
      mat.color = new THREE.Color('#E8946A');
    }
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

// --- real Jezero DTM → baked heightfield ------------------------------------
// The DTM GLB is a heightfield mesh (a displaced grid), so we read its vertices
// directly (fast) rather than raycasting. A cropped region is binned into an
// N×N grid of average elevation; holes are dilated shut; the result feeds
// heightAt via bilinear sampling. Returns { grid, N, scale, baseY }:
//   scale  — world units per DTM elevation unit (vertical exaggeration)
//   baseY  — DTM elevation at the landing centre, so heightAt(0,0) ≈ 0.
export function sampleDTMHeightfield(model, THREE, cfg) {
  const { cx, cz, halfX, halfZ, relief, gridN: N, yawDeg = 0 } = cfg;
  const grid = new Float32Array(N * N);
  const cnt = new Uint32Array(N * N);
  const v = new THREE.Vector3();
  const yaw = (yawDeg * Math.PI) / 180;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);

  model.updateWorldMatrix(true, true);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.updateWorldMatrix(true, false);
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const dx = v.x - cx;
      const dz = v.z - cz;
      const rx = dx * cosY - dz * sinY;
      const rz = dx * sinY + dz * cosY;
      const u = (rx + halfX) / (2 * halfX);
      const w = (rz + halfZ) / (2 * halfZ);
      if (u < 0 || u >= 1 || w < 0 || w >= 1) continue;
      const gx = Math.min(N - 1, (u * N) | 0);
      const gz = Math.min(N - 1, (w * N) | 0);
      const idx = gz * N + gx;
      grid[idx] += v.y;
      cnt[idx]++;
    }
  });

  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < N * N; i++) {
    if (cnt[i]) {
      grid[i] /= cnt[i];
      if (grid[i] < minY) minY = grid[i];
      if (grid[i] > maxY) maxY = grid[i];
    }
  }
  fillHoles(grid, cnt, N, minY);

  const scale = relief / (maxY - minY || 1);
  const baseY = bilinearGrid(grid, N, 0.5, 0.5);
  return { grid, N, scale, baseY };
}

// Fill empty cells by iterative dilation (average of filled 4-neighbours).
function fillHoles(grid, cnt, N, fallback) {
  let empty = [];
  for (let i = 0; i < N * N; i++) if (!cnt[i]) empty.push(i);
  let pass = 0;
  while (empty.length && pass < 24) {
    const filledNow = [];
    const still = [];
    for (const idx of empty) {
      const gx = idx % N;
      const gz = (idx / N) | 0;
      let s = 0;
      let c = 0;
      if (gx > 0 && cnt[idx - 1]) (s += grid[idx - 1]), c++;
      if (gx < N - 1 && cnt[idx + 1]) (s += grid[idx + 1]), c++;
      if (gz > 0 && cnt[idx - N]) (s += grid[idx - N]), c++;
      if (gz < N - 1 && cnt[idx + N]) (s += grid[idx + N]), c++;
      if (c) {
        grid[idx] = s / c;
        filledNow.push(idx);
      } else {
        still.push(idx);
      }
    }
    for (const idx of filledNow) cnt[idx] = 1;
    empty = still;
    pass++;
  }
  for (const idx of empty) grid[idx] = fallback; // any stragglers
}

// Bilinear sample of an N×N grid at normalized (u,w) ∈ [0,1].
function bilinearGrid(grid, N, u, w) {
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  w = w < 0 ? 0 : w > 1 ? 1 : w;
  const fx = u * (N - 1);
  const fz = w * (N - 1);
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const x1 = Math.min(N - 1, x0 + 1);
  const z1 = Math.min(N - 1, z0 + 1);
  const tx = fx - x0;
  const tz = fz - z0;
  const a = grid[z0 * N + x0];
  const b = grid[z0 * N + x1];
  const c = grid[z1 * N + x0];
  const d = grid[z1 * N + x1];
  return (
    a * (1 - tx) * (1 - tz) +
    b * tx * (1 - tz) +
    c * (1 - tx) * tz +
    d * tx * tz
  );
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
