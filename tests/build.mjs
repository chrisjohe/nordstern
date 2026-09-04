/* NORDSTERN: Prüfung des Einzeldatei-Baus.
   Baut frisch und stellt drei Fragen: Ist die Datei wirklich geschlossen?
   Steht darin Zeichen für Zeichen der Quelltext aus dem Ordner? Und läuft
   die Anwendung daraus genauso — bis hin zur eingelesenen Mappe? */
import {boot, bootBundle, importFixture, ROOT} from './harness.mjs';
import {execFileSync} from 'child_process';
import fs from 'fs'; import path from 'path';

let pass=0, fail=0;
const ok=(c,m)=>{ if(c){pass++;} else {fail++; console.log('  ✗ '+m);} };
const sec=t=>console.log('\n== '+t);

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
