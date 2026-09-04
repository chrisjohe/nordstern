/* NORDSTERN: der Commit-Haken selbst.
   Ein Haken, der nichts tut, sieht genauso aus wie einer, der nichts zu tun
   findet. Deshalb diese Reihe: sie legt ein Wegwerf-Repository an, hängt den
   echten Haken ein und prüft, dass er beisst — bei einer untergeschobenen
   Tabelle, bei einem ungeprüften Bild, bei einer echten Zahl aus der Mappe —
   und dass er einen sauberen Commit durchlässt, denn ein Riegel, der alles
   blockiert, wird abgeschraubt.

   Ohne Mappe in excel/ läuft nur die Hälfte, und das steht dann auch da. */
import fs from 'fs'; import os from 'os'; import path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nordstern-hook-'));
const git = (...a) => execFileSync('git', a, { cwd: tmp, encoding: 'utf8', stdio: 'pipe' });

/* Ein Repository, das aussieht wie das echte: derselbe Haken, dieselbe
   privacy.mjs, dieselbe Mappe in excel/, falls es eine gibt. */
fs.mkdirSync(path.join(tmp, '.githooks'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'tests'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'js/vendor'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'examples'), { recursive: true });
/* harness.mjs fehlt hier mit Absicht: der Wächter darf es nicht brauchen. */
for (const f of ['.githooks/pre-commit', 'tests/privacy.mjs',
                 'tests/privacy-allow.txt', 'js/util.js', 'js/importer.js',
                 'js/vendor/xlsx.full.min.js', 'examples/nordstern-example.xlsx',
                 'package.json']) {
  fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
}
fs.chmodSync(path.join(tmp, '.githooks/pre-commit'), 0o755);
fs.writeFileSync(path.join(tmp, '.gitignore'), 'excel/\n*.xlsx\n!examples/*.xlsx\n');

git('init', '-b', 'main', '-q');
git('config', 'core.hooksPath', '.githooks');
git('config', 'user.name', 'Test');
git('config', 'user.email', 'test@example.invalid');
git('config', 'commit.gpgsign', 'false');

const commit = (msg) => spawnSync('git', ['commit', '-q', '-m', msg],
  { cwd: tmp, encoding: 'utf8' });

/* --- ein sauberer Commit muss durchgehen ------------------------------- */
fs.writeFileSync(path.join(tmp, 'README.md'), '# nothing to hide\n');
git('add', 'README.md');
let r = commit('clean');
ok(r.status === 0, 'ein sauberer Commit geht durch: ' + (r.stderr || r.stdout || '').trim());

/* --- eine untergeschobene Tabelle muss scheitern ----------------------- */
fs.copyFileSync(path.join(ROOT, 'examples/nordstern-example.xlsx'), path.join(tmp, 'secret.xlsx'));
git('add', '-f', 'secret.xlsx');
r = commit('smuggle');
ok(r.status !== 0, 'eine Tabelle ausserhalb examples/ wird abgewiesen');
ok(/spreadsheet is staged/.test(r.stdout + r.stderr), 'und der Grund steht da');
git('reset', '-q');
fs.unlinkSync(path.join(tmp, 'secret.xlsx'));

/* --- die Beispielmappe muss durchgehen --------------------------------- */
/* Der Riegel darf nicht pauschal auf .xlsx losgehen — sonst liesse sich die
   Beispielmappe nie pflegen, und der Haken flöge nach dem zweiten Versuch
   raus. */
git('add', '-A');
r = commit('example workbook');
ok(r.status === 0, 'die Beispielmappe darf mit: ' + (r.stdout + r.stderr).trim().split('\n')[0]);
ok(execFileSync('git', ['ls-files'], { cwd: tmp, encoding: 'utf8' })
     .includes('examples/nordstern-example.xlsx'), 'und liegt danach wirklich im Index');

/* --- ein Bild ohne Prüfeintrag muss scheitern -------------------------- */
/* Der Wächter liest keine Pixel. Er kann deshalb nicht sagen, ob auf einem
   Screenshot ein Kontostand steht — aber er kann darauf bestehen, dass jemand
   hingesehen hat. Diese drei Fälle prüfen genau das, und sie laufen auch ohne
   Mappe: hier geht es nicht um fremde Zahlen, sondern um die Frage, ob
   „ungeprüft" auffällt. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');
fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'docs/shot.png'), PNG);
git('add', '-f', 'docs/shot.png');
r = commit('unchecked image');
ok(r.status !== 0, 'ein Bild ohne Prüfeintrag wird abgewiesen');
ok(/privacy-images/.test(r.stdout + r.stderr), 'und sagt, wo der Eintrag hingehört');

/* --- mit Eintrag geht dasselbe Bild durch ------------------------------ */
const sum = (b) => crypto.createHash('sha256').update(b).digest('hex');
fs.writeFileSync(path.join(tmp, 'tests/privacy-images.txt'),
  '# Prüfeinträge\n' + sum(PNG) + '  docs/shot.png  # hingesehen: ein Pixel\n');
git('add', '-A');
r = commit('checked image');
ok(r.status === 0, 'mit Prüfeintrag geht es durch: ' + (r.stdout + r.stderr).trim().split('\n')[0]);

/* --- ein geändertes Bild muss wieder scheitern ------------------------- */
/* Sonst wäre der Eintrag ein Freifahrtschein für den Pfad statt ein Beleg
   für das Bild: einmal geprüft, danach beliebig austauschbar. */
fs.writeFileSync(path.join(tmp, 'docs/shot.png'), Buffer.concat([PNG, Buffer.from([0])]));
git('add', '-A');
r = commit('swapped image');
ok(r.status !== 0, 'ein Bild, das sich seit der Prüfung geändert hat, wird abgewiesen');
ok(/geändert/.test(r.stdout + r.stderr), 'und nennt den Grund');
git('reset', '-q');
fs.unlinkSync(path.join(tmp, 'docs/shot.png'));
fs.writeFileSync(path.join(tmp, 'tests/privacy-images.txt'), '# leer\n');
git('add', '-A');
r = commit('drop image');
ok(r.status === 0, 'und ohne Bild ist wieder Ruhe');

/* --- ein Satz über einen Menschen muss scheitern ----------------------- */
/* Der Riegel gegen Zahlen greift hier nicht: „X ist der Vermögensstand von
   Y" enthält keinen Kontonamen und keinen Betrag. Der Name kommt aus
   package.json, deshalb liegt die Datei im Wegwerf-Repository. */
const NAME = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  .author.split(/[<(]/)[0].trim().split(/\s+/)[0];
fs.writeFileSync(path.join(tmp, 'notes.md'), 'Die Mappe von ' + NAME + ' liegt in excel/.\n');
git('add', 'notes.md');
r = commit('person');
ok(r.status !== 0, 'ein Satz über eine Person wird abgewiesen');
ok(/Personenbezug|Name des Autors/.test(r.stdout + r.stderr), 'und nennt den Grund');

/* Die Urheberzeile darf bleiben — sonst liesse sich die Lizenz nicht führen. */
git('reset', '-q');
fs.writeFileSync(path.join(tmp, 'notes.md'), 'Copyright 2026 ' + NAME + ' J. Beispiel\n');
git('add', 'notes.md');
r = commit('copyright');
ok(r.status === 0, 'eine Urheberzeile geht durch: ' + (r.stdout + r.stderr).trim().split('\n')[0]);
git('rm', '-q', 'notes.md');
r = commit('drop notes');
ok(r.status === 0, 'und danach ist wieder Ruhe');

/* --- eine echte Zahl muss scheitern ------------------------------------ */
/* Der Wert wird aus der Mappe gelesen, nie getippt — er steht in keiner
   Quelldatei dieses Projekts, auch nicht in dieser. */
const real = fs.existsSync(path.join(ROOT, 'excel')) &&
  fs.readdirSync(path.join(ROOT, 'excel')).find((n) => /\.(xlsx|xlsm|ods|numbers)$/i.test(n));

if (!real) {
  console.log('\nⓘ Keine echte Mappe in excel/ — der zweite Riegel bleibt ungeprüft.');
  console.log('  Das ist auf jedem fremden Rechner der Normalfall.');
} else {
  fs.mkdirSync(path.join(tmp, 'excel'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'excel', real), path.join(tmp, 'excel', real));

  const XLSX = (await import('node:module')).createRequire(import.meta.url)(
    path.join(ROOT, 'js/vendor/xlsx.full.min.js'));
  const g = globalThis; g.window = g; g.XLSX = XLSX;
  for (const f of ['js/util.js', 'js/importer.js']) {
    new Function('window', fs.readFileSync(path.join(ROOT, f), 'utf8')).call(g, g);
  }
  const buf = fs.readFileSync(path.join(ROOT, 'excel', real));
  const res = g.NORDSTERN.importer.parseArrayBuffer(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), real);
  const nw = res.model.months[res.model.months.length - 1].netWorth;
  const de = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  fs.writeFileSync(path.join(tmp, 'notes.md'), 'Net worth: ' + de.format(nw) + '\n');
  git('add', 'notes.md');
  r = commit('leak');
  ok(r.status !== 0, 'ein echter Betrag wird abgewiesen — der Riegel, der einmal offen stand');
  ok(/privacy guard found real data/.test(r.stdout + r.stderr) || /TREFFER/.test(r.stdout + r.stderr),
     'und nennt Datei und Zeile');

  /* Und ein Kontoname genauso. */
  git('reset', '-q');
  fs.unlinkSync(path.join(tmp, 'notes.md'));
  const name = Object.values(res.model.accounts).flat().map((a) => a.name)
    .filter((n) => n.length >= 12).sort((a, b) => b.length - a.length)[0];
  if (name) {
    fs.writeFileSync(path.join(tmp, 'notes.md'), 'Account: ' + name + '\n');
    git('add', 'notes.md');
    r = commit('leak name');
    ok(r.status !== 0, 'ein echter Kontoname wird abgewiesen');
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
ok(!fs.existsSync(tmp), 'das Wegwerf-Repository ist wieder weg');

console.log('\n' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
