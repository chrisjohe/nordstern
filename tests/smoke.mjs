import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import { JSDOM } from 'jsdom';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8')
  .replace(/<script src="js\/vendor\/xlsx\.full\.min\.js"><\/script>/,''); // wird injiziert

const errors=[];
const dom=new JSDOM(html,{ runScripts:'outside-only', pretendToBeVisual:true, url:'file://'+ROOT+'/index.html' });
const w=dom.window;
w.addEventListener('error',e=>errors.push('window error: '+e.message));

// --- Umgebung ergänzen, die jsdom fehlt ---------------------------------
w.eval(fs.readFileSync(path.join(ROOT,'js/vendor/xlsx.full.min.js'),'utf8'));
w.ResizeObserver=class{constructor(cb){this.cb=cb;} observe(){} unobserve(){} disconnect(){}};
w.matchMedia=q=>({matches:false, media:q, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}});
w.Path2D=class{constructor(d){this.d=d;}};
const calls={};
function mockCtx(){
  const h={ get(t,p){ if(p in t) return t[p];
      return (...a)=>{ calls[p]=(calls[p]||0)+1; if(p==='measureText') return {width:20}; }; },
    set(t,p,v){ t[p]=v; return true; } };
  const base={ createRadialGradient:()=>({addColorStop(){}}), createLinearGradient:()=>({addColorStop(){}}) };
  return new Proxy(base,h);
}
const origGet=w.HTMLCanvasElement.prototype.getContext;
w.HTMLCanvasElement.prototype.getContext=function(k){ return k==='2d'? mockCtx() : null; };
// Größen vortäuschen
const sizes={ 'mount-canvas':[720,520], 'chart-body':[520,190] };
w.Element.prototype.getBoundingClientRect=function(){
  for(const [cls,[width,height]] of Object.entries(sizes)) if(this.classList&&this.classList.contains(cls)) return {width,height,left:0,top:0,right:width,bottom:height,x:0,y:0};
  return {width:600,height:200,left:0,top:0,right:600,bottom:200,x:0,y:0};
};
Object.defineProperty(w.HTMLCanvasElement.prototype,'width',{value:0,writable:true,configurable:true});
Object.defineProperty(w.HTMLCanvasElement.prototype,'height',{value:0,writable:true,configurable:true});
w.devicePixelRatio=2;
w.URL.createObjectURL=()=>'blob:mock'; w.URL.revokeObjectURL=()=>{};
const mem={};
Object.defineProperty(w,'localStorage',{configurable:true,value:{
  getItem:k=>k in mem?mem[k]:null, setItem:(k,v)=>{mem[k]=String(v);}, removeItem:k=>{delete mem[k];}, clear:()=>{for(const k in mem) delete mem[k];}
}});

// --- Skripte laden -------------------------------------------------------
const files=['js/util.js','js/importer.js','js/calc.js','js/store.js','js/ui/icons.js','js/ui/header.js','js/ui/position.js','js/ui/chart.js','js/ui/orbit.js','js/ui/mountain.js','js/ui/cards.js','js/ui/settings.js','js/app.js'];
for(const f of files){
  try { w.eval(fs.readFileSync(path.join(ROOT,f),'utf8')); }
  catch(e){ errors.push("EVAL "+f+": "+e.message); console.log("EVAL FEHLER",f,e.message); }
}
console.log('Skripte geladen, Fehler:', errors.length);
console.log('readyState nach eval:', w.document.readyState);
await new Promise(r=>setTimeout(r,120));
console.log('readyState danach:', w.document.readyState, '| gebootet:', !!(w.NORDSTERN.app));

// --- Import simulieren ---------------------------------------------------
/* Standard ist die Beispielmappe. NORDSTERN_WORKBOOK=… zeigt auf eine echte
   Datei — diese Reihe behauptet nichts, sie gibt nur aus, und ist damit der
   Weg, eine eigene Mappe einmal durch die ganze Anwendung zu schicken. */
const FIXTURE=process.env.NORDSTERN_WORKBOOK||path.join(ROOT,'examples/nordstern-example.xlsx');
console.log('Mappe:', path.basename(FIXTURE));
const buf=fs.readFileSync(FIXTURE);
const res=w.NORDSTERN.importer.parseArrayBuffer(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),path.basename(FIXTURE));
if(!res.ok){ console.log('IMPORT FEHLGESCHLAGEN', res.errors); process.exit(1); }
w.NORDSTERN.app.state.model=res.model;
try { w.NORDSTERN.app.refresh(); } catch(e){ errors.push('refresh: '+e.message+'\n'+e.stack.split('\n').slice(0,4).join('\n')); }
w.document.getElementById('gate').hidden=true;

// rAF ein paar Frames laufen lassen (Berg zeichnet)
await new Promise(r=>setTimeout(r,260));

const d=w.document;
const out=(sel,label)=>{const n=d.querySelector(sel); console.log(label+':', n? n.textContent.trim().replace(/\s+/g,' ').slice(0,150):'FEHLT');};
console.log('\n— gerendert —');
out('.hero-val','Net Worth');
out('.hero-deltas','Deltas');
out('.kpi-row','KPIs');
out('.mount-status','Status');
console.log('Vorjahreslinie:', !!d.querySelector('.chart-ya-stub[mask]'), '/ voll:', !!d.querySelector('.chart-ya-full'), '| Blende:', !!d.querySelector('#nsYaMask'));
console.log('Chart-SVG:', !!d.querySelector('.chart-svg'), '| Pfade:', d.querySelectorAll('.chart-svg path').length, '| Gitterlinien:', d.querySelectorAll('.chart-grid line').length, '| Jahresmarken:', d.querySelectorAll('.chart-xlab text').length);
console.log('Orbit-Bögen:', d.querySelectorAll('.orbit-arc').length, '| Legendenzeilen:', d.querySelectorAll('.legend-row').length, '| Flaggen:', d.querySelectorAll('.orbit-flag-val').length);
console.log('Cards:', d.querySelectorAll('.card').length, '| Status:', Array.from(d.querySelectorAll('.card')).map(c=>c.dataset.id+':'+c.dataset.status).join(' '));
console.log('Card-Balken:', Array.from(d.querySelectorAll('.card-bar i')).map(i=>i.style.width).join(' '));
const back=d.querySelector('.card[data-id="barista"] .card-back');
console.log('Rückseite Aurora:', back.textContent.replace(/\s+/g,' ').trim().slice(0,200));
console.log('\nCanvas-Aufrufe:', Object.entries(calls).map(([k,v])=>k+'='+v).sort().join(' '));
console.log('\nFehler gesamt:', errors.length);
errors.forEach(e=>console.log('  ! '+e));

process.exit(errors.length?1:0);
