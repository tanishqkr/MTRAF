import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message,'\n',e.stack));
p.on('console',m=>{ if(m.type()==='error') console.log('CONSOLE.ERR:', m.text()); });
await p.goto('http://localhost:5173/',{waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,4000));
// also try to read boot error captured
const e = await p.evaluate(()=> window.__bootErr || null);
console.log('bootErr:', e);
await b.close();
