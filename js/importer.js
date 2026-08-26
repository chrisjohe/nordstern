/* NORDSTERN — Importer.
   SÄMTLICHES Wissen über den Aufbau der Arbeitsmappe lebt in dieser Datei.
   Ausgewertet, behalten und gespeichert wird ausschließlich das eine Blatt,
   das chooseSheet auswählt (SHEET_NAMES unten); für xlsx, xlsm und xlsb wird
   kein anderes überhaupt dekodiert (siehe openWorkbook, wo auch steht,
   warum ods und numbers das nicht können).
   Die Datei wird nur gelesen — nie geschrieben, nie ergänzt. */
(function (global) {
  'use strict';

  var NS = global.NORDSTERN || (global.NORDSTERN = {});
  /* Wer die Form des Modells ändert, zählt hier hoch: ein Modell mit anderer
     Nummer wirft store.js beim Laden fort, und die App bittet um einen neuen
     Import statt mit einer alten Form weiterzurechnen. */
  var MODEL_VERSION = 3;
  /* Anzeigewährung für die Warnhinweise unten ("… 5.855,00 USD, …") — vom
     Aufrufer über opts.currency gesetzt, je Lauf neu, wie `noted`. Betrifft
     nur den Text der Warnung, nicht die Zahl: die Mappe wird nicht
     umgerechnet, nur benannt. */
  var dispCode = 'EUR';

  /* ------------------------------------------------------- Zellen-Zugriffe */

  function colName(i) {
    var s = '';
    for (i = i + 1; i > 0;) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - 1 - m) / 26; }
    return s;
  }
  function addr(row, col) { return colName(col) + (row + 1); }

  function cell(ws, row, col) {
    var c = ws[addr(row, col)];
    return c === undefined ? null : c;
  }
  /* Zahlen, die als Text in der Zelle stehen.

     parseFloat wäre hier falsch, und leise falsch: „1.234,56" wird, wenn man
     nur das Komma tauscht, zu „1.234.56", und parseFloat hört am zweiten Punkt
     auf — 1,234 statt 1.234,56. Ein Faktor tausend, ohne ein Zeichen davon im
     Programm. Auch die Gegenprobe gegen die Summenzeile fängt es nicht, wenn
     die Summe ebenfalls Text ist: dann ist sie genauso falsch.

     Gelesen wird deshalb nur, was einer der beiden Schreibweisen ganz
     entspricht — deutsch (Punkt gruppiert, Komma trennt ab) oder englisch
     (umgekehrt). Was auf keine passt, ist keine Zahl.

     Wo beide passen — „1.234" ist deutsch tausendzweihundert und englisch
     eins Komma zwei — gilt die deutsche Lesart: die Mappe schreibt ihre Daten
     deutsch, und das Programm zeigt sie so. Dass überhaupt Text statt einer
     Zahl in der Zelle stand, sagen die Einstellungen; dann kann man nachsehen.

     Eine dritte Schreibweise kommt aus der Schweiz: Gruppen durch Apostroph
     getrennt, der Punkt bleibt Dezimaltrennzeichen — „1'234.56". Ein
     Apostroph steht in keiner der beiden anderen Schreibweisen, die Lesart
     ist also nie mehrdeutig.

     Ein Währungszeichen zählt nur am Rand — einmal, vor oder direkt nach
     dem Vorzeichen oder ganz am Ende. Mitten in den Ziffern („12€34") ist
     es keine Schreibweise, sondern eine kaputte Zelle; wer es dort entfernt,
     macht aus einem Betrag leise einen anderen, und die Summenzeile merkt
     es nicht, wenn sie genauso kaputt ist. */
  var DE_NUM = /^\d{1,3}(\.\d{3})+(,\d+)?$|^\d+(,\d+)?$/;
  var EN_NUM = /^\d{1,3}(,\d{3})+(\.\d+)?$|^\d+(\.\d+)?$/;
  var CH_NUM = /^\d{1,3}(['’]\d{3})+(\.\d+)?$/;
  var CUR = '(€|\\$|£|¥|EUR|USD|GBP|CHF)?';
  var EDGE = new RegExp('^([+\\-−]?)' + CUR + '([+\\-−]?)(.+?)' + CUR + '$', 'i');

  function parseNumber(v) {
    var m = EDGE.exec(String(v).replace(/\s/g, ''));
    if (!m || (m[1] && m[3]) || (m[2] && m[5])) return null;   // zwei Vorzeichen, zwei Währungen
    var sg = m[1] || m[3], sign = sg === '-' || sg === '−' ? -1 : 1;
    var s = m[4];
    var n = null;
    if (DE_NUM.test(s)) n = Number(s.replace(/\./g, '').replace(',', '.'));
    else if (EN_NUM.test(s)) n = Number(s.replace(/,/g, ''));
    else if (CH_NUM.test(s)) n = Number(s.replace(/['’]/g, ''));
    return n != null && isFinite(n) ? sign * n : null;
  }

  /* ------------------------------------------------------------- Währung */

  /* Erkennung der Währung aus dem Zahlenformat einer Zelle (c.z), nicht aus
     ihrem Wert — der Wert ist eine reine Zahl, das Format trägt das Symbol.

     Ein reiner Gebietsschema-Tag wie „[$-409]" trägt kein Symbol und wird
     zuerst entfernt. Übrig bleiben entweder Symbol-Tags wie „[$€-407]",
     „[$CHF-807]" oder „[$CHF]" (der Text zwischen „[$" und „-" bzw. „]" ist
     das Symbol), oder ein blankes Symbol/Kürzel irgendwo im Format, auch in
     Anführungszeichen wie „"CHF "". Alles, was auf keine der vier Währungen
     passt (¥, kr, …), wird ignoriert — der Import kennt nur die vier, die
     die Einstellungen auch anbieten. */
  var LOCALE_ONLY_RE = /\[\$-[^\]]*\]/g;
  var BRACKET_TAG_RE = /\[\$([^\]-]*)(?:-[^\]]*)?\]/;
  var BRACKET_TAG_ALL_RE = /\[\$[^\]]*\]/g;
  var BARE_SYMBOL_RE = /[€$£]/;
  var LITERAL_CODE_RE = /\b(EUR|USD|GBP|CHF)\b/i;

  function symbolToCurrency(s) {
    var t = String(s == null ? '' : s).trim();
    if (!t) return null;
    if (t === '€') return 'EUR';
    if (t === '$') return 'USD';
    if (t === '£') return 'GBP';
    var up = t.toUpperCase();
    if (up === 'EUR' || up === 'USD' || up === 'GBP' || up === 'CHF') return up;
    return null;
  }

  /** Eine Zahlenformat-Zeichenkette → Währungscode oder null. */
  function currencyOfFormat(fmt) {
    if (!fmt) return null;
    var s = String(fmt).replace(LOCALE_ONLY_RE, '');
    var m = BRACKET_TAG_RE.exec(s);
    if (m) {
      var fromTag = symbolToCurrency(m[1]);
      if (fromTag) return fromTag;
    }
    var rest = s.replace(BRACKET_TAG_ALL_RE, '');
    var bare = BARE_SYMBOL_RE.exec(rest);
    if (bare) return symbolToCurrency(bare[0]);
    var lit = LITERAL_CODE_RE.exec(rest);
    if (lit) return symbolToCurrency(lit[1]);
    return null;
  }

  /* Zählung je Lauf, nicht je Aufruf von noteInit — erst parseWorkbook weiß,
     ob eine oder mehrere Währungen vorkommen. `currencySeen` verhindert die
     doppelte Zählung derselben Zelle: „Data Input" liest die Summenzeile
     einer Sektion einmal für die Monatsreihe und ein zweites Mal für die
     Gegenprobe. */
  var currencyTally = null;
  var currencySeen = null;
  function currencyTallyReset() { currencyTally = {}; }
  function currencySeenReset() { currencySeen = {}; }
  function currencyNote(addrStr, fmt) {
    if (!currencyTally || (currencySeen && currencySeen[addrStr])) return;
    if (currencySeen) currencySeen[addrStr] = true;
    var code = currencyOfFormat(fmt);
    if (code) currencyTally[code] = (currencyTally[code] || 0) + 1;
  }
  /** Genau eine gezählte Währung → ihr Code; keine → null; mehr als eine →
      null, dazu eine Warnung mit den Codes nach Häufigkeit sortiert. */
  function currencyResult(warnings, shownAs) {
    var codes = Object.keys(currencyTally || {});
    if (codes.length === 0) return null;
    if (codes.length === 1) return codes[0];
    codes.sort(function (a, b) { return currencyTally[b] - currencyTally[a]; });
    warnings.push('Amounts are formatted in more than one currency on the sheet (' +
      codes.join(', ') + '). Shown as ' + shownAs + ' — change it in settings.');
    return null;
  }

  /* Was beim Lesen eines Blattes an Textzellen auffiel. Nicht als Liste —
     eine Mappe mit hundert Textspalten schriebe hundert Adressen mit. Die
     Anzahl und die erste Adresse genügen, um nachzusehen. */
  var noted = null;
  function noteInit(sheet) {
    noted = { sheet: sheet, textN: 0, textAt: null, badN: 0, badAt: null };
    currencySeenReset();       // Dedup gilt je Blatt, die Zählung selbst je Lauf
  }
  function noteFlush(warnings) {
    var n = noted;
    noted = null;
    if (!n) return;
    if (n.textN) {
      warnings.push(n.textN + (n.textN === 1 ? ' amount is' : ' amounts are') +
        ' stored as text on "' + n.sheet + '" (first: ' + n.textAt +
        '). Read as German numbers — 1.234,56 is one thousand two hundred.');
    }
    if (n.badN) {
      warnings.push(n.badN + (n.badN === 1 ? ' cell holds' : ' cells hold') +
        ' text that is not a number on "' + n.sheet + '" (first: ' + n.badAt +
        '). They count as empty.');
    }
  }

  function num(ws, row, col) {
    var c = cell(ws, row, col);
    if (!c || c.v == null || c.v === '') return null;
    var result;
    if (typeof c.v === 'number') {
      result = isFinite(c.v) ? c.v : null;
    } else {
      var n = parseNumber(c.v);
      if (noted) {
        if (n == null) { noted.badN++; if (!noted.badAt) noted.badAt = addr(row, col); }
        else { noted.textN++; if (!noted.textAt) noted.textAt = addr(row, col); }
      }
      result = n;
    }
    if (result != null) currencyNote(addr(row, col), c.z);
    return result;
  }
  function str(ws, row, col) {
    var c = cell(ws, row, col);
    if (!c || c.v == null) return '';
    return typeof c.v === 'string' ? c.v : String(c.v);
  }

  /** Beschriftungen robust vergleichbar machen: Kleinschreibung, Leerraum normalisiert. */
  function norm(s) {
    return String(s == null ? '' : s)
      .replace(/ /g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[:•]+$/, '')
      .toLowerCase();
  }

  function decodeRange(ws) {
    var ref = ws['!ref'] || 'A1';
    var m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(ref);
    if (!m) return { r0: 0, c0: 0, r1: 0, c1: 0 };
    function ci(s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64); return n - 1; }
    return { r0: Number(m[2]) - 1, c0: ci(m[1]), r1: Number(m[4]) - 1, c1: ci(m[3]) };
  }

  /** 'YYYY-MM' → fortlaufende Monatszahl; die Differenz zweier Werte ist der
      Abstand in Monaten. Eigene Zeile statt js/util.js: diese Datei kommt seit
      jeher ohne den Rest der Anwendung aus. */
  function monthNo(key) {
    var p = String(key).split('-');
    return Number(p[0]) * 12 + (Number(p[1]) - 1);
  }

  /** Excel-Seriennummer → Datum (nur Fallback, wenn cellDates nicht griff). */
  function serialToDate(n) {
    var ms = Math.round((n - 25569) * 86400000);
    var d = new Date(ms);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  function isDate(v) { return Object.prototype.toString.call(v) === '[object Date]'; }
  function v_(c) { return c.v; }

  function readDate(ws, row, col) {
    var c = cell(ws, row, col);
    if (!c || c.v == null || c.v === '') return null;
    if (isDate(v_(c))) return c.v;
    if (typeof c.v === 'number' && c.v > 20000 && c.v < 80000) return serialToDate(c.v);
    return null;
  }

  function monthKey(d) {
    var m = d.getMonth() + 1;
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m);
  }
  function isoDay(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }

  /* ------------------------------------------------ Aufbau von "Data Input" */

  /* Jede Sektion wird über zwei Beschriftungen in Spalte A verankert, nicht über
     feste Zeilennummern — eingefügte Konten verschieben den Import damit nicht.

     Eine Schreibweise je Anker, dieselbe wie in der Oberfläche. Zwei gültige
     Namen für dieselbe Zeile helfen nur so lange, wie sich jemand an den
     zweiten erinnert. */
  var SECTIONS = [
    { id: 'liquid',      head: 'liquid',      total: 'total liquid' },
    { id: 'receivables', head: 'claims',      total: 'total claims' },
    { id: 'investment',  head: 'investments', total: 'total investments' },
    { id: 'tangible',    head: 'property',    total: 'total property' },
    { id: 'retirement',  head: 'retirement',  total: 'total retirement' }
  ];
  var ANCHOR_DATES      = 'month';
  var ANCHOR_NETWORTH   = 'total net worth';
  var ANCHOR_TOTALASSETS = 'total assets';
  var ANCHOR_LIABILITIES = 'liabilities';          // exakt — "liabilities *(-1)" ist eine Hilfszeile
  var ANCHOR_LIAB_TOTAL  = 'total liabilities';

  function labelRows(ws, range) {
    var map = {}, order = [];
    for (var r = range.r0; r <= range.r1; r++) {
      var l = norm(str(ws, r, 0));
      if (!l) continue;
      if (!(l in map)) map[l] = r;      // erstes Vorkommen gewinnt
      order.push({ row: r, label: l, raw: str(ws, r, 0).replace(/ /g, ' ').trim() });
    }
    return { map: map, order: order };
  }

  function parseDataInput(ws, errors, warnings) {
    noteInit('Data Input');
    var range = decodeRange(ws);
    var L = labelRows(ws, range);

    function need(anchor) {
      if (!(anchor in L.map)) { errors.push('Row "' + anchor + '" not found.'); return -1; }
      return L.map[anchor];
    }

    var rowDates  = need(ANCHOR_DATES);
    var rowNW     = need(ANCHOR_NETWORTH);
    var rowTA     = need(ANCHOR_TOTALASSETS);
    var rowLiab   = need(ANCHOR_LIABILITIES);
    var rowLiabTot = need(ANCHOR_LIAB_TOTAL);
    SECTIONS.forEach(function (s) { s._head = need(s.head); s._total = need(s.total); });
    if (errors.length) return null;

    /* Monatsspalten aus der Kopfzeile */
    var cols = [];
    for (var c = range.c0 + 1; c <= range.c1; c++) {
      var d = readDate(ws, rowDates, c);
      if (d) cols.push({ col: c, date: d, key: monthKey(d), iso: isoDay(d) });
    }
    if (!cols.length) { errors.push('No month columns found in the header row.'); return null; }

    /* Konten je Sektion: alle beschrifteten Zeilen zwischen Kopf- und Summenzeile */
    SECTIONS.forEach(function (s) {
      s._rows = [];
      for (var r = s._head + 1; r < s._total; r++) {
        var raw = str(ws, r, 0).replace(/ /g, ' ').trim();
        if (raw) s._rows.push({ row: r, name: raw });
      }
    });
    var liabRows = [];
    for (var r2 = rowLiab + 1; r2 < rowLiabTot; r2++) {
      var rawL = str(ws, r2, 0).replace(/ /g, ' ').trim();
      if (rawL) liabRows.push({ row: r2, name: rawL });
    }

    /* Welche Spalte „jetzt" ist.

       Mappen tragen rechts vom letzten echten Snapshot oft fortgeschriebene
       Spalten: ein Auto, das planmäßig abschreibt, ein Darlehen, das bis ins
       übernächste Jahr tilgt.

       Die Grenze am Betrag zu ziehen — „die letzte Spalte mit Total liquid
       oder Total investments über null" — geht nicht: liquide Mittel dürfen
       negativ sein (wer seine Dispositionskredite oben führt), und ein Depot
       darf 0 sein (wer noch keins hat). Beides wäre ein echter Monat, der aus
       der Reihe fiele.

       Jetzt zählt der Kalender: ein Snapshot ist ein Monat, der stattgefunden
       hat. Dazu muss in der Spalte überhaupt etwas stehen — leere Spalten für
       den Rest des Jahres legt man sich gern im Voraus an. Das gilt nicht nur
       rechts vom letzten Snapshot: eine leere Spalte mitten in der Reihe ist
       ebenso wenig ein Monat, der stattgefunden hat — sie wird als Lücke
       behandelt, nicht als Nullstand.

       Der Füllgrad taugt nicht als Kriterium: eine Fortschreibung füllt fast
       so viele Kontozeilen wie ein gelebter Monat, und ein paar Prozentpunkte
       tragen keine Schwelle. */
    var accountRows = [];
    SECTIONS.forEach(function (s) { s._rows.forEach(function (a) { accountRows.push(a.row); }); });
    liabRows.forEach(function (a) { accountRows.push(a.row); });

    function hasData(col) {
      for (var k = 0; k < accountRows.length; k++) {
        var c = cell(ws, accountRows[k], col);
        if (c && c.v != null && c.v !== '') return true;
      }
      return false;
    }

    var nowKey = monthKey(new Date());        // Monatsschlüssel sind vergleichbar
    var lastIdx = -1;
    for (var i = 0; i < cols.length; i++) {
      if (cols[i].key > nowKey) continue;
      if (hasData(cols[i].col)) lastIdx = i;
    }
    if (lastIdx < 0) {
      errors.push('No snapshot found: every month column is either empty or dated in the future.');
      return null;
    }

    /* `used` nimmt nur Spalten mit Daten bis lastIdx — eine leere Spalte
       mitten in der Reihe (Februar ausgelassen, Januar und März stehen) wird
       hier bereits ausgesiebt, statt später als Nullstand in die Monatsreihe
       zu rutschen. Die Lückenerkennung unten sieht dann den Sprung von
       Januar auf März und meldet ihn wie jede andere Lücke; eine eigene
       Warnung sagt zusätzlich, dass es eine leere Spalte war. */
    var used = [], emptyInside = [];
    for (var i2 = 0; i2 <= lastIdx; i2++) {
      if (hasData(cols[i2].col)) used.push(cols[i2]); else emptyInside.push(cols[i2].key);
    }
    /* Was rechts liegen bleibt, wird nicht still verworfen — die Einstellungen
       sagen es unter „data source". Gezählt werden Spalten rechts von
       lastIdx, nicht die Differenz der Längen — die trüge auch die innen
       ausgesiebten leeren Spalten mit. */
    var skipped = cols.length - (lastIdx + 1);

    /* Die Reihe muss Monat für Monat aufsteigen. Sie tut es fast immer — und
       wenn nicht, fällt es nirgends auf: die Berechnung liest die Spalte
       links vom aktuellen Monat als „Vormonat" und die zwölfte als „vor einem
       Jahr". Eine ausgelassene, doppelte oder verrutschte Spalte macht daraus
       eine falsche Zahl, die aussieht wie jede andere.

       Lücken und Doppelungen trägt das Programm: die Vergleiche rechnen mit
       dem Monatsabstand und bleiben leer, wo keiner passt (calc.back), der
       Verlauf zeichnet die Lücke als Lücke, und die Einstellungen sagen es
       unter „notes while reading".

       Eine verrutschte Spalte trägt es nicht. „Zuletzt" ist die Spalte ganz
       rechts, und wenn die Reihe Januar, März, Februar heisst, ist das der
       Februar — ein falscher aktueller Stand, aus dem alles Weitere folgt.
       Sortieren wäre möglich, hiesse aber, eine kaputte Mappe stillschweigend
       zu reparieren und dabei zu raten. Also abgelehnt und gesagt, wo. */
    var dups = [], jumps = [], missing = 0, firstGap = null;
    for (var g = 1; g < used.length; g++) {
      var step = monthNo(used[g].key) - monthNo(used[g - 1].key);
      if (step === 0) dups.push(used[g].key);
      else if (step < 0) jumps.push('column ' + colName(used[g].col) + ' (' + used[g].key + ')');
      else if (step > 1) { missing += step - 1; if (!firstGap) firstGap = used[g - 1].key; }
    }
    if (jumps.length) {
      errors.push('The month columns must run in ascending order. ' + jumps.join(', ') +
        ' stands after a later month.');
      return null;
    }
    if (dups.length) {
      warnings.push('The same month stands in more than one column: ' + dups.join(', ') +
        '. Comparisons skip the duplicate.');
    }
    if (missing) {
      warnings.push('The series skips ' + missing + ' month' + (missing === 1 ? '' : 's') +
        ', the first gap after ' + firstGap +
        '. Comparisons across a gap say how far back they reach.');
    }
    /* Zusatz zur Lückenwarnung oben: sagt, dass die Lücke keine fehlende
       Spalte war, sondern eine vorhandene, leere — damit lässt sich das eine
       vom anderen unterscheiden, ohne in die Mappe zu schauen. */
    if (emptyInside.length) {
      warnings.push(emptyInside.length + ' empty month column' + (emptyInside.length === 1 ? '' : 's') +
        ' inside the series ' + (emptyInside.length === 1 ? 'was' : 'were') +
        ' skipped: ' + emptyInside.join(', ') + '.');
    }

    /* Monatsreihe */
    var months = used.map(function (mc) {
      var m = { key: mc.key, iso: mc.iso };
      SECTIONS.forEach(function (s) { m[s.id] = num(ws, s._total, mc.col) || 0; });
      m.totalAssets = num(ws, rowTA, mc.col);
      m.liabilities = num(ws, rowLiabTot, mc.col) || 0;
      m.netWorth = num(ws, rowNW, mc.col);
      if (m.totalAssets == null) {
        m.totalAssets = m.liquid + m.receivables + m.investment + m.tangible + m.retirement;
      }
      if (m.netWorth == null) m.netWorth = m.totalAssets - m.liabilities;
      return m;
    });

    /* Konten-Historien */
    var accounts = {};
    SECTIONS.forEach(function (s) {
      accounts[s.id] = s._rows.map(function (a) {
        return { name: a.name, values: used.map(function (mc) { return num(ws, a.row, mc.col) || 0; }) };
      });
    });
    accounts.liabilities = liabRows.map(function (a) {
      return { name: a.name, values: used.map(function (mc) { return num(ws, a.row, mc.col) || 0; }) };
    });

    /* Gegenprobe: Kontensummen gegen die Summenzeilen der Mappe */
    var EPS = 0.02;
    function checkSums(id, rows, totalRow) {
      var bad = 0, worst = 0, worstKey = null;
      used.forEach(function (mc, i) {
        var sum = 0;
        rows.forEach(function (a) { sum += a.values[i]; });
        var tot = num(ws, totalRow, mc.col) || 0;
        var diff = Math.abs(sum - tot);
        if (diff > EPS) { bad++; if (diff > worst) { worst = diff; worstKey = mc.key; } }
      });
      if (bad) {
        warnings.push('Section "' + id + '": ' + bad + ' month(s) differ from the total row (max. ' +
          worst.toFixed(2) + ' ' + dispCode + ' in ' + worstKey + ').');
      }
    }
    SECTIONS.forEach(function (s) { checkSums(s.id, accounts[s.id], s._total); });
    checkSums('liabilities', accounts.liabilities, rowLiabTot);

    var badTA = 0, badNW = 0;
    months.forEach(function (m) {
      var sum = m.liquid + m.receivables + m.investment + m.tangible + m.retirement;
      if (Math.abs(sum - m.totalAssets) > EPS) badTA++;
      if (Math.abs((m.totalAssets - m.liabilities) - m.netWorth) > EPS) badNW++;
    });
    if (badTA) warnings.push('Total assets differ from the sum of sections in ' + badTA + ' month(s).');
    if (badNW) warnings.push('Net worth differs from (assets − liabilities) in ' + badNW + ' month(s).');
    noteFlush(warnings);

    return {
      months: months,
      currentIndex: months.length - 1,
      accounts: accounts,
      sectionOrder: SECTIONS.map(function (s) { return s.id; }),
      skipped: skipped ? { count: skipped, from: cols[lastIdx + 1].key } : null
    };
  }

  /* ------------------------------------------------------------------- API */

  /* Erlaubte Blattnamen, in Vorrangreihenfolge: der erste Name dieser Liste,
     der in der Mappe vorkommt, gewinnt — unabhängig davon, an welcher
     Stelle er in der Mappe steht oder wie viele andere Blätter es noch
     gibt. Fehlt jeder Name, aber die Mappe hat genau ein Blatt, wird dieses
     genommen, wie auch immer es heißt (siehe chooseSheet). */
  var SHEET_NAMES = ['Data Input', 'Data', 'Input', 'Snapshots', 'Net Worth',
    'Nordstern', 'Daten', 'Dateneingabe', 'Vermögen', 'Bilanz'];

  /** Welches Blatt aus `sheetNames` gelesen wird: der erste Name aus
      SHEET_NAMES, der vorkommt — Groß-/Kleinschreibung und Leerraum egal
      (norm()). Kommt keiner vor, die Mappe hat aber nur ein Blatt, ist das
      der Fallback: ein Einzelblatt braucht keinen passenden Namen. Sonst
      null — bei zwei oder mehr unbekannten Blättern wird nicht geraten und
      auch nicht in den Inhalt geschaut, das würde jedes Blatt dekodieren
      und das Privacy-Versprechen brechen. */
  function chooseSheet(sheetNames) {
    for (var i = 0; i < SHEET_NAMES.length; i++) {
      var n = norm(SHEET_NAMES[i]);
      for (var j = 0; j < sheetNames.length; j++) {
        if (norm(sheetNames[j]) === n) return sheetNames[j];
      }
    }
    if (sheetNames.length === 1) return sheetNames[0];
    return null;
  }

  /** Öffnet die Mappe in zwei Durchgängen: erst das Inhaltsverzeichnis, dann
      ausschließlich das eine Blatt, das chooseSheet auswählt.

      Der Umweg ist der Preis dafür, dass SheetJS ohne `sheets` jedes Blatt
      parst — auch das, auf dem jemand seine Gehaltsverhandlung notiert hat.
      `bookSheets: true` liest nur die Namensliste und keinen Blattinhalt.

      Für ods und numbers ignoriert SheetJS den Filter und parst trotzdem
      alles. Deshalb wird danach hart auf das eine Blatt reduziert: was
      nicht dazugehört, kommt nicht über diese Funktion hinaus. Mit derselben
      Bewegung fallen die Mappen-Eigenschaften weg — dort steht sonst der
      Name dessen, der die Datei angelegt hat.

      `available` trägt alle Blattnamen aus dem ersten Durchgang, damit eine
      Fehlermeldung sie nennen kann, ohne sie zu dekodieren; SheetNames und
      Sheets enthalten weiterhin nie mehr als das eine gewählte Blatt. */
  function openWorkbook(X, bytes) {
    var toc = X.read(bytes, { type: 'array', bookSheets: true });
    var available = (toc.SheetNames || []).slice();
    var chosen = chooseSheet(available);
    if (!chosen) return { SheetNames: [], Sheets: {}, available: available };
    /* cellNF: true — ohne das legt SheetJS das Zahlenformat einer Zelle
       (c.z) gar nicht erst ab, und currencyOfFormat() liest immer null.
       Die Erkennung der Währung hängt daran. */
    var wb = X.read(bytes, {
      type: 'array', cellDates: true, cellNF: true, cellFormula: false, cellStyles: false, sheets: [chosen]
    });
    var kept = {};
    if (wb.Sheets[chosen]) kept[chosen] = wb.Sheets[chosen];
    return { SheetNames: [chosen], Sheets: kept, available: available };
  }

  function parseWorkbook(wb, fileName, opts) {
    dispCode = (opts && opts.currency) || 'EUR';
    currencyTallyReset();
    var errors = [], warnings = [];
    var wsData = wb.Sheets[wb.SheetNames[0]];
    if (!wsData) {
      var have = (wb.available || []).map(function (n) { return '"' + n + '"'; }).join(', ');
      errors.push('No sheet named "Data Input" found (also accepted: ' +
        SHEET_NAMES.slice(1).join(', ') + '). This workbook has: ' + have +
        '. Rename the sheet, or keep a single sheet in the file.');
    }
    if (errors.length) return { ok: false, errors: errors, warnings: warnings, model: null, currency: null };

    var data = parseDataInput(wsData, errors, warnings);
    if (errors.length || !data) return { ok: false, errors: errors, warnings: warnings, model: null, currency: null };

    var currency = currencyResult(warnings, dispCode);

    return {
      ok: true, errors: [], warnings: warnings, currency: currency,
      model: {
        version: MODEL_VERSION,
        importedAt: new Date().toISOString(),
        sourceName: fileName || null,
        months: data.months,
        currentIndex: data.currentIndex,
        accounts: data.accounts,
        sectionOrder: data.sectionOrder,
        skipped: data.skipped,
        warnings: warnings
      }
    };
  }

  function parseArrayBuffer(buf, fileName, opts) {
    var X = global.XLSX;
    if (!X) return { ok: false, errors: ['SheetJS (js/vendor/xlsx.full.min.js) was not loaded.'], warnings: [], model: null, currency: null };
    var wb;
    try {
      wb = openWorkbook(X, new Uint8Array(buf));
    } catch (e) {
      return { ok: false, errors: ['The file could not be read: ' + (e && e.message ? e.message : e)], warnings: [], model: null, currency: null };
    }
    return parseWorkbook(wb, fileName, opts);
  }

  NS.importer = {
    MODEL_VERSION: MODEL_VERSION,
    parseWorkbook: parseWorkbook,
    parseArrayBuffer: parseArrayBuffer,
    _parseNumber: parseNumber,
    _openWorkbook: openWorkbook,
    _currencyOfFormat: currencyOfFormat
  };
})(typeof window !== 'undefined' ? window : globalThis);
