// Verify flame lean against the REAL descent/touchdown camera (NOT a parked
// debug camera — that was the mistake: sprite lean is screen-space, so it must
// be judged from the actual shot). Scrolls to the touchdown beat where all four
// retros are at full thrust and the skycrane is framed, and captures.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';

const outdir = process.argv[2] || '/tmp/mtra-flame';
const prog = parseFloat(process.argv[3] || '0.79');
mkdirSync(outdir, { recursive: true });
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--force-color-profile=srgb', '--window-size=1600,1000'],
});
const p = await b.newPage();
await p.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));
await p.evaluate((prog) => {
  const st = window.__mtra.choreographer.cameraTimeline.scrollTrigger;
  const y = st.start + (st.end - st.start) * prog;
  window.__mtra.choreographer.lenis.scrollTo(y, { immediate: true, force: true });
}, prog);
await new Promise((r) => setTimeout(r, 1500));

// Freeze, then DOLLY the real camera in along its exact view axis toward the
// skycrane — same orientation (so the screen-space lean looks identical), just
// closer so the four plumes are big enough to judge.
await p.evaluate(() => {
  const s = window.__mtra.scene;
  s.onFrame = null;
  const cam = s.camera;
  const gp = s.skycrane.group.position.clone();
  const dir = gp.clone().sub(cam.position).normalize();
  cam.position.copy(gp).addScaledVector(dir, -5.5);
  cam.lookAt(gp);
  cam.updateProjectionMatrix();
  s.skycrane.setThrust(1, 5);
});
await new Promise((r) => setTimeout(r, 400));
await p.screenshot({ path: `${outdir}/flame-real.png` });
console.log('wrote flame-real.png at prog', prog);
await b.close();
