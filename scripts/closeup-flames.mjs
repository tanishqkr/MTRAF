// Close-up of the skycrane thrusters to verify plume alignment + outward cant.
// Freezes the choreographer camera and parks a camera right in front of the
// stage with full thrust on.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';

const outdir = process.argv[2] || '/tmp/mtra-fx';
mkdirSync(outdir, { recursive: true });
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--force-color-profile=srgb', '--window-size=1400,1200'],
});
const p = await b.newPage();
await p.setViewport({ width: 1400, height: 1200, deviceScaleFactor: 2 });
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));

// Scroll to mid surface-descent so the stage is placed on the surface.
await p.evaluate(() => {
  const st = window.__mtra.choreographer.cameraTimeline.scrollTrigger;
  const y = st.start + (st.end - st.start) * 0.66;
  window.__mtra.choreographer.lenis.scrollTo(y, { immediate: true, force: true });
});
await new Promise((r) => setTimeout(r, 2000));

// Freeze the camera, park it in front (+Z) of the stage, full thrust.
await p.evaluate(() => {
  const s = window.__mtra.scene;
  s.onFrame = null;
  const sky = s.skycrane;
  const gp = sky.group.position;
  const cam = s.camera;
  cam.fov = 32;
  cam.position.set(gp.x + 0.2, gp.y - 0.6, gp.z + 6);
  cam.lookAt(gp.x, gp.y - 1.0, gp.z);
  cam.updateProjectionMatrix();
  sky.setThrust(1, 5);
});
await new Promise((r) => setTimeout(r, 500));
await p.screenshot({ path: `${outdir}/C-flames-front.png` });
console.log('wrote C-flames-front.png');

// Also a side/3-4 view to read the outward splay.
await p.evaluate(() => {
  const s = window.__mtra.scene;
  const sky = s.skycrane;
  const gp = sky.group.position;
  const cam = s.camera;
  cam.position.set(gp.x + 5, gp.y - 0.4, gp.z + 3.5);
  cam.lookAt(gp.x, gp.y - 1.0, gp.z);
  cam.updateProjectionMatrix();
  sky.setThrust(1, 7);
});
await new Promise((r) => setTimeout(r, 400));
await p.screenshot({ path: `${outdir}/C2-flames-34.png` });
console.log('wrote C2-flames-34.png');
await b.close();
