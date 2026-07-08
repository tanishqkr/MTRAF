// Capture the Phase 8 orbital→surface descent at several timeline progress
// points in one Chrome session. Drives the camera timeline's OWN ScrollTrigger
// (start/end px) so we hit exact beats regardless of the editorial scroll after
// #story. Scrolls via Lenis (immediate) and waits for the scrub to settle.
//
// Usage: node scripts/descent.mjs [outdir]

import puppeteer from 'puppeteer-core';

const CHROME =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const outdir = process.argv[2] || '/tmp/mtra-descent';
const url = 'http://localhost:5173/';
const w = 1600;
const h = 1000;

// label → timeline progress (0..1 of the camera timeline span)
const SHOTS = [
  ['00-orbital',       0.0],
  ['01-skycrane-early', 0.28],
  ['01-skycrane',      0.40],
  ['02-haze-peak',     0.52],
  ['03-surface-in',    0.58],
  ['04-descent-mid',   0.67],
  ['05-touchdown',     0.80],
  ['06-rover-land',    0.93],
  ['07-rover-drive',   0.99],
];

import { mkdirSync } from 'fs';
mkdirSync(outdir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    `--window-size=${w},${h}`,
  ],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });

  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 4000)); // texture/GLB decode

  for (const [label, p] of SHOTS) {
    await page.evaluate((prog) => {
      const st = window.__mtra.choreographer.cameraTimeline.scrollTrigger;
      const y = st.start + (st.end - st.start) * prog;
      const lenis = window.__mtra.choreographer.lenis;
      if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
      else window.scrollTo(0, y);
    }, p);
    // Let the scrub (scrub:1) lerp the camera state to the target and render.
    await new Promise((r) => setTimeout(r, 2200));
    const out = `${outdir}/${label}.png`;
    await page.screenshot({ path: out });
    console.log('wrote ' + out);
  }

  console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.join('\n') : 'no console errors');
} finally {
  await browser.close();
}
