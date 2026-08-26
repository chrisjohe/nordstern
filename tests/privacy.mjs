/* NORDSTERN — der Wächter.
   Die .gitignore schützt die Datei, nicht die Zahlen. Wer beim Schreiben einen
   echten Wert abschreibt — in eine Reihe, ins README, in den DATA_CONTRACT —,
   trägt ihn mit dem nächsten Commit für immer in die History.

   Diese Reihe nimmt eine echte Mappe, zieht heraus, was daraus niemals
   irgendwo auftauchen darf, und durchsucht damit genau die Dateien, die ein
   Commit mitnehmen würde. Sie prüft nicht den Quelltext auf Absicht, sondern
   das Ergebnis auf Tatsachen.

   Ohne Mappe läuft sie durch und sagt das deutlich: auf einem fremden Rechner
   und in der CI gibt es nichts zu schützen. Sie ersetzt kein Nachdenken —
   sie fängt nur das, was beim Nachdenken durchgerutscht ist. */
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

/* Diese Reihe steht bewusst allein: kein Import aus harness.mjs, weil das
   jsdom nachzieht. Sie läuft im pre-commit-Haken, also auch auf einem
   Rechner, auf dem noch nie `npm install` gelaufen ist — und ein Wächter,
   der dort mit einem Stacktrace statt mit einem Urteil abbricht, ist keiner.
   Alles, was sie braucht, ist Node und die vendorte SheetJS-Datei. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Der Pfad steht bewusst nicht als Dateiname da — auch der wäre eine Angabe
   über die private Mappe. Gesucht wird die erste Tabelle in excel/. */
function findWorkbook() {
  if (process.env.NORDSTERN_WORKBOOK) return process.env.NORDSTERN_WORKBOOK;
  const dir = path.join(ROOT, 'excel');
  if (!fs.existsSync(dir)) return null;
  const f = fs.readdirSync(dir).filter((n) => /\.(xlsx|xlsm|xlsb|ods|numbers)$/i.test(n)).sort()[0];
  return f ? path.join(dir, f) : null;
}
const WORKBOOK = findWorkbook();

function report(list) {
  console.log('\n' + list.length + ' TREFFER — das darf so nicht ins Repository:\n');
  for (const h of list) console.log('  ' + h.rel + ':' + h.line + '  „' + h.needle + '"  (' + h.what + ')');
  if (list.some((h) => /^Bild /.test(h.what))) {
    console.log('\nBei einem Bild heisst das nicht zwingend „falsch", sondern „ungeprüft": hineinsehen,');
    console.log('und wenn nichts Persönliches darauf ist, die Zeile in tests/privacy-images.txt setzen —');
    console.log('Prüfsumme, Pfad, und hinter dem # wie geprüft wurde.');
  }
  console.log('\nSonst entfernen, bevor committet wird. Steht es schon in einem Commit, hilft nur');
  console.log('eine neue History — ein Folge-Commit entfernt nichts, er legt nur etwas darüber.');
}

/* Zwei Reichweiten. Normal: was ein Commit mitnehmen würde — das ist die
   Frage vor dem Veröffentlichen. Mit --all oder NORDSTERN_SCAN_ALL: alles,
   was auf der Platte liegt, auch das von .gitignore Verborgene. Denn „nicht
   im Repository" heisst nicht „nicht vorhanden", und die Frage, ob irgendwo
   noch persönliche Daten liegen, ist eine andere als die, ob sie ins Netz
   geraten. Nur excel/ selbst und node_modules bleiben aussen vor: das eine
   ist die Quelle, das andere fremder Code. */
const ALL = process.argv.indexOf('--all') >= 0 || !!process.env.NORDSTERN_SCAN_ALL;

function listFiles() {
  try {
    if (ALL) throw new Error('walk');
    return execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n').filter(Boolean);
  } catch (e) {
    /* Noch kein Repository, oder --all: der Baum. */
    const skip = ALL ? /^(node_modules|excel)(\/|$)/ : /^(node_modules|\.git|excel|backup)(\/|$)/;
    const out = [];
    (function walk(rel) {
      for (const e of fs.readdirSync(path.join(ROOT, rel) || ROOT, { withFileTypes: true })) {
        const r = rel ? rel + '/' + e.name : e.name;
        if (skip.test(r)) continue;
        if (e.isDirectory()) walk(r); else out.push(r);
      }
    })('');
    return out;
  }
}
const files = listFiles();

/* ------------------------------------------------ Bilder: der blinde Fleck */

/* Der Wächter liest Text. Ein Screenshot der laufenden Anwendung zeigt aber
   genau das, was er sucht — Kontonamen, Beträge, den Dateinamen in der
   Titelleiste —, und kein Muster der Welt findet das in einem PNG. Über ein
   Bild zu schweigen hiesse also, die eine Datei durchzuwinken, die alles
   zeigt.

   Deshalb: jedes Bild braucht eine Zeile in
   tests/privacy-images.txt mit seiner Prüfsumme und der Angabe, wie geprüft
   wurde. Ändert sich das Bild, ändert sich die Prüfsumme, und die Zeile gilt
   nicht mehr. Das prüft nicht den Inhalt — das kann nur ein Mensch. Es sorgt
   nur dafür, dass „ungeprüft" kein stiller Zustand ist.

   Diese Prüfung läuft ohne Mappe, also auch in der CI und auf jedem fremden
   Rechner: Sie fragt nicht, ob private Zahlen im Bild stehen, sondern ob
   überhaupt jemand hingesehen hat. */
const IMAGE = /\.(png|jpe?g|webp|gif|avif|bmp|tiff?|pdf)$/i;

const checked = new Map();                       // Pfad → { sum, why }
const imgFile = path.join(ROOT, 'tests/privacy-images.txt');
if (fs.existsSync(imgFile)) {
  fs.readFileSync(imgFile, 'utf8').split('\n').forEach((raw) => {
    const body = raw.replace(/\s*#.*$/, '').trim();
    if (!body) return;
    const m = body.match(/^([0-9a-f]{64})\s+(.+)$/i);
    if (m) checked.set(m[2].trim(), { sum: m[1].toLowerCase(), why: raw.slice(raw.indexOf('#') + 1).trim() });
  });
}
const sha = (abs) => crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');

const imageHits = [];
const images = files.filter((rel) => IMAGE.test(rel));
for (const rel of images) {
  const abs = path.join(ROOT, rel);
  let st; try { st = fs.statSync(abs); } catch (e) { continue; }
  if (!st.isFile()) continue;
  const entry = checked.get(rel);
  if (!entry) {
    imageHits.push({ rel, line: 0, needle: sha(abs).slice(0, 16) + '…',
      what: 'Bild ohne Eintrag in tests/privacy-images.txt — niemand hat hineingesehen' });
  } else if (entry.sum !== sha(abs)) {
    imageHits.push({ rel, line: 0, needle: sha(abs).slice(0, 16) + '…',
      what: 'Bild geändert seit der Prüfung — die Prüfsumme in tests/privacy-images.txt passt nicht mehr' });
  }
}

/* Ausnahmen stehen in einer Datei, nicht im Kopf: jede Nadel, die trotz
   Treffer keine Preisgabe ist, braucht eine Zeile mit Begründung. Ein
   Wächter, den man still umgeht, ist keiner. */
const ALLOW = new Map();
const allowFile = path.join(ROOT, 'tests/privacy-allow.txt');
if (fs.existsSync(allowFile)) {
  fs.readFileSync(allowFile, 'utf8').split('\n').forEach((raw) => {
    const line = raw.replace(/\s*#.*$/, '').trim();
    if (line) ALLOW.set(line, raw.slice(raw.indexOf('#') + 1).trim());
  });
}
const waived = (rel, needle) => ALLOW.has(needle) || ALLOW.has(rel + ':' + needle);

/* ------------------------------------------------ wer, nicht nur was */

/* Der Wächter oben sucht Nadeln aus der Mappe: Kontonamen, Posten, Beträge.
   Ein Satz, der einen Menschen benennt und etwas über seine Lage sagt,
   enthält keine davon und geht glatt durch — Zahlen wären geschützt,
   Biografie nicht.

   Also die zweite Sorte Nadel: der Name aus package.json, seine Bestandteile,
   und die Wendungen, mit denen aus einer Sache eine Person wird. Der Genitiv
   zählt mit; die Form mit angehängtem -s ist derselbe Verstoss.

   Wo die Lizenz den Namen verlangt, steht er zu Recht: Zeilen mit Copyright,
   Markenhinweis, „developed by" oder einer Lizenznennung sind ausgenommen.
   Alles andere braucht eine begründete Zeile in privacy-allow.txt.

   Läuft ohne Mappe, also auch in der CI: hier geht es nicht um fremde Zahlen,
   sondern um Sätze über Menschen. */
const persons = new Map();
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const author = String(pkg.author || '').split(/[<(]/)[0].trim();
  if (author) {
    persons.set(author, 'Name des Autors');
    author.split(/\s+/).forEach((tok) => {
      const t = tok.replace(/[.,]/g, '');
      if (t.length >= 4) persons.set(t, 'Name des Autors');
    });
  }
} catch (e) { /* kein package.json — dann gibt es hier nichts zu schützen */ }
['des Autors', 'dem Autor', 'der Autor', 'the maintainer\u2019s', "the maintainer's"]
  .forEach((r) => persons.set(r, 'Rolle statt Sache'));

/* Wortgrenze, aber mit Genitiv-s: „<Vorname>s Datei" ist der Fall, um den es
   geht. Kein Punkt in der Grenze, sonst schlüge ein Initial nie an. */
const prx = new Map([...persons].map(([n]) =>
  [n, new RegExp('(?<!\\w)' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:s|\u2019s|\'s)?(?!\\w)', 'i')]));

/* Wo der Name hingehört: in die Urheber- und Markenzeilen. */
const LICENCE = /(copyright|\u00a9|trademarks? of|"author"\s*:|developed by|licen[cs])/i;

const BINARY = /\.(xlsx|xlsm|xlsb|ods|numbers|png|jpe?g|webp|gif|pdf|zip|woff2?|ttf|otf)$/i;

/* Text oder nichts: Binärdateien, zu grosse Dateien und die Ausnahmeliste
   selbst (die steht voller Nadeln, das ist ihr Zweck) bleiben draussen. */
function textOf(rel) {
  if (BINARY.test(rel) || rel === 'tests/privacy-allow.txt') return null;
  const abs = path.join(ROOT, rel);
  let st; try { st = fs.statSync(abs); } catch (e) { return null; }
  if (!st.isFile() || st.size > 8 * 1024 * 1024) return null;
  return fs.readFileSync(abs, 'utf8');
}

const personHits = [];
function scanPersons(rel, text) {
  /* .git/ trägt den Namen zwangsläufig — ohne ihn liesse sich kein Commit
     zuordnen. Was dort steht, geht auch nirgendwohin. */
  if (rel.startsWith('.git/')) return;
  const lines = text.split('\n');
  for (const [needle, what] of persons) {
    if (waived(rel, needle)) continue;
    for (let i = 0; i < lines.length; i++) {
      if (LICENCE.test(lines[i])) continue;
      if (prx.get(needle).test(lines[i])) {
        personHits.push({ rel, line: i + 1, needle, what });
        break;
      }
    }
  }
}

for (const rel of files) {
  const text = textOf(rel);
  if (text != null) scanPersons(rel, text);
}

function imageVerdict() {
  const n = images.length;
  console.log('\n== Bilder: ' + n + (n === 1 ? ' Bild' : ' Bilder') + ', ' +
              (imageHits.length ? imageHits.length + ' ungeprüft' : 'alle mit Prüfeintrag'));
  console.log('== Personenbezug: ' + persons.size + ' Wendungen, ' +
              (personHits.length ? personHits.length + ' Treffer' : 'nichts ausserhalb der Urheberzeilen'));
}

if (!WORKBOOK || !fs.existsSync(WORKBOOK)) {
  imageVerdict();
  const early = imageHits.concat(personHits);
  if (early.length) { report(early); }
  console.log('\nⓘ Keine echte Mappe in excel/ — keine Nadeln zu suchen.');
  console.log('  Auf einem fremden Rechner ist das der Normalfall. Wer die Reihe fahren will,');
  console.log('  legt seine Mappe dorthin oder setzt NORDSTERN_WORKBOOK.');
  process.exit(early.length ? 1 : 0);
}

/* ------------------------------------------------ die Mappe lesen, headless */

const g = { window: null };
g.window = g;
const XLSX = createRequire(import.meta.url)(path.join(ROOT, 'js/vendor/xlsx.full.min.js'));
g.XLSX = XLSX;
const run = (f) => new Function('window', 'g',
  fs.readFileSync(path.join(ROOT, f), 'utf8')).call(g, g, g);
run('js/util.js');
run('js/importer.js');

const buf = fs.readFileSync(WORKBOOK);
const res = g.NORDSTERN.importer.parseArrayBuffer(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), path.basename(WORKBOOK));
if (!res.ok) { console.log('Mappe nicht lesbar: ' + res.errors.join(' | ')); process.exit(1); }
const M = res.model;

/* ------------------------------------------------------- was geheim bleibt */

const needles = new Map();                       // Nadel → wofür sie steht
const add = (v, what) => { if (v && String(v).length >= 5) needles.set(String(v), what); };

Object.entries(M.accounts).forEach(([sec, rows]) =>
  rows.forEach((a) => add(a.name, 'Kontoname (' + sec + ')')));
/* Die Namen der übrigen Blätter stehen nicht mehr im Modell — genau das ist
   der Punkt. Sie kommen deshalb aus der Datei selbst; taucht einer davon
   irgendwo auf, ist etwas durchgesickert. */
XLSX.read(new Uint8Array(buf), { type: 'array', bookSheets: true }).SheetNames
  .filter((n) => !/^(data input)$/i.test(n))
  .forEach((n) => add(n, 'Blattname'));
add(path.basename(WORKBOOK).replace(/\.[^.]+$/, ''), 'Dateiname der Mappe');

/* Beträge in jeder Schreibweise, in der sie in einem Text landen könnten:
   roh, deutsch mit und ohne Nachkommastellen. Die letzten zwei Jahre plus die
   Extreme — mehr wäre nur langsamer, nicht sicherer. */
const de2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const de0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const amounts = [];
M.months.slice(-24).forEach((m) => amounts.push(m.netWorth, m.totalAssets, m.investment, m.liquid, m.liabilities));
amounts.push(Math.max(...M.months.map((m) => m.netWorth)), Math.min(...M.months.map((m) => m.netWorth)));
amounts.filter((n) => typeof n === 'number' && Math.abs(n) >= 100).forEach((n) => {
  add(de2.format(n), 'Betrag'); add(de0.format(n), 'Betrag'); add(String(Math.round(n * 100) / 100), 'Betrag');
});

/* ------------------------------------------ was ein Commit mitnehmen würde */


const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/* Wortgrenzen, damit ein kurzer Kontoname nicht in einem längeren Wort
   anschlägt und ein Betrag nicht in einem größeren steckenbleibt. Ohne
   Beispiele: auch eine Erläuterung ist Text im Repository, und der Wächter
   liest sie mit. */
const rx = new Map([...needles].map(([n, w]) => [n, new RegExp('(?<![\\w.,])' + esc(n) + '(?![\\w.,])')]));

const scanned = [];
const hits = imageHits.concat(personHits);   // Bilder und Personenbezug zählen mit

for (const rel of files) {
  const abs = path.join(ROOT, rel);
  let st; try { st = fs.statSync(abs); } catch (e) { continue; }
  if (!st.isFile()) continue;
  if (BINARY.test(rel)) {
    /* Eine Tabelle im Repository ist ausschließlich die Beispielmappe. */
    if (/\.(xlsx|xlsm|xlsb|ods|numbers|csv)$/i.test(rel) && !rel.startsWith('examples/')) {
      hits.push({ rel, line: 0, needle: rel, what: 'Tabellendatei außerhalb von examples/' });
    }
    continue;
  }
  if (rel === 'tests/privacy-allow.txt') continue;   // steht voller Nadeln, das ist ihr Zweck
  if (st.size > 8 * 1024 * 1024) continue;
  const text = fs.readFileSync(abs, 'utf8');
  scanned.push(rel);
  for (const [needle, what] of needles) {
    if (waived(rel, needle)) continue;
    const m = rx.get(needle).exec(text);
    if (!m) continue;
    hits.push({ rel, line: text.slice(0, m.index).split('\n').length, needle, what });
  }
}

imageVerdict();

console.log('\n== Wächter: ' + needles.size + ' Nadeln aus der Mappe in excel/ gegen ' +
            scanned.length + ' Dateien' + (ALLOW.size ? ', ' + ALLOW.size + ' Ausnahmen' : '') +
            (ALL ? '\n   Reichweite: ALLES auf der Platte, auch von .gitignore Verborgenes' :
                   '\n   Reichweite: was ein Commit mitnehmen würde'));

if (!hits.length) {
  console.log('\nnichts gefunden — kein Kontoname, kein Posten, kein Betrag, kein Blattname.');
  process.exit(0);
}

report(hits);
process.exit(1);
