// Scriptable screenshot helper for visual verification (see CLAUDE.md).
// Drives the system Chrome via puppeteer-core against the running dev server.
//
// Usage:
//   node scripts/shot.mjs <outfile> [options as key=val]
//     url=http://localhost:5173/     page to load
//     w=1600 h=1000                  viewport
//     wait=2500                      ms to wait after load (texture/model decode)
//     scroll=0.0                     scroll progress 0..1 of the scrollable height
//     eval="<js>"                    JS to run in page before the shot
//     dpr=2                          device pixel ratio
//
// Examples:
//   node scripts/shot.mjs out.png wait=4000
//   node scripts/shot.mjs out.png scroll=0.5 wait=1500
//   node scripts/shot.mjs out.png eval="window.__mtra.scene.mars.surface.rotation.y=3.14"

import puppeteer from 'puppeteer-core';

const CHROME =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const [, , outfile = 'shot.png', ...rest] = process.argv;
const opts = Object.fromEntries(
  rest.map((kv) => {
    const i = kv.indexOf('=');
    return [kv.slice(0, i), kv.slice(i + 1)];
  }),
);

const url = opts.url || 'http://localhost:5173/';
const w = parseInt(opts.w || '1600', 10);
const h = parseInt(opts.h || '1000', 10);
const wait = parseInt(opts.wait || '3500', 10);
const scroll = opts.scroll != null ? parseFloat(opts.scroll) : null;
const dpr = parseFloat(opts.dpr || '2');

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
  await page.setViewport({ width: w, height: h, deviceScaleFactor: dpr });

  if (opts.rm === '1') {
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ]);
  }

  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, wait));

  if (opts.el) {
    // Scroll a specific element to the top of the viewport.
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY);
    }, opts.el);
    await new Promise((r) => setTimeout(r, parseInt(opts.settle || '1200', 10)));
  }

  if (scroll != null) {
    await page.evaluate((p) => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, max * p);
    }, scroll);
    // Let scroll-linked animation settle (Lenis + ScrollTrigger).
    await new Promise((r) => setTimeout(r, parseInt(opts.settle || '1200', 10)));
  }

  if (opts.eval) {
    await page.evaluate(opts.eval);
    await new Promise((r) => setTimeout(r, 400));
  }

  await page.screenshot({ path: outfile });

  if (errors.length) {
    console.error('CONSOLE ERRORS:\n' + errors.join('\n'));
  } else {
    console.log('no console errors');
  }
  console.log('wrote ' + outfile);
} finally {
  await browser.close();
}
