import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--window-size=1600,1000']});
const p=await b.newPage();
await p.setViewport({width:1600,height:1000,deviceScaleFactor:1});
await p.goto('http://localhost:5173/',{waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,4500));
// scroll to touchdown so skycrane+rover+dust are all in scene
await p.evaluate(()=>{const m=document.documentElement.scrollHeight-innerHeight; // find story end
  const story=document.getElementById('story'); const y=story.getBoundingClientRect().bottom+window.scrollY-window.innerHeight; window.scrollTo(0,y);});
await new Promise(r=>setTimeout(r,1500));
const info=await p.evaluate(()=>{
  const s=window.__mtra.scene; const r=s.renderer;
  let geomTris=0, meshes=0, textures=0;
  const texSet=new Set();
  s.scene.traverse(o=>{
    if(o.isMesh && o.geometry){ meshes++;
      const g=o.geometry; const idx=g.index? g.index.count : (g.attributes.position? g.attributes.position.count:0);
      geomTris += idx/3;
      for(const k in o.material||{}){ const v=o.material[k]; if(v&&v.isTexture) texSet.add(v.uuid); }
    }
  });
  return {
    renderTriangles: r.info.render.triangles,
    renderCalls: r.info.render.calls,
    sceneMeshTris: Math.round(geomTris),
    meshes,
    programs: r.info.programs? r.info.programs.length : null,
    memGeometries: r.info.memory.geometries,
    memTextures: r.info.memory.textures,
    pixelRatio: r.getPixelRatio(),
  };
});
console.log(JSON.stringify(info,null,2));
await b.close();
