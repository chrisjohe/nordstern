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

/* --- ist der Haken in diesem Checkout überhaupt eingehängt? ------------- */
/* Ohne .git gibt es nichts zu prüfen — z.B. aus einem npm-Tarball heraus.
   .git ist bei einem Worktree eine Datei, kein Verzeichnis, deshalb reicht
   hier "existiert". */
if (fs.existsSync(path.join(ROOT, '.git'))) {
  let hooksPath = '';
  try {
    hooksPath = execFileSync('git', ['config', '--get', 'core.hooksPath'],
      { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (e) { /* nicht gesetzt */ }
  ok(hooksPath === '.githooks',
    'core.hooksPath steht hier nicht auf .githooks, der Haken läuft nicht — ' +
    '`npm install` (führt prepare aus) oder `git config core.hooksPath .githooks`');
}

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
fs.writeFileSync(path.join(tmp, '.gitignore'), 'excel/\n*.xlsx\n*.xls\n!examples/*.xlsx\n');

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

/* --- eine .xls ausserhalb examples/ scheitert schon an der Endung ------ */
/* .xls ist das aeltere BIFF-Format; die Endungsprüfung muss es genauso
   abweisen wie .xlsx, unabhängig davon, was in der Datei steht. */
fs.writeFileSync(path.join(tmp, 'notes.xls'), Buffer.from('not even a real workbook'));
git('add', '-f', 'notes.xls');
r = commit('xls extension');
ok(r.status !== 0, 'eine .xls ausserhalb examples/ wird abgewiesen');
ok(/spreadsheet is staged/.test(r.stdout + r.stderr), 'und der Grund steht da');
git('reset', '-q');
fs.unlinkSync(path.join(tmp, 'notes.xls'));

/* --- eine als notes.dat getarnte Tabelle scheitert an den Bytes -------- */
/* Eine Umbenennung schlägt die Endungsprüfung oben, nicht die ersten vier
   Bytes: die Beispielmappe ist ein Zip-Container, das steht in ihr selbst,
   nicht im Dateinamen. */
fs.copyFileSync(path.join(ROOT, 'examples/nordstern-example.xlsx'), path.join(tmp, 'notes.dat'));
git('add', '-f', 'notes.dat');
r = commit('disguised as dat');
ok(r.status !== 0, 'eine als notes.dat getarnte Tabelle wird trotzdem abgewiesen');
ok(/zip\/Office container/i.test(r.stdout + r.stderr), 'und nennt den Zip/Office-Grund');
git('reset', '-q');
fs.unlinkSync(path.join(tmp, 'notes.dat'));

/* --- eine BIFF/OLE2-Datei (Alt-Excel) scheitert ebenso an den Bytes ---- */
const OLE2 = Buffer.concat([
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64)]);
fs.writeFileSync(path.join(tmp, 'data.bin'), OLE2);
git('add', '-f', 'data.bin');
r = commit('ole2 disguise');
ok(r.status !== 0, 'eine BIFF/OLE2-Datei wird abgewiesen, auch ohne Tabellen-Endung');
ok(/BIFF\/OLE2/i.test(r.stdout + r.stderr), 'und nennt den BIFF/OLE2-Grund');
git('reset', '-q');
fs.unlinkSync(path.join(tmp, 'data.bin'));

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

/* --- ein SVG ohne Prüfeintrag muss ebenso scheitern -------------------- */
/* Ein Screenshot lässt sich als <image>/base64 in ein SVG einbetten — der
   Wächter muss also auch bei einem Vektorbild darauf bestehen, dass jemand
   hineingesehen hat, genau wie bei einem PNG. */
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>\n';
fs.writeFileSync(path.join(tmp, 'docs/icon.svg'), SVG);
git('add', '-f', 'docs/icon.svg');
r = commit('unchecked svg');
ok(r.status !== 0, 'ein SVG ohne Prüfeintrag wird abgewiesen');
ok(/privacy-images/.test(r.stdout + r.stderr), 'und sagt, wo der Eintrag hingehört');

/* --- mit Eintrag geht dasselbe SVG durch -------------------------------- */
fs.writeFileSync(path.join(tmp, 'tests/privacy-images.txt'),
  '# Prüfeinträge\n' + sum(Buffer.from(SVG)) +
  '  docs/icon.svg  # ein einzelnes <rect>, kein <image>, kein base64\n');
git('add', '-A');
r = commit('checked svg');
ok(r.status === 0, 'mit Prüfeintrag geht das SVG durch: ' + (r.stdout + r.stderr).trim().split('\n')[0]);
/* fs.unlinkSync statt `git rm`: Letzteres räumt ein leer gewordenes docs/
   gleich mit weg, das der nächste Bildtest aber wieder braucht. */
fs.unlinkSync(path.join(tmp, 'docs/icon.svg'));
fs.writeFileSync(path.join(tmp, 'tests/privacy-images.txt'), '# leer\n');
git('add', '-A');
r = commit('drop svg');
ok(r.status === 0, 'und danach ist wieder Ruhe');

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

/* --- der Haken fragt den Index, nicht die Platte ----------------------- */
/* Ein Commit nimmt das, was `git add` zuletzt gesehen hat — nicht das, was
   gerade auf der Platte liegt. Die drei Fälle hier brauchen keine Mappe: der
   Personen- und der Bild-Scan laufen auch ohne sie. */

/* Repariert auf der Platte, aber nicht nachgestaged: der alte, belastete
   Satz steht noch im Index, und der Commit nimmt den Index. */
fs.writeFileSync(path.join(tmp, 'notes.md'), 'Die Mappe von ' + NAME + ' liegt in excel/.\n');
git('add', 'notes.md');
fs.writeFileSync(path.join(tmp, 'notes.md'), 'nothing to see here\n');
r = commit('desk fixed, index not');
ok(r.status !== 0, 'eine auf der Platte reparierte, aber nicht nachgestagte Zeile wird trotzdem abgewiesen: ' + r.status);
ok(/Personenbezug|Name des Autors/.test(r.stdout + r.stderr), 'und nennt den Grund');
git('reset', '-q');
fs.unlinkSync(path.join(tmp, 'notes.md'));

/* Gestaged, dann von der Platte gelöscht: das Bild steckt noch im Index,
   und dorthin schaut der Wächter im Reach --staged. */
fs.writeFileSync(path.join(tmp, 'docs/staged-only.png'), PNG);
git('add', '-f', 'docs/staged-only.png');
fs.unlinkSync(path.join(tmp, 'docs/staged-only.png'));
r = commit('staged image, gone from disk');
ok(r.status !== 0, 'ein gestagtes, von der Platte gelöschtes Bild wird trotzdem geprüft: ' + r.status);
ok(/privacy-images/.test(r.stdout + r.stderr), 'und sagt, wo der Eintrag hingehört');
git('reset', '-q');

/* Die Gegenrichtung: eine belastete Datei liegt ungestaged auf der Platte,
   der Commit selbst ist sauber. Der Haken beurteilt den Commit, nicht das
   Arbeitsverzeichnis — sonst würde jeder halbfertige Entwurf im Verzeichnis
   jeden Commit blockieren, auch einen, der ihn gar nicht mitnimmt. */
fs.writeFileSync(path.join(tmp, 'notes.md'), 'Die Mappe von ' + NAME + ' liegt in excel/.\n');
fs.appendFileSync(path.join(tmp, 'README.md'), '\nmore nothing\n');
git('add', 'README.md');
r = commit('untracked leak on disk, clean stage');
ok(r.status === 0, 'ein ungestagter Satz auf der Platte hält einen sauberen Commit nicht auf: ' +
  (r.stdout + r.stderr).trim().split('\n')[0]);
fs.unlinkSync(path.join(tmp, 'notes.md'));

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

/* Sauberer Boden für die restlichen Fälle, unabhängig davon, ob der
   Mappen-Zweig oben gelaufen ist und was er liegen liess. */
try { fs.unlinkSync(path.join(tmp, 'notes.md')); } catch (e) { /* schon weg */ }
git('reset', '-q');

/* --- eine Ausnahme ohne Begründung (G5) --------------------------------- */
/* raw.slice(raw.indexOf('#') + 1) macht bei fehlendem "#" (indexOf -1) über
   slice(0) die ganze Zeile (die Nadel selbst) zur Begründung. Der Kopf von
   tests/privacy-allow.txt erklärt die Begründung aber zur Pflicht: eine
   bare Zeile muss den Commit verhindern, nicht still durchgehen. */
fs.writeFileSync(path.join(tmp, 'tests/privacy-allow.txt'), 'Dashboard\n');
fs.appendFileSync(path.join(tmp, 'README.md'), '\nbare allow line\n');
git('add', '-A');
r = commit('bare allow line');
ok(r.status !== 0, 'eine Ausnahme ohne Begründung lässt keinen Commit durch: ' + r.status);
ok(/privacy-allow\.txt:1\b/.test(r.stdout + r.stderr),
  'und nennt die Zeile: ' + (r.stdout + r.stderr).trim().split('\n').slice(0, 3).join(' | '));
git('reset', '-q');

/* Mit Begründung geht dieselbe Nadel wieder durch: die Regel trifft die
   Form der Zeile, nicht die Nadel selbst. */
fs.writeFileSync(path.join(tmp, 'tests/privacy-allow.txt'),
  fs.readFileSync(path.join(ROOT, 'tests/privacy-allow.txt')));
git('add', '-A');
r = commit('restore allow file');
ok(r.status === 0, 'mit Begründung ist wieder Ruhe: ' + (r.stdout + r.stderr).trim().split('\n')[0]);

/* --- der Personen-Scan meldet jeden Treffer, nicht nur den ersten (G6) -- */
/* Zwei Zeilen mit demselben Namen in derselben Datei müssen zwei Zeilen im
   Bericht ergeben, sonst versteht niemand aus der Meldung, wie viel
   aufzuräumen ist. */
fs.writeFileSync(path.join(tmp, 'notes.md'),
  'Die Mappe von ' + NAME + ' liegt in excel/.\n' +
  'Auch diese Zeile spricht von ' + NAME + ' und der Mappe.\n');
git('add', 'notes.md');
r = commit('person twice');
ok(r.status !== 0, 'zwei Sätze über dieselbe Person werden abgewiesen');
ok(/notes\.md:1\b/.test(r.stdout + r.stderr) && /notes\.md:2\b/.test(r.stdout + r.stderr),
  'und beide Zeilen stehen im Bericht, nicht nur die erste: ' +
  (r.stdout + r.stderr).trim().split('\n').slice(0, 5).join(' | '));
git('reset', '-q');
fs.unlinkSync(path.join(tmp, 'notes.md'));

fs.rmSync(tmp, { recursive: true, force: true });
ok(!fs.existsSync(tmp), 'das Wegwerf-Repository ist wieder weg');

/* --- der prepare-Schritt: hängt den Haken von selbst ein ---------------- */
/* Direkt das Skript aus package.json, nicht `npm run prepare` — dieser Test
   soll auch ohne node_modules laufen. Zwei Richtungen: in einem Repository
   hängt er den Haken ein, ausserhalb bricht er nicht ab. */
const prepareScript = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts.prepare;

const prepGit = fs.mkdtempSync(path.join(os.tmpdir(), 'nordstern-prepare-git-'));
execFileSync('git', ['init', '-b', 'main', '-q'], { cwd: prepGit });
let rp = spawnSync('sh', ['-c', prepareScript], { cwd: prepGit, encoding: 'utf8' });
ok(rp.status === 0, 'prepare läuft in einem frischen Repository durch: ' + (rp.stderr || '').trim());
const hooked = execFileSync('git', ['config', '--get', 'core.hooksPath'], { cwd: prepGit, encoding: 'utf8' }).trim();
ok(hooked === '.githooks', 'und hängt den Haken dort ein: ' + hooked);
fs.rmSync(prepGit, { recursive: true, force: true });

const prepNoGit = fs.mkdtempSync(path.join(os.tmpdir(), 'nordstern-prepare-nogit-'));
rp = spawnSync('sh', ['-c', prepareScript], { cwd: prepNoGit, encoding: 'utf8' });
ok(rp.status === 0, 'und bricht ausserhalb eines Repositories nicht ab: ' + (rp.stderr || '').trim());
fs.rmSync(prepNoGit, { recursive: true, force: true });

console.log('\n' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
