// Inspect the Jezero CTX DTM GLB: bounding box, which axis is elevation, mesh
// stats, and a coarse height sample grid (raycast down the elevation axis).
import puppeteer from 'puppeteer-core';

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage();
p.on('console', (m) => console.log('[page]', m.text()));
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 3000));

const info = await p.evaluate(async () => {
  const { THREE, createGLTFLoader } = await import('/src/scenes/_probe.js');
  const loader = createGLTFLoader();
  const gltf = await loader.loadAsync('/assets/models/jezero_crater_ctx_dtm.glb');
  const model = gltf.scene;
  model.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);

  let meshCount = 0;
  let vtot = 0;
  let hasColor = false;
  let hasUV = false;
  let hasMap = false;
  model.traverse((o) => {
    if (o.isMesh) {
      meshCount++;
      vtot += o.geometry.attributes.position.count;
      if (o.geometry.attributes.color) hasColor = true;
      if (o.geometry.attributes.uv) hasUV = true;
      if (o.material && o.material.map) hasMap = true;
    }
  });

  // Raycast a grid straight down (-Y) onto the DTM to read its heightfield.
  const ray = new THREE.Raycaster();
  const DOWN = new THREE.Vector3(0, -1, 0);
  const COLS = 20; // across X
  const ROWS = 44; // along Z
  const grid = [];
  let hmin = Infinity;
  let hmax = -Infinity;
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    const z = box.min.z + (size.z * (r + 0.5)) / ROWS;
    for (let cIdx = 0; cIdx < COLS; cIdx++) {
      const x = box.min.x + (size.x * (cIdx + 0.5)) / COLS;
      ray.set(new THREE.Vector3(x, box.max.y + 1, z), DOWN);
      const hit = ray.intersectObject(model, true)[0];
      const h = hit ? hit.point.y : NaN;
      row.push(h);
      if (hit) {
        hmin = Math.min(hmin, h);
        hmax = Math.max(hmax, h);
      }
    }
    grid.push(row);
  }
  // ASCII elevation map (low→high): each char one cell.
  const ramp = ' .:-=+*#%@';
  const ascii = grid
    .map((row) =>
      row
        .map((h) => {
          if (Number.isNaN(h)) return ' ';
          const t = (h - hmin) / (hmax - hmin || 1);
          return ramp[Math.min(ramp.length - 1, Math.floor(t * ramp.length))];
        })
        .join(''),
    )
    .join('\n');

  return {
    bbox: { min: box.min.toArray().map((n) => +n.toFixed(2)), max: box.max.toArray().map((n) => +n.toFixed(2)) },
    size: size.toArray().map((n) => +n.toFixed(2)),
    meshCount,
    vtot,
    hasColor,
    hasUV,
    hasMap,
    heightRange: [+hmin.toFixed(3), +hmax.toFixed(3)],
    ascii,
  };
});

console.log(JSON.stringify({ ...info, ascii: undefined }, null, 2));
console.log('\nElevation map (X across, Z down; low . → high @):\n');
console.log(info.ascii);
await b.close();
