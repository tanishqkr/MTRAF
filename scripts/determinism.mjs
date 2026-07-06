import puppeteer from 'puppeteer-core';
const CH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
async function measure(waitMs){
  const b=await puppeteer.launch({executablePath:CH,headless:'new',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--window-size=1600,1000']});
  const p=await b.newPage();
  await p.setViewport({width:1600,height:1000,deviceScaleFactor:1});
  await p.goto('http://localhost:5173/',{waitUntil:'networkidle2'});
  await new Promise(r=>setTimeout(r,waitMs));           // vary wall-clock elapsed
  await p.evaluate(()=>{const m=document.documentElement.scrollHeight-innerHeight;scrollTo(0,m*1.0);});
  await new Promise(r=>setTimeout(r,1800));
  const d=await p.evaluate(()=>{
    const s=window.__mtra.scene;
    const site=s.mars.getLandingWorldPosition(new (s.mars.landingAnchor.position.constructor)());
    const sky=s.skycrane.group.position;
    return {site:[site.x,site.y,site.z], sky:[sky.x,sky.y,sky.z]};
  });
  await b.close();
  return d;
}
const a=await measure(3500);
const c=await measure(6500);   // different elapsed → would drift if time-driven
const dist=(u,v)=>Math.hypot(u[0]-v[0],u[1]-v[1],u[2]-v[2]);
console.log('run A:', JSON.stringify(a));
console.log('run B:', JSON.stringify(c));
console.log('site delta:', dist(a.site,c.site).toExponential(3));
console.log('skycrane delta:', dist(a.sky,c.sky).toExponential(3));
