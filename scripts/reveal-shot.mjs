// Single capture of the reveal end-state (rover hero close-up) to check the
// camera angle.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';

const outdir = process.argv[2] || '/tmp/mtra-fx';
const prog = parseFloat(process.argv[3] || '0.985');
mkdirSync(outdir, { recursive: true });
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--force-color-profile=srgb', '--window-size=1600,1000'],
});
const p = await b.newPage();
await p.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1.5 });
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));
await p.evaluate((prog) => {
  const st = window.__mtra.choreographer.cameraTimeline.scrollTrigger;
  const y = st.start + (st.end - st.start) * prog;
  window.__mtra.choreographer.lenis.scrollTo(y, { immediate: true, force: true });
}, prog);
await new Promise((r) => setTimeout(r, 1500));
await p.screenshot({ path: `${outdir}/reveal.png` });
console.log('wrote reveal.png at prog', prog);
await b.close();
