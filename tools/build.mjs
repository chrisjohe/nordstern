/* NORDSTERN: Build.
   Faltet index.html, die drei Stylesheets und die vierzehn Skripte zu einer
   einzigen Datei unter export/. Kein Bundler, kein Minifier, keine
   Umschrift: der Quelltext wandert Zeichen für Zeichen in <style> und
   <script>, nur die Reihenfolge aus index.html hält ihn zusammen. Wer die
   gebaute Datei liest, liest dieselben Zeilen wie im Ordner nebenan — samt
   Kommentaren.

   Die Regel, die alles andere bestimmt: es werden ausschliesslich Dateien
   eingefaltet, die index.html selbst verlinkt — aus css/ und js/. Damit kann
   durch einen Tippfehler nichts aus excel/ oder img/ in die Ausgabe geraten.
   Ein Bau, der eine Datei ausserhalb dieser Liste anfassen müsste, bricht ab
   statt sie mitzunehmen. Die Symbol-Datei im Wurzelverzeichnis fasst der Bau
   gar nicht erst an, siehe unten. */
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'export');
const OUT_FILE = resolve(OUT_DIR, 'nordstern.html');

/* Nur hier darf der Bau lesen. */
const ALLOWED = ['css', 'js'];

const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));

function read(rel) {
  const abs = resolve(ROOT, rel);
  const inside = relative(ROOT, abs);
  const top = inside.split(sep)[0];
  if (inside.startsWith('..') || !ALLOWED.includes(top)) {
    throw new Error('Bau abgebrochen: "' + rel + '" liegt ausserhalb von ' +
      ALLOWED.join('/ und ') + '/.');
  }
  return readFileSync(abs, 'utf8');
}

const inlined = [];
function note(rel, src) {
  inlined.push({ rel, bytes: Buffer.byteLength(src, 'utf8') });
  return src;
}

/* Ein </script> im Skript oder ein </style> im Stylesheet würde den Block
   vorzeitig schliessen. Beides kommt heute nicht vor; die Maskierung steht
   trotzdem hier, damit ein künftiger Kommentar die Datei nicht zerlegt. */
let escaped = 0;
function guard(src, tag) {
  const re = new RegExp('</(' + tag + ')', 'gi');
  return src.replace(re, (m, t) => { escaped++; return '<\\/' + t; });
}

let html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');

html = html.replace(
  /[ \t]*<link\s+rel="stylesheet"\s+href="([^"]+)"\s*>/g,
  (m, href) => '<style data-src="' + href + '">\n' +
    guard(note(href, read(href)), 'style').trimEnd() + '\n</style>'
);

html = html.replace(
  /[ \t]*<script\s+src="([^"]+)"\s*><\/script>/g,
  (m, src) => {
    /* SheetJS wird hier mitverteilt, nicht nur benutzt — die Lizenz reist mit. */
    const lic = src.indexOf('xlsx.full.min.js') >= 0
      ? '<!--\n  ' + src + ' — SheetJS Community Edition, Apache License 2.0.\n' +
        '  Volltext: js/vendor/xlsx.LICENSE.txt im Quellordner sowie\n' +
        '  https://www.apache.org/licenses/LICENSE-2.0\n-->\n'
      : '';
    return lic + '<script data-src="' + src + '">\n' +
      guard(note(src, read(src)), 'script').trimEnd() + '\n</script>';
  }
);

/* Den Symbol-Link rührt der Bau nicht an: Safari lädt keine data:-Adressen,
   also bliebe das Falten wirkungslos. favicon.png bleibt eine Datei neben
   der Seite; auf Pages liefert der Workflow sie aus. Über file:// fehlt sie
   im Bau, es sei denn, wer die gebaute Datei öffnet, legt favicon.png
   daneben. favicon.svg ist nur die Quelle, aus der favicon.png gerendert
   ist, und wird nirgends verlinkt. */

const left = html.match(/\s(?:href|src)="(?:css|js)\/[^"]+"/g);
if (left) throw new Error('Bau abgebrochen: nicht eingefaltet — ' + left.join(', '));

/* Eine Zusage, die der Browser durchsetzt statt des Quelltexts.
   Die Anwendung soll nichts ins Netz schicken — das steht seit jeher im
   Vorhang und im README, und beides sind nur Worte. Diese Zeile macht daraus
   eine Regel: 'none' als Grundeinstellung, keine Verbindung, kein
   Formularziel, keine andere Basis-URL. Wer misstrauisch ist, öffnet den
   Netzwerk-Tab und sieht nichts; wer sehr misstrauisch ist, liest hier nach.

   'unsafe-inline' steht dort, weil in dieser Datei alles inline ist — Skript
   wie Stil. Das lockert nichts, was für die Zusage zählt: eingebetteter Code
   kann ohne connect-src und ohne form-action nichts nach draussen geben.

   img-src 'self' ist einzig für die Symbol-Datei vom eigenen Ursprung
   gedacht. Kein Weg nach draussen entsteht dadurch, weil nur derselbe
   Ursprung erlaubt ist, von dem die Seite selbst kommt — auf Pages also nur
   favicon.png daneben, nirgendwo sonst.

   Nur der Bau bekommt sie. Über file:// ist der Ursprung undurchsichtig,
   und ein script-src 'self' würde im Ordner nebenan die vierzehn Skripte
   aussperren, statt irgendetwas zu schützen. */
const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src 'self'",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'"
].join('; ');
html = html.replace(/<meta name="color-scheme"[^>]*>/,
  (m) => '<meta http-equiv="Content-Security-Policy" content="' + CSP + '">\n' + m);
if (html.indexOf('Content-Security-Policy') < 0) {
  throw new Error('Bau abgebrochen: die CSP konnte nicht gesetzt werden.');
}

const stamp = new Date().toISOString().slice(0, 10);
const banner = '<!--\n' +
  '  NORDSTERN ' + pkg.version + ' — Einzeldatei-Bau vom ' + stamp + '\n' +
  '  Gebaut aus index.html + ' + inlined.length + ' Dateien mit tools/build.mjs.\n' +
  '  In sich geschlossen: keine Netzwerkaufrufe, keine Schriften von aussen,\n' +
  '  keine Bilder, keine Daten. Laeuft per Doppelklick ueber file://.\n' +
  '  Die Content-Security-Policy im Kopf laesst den Browser das durchsetzen.\n' +
  '  Die Mappe wird beim Oeffnen im Browser gelesen und verlaesst den Rechner nicht.\n' +
  '-->\n';
html = html.replace(/^<!doctype html>\n/i, (m) => m + banner);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, html, 'utf8');

const bytes = statSync(OUT_FILE).size;
const sha = createHash('sha256').update(html).digest('hex').slice(0, 16);
const kb = (n) => (n / 1024).toFixed(1).padStart(7) + ' kB';

console.log('export/nordstern.html   ' + kb(bytes) + '   sha256:' + sha);
console.log('  aus index.html und ' + inlined.length + ' Dateien:');
for (const f of inlined) console.log('    ' + kb(f.bytes) + '  ' + f.rel);
if (escaped) console.log('  ' + escaped + '× </tag> im Quelltext maskiert.');
