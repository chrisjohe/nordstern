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
  /* jsdom lädt kein <link rel="stylesheet"> ohne resources:"usable" — das
     wollen wir hier nicht (es zöge auch die <script src>-Tags durch den
     Resource-Loader). Also stehen die Blätter, wie im Bau unter export/,
     direkt im Dokument; sonst bleibt getComputedStyle blind für die eigenen
     Regeln, seit jsdom für unbekannte SVG-Eigenschaften nicht mehr die leere
     Zeichenkette, sondern den echten Anfangswert liefert. */
  const inlineCss=name=>`<style>${fs.readFileSync(path.join(ROOT,'css',name),'utf8')}</style>`;
  const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8')
    .replace(/<script src="js\/vendor\/xlsx\.full\.min\.js"><\/script>/,'')
    .replace(/<link rel="stylesheet" href="css\/([\w-]+\.css)">/g,(m,name)=>inlineCss(name));
  const errors=[];
  const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'file://'+ROOT+'/index.html'});
  const w=dom.window;
  w.addEventListener('error',e=>errors.push('window: '+e.message));
  w.eval(fs.readFileSync(path.join(ROOT,'js/vendor/xlsx.full.min.js'),'utf8'));   // exakt das ausgelieferte Bundle
  const {calls,mem}=stubs(w,opts);
  const files=['js/util.js','js/importer.js','js/calc.js','js/store.js','js/ui/icons.js','js/ui/header.js','js/ui/position.js','js/ui/chart.js','js/ui/orbit.js','js/ui/mountain.js','js/ui/cards.js','js/ui/settings.js','js/app.js'];
  /* `patch` greift zwischen den Bausteinen und js/app.js — der einzige
     Moment, in dem NORDSTERN vollständig dasteht und noch nichts gestartet
     ist. Damit lässt sich prüfen, was der Start tut, wenn ein Baustein
     wirft. */
  for(const f of files){
    if(f==='js/app.js' && opts.patch) { try{ opts.patch(w); }catch(e){ errors.push('PATCH: '+e.message); } }
    try{ w.eval(fs.readFileSync(path.join(ROOT,f),'utf8')); }catch(e){ errors.push('EVAL '+f+': '+e.message); }
  }
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

/* Die kleine, aber vollständige Mappe für die Importer-Reihen: alle fünfzehn
   Anker, drei Sektionen leer. Die Daten müssen aus der Welt des Fensters
   kommen: SheetJS läuft dort und prüft `instanceof Date` gegen dessen
   Konstruktor, nicht gegen den hiesigen. */
export const TINY_ROWS={MONTH:0, LIQUID:1, CASH:2, TOTALLIQUID:3, CLAIMS:4, TOTALCLAIMS:5,
  INVEST:6, DEPOT:7, TOTALINVEST:8, PROPERTY:9, TOTALPROPERTY:10,
  RETIREMENT:11, TOTALRETIREMENT:12, TOTALASSETS:13, LIABILITIES:14,
  LOAN:15, LIABTOTAL:16, NETWORTH:17};

export function tinySheet(w,months){
  const D=(y,m)=>new w.Date(y,m-1,1);
  return w.XLSX.utils.aoa_to_sheet([
    ['Month',        ...months.map(([y,m])=>D(y,m))],
    ['Liquid'],
    ['  Cash',       ...months.map((_,i)=>100+i)],
    ['Total liquid', ...months.map((_,i)=>100+i)],
    ['Claims'],
    ['Total claims', ...months.map(()=>0)],
    ['Investments'],
    ['  Depot',      ...months.map((_,i)=>1000+100*i)],
    ['Total investments', ...months.map((_,i)=>1000+100*i)],
    ['Property'],
    ['Total property', ...months.map(()=>0)],
    ['Retirement'],
    ['Total retirement', ...months.map(()=>0)],
    ['Total assets', ...months.map((_,i)=>1100+100*i+i)],
    ['Liabilities'],
    ['  Loan',       ...months.map(()=>0)],
    ['Total liabilities', ...months.map(()=>0)],
    ['Total net worth', ...months.map((_,i)=>1100+100*i+i)]
  ],{cellDates:true});
}

export function tinyWorkbook(w,months,sheetName='Data Input'){
  const wb=w.XLSX.utils.book_new();
  w.XLSX.utils.book_append_sheet(wb,tinySheet(w,months),sheetName);
  return wb;
}

/* Das Origin-Blatt (Reddit 2016), synthetisch nachgebaut: Kopfzeile „Net
   Worth by Month (Progress)", „Total Net Worth" oben, Kennzahlzeilen ohne
   Bedeutung für den Importer, Gruppenzeilen ohne Werte, zwei kopflose
   Sektionen (Education, Hard Assets), ein doppelter Kontoname, ein
   numerisches Label, `$`-Formate, Daten am Monatsersten. Die Zahlen sind
   erfunden und in sich stimmig: null Warnungen sind der Massstab. */
export const ORIGIN_ROWS={HEADER:0, NETWORTH:2, LIQUIDCOPY:7, ASSETS:13, CHECKING:14, SAVINGS:15, BROKERAGE:16,
  FUND_A:17, FUND_B:18, TOTALLIQUID:19, PLAN_1:21, PLAN_2:22, TOTALEDU:24, HOUSE:26, BUSINESS:27,
  BIZ_CHECKING:28, NUM_LABEL:29, TOTALHARD:30, RETIREMENT:32, PENSION:33, TOTALRET:34, TOTALASSETS:36,
  LIABILITIES:39, CARD:40, MORTGAGE:41, CARLOAN:42, LOAN:43, TOTALLIAB:44};

export function originFigures(i){
  const checking=100+i, savings=200+i, fundA=1000+100*i, fundB=500+50*i;
  const plan=60+i, house=120000, bizChecking=800+i, numLabel=85000, pension=28000+i;
  const card=100, mortgage=88000-100*i, loan=15000;
  const liquid=checking+savings+fundA+fundB, education=2*plan, tangible=house+bizChecking+numLabel, retirement=pension;
  const totalAssets=liquid+education+tangible+retirement, liabilities=card+mortgage+loan;
  return {checking,savings,fundA,fundB,plan,house,bizChecking,numLabel,pension,card,mortgage,loan,
    liquid,education,tangible,retirement,totalAssets,liabilities,netWorth:totalAssets-liabilities};
}

export function originSheet(w,months){
  const D=(y,m)=>new w.Date(y,m-1,1);
  const F=months.map((_,i)=>originFigures(i));
  const col=k=>F.map(f=>f[k]);
  const ratio=()=>F.map((f,i)=>0.01*(i+1));
  const rows=[
    ['Net Worth by Month (Progress)', ...months.map(([y,m])=>D(y,m))],
    [],
    ['Total Net Worth',           ...col('netWorth')],
    ['Net worth % Liquid',        ...ratio()],
    ['Net Worth % Retirement',    ...ratio()],
    ['Net Worth % Hard Assets',   ...ratio()],
    ['Net Worth % Education',     ...ratio()],
    ['Liquid Assets',             ...col('liquid')],
    ['Change from previous month',...ratio()],
    ['',                          ...ratio()],
    ['Cumlative Change',          ...ratio()],
    ['Average Change per Month',  ...ratio()],
    [],
    ['Assets'],
    ['Checking',                  ...col('checking')],
    ['Savings',                   ...col('savings')],
    ['Brokerage'],
    ['  Index Fund A',            ...col('fundA')],
    ['  Index Fund B',            ...col('fundB')],
    ['Total Liquid Assets',       ...col('liquid')],
    [],
    ['  529 Plan',                ...col('plan')],
    ['  529 Plan',                ...col('plan')],
    [],
    ['Total Education Assets',    ...col('education')],
    [],
    ['Contract House',            ...col('house')],
    ['Business Account'],
    ['  Checking',                ...col('bizChecking')],
    [212,                         ...col('numLabel')],
    ['Total Hard Assets',         ...col('tangible')],
    [],
    ['Retirement Assets'],
    ['Pension',                   ...col('pension')],
    ['Total Retirement Assets',   ...col('retirement')],
    [],
    ['Total Assets',              ...col('totalAssets')],
    ['',                          ...ratio()],
    [],
    ['Liabilities'],
    ['Rewards Card',              ...col('card')],
    ['Mortgage',                  ...col('mortgage')],
    ['Car Loan'],
    ['  Loan',                    ...col('loan')],
    ['Total Liabilities',         ...col('liabilities')],
    ['',                          ...ratio()],
    ['',                          ...F.map(()=>-200.13)]
  ];
  const ws=w.XLSX.utils.aoa_to_sheet(rows,{cellDates:true});
  /* `$` an jeder Betragszelle, wie im Original; die Kennzahlzeilen tragen
     Prozentformate, sie werden ohnehin nicht gelesen. */
  const range=w.XLSX.utils.decode_range(ws['!ref']);
  for(let r=range.s.r;r<=range.e.r;r++) for(let c=1;c<=range.e.c;c++){
    const a=w.XLSX.utils.encode_cell({r,c}); const cell=ws[a]; if(!cell||cell.t!=='n') continue;
    cell.z=(rows[r][0]===''||/%|Change/.test(String(rows[r][0])))?'0.0%':'"$"#,##0.00';
  }
  return ws;
}

export function originWorkbook(w,months,sheetName='Sheet1'){
  const wb=w.XLSX.utils.book_new();
  w.XLSX.utils.book_append_sheet(wb,originSheet(w,months),sheetName);
  return wb;
}

/* Der Schwenkwinkel eines Scheiben-Segments, aus dem gezeichneten Pfad
   zurückgerechnet. */
export function arcSweep(d,id){
  const n=d.querySelector('.orbit-arc[data-id="'+id+'"],.orbit-short[data-id="'+id+'"]');
  if(!n) return null;
  if(n.tagName==='circle') return Math.PI*2;
  const m=/M([-\d.]+) ([-\d.]+)A[\d.]+ [\d.]+ 0 (\d) (\d) ([-\d.]+) ([-\d.]+)/.exec(n.getAttribute('d'));
  if(!m) return null;
  const a=(x,y)=>Math.atan2(Number(x)-135,-(Number(y)-135));
  let s0=a(m[1],m[2]), s1=a(m[5],m[6]);
  let dl=s1-s0; if(m[4]==='0') dl=-Math.abs(dl); if(dl<0&&m[4]==='1') dl+=Math.PI*2;
  return Math.abs(dl)+(m[3]==='1'&&Math.abs(dl)<Math.PI?Math.PI*2-2*Math.abs(dl):0);
}
