import fs from 'fs';
import path from 'path';
import {boot, ROOT, tick} from './harness.mjs';

/* Kein Test: dieses Skript behauptet nichts, es gibt nur einen maskierten
   Rundgang durch die gerenderte Seite aus. Läuft nicht in `npm test` mit,
   weil behaviour.mjs dieselbe Anwendung bereits bootet und dieselbe
   Beispielmappe bereits importiert; von Hand gestartet über `npm run smoke`. */
const {w, errors} = await boot();

/* Standard ist die Beispielmappe. NORDSTERN_WORKBOOK=… zeigt auf eine echte
   Datei — diese Reihe behauptet nichts, sie gibt nur aus, und ist damit der
   Weg, eine eigene Mappe einmal durch die ganze Anwendung zu schicken. */
const FIXTURE=process.env.NORDSTERN_WORKBOOK||path.join(ROOT,'examples/nordstern-example.xlsx');
/* MASK ist wahr, sobald es nicht die mitgelieferte Beispielmappe ist: dann kann
   hier eine echte Mappe mit echten Beträgen laufen, und die darf auf der
   Konsole nicht erscheinen — auch nicht in einem Testlauf, auch nicht
   teilweise (AGENTS.md Regel 6). Jede Ausgabe ab hier, die Inhalte aus dem
   gerenderten DOM oder dem Modell zeigen könnte, läuft durch say(): das ist
   die einzige Stelle, an der geprüft werden muss, ob etwas durchsickert. */
const MASK = path.resolve(FIXTURE) !== path.resolve(ROOT,'examples/nordstern-example.xlsx');
function say(label, value){
  if(MASK){
    // Selbstkontrolle: keine Tausendertrennung, keine Nachkommabeträge, kein Währungszeichen.
    const s=String(value);
    if(/[€$£]|\d{1,3}(?:[.,]\d{3})+|\d+[.,]\d{2}\b/.test(s)){
      throw new Error('say(): möglicher Betrag in maskierter Ausgabe bei "'+label+'": '+s);
    }
  }
  console.log(label+':', value);
}
say('Mappe', MASK? 'eigene Mappe (maskiert)' : path.basename(FIXTURE));
const buf=fs.readFileSync(FIXTURE);
const res=w.NORDSTERN.importer.parseArrayBuffer(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),path.basename(FIXTURE));
if(!res.ok){
  if(MASK) say('IMPORT FEHLGESCHLAGEN, Fehler', res.errors.length);
  else console.log('IMPORT FEHLGESCHLAGEN', res.errors);
  process.exit(1);
}
w.NORDSTERN.app.state.model=res.model;
try { w.NORDSTERN.app.refresh(); } catch(e){ errors.push('refresh: '+e.message+'\n'+e.stack.split('\n').slice(0,4).join('\n')); }
w.document.getElementById('gate').hidden=true;

// rAF ein paar Frames laufen lassen (Berg zeichnet)
await tick(260);

const d=w.document;
// Bei einer echten Mappe nur Vorhandensein und Länge, nie den Text selbst.
const out=(sel,label)=>{
  const n=d.querySelector(sel);
  const text=n? n.textContent.trim().replace(/\s+/g,' ') : null;
  if(text===null){ say(label,'FEHLT'); return; }
  say(label, MASK? 'vorhanden ('+text.length+' Zeichen)' : text.slice(0,150));
};
console.log('\n— gerendert —');
out('.hero-val','Net Worth');
out('.hero-deltas','Deltas');
out('.kpi-row','KPIs');
out('.mount-status','Status');
say('Vorjahreslinie', (!!d.querySelector('.chart-ya-stub[mask]'))+' / voll: '+(!!d.querySelector('.chart-ya-full'))+' | Blende: '+(!!d.querySelector('#nsYaMask')));
say('Chart-SVG', (!!d.querySelector('.chart-svg'))+' | Pfade: '+d.querySelectorAll('.chart-svg path').length+' | Gitterlinien: '+d.querySelectorAll('.chart-grid line').length+' | Jahresmarken: '+d.querySelectorAll('.chart-xlab text').length);
say('Orbit-Bögen', d.querySelectorAll('.orbit-arc').length+' | Legendenzeilen: '+d.querySelectorAll('.legend-row').length);
const cardEls=d.querySelectorAll('.card');
say('Cards', cardEls.length+' | Status: '+(MASK? cardEls.length+' Einträge (maskiert)' : Array.from(cardEls).map(c=>c.dataset.id+':'+c.dataset.status).join(' ')));
const barEls=d.querySelectorAll('.card-bar i');
say('Card-Balken', MASK? barEls.length+' Balken (maskiert)' : Array.from(barEls).map(i=>i.style.width).join(' '));
const back=d.querySelector('.card[data-id="barista"] .card-back');
const backText=back? back.textContent.replace(/\s+/g,' ').trim() : null;
say('Rückseite Aurora', backText===null? 'FEHLT' : (MASK? 'vorhanden ('+backText.length+' Zeichen)' : backText.slice(0,200)));
console.log('\nFehler gesamt:', errors.length);
errors.forEach(e=>console.log('  ! '+e));

process.exit(errors.length?1:0);
