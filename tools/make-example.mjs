/* NORDSTERN: die Beispielmappe.
   Erzeugt examples/nordstern-example.xlsx: sieben Jahre erfundene Zahlen in
   genau dem Aufbau, den js/importer.js erwartet. Sie ist zweierlei — das,
   womit ein Fremder die Anwendung in zehn Sekunden laufen sieht, und der
   Prüfstein der Testreihe.

   Warum ein Skript und keine abgelegte Datei: eine .xlsx im Repository ist
   ein undurchsichtiger Klumpen. Hier steht jede Zahl im Klartext, jeder kann
   nachlesen, dass keine echte darunter ist, und ein geänderter Aufbau der
   Mappe lässt sich in einer Zeile nachziehen. Der Zufall ist gesät, der Lauf
   also wiederholbar: dieselbe Datei, Byte für Byte, bei jedem Aufruf.

   Die Person dahinter gibt es nicht. Sie hat zu Beginn der Aufzeichnung eine
   Eigentumswohnung gekauft, voll finanziert, und bewohnt sie selbst. Damit
   zeigt das Beispiel den Fall, der sich mit einem reinen Depot nicht zeigen
   lässt: ein großer Sachwert, eine große Schuld, eine Annuität, die jeden
   Monat Fixkosten frisst — und ein Net Worth, der trotzdem steigt, weil ein
   Teil dieser Annuität Tilgung ist. */
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const XLSX = createRequire(import.meta.url)(resolve(ROOT, 'js/vendor/xlsx.full.min.js'));

let seed = 20260823;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const jitter = (a) => 1 + (rnd() - 0.5) * a;
const r2 = (n) => Math.round(n * 100) / 100;

/* Sieben Jahre bis August 2026. Der Kauf fällt auf den ersten Monat. */
const MONTHS = 84;
const END = { y: 2026, m: 8 };
const dates = [];
for (let i = MONTHS - 1; i >= 0; i--) {
  let m = END.m - i, y = END.y;
  while (m <= 0) { m += 12; y -= 1; }
  dates.push(new Date(y, m, 0));                  // Tag 0 des Folgemonats = Monatsletzter
}
const START = dates[0];

/* ------------------------------------------------------- Monatsrenditen */

/* Die Kurse folgen keiner Formel, sondern dieser Tabelle: Monatsrenditen in
   Prozent, Jahr für Jahr, Januar bis Dezember. Abgeschrieben von einer
   Heatmap — wer eine Zelle anders liest, ändert sie hier und läuft
   `npm run example` neu. Nichts anderes im Depot ist von Hand gesetzt. */
const RETURNS = {
  2019: [ 0.0,  0.0,  0.0,  0.0,  0.0,  1.1, -2.5,  1.3, -2.4,  2.9,  0.0,  0.0],
  2020: [-0.6, -6.2, -10.0,  9.2,  5.7,  3.9, -1.9,  4.8,  0.5, -3.5,  9.3,  2.2],
  2021: [-1.1,  0.9,  4.0,  3.2, -0.4,  3.6, -0.2,  3.8, -1.7,  2.5,  0.7,  3.0],
  2022: [-4.3, -2.6,  4.4, -3.8, -0.0, -4.8,  6.5,  0.7, -4.8,  1.6,  3.5, -4.0],
  2023: [ 4.7, -1.3,  0.9,  0.7, -0.2,  3.2,  2.1, -1.4, -0.7, -2.2,  4.8,  4.3],
  2024: [ 0.8,  4.4,  3.3, -2.6,  2.6,  2.6,  0.3, -0.2,  0.7,  0.8,  6.1, -1.0],
  2025: [ 4.1, -1.9, -6.3, -2.1,  4.7,  2.8,  4.9,  0.9,  3.6,  4.8, -0.8, -0.8],
  2026: [ 0.8,  3.6, -5.7,  7.9,  5.8,  0.7, -1.4,  1.2,  0.0,  0.0,  0.0,  0.0]
};
const marketReturn = (d) => (RETURNS[d.getFullYear()] || [])[d.getMonth()] / 100 || 0;

/* -------------------------------------------------- Wohnung und Finanzierung */

/* Annuitätendarlehen: 2,5 % Zins, 2,5 % anfängliche Tilgung — zusammen 5 %
   der Ursprungssumme im Jahr, monatlich gleichbleibend. Der Zinsanteil
   sinkt, der Tilgungsanteil wächst; genau davon lebt der Net Worth in diesem
   Beispiel. */
const FLAT_VALUE = 410000;
const LOAN0 = 410000;
const RATE = 0.025;
const AMORT0 = 0.025;
const ANNUITY = r2(LOAN0 * (RATE + AMORT0) / 12);          // 1.708,33 € im Monat

const mortgage = [];
{
  let bal = LOAN0;
  const i = RATE / 12;
  for (let k = 0; k < MONTHS; k++) {
    bal = Math.max(0, bal * (1 + i) - ANNUITY);
    mortgage.push(r2(bal));
  }
}

/* Der Wertpapierkredit wird nicht von Anfang an gezogen, sondern nach dem
   schwachen Jahr 2022 — im Januar 2023. Das ist eine Entscheidung, die man
   im Verlauf sieht: Depot und Schulden springen im selben Monat. */
const LOMBARD = 100000;
const LOMBARD_AT = dates.findIndex((d) => d.getFullYear() === 2023 && d.getMonth() === 0);

/* ------------------------------------------------------------- Depot */

/* Jede Position trägt dieselben Monatsrenditen, nur unterschiedlich stark —
   ein Rentenpapier atmet flacher als ein Technologieindex. Darüber liegt der
   Sparplan, und im Januar 2023 kommt der Kredit dazu. */
function holding(start, monthly, beta, lombardShare) {
  let v = start; const out = [];
  for (let k = 0; k < MONTHS; k++) {
    v = v * (1 + marketReturn(dates[k]) * beta) + monthly * jitter(0.06);
    if (k === LOMBARD_AT) v += LOMBARD * lombardShare;
    out.push(r2(Math.max(0, v)));
  }
  return out;
}

const SHEET = [
  { head: 'Liquid', total: 'Total liquid', rows: [
    ['Checking account',       wobble(5100, 0.30, 900)],
    ['Savings account',        ramp(4600, 15200, 0.05)],
    ['Instant access savings', ramp(1700, 11400, 0.06)],
    ['Cash',                   wobble(760, 0.4, 180)]
  ]},
  /* Wer zur Miete wohnt, hat hier die Kaution stehen. Wer selbst besitzt,
     hat etwas anderes: die Instandhaltungsrücklage der Eigentümergemeinschaft.
     Sie ist eingezahltes Geld, das dem Miteigentumsanteil zugerechnet wird und
     beim Verkauf mitgeht — eine Forderung, kein Aufwand. Dazu das Guthaben aus
     der Nebenkostenabrechnung und die Steuererstattung, die im Frühjahr offen
     steht. */
  { head: 'Claims', total: 'Total claims', rows: [
    ['Maintenance reserve (owners’ association)', reserve()],
    ['Service charge settlement', seasonal([4, 5], 640, 0.25)],
    ['Tax refund due', seasonal([0, 1, 2, 3], 1180, 0.3)]
  ]},
  { head: 'Investments', total: 'Total investments', rows: [
    ['World ETF',            holding(8100, 430, 1.00, 0.40)],
    ['S&P 500 ETF',          holding(4400, 250, 1.05, 0.25)],
    ['Nasdaq 100 ETF',       holding(2600, 150, 1.35, 0.20)],
    ['Emerging markets ETF', holding(1500,  75, 0.85, 0.08)],
    ['Bond ETF',             holding(2200,  58, 0.15, 0.07)]
  ]},
  { head: 'Property', total: 'Total property', rows: [
    ['Apartment', dates.map(() => FLAT_VALUE)],
    ['Car',       dates.map((_, i) => r2(26000 * Math.pow(0.9885, i)))]
  ]},
  /* Der größere Teil kommt vom Arbeitgeber — Entgeltumwandlung mit Zuschuss
     läuft länger und höher als der private Vertrag daneben. */
  { head: 'Retirement', total: 'Total retirement', rows: [
    ['Company pension', holding(11500, 384, 0.35, 0)],
    ['Private pension', holding( 6150, 202, 0.30, 0)]
  ]}
];

const LIABS = [
  ['Mortgage', mortgage],
  ['Securities loan', dates.map((_, i) => (i >= LOMBARD_AT ? LOMBARD : 0))],
  ['Credit card', wobble(880, 0.5, 90)]
];

/* ------------------------------------------------------- Hilfsverläufe */

function ramp(from, to, noise) {
  return dates.map((_, i) => r2((from + (to - from) * (i / (MONTHS - 1))) * jitter(noise)));
}
function wobble(base, amp, floor) {
  return dates.map((_, i) => r2(Math.max(floor, base * jitter(amp) + Math.sin(i / 3) * base * 0.08)));
}
/* Die Rücklage wächst mit dem Hausgeld und bricht ein, wenn die Gemeinschaft
   etwas beschließt — hier zweimal: ein Dach und ein Aufzug. */
function reserve() {
  let v = 0; const out = [];
  for (let k = 0; k < MONTHS; k++) {
    v += 118;
    if (k === 29) v -= 2600;
    if (k === 61) v -= 3400;
    out.push(r2(Math.max(0, v)));
  }
  return out;
}
function seasonal(months, amount, noise) {
  return dates.map((d) => (months.indexOf(d.getMonth()) >= 0 ? r2(amount * jitter(noise)) : 0));
}

/* --------------------------------------------------------- Blatt bauen */

const sum = (rows, i) => r2(rows.reduce((a, r) => a + r[1][i], 0));

const aoa = [];
const fmt = [];
const push = (label, values, z) => {
  const r = aoa.length;
  aoa.push([label, ...(values || [])]);
  if (values && z) values.forEach((_, i) => fmt.push({ r, c: i + 1, z }));
  return r;
};
const MONEY = '#,##0.00';

push('Month', dates, 'dd.mm.yyyy');
const sectionTotals = [];
for (const s of SHEET) {
  aoa.push([]);
  push(s.head);
  s.rows.forEach(([name, values]) => push(name, values, MONEY));
  const totals = dates.map((_, i) => sum(s.rows, i));
  push(s.total, totals, MONEY);
  sectionTotals.push(totals);
}
aoa.push([]);
const assets = dates.map((_, i) => r2(sectionTotals.reduce((a, t) => a + t[i], 0)));
push('Total assets', assets, MONEY);
aoa.push([]);
push('Liabilities');
LIABS.forEach(([name, values]) => push(name, values, MONEY));
const liabTotal = dates.map((_, i) => sum(LIABS, i));
push('Total liabilities', liabTotal, MONEY);
aoa.push([]);
const net = dates.map((_, i) => r2(assets[i] - liabTotal[i]));
push('Total net worth', net, MONEY);

const wsData = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
fmt.forEach(({ r, c, z }) => { const a = XLSX.utils.encode_cell({ r, c }); if (wsData[a]) wsData[a].z = z; });
wsData['!cols'] = [{ wch: 34 }, ...dates.map(() => ({ wch: 12 }))];

/* ------------------------------------------------------------- Read me */

const wsRead = XLSX.utils.aoa_to_sheet([
  ['NORDSTERN — example workbook'],
  [],
  ['Everything in this file is invented. No real person, no real portfolio.'],
  ['Seven years of a household that bought a flat on day one and financed'],
  ['all of it, so the numbers show a large asset and a large debt side by side.'],
  [],
  ['nordstern reads one sheet and nothing else:'],
  ['  "Data Input"', 'one column per month, one row per account'],
  [],
  ['This second sheet is here to prove the point: it is never read.'],
  ['Add as many of your own as you like.'],
  [],
  ['Rows are found by their label in column A, never by row number.'],
  ['Insert accounts wherever you want — the section heads and the total'],
  ['rows are the anchors. See docs/DATA_CONTRACT.md for the full contract.']
]);
wsRead['!cols'] = [{ wch: 22 }, { wch: 58 }];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, wsRead, 'Read me');
XLSX.utils.book_append_sheet(wb, wsData, 'Data Input');

/* Wohin geschrieben wird. Ohne Angabe an den angestammten Platz — aber nicht
   über eine Datei, die schon dort liegt.

   Denn die ausgelieferte Mappe ist von Hand nachformatiert: Spaltenbreiten,
   Zahlenformate, abgesetzte Summenzeilen, damit man beim Öffnen sofort sieht,
   wie sie gebaut ist. Diese Formatierung kann dieses Skript nicht erzeugen —
   die freie Fassung von SheetJS schreibt keine Zellformate. Ein unbedachtes
   `npm run example` würde sie also stillschweigend wegwerfen.

   Deshalb: --out für einen anderen Pfad (so prüft tests/example.mjs, dass die
   ausgelieferte Mappe noch dasselbe sagt wie dieses Skript), --force, wenn man
   die Formatierung wirklich verwerfen will. */
const outArg = process.argv.indexOf('--out');
const forced = process.argv.indexOf('--force') >= 0;
if (outArg >= 0 && !process.argv[outArg + 1]) {
  console.error('--out braucht einen Pfad.');
  console.error('');
  console.error('  --out <pfad>   woandershin schreiben (zum Vergleichen)');
  console.error('  --force        die Formatierung verwerfen und neu erzeugen');
  process.exit(1);
}
const SHIPPED = resolve(ROOT, 'examples/nordstern-example.xlsx');
const out = outArg >= 0
  ? resolve(process.cwd(), process.argv[outArg + 1])
  : SHIPPED;

/* Die Erlaubnis hängt am Ziel, nicht daran, ob --out auf der Kommandozeile
   stand: --out examples/nordstern-example.xlsx trifft dasselbe Ziel wie gar
   kein --out und braucht denselben Schutz. */
if (!forced && resolve(out) === SHIPPED && existsSync(out)) {
  console.error('Es liegt schon eine Mappe unter examples/ — und die ist von Hand');
  console.error('formatiert; dieses Skript kann das nicht nachbilden.');
  console.error('');
  console.error('  --out <pfad>   woandershin schreiben (zum Vergleichen)');
  console.error('  --force        die Formatierung verwerfen und neu erzeugen');
  process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true }));

const L = MONTHS - 1;
const eur = (n) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(14);
console.log(out);
console.log('  ' + MONTHS + ' Monate, ' + START.getFullYear() + '-' + String(START.getMonth() + 1).padStart(2, '0') +
            ' … ' + dates[L].getFullYear() + '-' + String(dates[L].getMonth() + 1).padStart(2, '0'));
console.log('  liquide       ' + eur(sectionTotals[0][L]));
console.log('  Forderungen   ' + eur(sectionTotals[1][L]));
console.log('  investiert    ' + eur(sectionTotals[2][L]));
console.log('  Sachwerte     ' + eur(sectionTotals[3][L]));
console.log('  Vorsorge      ' + eur(sectionTotals[4][L]));
console.log('  Vermögen      ' + eur(assets[L]));
console.log('  Darlehen      ' + eur(mortgage[L]) + '   (von ' + LOAN0.toLocaleString('de-DE') + ')');
console.log('  Schulden      ' + eur(liabTotal[L]));
console.log('  NET WORTH     ' + eur(net[L]));
