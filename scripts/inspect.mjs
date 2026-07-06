import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage();
await p.goto('http://localhost:5173/',{waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,4500));
const info = await p.evaluate(()=>{
  const sky = window.__mtra.scene.skycrane;
  const n = sky.nativeSize;
  return { nativeSize: [n.x, n.y, n.z] };
});
console.log(JSON.stringify(info));
await b.close();
