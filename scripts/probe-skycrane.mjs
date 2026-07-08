// Dump the skycrane GLB mesh hierarchy with each mesh's bounding-box centre
// expressed in the skycrane GROUP's local frame (post-normalization), so we can
// align the retro flames to the actual engine/nozzle positions.
import puppeteer from 'puppeteer-core';

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage();
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 4500));

const info = await p.evaluate(() => {
  const sky = window.__mtra.scene.skycrane;
  const group = sky.group;
  group.updateWorldMatrix(true, true);
  const inv = group.matrixWorld.clone().invert();
  const V3 = sky.model.position.constructor; // THREE.Vector3

  // Overall footprint: transform every vertex of every mesh into GROUP-local
  // space and track the extremes + the lowest-quartile outboard points (the
  // nozzle tips). Sampling verts (not mesh centres) sees through merged meshes.
  const min = new V3(Infinity, Infinity, Infinity);
  const max = new V3(-Infinity, -Infinity, -Infinity);
  const lowPts = []; // {x,y,z} of vertices in the bottom band
  const v = new V3();
  sky.model.traverse((o) => {
    if (!o.isMesh) return;
    o.updateWorldMatrix(true, false);
    const pos = o.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 400)); // subsample
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
      min.min(v);
      max.max(v);
      lowPts.push({ x: v.x, y: v.y, z: v.z });
    }
  });
  // Keep only the lowest 12% of sampled points (near the nozzle plane).
  lowPts.sort((a, b) => a.y - b.y);
  const band = lowPts.slice(0, Math.floor(lowPts.length * 0.12));
  // Bucket those into the 4 quadrants (±x, ±z) and average each → nozzle group.
  const quad = { pp: [], pn: [], np: [], nn: [] };
  for (const q of band) {
    const k = (q.x >= 0 ? 'p' : 'n') + (q.z >= 0 ? 'p' : 'n');
    quad[k].push(q);
  }
  const avg = (arr) =>
    arr.length
      ? {
          n: arr.length,
          x: +(arr.reduce((s, a) => s + a.x, 0) / arr.length).toFixed(3),
          y: +(arr.reduce((s, a) => s + a.y, 0) / arr.length).toFixed(3),
          z: +(arr.reduce((s, a) => s + a.z, 0) / arr.length).toFixed(3),
        }
      : null;
  return {
    targetHeight: sky._targetHeight,
    bbox: {
      min: [+min.x.toFixed(3), +min.y.toFixed(3), +min.z.toFixed(3)],
      max: [+max.x.toFixed(3), +max.y.toFixed(3), +max.z.toFixed(3)],
    },
    nozzleQuadrants: {
      '+x+z': avg(quad.pp),
      '+x-z': avg(quad.pn),
      '-x+z': avg(quad.np),
      '-x-z': avg(quad.nn),
    },
  };
});

console.log(JSON.stringify(info, null, 2));
await b.close();
