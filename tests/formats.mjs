/* NORDSTERN — welche Tabellen gelesen werden.
   Der Dateidialog nennt fünf Formate. Diese Reihe schreibt die Beispielmappe
   in jedes davon und liest sie mit dem echten Importer zurück: gleiche
   Monatszahl, gleiche Beträge, keine Warnung. Was der Dialog verspricht, ist
   damit nachgewiesen und nicht behauptet.

   Nicht dabei: .numbers. Der Leser dafür steckt im Bundle (SheetJS erkennt
   Index/Document.iwa), aber schreiben kann SheetJS das Format ohne Vorlage
   nicht — es gibt hier also keine Datei, gegen die zu prüfen wäre. Das muss
   von Hand geprüft werden, auf einem Mac mit Numbers. */
import fs from 'fs'; import path from 'path';
import { createRequire } from 'node:module';
import { ROOT, FIXTURE } from './harness.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };

const XLSX = createRequire(import.meta.url)(path.join(ROOT, 'js/vendor/xlsx.full.min.js'));

/* Der Importer, ohne DOM — er berührt keins. */
const g = globalThis;
g.window = g; g.XLSX = XLSX;
for (const f of ['js/util.js', 'js/importer.js']) {
  new Function('window', fs.readFileSync(path.join(ROOT, f), 'utf8')).call(g, g);
}
const read = (buf, name) =>
  g.NORDSTERN.importer.parseArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), name);

const base = read(fs.readFileSync(FIXTURE), 'nordstern-example.xlsx');
ok(base.ok && base.warnings.length === 0, 'die Beispielmappe selbst liest sich sauber');
{
  const kept = g.NORDSTERN.importer._openWorkbook(XLSX, new Uint8Array(fs.readFileSync(FIXTURE))).SheetNames;
  ok(kept.join(' · ') === 'Data Input · Expenses',
     'und gibt nur die zwei Blätter weiter, obwohl sie drei hat: ' + kept.join(' · '));
}
const ref = base.model.months[base.model.months.length - 1];

/* Was index.html im accept anbietet — jedes Format einzeln nachgewiesen. */
const accept = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .match(/id="filePicker"[^>]*accept="([^"]+)"/)[1].split(',').map((s) => s.trim().replace(/^\./, ''));
ok(accept.join(' ') === 'xlsx xlsm xlsb ods numbers',
   'der Dialog bietet fünf Formate an: ' + accept.join(' · '));

const wb = XLSX.read(fs.readFileSync(FIXTURE), { type: 'buffer', cellDates: true });
for (const bt of accept.filter((f) => f !== 'numbers')) {
  const buf = XLSX.write(wb, { type: 'buffer', bookType: bt, cellDates: true });
  const r = read(Buffer.from(buf), 'example.' + bt);
  if (!r.ok) { ok(false, bt + ': ' + r.errors.join(' | ')); continue; }
  const last = r.model.months[r.model.months.length - 1];
  ok(r.warnings.length === 0, bt + ' ohne Warnung: ' + r.warnings.join(' | '));
  ok(r.model.months.length === base.model.months.length,
     bt + ' hat gleich viele Monate: ' + r.model.months.length);
  ok(last.netWorth === ref.netWorth && last.investment === ref.investment && last.liquid === ref.liquid,
     bt + ' ergibt dieselben Beträge: ' + last.netWorth + ' vs ' + ref.netWorth);

  /* Und das dritte Blatt kommt in keinem Format durch. Geprüft wird das
     Ergebnis, nicht die Absicht: für ods ignoriert SheetJS den `sheets`-
     Filter und parst doch alles — dort trägt die Reduktion danach.

     Der Spion zählt mit, wie viele Blätter SheetJS im zweiten Durchgang
     wirklich dekodiert hat. Damit steht die Ausnahme als Zahl da, statt als
     Fussnote: sie darf nicht wachsen, und wenn SheetJS den Filter eines
     Tages auch für ods beachtet, sagt es diese Reihe. */
  const decoded = [];
  const spy = Object.assign(Object.create(XLSX), {
    read(b, o) {
      const wbx = XLSX.read(b, o);
      if (!o.bookSheets) decoded.push(Object.keys(wbx.Sheets).length);
      return wbx;
    }
  });
  const kept = g.NORDSTERN.importer._openWorkbook(spy, new Uint8Array(buf)).SheetNames;
  ok(kept.join(' · ') === 'Data Input · Expenses',
     bt + ' reicht nur die zwei Blätter weiter: ' + kept.join(' · '));
  const expected = bt === 'ods' ? 3 : 2;
  ok(decoded.length === 1 && decoded[0] === expected,
     bt + ': ' + decoded[0] + ' von 3 Blättern dekodiert' +
     (expected === 3 ? ' — SheetJS kennt für dieses Format keinen Filter' : ''));
}

/* Und der Leser für Numbers ist wirklich im Bundle — geprüft am Code, weil
   es keine Datei zum Prüfen gibt. */
const vendor = fs.readFileSync(path.join(ROOT, 'js/vendor/xlsx.full.min.js'), 'utf8');
ok(vendor.includes('Index/Document.iwa'), 'SheetJS erkennt Numbers-Dateien');
ok(/NUMBERS file parsing requires/.test(vendor), 'und hat den Parser dafür an Bord');

/* Google Sheets hat kein eigenes Format — der Export ist .xlsx oder .ods,
   beides oben nachgewiesen. Es gibt hier nichts eigenes zu prüfen. */

console.log('\n' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
