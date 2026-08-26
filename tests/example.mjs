/* NORDSTERN — die ausgelieferte Beispielmappe gegen ihren Erzeuger.
   Die Mappe in examples/ stammt aus tools/make-example.mjs, ist danach aber
   von Hand formatiert worden: Spaltenbreiten, Zahlenformate, abgesetzte
   Summenzeilen. Wer sie öffnet, soll sofort sehen, wie sie gebaut ist.

   Byte-Gleichheit mit dem Skript ist damit ausgeschlossen: ein
   Tabellenprogramm schreibt seine eigene Datei, und die freie Fassung von
   SheetJS schreibt keine Zellformate. Was zählt, ist ohnehin nicht die
   Byte-Gleichheit, sondern die Aussage — dass die Zahlen im Repository genau
   die erfundenen sind, die das Skript beschreibt. Diese Reihe erzeugt die
   Mappe dafür neu, an einen Wegwerf-Pfad, und vergleicht beide Modelle Feld
   für Feld.

   Schlägt sie fehl, ist eines von beiden veraltet: entweder ist die
   ausgelieferte Mappe von Hand verändert worden (dann stimmen die Zahlen in
   den Reihen und in der Dokumentation nicht mehr), oder das Skript wurde
   geändert, ohne die Mappe neu zu erzeugen (npm run example -- --force). */
import fs from 'fs'; import os from 'os'; import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };

/* Kein jsdom: hier wird gelesen, nicht dargestellt. */
const g = { window: null }; g.window = g;
g.XLSX = createRequire(import.meta.url)(path.join(ROOT, 'js/vendor/xlsx.full.min.js'));
for (const f of ['js/util.js', 'js/importer.js']) {
  new Function('window', fs.readFileSync(path.join(ROOT, f), 'utf8')).call(g, g);
}
function read(file) {
  const b = fs.readFileSync(file);
  return g.NORDSTERN.importer.parseArrayBuffer(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), path.basename(file));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nordstern-example-'));
const gen = path.join(tmp, 'generated.xlsx');
execFileSync('node', [path.join(ROOT, 'tools/make-example.mjs'), '--out', gen], { stdio: 'pipe' });

const shipped = read(path.join(ROOT, 'examples/nordstern-example.xlsx'));
const fresh = read(gen);

ok(shipped.ok, 'die ausgelieferte Mappe ist lesbar: ' + shipped.errors.join(' | '));
ok(fresh.ok, 'die erzeugte auch');
ok(shipped.warnings.length === 0, 'ohne Warnungen: ' + shipped.warnings.join(' | '));

/* Feld für Feld, Zahlen mit Toleranz: die ausgelieferte Mappe ist einmal
   durch ein Tabellenprogramm gegangen, und das darf am letzten Bit drehen —
   an keiner Stelle, die ein Mensch je sähe. */
const EPS = 1e-6;
const diffs = [];
(function cmp(a, b, at) {
  if (diffs.length > 12) return;
  if (typeof a === 'number' && typeof b === 'number') {
    if (Math.abs(a - b) > EPS) diffs.push(at + ': ' + a + ' statt ' + b);
    return;
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    if (a !== b) diffs.push(at + ': ' + JSON.stringify(a) + ' statt ' + JSON.stringify(b));
    return;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (k === 'sourceName' || k === 'importedAt') continue;   // sagen nichts über die Zahlen
    cmp(a[k], b[k], at ? at + '.' + k : k);
  }
})(shipped.model, fresh.model, '');

ok(diffs.length === 0, 'die ausgelieferte Mappe sagt dasselbe wie ihr Erzeuger:\n     ' + diffs.join('\n     '));

/* Was in der Dokumentation steht, steht auch in der Datei. */
const m = shipped.model, L = m.currentIndex;
ok(m.months.length === 84, '84 Monate: ' + m.months.length);
ok(m.months[L].key === '2026-08', 'bis August 2026: ' + m.months[L].key);
const names = g.XLSX.read(fs.readFileSync(path.join(ROOT, 'examples/nordstern-example.xlsx')),
  { type: 'buffer', bookSheets: true }).SheetNames;
ok(names.length === 2 && names.some((n) => /read me/i.test(n)),
   'zwei Blätter, davon eines, das ungelesen bleibt: ' + names.join(' · '));

/* Und das zweite Blatt bleibt draußen: weder sein Name noch ein Satz daraus
   steht im Modell, das gleich im localStorage landet. */
const third = names.find((n) => !/^data input$/i.test(n));
const wbAll = g.XLSX.read(fs.readFileSync(path.join(ROOT, 'examples/nordstern-example.xlsx')),
  { type: 'buffer', cellDates: true });
const cells = Object.keys(wbAll.Sheets[third]).filter((k) => k[0] !== '!')
  .map((k) => wbAll.Sheets[third][k].v).filter((v) => typeof v === 'string' && v.length >= 12);
const dump = JSON.stringify(m);
ok(cells.length >= 3, 'das dritte Blatt trägt Text, gegen den sich prüfen lässt: ' + cells.length);
const leaked = [third, ...cells].filter((s) => dump.includes(s));
ok(leaked.length === 0, 'nichts vom dritten Blatt im Modell: ' + leaked.join(' | '));
ok(!('sheetNames' in m), 'und die Blattnamen stehen gar nicht erst darin');
ok(Math.abs(m.months[L].netWorth - 450239.15) < 0.005, 'Net Worth 450.239,15: ' + m.months[L].netWorth.toFixed(2));
ok(!('expenses' in m), 'kein expenses-Feld im Modell — die Ausgaben kommen aus den Einstellungen');

/* Und der Erzeuger überschreibt die Formatierung nicht aus Versehen. */
const r = execFileSync('node', ['-e', `
  const {spawnSync} = require('child_process');
  const r = spawnSync('node', ['${path.join(ROOT, 'tools/make-example.mjs')}'], {encoding: 'utf8'});
  console.log(JSON.stringify({ status: r.status, err: r.stderr }));
`], { encoding: 'utf8', cwd: ROOT });
const guard = JSON.parse(r);
ok(guard.status !== 0, 'ohne --force schreibt der Erzeuger nicht über die ausgelieferte Mappe');
ok(/--force/.test(guard.err), 'und sagt, wie man es doch tut');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
