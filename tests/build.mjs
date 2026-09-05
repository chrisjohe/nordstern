/* NORDSTERN: Prüfung des Einzeldatei-Baus.
   Baut frisch und stellt drei Fragen: Ist die Datei wirklich geschlossen?
   Steht darin Zeichen für Zeichen der Quelltext aus dem Ordner? Und läuft
   die Anwendung daraus genauso — bis hin zur eingelesenen Mappe? Geschlossen
   heisst dabei mehr als „nichts lädt nach": der Quelltext selbst — js/, css/
   und index.html, nicht nur das gebaute Markup — wird auf jeden Aufruf und
   jede Adresse durchsucht, die das Netz erreichen könnte. */
import {boot, bootBundle, importFixture, ROOT} from './harness.mjs';
import {execFileSync} from 'child_process';
import fs from 'fs'; import path from 'path';

let pass=0, fail=0;
const ok=(c,m)=>{ if(c){pass++;} else {fail++; console.log('  ✗ '+m);} };
const sec=t=>console.log('\n== '+t);

/* Der Netz-Wächter: eine reine Funktion, unabhängig vom Bau prüfbar (siehe
   unten, „Der Wächter erkennt jede Leck-Form"). sources sind die Dateien im
   Ordner (js/ ohne vendor/, css/, index.html); html ist die fertig gebaute
   Datei. Beide Seiten werden gegen dieselben Muster geprüft, weil ein Leck
   in der Quelle genauso zählt wie eines, das erst der Bau hinterlässt.

   Erkannt werden Aufruf-/Konstruktionsformen, nicht jede Erwähnung eines
   Namens in Prosa — sonst schlüge der About-Text in settings.js an, der
   „no fetch, no XMLHttpRequest, no WebSocket" aufzählt, ohne selbst etwas
   aufzurufen. XMLHttpRequest liesse sich auch ohne „new" erzeugen; das
   Muster verlangt „new" trotzdem, bewusst — sonst träfe es die Prosa. */
const IDENTIFIER_CHECKS = [
  [/\bfetch\s*\(/, 'fetch('],
  [/\bnew\s+XMLHttpRequest\b/, 'new XMLHttpRequest'],
  [/\bnew\s+WebSocket\b/, 'new WebSocket'],
  [/\bnew\s+EventSource\b/, 'new EventSource'],
  [/\.sendBeacon\b/, '.sendBeacon'],
  [/\bimportScripts\s*\(/, 'importScripts('],
  [/\bnew\s+Image\s*\(/, 'new Image('],
  [/\bserviceWorker\b/, 'serviceWorker']
];

/* Jede Adresse hier mit eigenem Grund — wer eine weitere findet, meldet sie
   statt sie stillschweigend zuzulassen (siehe unten, der Fund-freie Lauf). */
const ALLOWED_URLS = new Set([
  'https://www.apache.org/licenses/LICENSE-2.0',    // About: Lizenztext, mehrfach verlinkt
  'https://github.com/chrisjohe/nordstern',          // About: Quelle von nordstern selbst
  'https://git.sheetjs.com/sheetjs/sheetjs',         // About: Quelle von SheetJS
  'https://github.com/google/material-design-icons', // About: Quelle der Symbole
  'http://www.w3.org/2000/svg'                       // SVG-Namensraum — ein Name, kein Ladevorgang
]);

function urlFindings(rel, text) {
  const out = [];
  for (const m of text.matchAll(/https?:\/\/[^\s"'<>)]+/g)) {
    if (!ALLOWED_URLS.has(m[0])) out.push({where: rel, what: 'Adresse ' + m[0]});
  }
  /* Protokoll-relativ (//host/…): nur hinter einem Anführungszeichen, „("
     oder „=" — dort steht eine Adresse, die geladen würde. Ein
     Zeilenkommentar „//TODO" ist keine, und „https://" fand die Regel
     darüber schon. */
  for (const m of text.matchAll(/(?<=["'(=])\/\/[a-zA-Z0-9][^\s"'<>)]*/g)) {
    if (!ALLOWED_URLS.has(m[0])) out.push({where: rel, what: 'protokoll-relative Adresse ' + m[0]});
  }
  for (const m of text.matchAll(/url\(\s*([^)]*?)\s*\)/gi)) {
    const arg = m[1].replace(/^['"]|['"]$/g, '');
    if (!arg.startsWith('#')) out.push({where: rel, what: 'url(' + m[1] + ')'});
  }
  return out;
}

function identifierFindings(rel, text) {
  const out = [];
  for (const [re, label] of IDENTIFIER_CHECKS) if (re.test(text)) out.push({where: rel, what: label});
  return out;
}

function linkRel(tag) { return (tag.match(/\srel\s*=\s*"([^"]*)"/i) || [])[1] || ''; }

function leaks({sources, html}) {
  let out = [];
  for (const {rel, text} of sources) {
    out = out.concat(identifierFindings(rel, text), urlFindings(rel, text));
  }
  const indexSrc = sources.find(s => s.rel === 'index.html');
  if (indexSrc) {
    for (const m of indexSrc.text.matchAll(/<link\b[^>]*>/gi)) {
      if (/^(preload|prefetch|dns-prefetch|preconnect)$/i.test(linkRel(m[0]))) {
        out.push({where: 'index.html', what: '<link>: ' + m[0]});
      }
    }
  }

  if (html) {
    /* <style>- und <script>-Rümpfe werden wie eigene Quelldateien geprüft —
       insbesondere fängt das ein url(https://…) in einem eingefalteten
       Stylesheet, das die reine Markup-Prüfung unten gar nicht mehr sieht,
       weil sie genau diese Blöcke herausschneidet. */
    for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi))
      out = out.concat(identifierFindings('gebaute Datei <style>', m[1]), urlFindings('gebaute Datei <style>', m[1]));
    /* SheetJS bleibt aussen vor: es ist eine vendorte Bibliothek, keine
       eigene Quelle, und trägt legitim eine Lizenzadresse (sheetjs.com) und
       jede XML-Namensraum-URI, die .xlsx/.ods je gesehen haben — das sind
       Namen im gelesenen Dateiformat, keine Ladeversuche. */
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/data-src="js\/vendor\//.test(m[1])) continue;
      out = out.concat(identifierFindings('gebaute Datei <script>', m[2]), urlFindings('gebaute Datei <script>', m[2]));
    }

    let markup = html, prev;
    do { prev = markup; markup = markup.replace(/<(style|script)\b[\s\S]*?<\/\1>/g, ''); } while (markup !== prev);
    out = out.concat(identifierFindings('gebaute Datei, Markup', markup), urlFindings('gebaute Datei, Markup', markup));
    if (/http-equiv\s*=\s*"refresh"/i.test(markup)) out.push({where: 'gebaute Datei, Markup', what: 'meta http-equiv="refresh"'});
    if (/\bsrcset\s*=/i.test(markup)) out.push({where: 'gebaute Datei, Markup', what: 'srcset='});
    for (const m of markup.matchAll(/<link\b[^>]*>/gi)) {
      const relAttr = linkRel(m[0]);
      if (relAttr !== 'icon' && relAttr !== 'apple-touch-icon') out.push({where: 'gebaute Datei, Markup', what: '<link>: ' + m[0]});
    }
  }
  return out;
}

function walk(dir) {
  let out = [];
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    out = fs.statSync(abs).isDirectory() ? out.concat(walk(abs)) : out.concat([abs]);
  }
  return out;
}
function readSources() {
  const files = [
    ...walk(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && !f.split(path.sep).includes('vendor')),
    ...walk(path.join(ROOT, 'css')).filter(f => f.endsWith('.css')),
    path.join(ROOT, 'index.html')
  ];
  return files.map(f => ({rel: path.relative(ROOT, f).split(path.sep).join('/'), text: fs.readFileSync(f, 'utf8')}));
}
const findingsText = fs => fs.map(f => f.where + ': ' + f.what).join(' | ') || '(keiner)';

sec('Der Bau läuft');
const log=execFileSync('node',[path.join(ROOT,'tools/build.mjs')],{cwd:ROOT,encoding:'utf8'});
const file=path.join(ROOT,'export/nordstern.html');
ok(fs.existsSync(file),'export/nordstern.html liegt vor');
const html=fs.readFileSync(file,'utf8');
ok(/NORDSTERN .* Einzeldatei-Bau vom \d{4}-\d\d-\d\d/.test(html),'der Kopf nennt Fassung und Datum');

sec('Geschlossen — nichts wird nachgeladen');
ok(!/<link\b[^>]*stylesheet/i.test(html),'kein <link rel="stylesheet"> mehr');
ok(!/<script[^>]*\ssrc=/i.test(html),'kein <script src=> mehr');
/* Jede Adresse in der Datei muss entweder ein Anker nach draußen sein (die
   Lizenzverweise in „about") oder gar nicht laden. Ein relativer Pfad in
   einem Ladeattribut wäre eine zweite Datei — und damit kein Bau mehr. */
let markup=html,prev;
do{prev=markup;markup=markup.replace(/<(style|script)\b[\s\S]*?<\/\1>/g,'');}while(markup!==prev);
/* favicon.png ist die bewusste Ausnahme: Safari zeigt keine data:-Symbole,
   also bleibt sie eine relative Datei, die auf Pages neben der Seite liegt;
   die Prüfung unten zählt sie gesondert. Hier zählen nur Pfade, die eine
   andere, ungeplante zweite Datei wären. */
const load=[...markup.matchAll(/\s(?:src|href)="([^"]*)"/g)].map(m=>m[1])
  .filter(v=>!/^(?:https?|data):/.test(v))
  .filter(v=>v!=='favicon.png');
ok(load.length===0,'keine ladenden Pfade im Markup: '+load.join(', '));
ok(!/@import/.test(html),'kein @import');
ok(!/fonts\.googleapis|cdn\.|unpkg|jsdelivr/i.test(html),'keine fremden Hosts');
/* Die Schriften kommen aus dem System — nichts davon wird geholt. */
ok(!/@font-face/.test(html),'keine nachzuladende Schrift');
/* Und der Browser setzt es durch, statt es dem Quelltext zu glauben. */
const csp=(html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)||[])[1]||'';
ok(/default-src 'none'/.test(csp),'CSP: nichts ist erlaubt, was nicht dasteht');
ok(/connect-src 'none'/.test(csp),'CSP: keine Verbindung nach draussen');
ok(/form-action 'none'/.test(csp),'CSP: kein Formular kann etwas fortschicken');
ok(/base-uri 'none'/.test(csp),'CSP: die Basis-URL lässt sich nicht verbiegen');
ok(/img-src 'self'/.test(csp),'CSP: Bilder nur vom eigenen Ursprung, die Symbol-Datei auf Pages');
ok(csp.indexOf('http')<0,'CSP nennt keinen fremden Host: '+csp);
/* Auch zur Laufzeit entsteht keine Adresse: die Karten tasten nach keinem
   Bild neben der Datei, ihre Verläufe sind gerechnet. */
ok(!/img\//.test(html),'kein Pfad in einen Bildordner, auch nicht im Skript');
ok(!/new Image\(/.test(html),'nichts wird nachgeladen');
ok(/SheetJS[\s\S]{0,200}Apache License 2\.0/.test(html),'die Lizenz von SheetJS reist mit');

sec('Kein Netzwerkaufruf — weder im Ordner noch im Bau');
const realFindings = leaks({sources: readSources(), html});
ok(realFindings.length===0, 'keine Netzwerkspur in js/, css/, index.html oder der gebauten Datei: '+findingsText(realFindings));

sec('Der Wächter erkennt jede Leck-Form');
/* Jeder Fall hängt einen Leck-Ausdruck an eine winzige Quelle oder ein
   Markup-Schnipsel und verlangt mindestens einen Fund, dessen Beschreibung
   den Ausdruck nennt — der Wächter soll nicht nur „irgendetwas" finden. */
const has=(fs,needle)=>fs.some(f=>f.what.indexOf(needle)>=0);
const sourceCases=[
  ['fetch(',              "function go(){ return fetch('https://x'); }",        'fetch('],
  ['new XMLHttpRequest',  "var r = new XMLHttpRequest();",                       'new XMLHttpRequest'],
  ['new WebSocket',       "var s = new WebSocket('wss://x');",                   'new WebSocket'],
  ['navigator.sendBeacon',"navigator.sendBeacon('/x');",                         '.sendBeacon'],
  ['new Image()',         "var im = new Image();",                              'new Image('],
  ['new EventSource',     "var e = new EventSource('/e');",                     'new EventSource'],
  ['importScripts',       "importScripts('x.js');",                             'importScripts('],
  ['nackte https-Adresse',"var u = 'https://evil.example/';",                   'https://evil.example/'],
  ['protokoll-relative Adresse', "var u = '//cdn.example/x.js';",               '//cdn.example/x.js'],
  ['css url() in der Quelle', "a{background:url(https://x/y.png)}",            'url(https://x/y.png)']
];
for(const [label,snippet,needle] of sourceCases){
  const found=leaks({sources:[{rel:'synthetic.js',text:snippet}],html:''});
  ok(found.length>0 && has(found,needle), label+' wird in der Quelle erkannt: '+findingsText(found));
}
const htmlCases=[
  ['meta http-equiv="refresh"', '<meta http-equiv="refresh" content="0;url=https://x">', 'refresh'],
  ['srcset',                    '<img srcset="https://x/a.png 1x">',                     'srcset'],
  ['<link rel="preload">',      '<link rel="preload" href="https://x/f.woff2">',         '<link>'],
  ['url() in einem <style>',    '<style>a{background:url(https://x/y.png)}</style>',     'url(https://x/y.png)']
];
for(const [label,snippet,needle] of htmlCases){
  const found=leaks({sources:[],html:snippet});
  ok(found.length>0 && has(found,needle), label+' wird im Bau erkannt: '+findingsText(found));
}
const allowSnippet=[...ALLOWED_URLS].map(u=>"'"+u+"'").join('\n');
const allowFindings=leaks({sources:[{rel:'synthetic-allow.js',text:allowSnippet}],html:''});
ok(allowFindings.length===0,'die erlaubten Adressen bleiben ohne Fund: '+findingsText(allowFindings));

sec('Der Quelltext ist unverändert eingefaltet');
const blocks=[...html.matchAll(/<(style|script) data-src="([^"]+)">\n([\s\S]*?)\n<\/\1>/g)];
let identical=0, differing=[];
for(const [,,rel,body] of blocks){
  const src=fs.readFileSync(path.join(ROOT,rel),'utf8').trimEnd();
  if(body===src) identical++; else differing.push(rel);
}
ok(differing.length===0,'jeder Block gleicht seiner Quelldatei: abweichend '+differing.join(', '));
ok(identical===blocks.length,identical+' von '+blocks.length+' Dateien wortgleich');
/* Wortgleich geht nur, solange nichts maskiert werden muss. Steht eines Tages
   ein </script> in einem Kommentar, maskiert der Bau es — dann schlägt die
   Prüfung oben fehl, und diese Zeile sagt warum. */
ok(!/maskiert/.test(log),'nichts musste maskiert werden');
/* Die Reihenfolge trägt alles: util vor importer, app zuletzt. */
const order=blocks.map(b=>b[2]);
const idx=r=>order.indexOf(r);
ok(idx('js/vendor/xlsx.full.min.js')<idx('js/importer.js'),'SheetJS steht vor dem Importer');
ok(idx('js/util.js')<idx('js/calc.js'),'util steht vor calc');
ok(idx('js/app.js')===order.length-1,'app.js steht zuletzt');
ok(order.slice(0,3).every(r=>r.startsWith('css/')),'die Stylesheets stehen im Kopf');

sec('Die Anwendung läuft aus der Einzeldatei');
const B=await bootBundle();
ok(B.errors.length===0,'kein Fehler beim Ausführen: '+B.errors.join(' | '));
ok(!!B.w.NORDSTERN&&!!B.w.NORDSTERN.app,'NORDSTERN ist da');
ok(typeof B.w.XLSX==='object','SheetJS ist da');
ok(!B.w.document.getElementById('gate').hidden,'ohne Daten steht der Vorhang');

sec('Dieselbe Mappe ergibt dasselbe Bild');
const A=await boot();
const ra=importFixture(A.w), rb=importFixture(B.w);
ok(rb.ok===true,'der Bau liest die Mappe: ok='+rb.ok);
ok(rb.model.months.length===ra.model.months.length,
   'gleich viele Monate: '+rb.model.months.length+' vs '+ra.model.months.length);
ok((rb.warnings||[]).length===(ra.warnings||[]).length,'gleich viele Warnungen');
const txt=w=>w.document.getElementById('posZone').textContent.replace(/\s+/g,' ').trim();
ok(txt(B.w)===txt(A.w),'die Kopfzahlen stimmen überein');
const bars=w=>[...w.document.querySelectorAll('.card .card-back .card-bar i')].map(i=>i.style.width).join(' ');
ok(bars(B.w)===bars(A.w),'die Fortschritte der acht Karten stimmen überein');

sec('Keine Daten im Bau');
/* Der eigentliche Wächter steht in tests/privacy.mjs — er prüft gegen eine
   echte Mappe und über alle Dateien, die ins Repository wandern würden.
   Hier bleibt nur, was die Datei selbst betrifft: keine data:-Adresse
   irgendwo im Bau, auch nicht für die Symbol-Datei. */
const dataCount=(html.match(/(?:src|href)="data:/g)||[]).length;
ok(dataCount===0,'keine Datenadresse im Bau: gezählt '+dataCount);

ok(!html.includes('PK\u0003\u0004'),'kein Stück einer Mappe im Bau');
ok(!/nordstern-example/i.test(html),'auch die Beispielmappe steckt nicht drin');

console.log('\n'+log.trim().split('\n')[0]);
console.log(pass+' bestanden, '+fail+' fehlgeschlagen');
process.exit(fail?1:0);
