// Verify the two FX fixes in one session:
//   A) thruster alignment — captured late in the descent (thrust on, no dust yet)
//   B) landing dust — fired fresh via eval, captured 0.7s in so it's mid-bloom
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outdir = process.argv[2] || '/tmp/mtra-fx';
mkdirSync(outdir, { recursive: true });

const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    '--window-size=1600,1000',
  ],
});
const p = await b.newPage();
await p.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));

const gotoProg = (prog) =>
  p.evaluate((pr) => {
    const st = window.__mtra.choreographer.cameraTimeline.scrollTrigger;
    const y = st.start + (st.end - st.start) * pr;
    const lenis = window.__mtra.choreographer.lenis;
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
    else window.scrollTo(0, y);
  }, prog);

// A) Thruster alignment — late descent, thrust ramped, dust not yet fired.
await gotoProg(0.72);
await new Promise((r) => setTimeout(r, 2200));
await p.screenshot({ path: `${outdir}/A-thrusters.png` });
console.log('wrote A-thrusters.png');

// B) Landing dust — sit at touchdown, then fire a FRESH burst and grab it mid-bloom.
await gotoProg(0.8);
await new Promise((r) => setTimeout(r, 1800));
await p.evaluate(() => window.__mtra.scene.dust.fire());
await new Promise((r) => setTimeout(r, 700));
await p.screenshot({ path: `${outdir}/B-dust.png` });
console.log('wrote B-dust.png');

// B2) A little later in the same burst, to see how it spreads/settles.
await new Promise((r) => setTimeout(r, 800));
await p.screenshot({ path: `${outdir}/B2-dust-later.png` });
console.log('wrote B2-dust-later.png');

await b.close();
