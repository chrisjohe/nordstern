import fs from 'fs'; import path from 'path'; import { JSDOM } from 'jsdom'; import {fileURLToPath} from 'url';
export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

/* Was jsdom nicht kann: messen, zeichnen, sich erinnern. Steht einmal hier,
   weil beide Wege es brauchen — der Ordner und der Bau unter export/. */
function stubs(w,opts){
  /* Ein echter ResizeObserver meldet sich einmal von selbst, sobald er zu
     beobachten beginnt — mit der Grösse, die ohnehin schon gilt. Ein Stub, der
     das verschweigt, verschweigt auch jedes Rendern, das daraus folgt. */
  w.ResizeObserver=class{
    constructor(cb){this.cb=cb;}
    observe(el){ const self=this; setTimeout(function(){ self.cb([{target:el}],self); },0); }
    unobserve(){} disconnect(){}
  };
  w.matchMedia=q=>({matches:!!opts.reducedMotion,media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
  w.Path2D=class{constructor(d){this.d=d;}};
  const calls={};
  w.HTMLCanvasElement.prototype.getContext=function(k){
    if(k!=='2d') return null;
    const base={createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}})};
    return new Proxy(base,{
      get(t,p){ if(p in t) return t[p];
        return (...a)=>{ calls[p]=(calls[p]||0)+1; if(p==='measureText') return {width:20}; }; },
      set(t,p,v){ t[p]=v; return true; }});
  };
  /* Breite, Höhe — und die Lage im Fenster. Der Chart klebt nicht am oberen
     Rand, über ihm stehen Kennzahlen und Kapitelzeile; wer das verschweigt,
     kann nicht prüfen, ob etwas oberhalb des Charts noch Platz hat. */
  const sizes={'mount-canvas':[720,520,120],'chart-body':[520,190,260]};
  w.Element.prototype.getBoundingClientRect=function(){
    for(const [c,[width,height,top]] of Object.entries(sizes)) if(this.classList&&this.classList.contains(c)) return {width,height,left:0,top:top||0,right:width,bottom:(top||0)+height,x:0,y:top||0};
    return {width:600,height:200,left:0,top:0,right:600,bottom:200,x:0,y:0};};
  Object.defineProperty(w.HTMLCanvasElement.prototype,'width',{value:0,writable:true,configurable:true});
  Object.defineProperty(w.HTMLCanvasElement.prototype,'height',{value:0,writable:true,configurable:true});
  w.devicePixelRatio=2; w.URL.createObjectURL=()=>'blob:mock'; w.URL.revokeObjectURL=()=>{};
  const mem=opts.storage||{};
  /* Nah genug am echten localStorage: length und key(i) gehören dazu, sonst
     kann eine Aufräumfunktion die eigenen Schlüssel gar nicht erst finden. */
  Object.defineProperty(w,'localStorage',{configurable:true,value:{
    getItem:k=>k in mem?mem[k]:null,setItem:(k,v)=>{mem[k]=String(v);},removeItem:k=>{delete mem[k];},
    key:i=>Object.keys(mem)[i]??null,get length(){return Object.keys(mem).length;},
    clear:()=>{for(const k in mem)delete mem[k];}}});
  return {calls,mem};
}

export async function boot(opts={}){
  const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8')
    .replace(/<script src="js\/vendor\/xlsx\.full\.min\.js"><\/script>/,'');
  const errors=[];
  const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'file://'+ROOT+'/index.html'});
  const w=dom.window;
  w.addEventListener('error',e=>errors.push('window: '+e.message));
  w.eval(fs.readFileSync(path.join(ROOT,'js/vendor/xlsx.full.min.js'),'utf8'));   // exakt das ausgelieferte Bundle
  const {calls,mem}=stubs(w,opts);
  const files=['js/util.js','js/importer.js','js/calc.js','js/store.js','js/ui/icons.js','js/ui/header.js','js/ui/position.js','js/ui/chart.js','js/ui/orbit.js','js/ui/mountain.js','js/ui/cards.js','js/ui/settings.js','js/app.js'];
  for(const f of files){ try{ w.eval(fs.readFileSync(path.join(ROOT,f),'utf8')); }catch(e){ errors.push('EVAL '+f+': '+e.message); } }
  await new Promise(r=>setTimeout(r,120));
  return {w,dom,errors,calls,mem};
}

/* Derselbe Start, aber aus der Einzeldatei: die Skripte werden nicht aus dem
   Ordner geladen, sondern in der Reihenfolge ausgeführt, in der sie im Bau
   stehen. Was hier läuft, ist genau das, was der Browser bekommt. */
export async function bootBundle(opts={}){
  const file=path.join(ROOT,'export/nordstern.html');
  const html=fs.readFileSync(file,'utf8');
  const errors=[];
  const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'file://'+file});
  const w=dom.window;
  w.addEventListener('error',e=>errors.push('window: '+e.message));
  const {calls,mem}=stubs(w,opts);
  const blocks=[...w.document.querySelectorAll('script[data-src]')];
  for(const s of blocks){ try{ w.eval(s.textContent); }catch(e){ errors.push('EVAL '+s.dataset.src+': '+e.message); } }
  await new Promise(r=>setTimeout(r,120));
  return {w,dom,errors,calls,mem,html,file,order:blocks.map(s=>s.dataset.src)};
}

/* Der Prüfstein ist die Beispielmappe, nie eine private Datei. Sie wird von
   tools/make-example.mjs erzeugt, liegt im Repository und enthält erfundene
   Zahlen — deshalb dürfen die erwarteten Beträge unten im Klartext stehen.
   Wer die Anwendung gegen eine echte Mappe laufen sehen will, setzt
   NORDSTERN_WORKBOOK; das gilt nur für tests/smoke.mjs, das nichts behauptet,
   sondern nur ausgibt. Die zusichernden Reihen bleiben beim Beispiel. */
export const FIXTURE=path.join(ROOT,'examples/nordstern-example.xlsx');

export function importFixture(w,file){
  const f=file||FIXTURE;
  const buf=fs.readFileSync(f);
  const ab=buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);
  const res=w.NORDSTERN.importer.parseArrayBuffer(ab,path.basename(f));
  w.NORDSTERN.app.state.model=res.model;
  w.NORDSTERN.store.saveModel(res.model);
  w.NORDSTERN.app.refresh();
  w.document.getElementById('gate').hidden=true;
  return res;
}
export const tick=ms=>new Promise(r=>setTimeout(r,ms));
