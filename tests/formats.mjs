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
  const opened = g.NORDSTERN.importer._openWorkbook(XLSX, new Uint8Array(fs.readFileSync(FIXTURE)));
  ok(opened.SheetNames.join(' · ') === 'Data Input',
     'und gibt nur das eine Blatt weiter, obwohl sie zwei hat: ' + opened.SheetNames.join(' · '));
  ok(opened.available.join(' · ') === 'Read me · Data Input',
     'available nennt beide Blätter der Beispielmappe, in Dateireihenfolge: ' + opened.available.join(' · '));
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
  const openedBt = g.NORDSTERN.importer._openWorkbook(spy, new Uint8Array(buf));
  ok(openedBt.SheetNames.join(' · ') === 'Data Input',
     bt + ' reicht nur das eine Blatt weiter: ' + openedBt.SheetNames.join(' · '));
  ok(openedBt.available.join(' · ') === 'Read me · Data Input',
     bt + ' nennt available beide Blätter, in Dateireihenfolge: ' + openedBt.available.join(' · '));
  const expected = bt === 'ods' ? 2 : 1;
  ok(decoded.length === 1 && decoded[0] === expected,
     bt + ': ' + decoded[0] + ' von 2 Blättern dekodiert' +
     (expected === 2 ? ' — SheetJS kennt für dieses Format keinen Filter' : ''));
}

/* Und der Leser für Numbers ist wirklich im Bundle — geprüft am Code, weil
   es keine Datei zum Prüfen gibt. */
const vendor = fs.readFileSync(path.join(ROOT, 'js/vendor/xlsx.full.min.js'), 'utf8');
ok(vendor.includes('Index/Document.iwa'), 'SheetJS erkennt Numbers-Dateien');
ok(/NUMBERS file parsing requires/.test(vendor), 'und hat den Parser dafür an Bord');

/* Google Sheets hat kein eigenes Format — der Export ist .xlsx oder .ods,
   beides oben nachgewiesen. Es gibt hier nichts eigenes zu prüfen. */

/* ------------------------------------------------------------ Währung */
console.log('\n== Währung');

/* 1. _parseNumber: Schweizer Schreibweise mit Apostroph (gerade und
   typografisch), dazu ein Währungscode vor der Zahl und die bestehenden
   Schreibweisen unverändert. */
{
  const P = g.NORDSTERN.importer._parseNumber;
  ok(P("1'234.56") === 1234.56, "1'234.56 (gerader Apostroph): " + P("1'234.56"));
  ok(P('1’234.56') === 1234.56, '1’234.56 (typografischer Apostroph): ' + P('1’234.56'));
  ok(P("CHF 1'234.56") === 1234.56, "CHF 1'234.56 mit vorangestelltem Code: " + P("CHF 1'234.56"));
  ok(P('1.234,56 €') === 1234.56, 'deutsche Schreibweise bleibt unverändert: ' + P('1.234,56 €'));
  ok(P("1'23.4") === null, "1'23.4 ist keine gültige Schweizer Gruppierung: " + P("1'23.4"));
  ok(P("12'345") === 12345, "12'345 ohne Nachkommastellen: " + P("12'345"));
  ok(P('USD 1,234.56') === 1234.56, 'USD 1,234.56 (englisch, mit vorangestelltem Code): ' + P('USD 1,234.56'));
}

/* 2. _currencyOfFormat: Zahlenformat-Zeichenkette → Währungscode oder null. */
{
  const F = g.NORDSTERN.importer._currencyOfFormat;
  const cases = [
    ['[$-409]#,##0.00', null],
    ['[$€-407] #,##0.00', 'EUR'],
    ['[$$-409]#,##0.00', 'USD'],
    ['[$£-809]#,##0.00', 'GBP'],
    ['[$CHF-807] #,##0.00', 'CHF'],
    ['[$CHF] #,##0.00', 'CHF'],
    ['"$"#,##0.00', 'USD'],
    ['#,##0.00 "€"', 'EUR'],
    ['#,##0.00" CHF"', 'CHF'],
    ['General', null],
    [undefined, null],
    ['#,##0.00 "kr"', null]
  ];
  cases.forEach(([fmt, want]) => {
    const got = F(fmt);
    ok(got === want, JSON.stringify(fmt) + ' → ' + want + ', bekommen: ' + got);
  });
}

/* 3. Erkennung am ganzen Workbook. Die Formate werden ausschließlich im
   Speicher verändert, nie auf die Platte geschrieben (AGENTS.md #4) — und
   je Fall an einer frischen Kopie, sonst liest der nächste Fall die
   Mutation des vorigen mit. */
/* Ein roher XLSX.read trägt SheetNames in Dateireihenfolge — hier „Read me"
   vor „Data Input". parseWorkbook vertraut inzwischen darauf, dass an
   Index 0 bereits das gewählte Blatt steht (das leistet sonst chooseSheet
   in openWorkbook); hier wird das von Hand nachgebildet, ohne den Weg über
   Bytes und zwei Lesedurchgänge zu nehmen, den die Formatmutation unten
   ohnehin unterläuft. */
function freshWorkbook() {
  const wb = XLSX.read(fs.readFileSync(FIXTURE), { type: 'buffer', cellDates: true });
  wb.SheetNames = ['Data Input'];
  return wb;
}
/* Betragszellen sind alle Zellen mit numerischem .v auf dem einen gelesenen
   Blatt. Mit cellDates:true stehen die Monatsdaten in der Kopfzeile von
   "Data Input" als Date-Objekt, nicht als Zahl — sie zählen hier also
   ohnehin nicht mit, ohne dass die Kopfzeile eigens übersprungen werden muss. */
function setAmountFormat(wb, sheetNames, fmt) {
  sheetNames.forEach((name) => {
    const ws = wb.Sheets[name];
    Object.keys(ws).forEach((addr) => {
      if (addr.charAt(0) === '!') return;
      const c = ws[addr];
      if (c && typeof c.v === 'number') c.z = fmt;
    });
  });
}
{
  const wb = freshWorkbook();
  setAmountFormat(wb, ['Data Input'], '"$"#,##0.00');
  const r = g.NORDSTERN.importer.parseWorkbook(wb, 'x.xlsx', {});
  ok(r.ok, 'a) liest sich trotz Formatwechsel: ' + r.errors.join(' | '));
  ok(r.currency === 'USD', 'a) einheitlich als USD erkannt: ' + r.currency);
  ok(!r.warnings.some((x) => x.includes('more than one')), 'a) keine Mehrfachwarnung: ' + r.warnings.join(' | '));
}
{
  const wb = freshWorkbook();
  setAmountFormat(wb, ['Data Input'], '[$CHF-807] #,##0.00');
  const r = g.NORDSTERN.importer.parseWorkbook(wb, 'x.xlsx', {});
  ok(r.ok, 'b) liest sich trotz Formatwechsel: ' + r.errors.join(' | '));
  ok(r.currency === 'CHF', 'b) einheitlich als CHF erkannt: ' + r.currency);
}
{
  /* Die ausgelieferte Beispielmappe trägt in keiner Zelle ein
     Währungsformat — unverändert bleibt die Erkennung also leer, statt auf
     EUR zu raten. */
  const wb = freshWorkbook();
  const r = g.NORDSTERN.importer.parseWorkbook(wb, 'x.xlsx', {});
  ok(r.currency === null, 'c) unveränderte Beispielmappe trägt keine Währung im Format: ' + r.currency);
}
{
  /* Zwei Währungen auf demselben, einzigen gelesenen Blatt — die meisten
     Betragszellen tragen Euro, ein Rest Dollar. Die Mehrheit entscheidet
     nichts: mehr als eine Währung ergibt kein Ergebnis, sondern eine Warnung
     mit beiden Codes, dem häufigeren zuerst. */
  const wb = freshWorkbook();
  const ws = wb.Sheets['Data Input'];
  const addrs = Object.keys(ws).filter((a) => a.charAt(0) !== '!' && typeof ws[a].v === 'number');
  addrs.forEach((a, i) => { ws[a].z = i < Math.ceil(addrs.length * 0.8) ? '€#,##0.00' : '"$"#,##0.00'; });
  const r = g.NORDSTERN.importer.parseWorkbook(wb, 'x.xlsx', { currency: 'GBP' });
  ok(r.currency === null, 'd) zwei Währungen auf demselben Blatt ergeben kein Ergebnis: ' + r.currency);
  ok(r.warnings.some((x) => /more than one currency .*\(EUR, USD\)\. Shown as GBP/.test(x)),
     'd) und eine Warnung mit beiden Codes und der Anzeigewährung: ' + r.warnings.join(' | '));
}
{
  const wb = freshWorkbook();
  setAmountFormat(wb, ['Data Input'], '[$-409]#,##0.00');
  const r = g.NORDSTERN.importer.parseWorkbook(wb, 'x.xlsx', {});
  ok(r.currency === null, 'e) ein reines Gebietsschema ohne Symbol trägt keine Währung: ' + r.currency);
  ok(!r.warnings.some((x) => x.includes('more than one')), 'e) und keine Mehrfachwarnung: ' + r.warnings.join(' | '));
}

console.log('\n' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
