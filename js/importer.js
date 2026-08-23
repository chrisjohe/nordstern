/* NORDSTERN — Importer.
   SÄMTLICHES Wissen über den Aufbau der Arbeitsmappe lebt in dieser Datei.
   Ausgelesen werden ausschließlich die Blätter "Data Input" und "Expenses".
   Die Datei wird nur gelesen — nie geschrieben, nie ergänzt. */
(function (global) {
  'use strict';

  var NS = global.NORDSTERN || (global.NORDSTERN = {});
  /* 2 statt 1, seit das Modell die Blattnamen nicht mehr mitführt: ein unter
     Version 1 gespeichertes Modell trägt sie noch, und die sollen weg. Ein
     Versionssprung wirft es beim Laden fort — einmal neu importieren. */
  var MODEL_VERSION = 2;

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
  function num(ws, row, col) {
    var c = cell(ws, row, col);
    if (!c || c.v == null || c.v === '') return null;
    if (typeof c.v === 'number') return isFinite(c.v) ? c.v : null;
    var n = parseFloat(String(c.v).replace(/\s/g, '').replace(',', '.'));
    return isFinite(n) ? n : null;
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
       den Rest des Jahres legt man sich gern im Voraus an.

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

    var used = cols.slice(0, lastIdx + 1);
    /* Was rechts liegen bleibt, wird nicht still verworfen — die Einstellungen
       sagen es unter „data source". */
    var skipped = cols.length - used.length;

    /* Die Reihe muss Monat für Monat aufsteigen. Sie tut es fast immer — und
       wenn nicht, fällt es nirgends auf: die Berechnung liest die Spalte
       links vom aktuellen Monat als „Vormonat" und die zwölfte als „vor einem
       Jahr". Eine ausgelassene, doppelte oder verrutschte Spalte macht daraus
       eine falsche Zahl, die aussieht wie jede andere. Also gesagt, was ist —
       die Einstellungen zeigen es unter „notes while reading". */
    var dups = [], jumps = [], missing = 0, firstGap = null;
    for (var g = 1; g < used.length; g++) {
      var step = monthNo(used[g].key) - monthNo(used[g - 1].key);
      if (step === 0) dups.push(used[g].key);
      else if (step < 0) jumps.push(used[g].key);
      else if (step > 1) { missing += step - 1; if (!firstGap) firstGap = used[g - 1].key; }
    }
    if (dups.length) {
      warnings.push('The same month stands in more than one column: ' + dups.join(', ') +
        '. Only comparisons that fall on an actual month are shown.');
    }
    if (jumps.length) {
      warnings.push('The month columns are not in ascending order — ' + jumps.join(', ') +
        ' comes after a later month. Month-on-month and year-on-year are left blank where the order breaks.');
    }
    if (missing) {
      warnings.push('The series skips ' + missing + ' month' + (missing === 1 ? '' : 's') +
        ', the first gap after ' + firstGap +
        '. Comparisons across a gap are left blank rather than counted as a month.');
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
          worst.toFixed(2) + ' € in ' + worstKey + ').');
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

    return {
      months: months,
      currentIndex: months.length - 1,
      accounts: accounts,
      sectionOrder: SECTIONS.map(function (s) { return s.id; }),
      skipped: skipped ? { count: skipped, from: cols[used.length].key } : null
    };
  }

  /* --------------------------------------------------- Aufbau von "Expenses" */

  var EXP_MONTHLY_TOTAL = 'monthly fixed costs';
  var EXP_ANNUAL_TOTAL  = 'annual fixed costs';
  var EXP_HEADER        = 'kind';

  function parseExpenses(ws, errors, warnings) {
    var range = decodeRange(ws);
    var L = labelRows(ws, range);
    var rMonthly = L.map[EXP_MONTHLY_TOTAL];
    var rAnnual  = L.map[EXP_ANNUAL_TOTAL];

    if (rMonthly == null && rAnnual == null) {
      errors.push('Sheet "Expenses": neither "Monthly fixed costs" nor "Annual fixed costs" found.');
      return null;
    }

    function items(from, to) {
      var out = [];
      for (var r = from; r < to; r++) {
        var name = str(ws, r, 0).replace(/ /g, ' ').trim();
        var amount = num(ws, r, 1);
        if (!name || amount == null) continue;
        if (norm(name) === EXP_MONTHLY_TOTAL || norm(name) === EXP_ANNUAL_TOTAL) continue;
        if (norm(name) === EXP_HEADER) continue;   // Kopfzeile des Blattes
        out.push({ name: name, amount: amount, due: str(ws, r, 2).trim() || null });
      }
      return out;
    }

    var monthlyItems = items(range.r0, rMonthly == null ? range.r1 + 1 : rMonthly);
    var annualItems  = rAnnual == null ? [] : items(rMonthly == null ? range.r0 : rMonthly + 1, rAnnual);

    var monthlyFixed = rMonthly == null ? null : num(ws, rMonthly, 1);
    var annualFixed  = rAnnual == null ? null : num(ws, rAnnual, 1);
    if (monthlyFixed == null) monthlyFixed = monthlyItems.reduce(function (a, b) { return a + b.amount; }, 0);
    if (annualFixed == null) annualFixed = annualItems.reduce(function (a, b) { return a + b.amount; }, 0);

    /* Die monatliche Last wird gerechnet, nicht gelesen: monatlich plus
       jährlich durch zwölf. Keine Zeile der Mappe darf das überschreiben —
       ein Anker für eine Zeile, die niemand hat, wäre eine Behauptung über
       eine fremde Datei. */
    var computed = monthlyFixed + annualFixed / 12;

    var sumM = monthlyItems.reduce(function (a, b) { return a + b.amount; }, 0);
    if (Math.abs(sumM - monthlyFixed) > 0.02) {
      warnings.push('Monthly line items add up to ' + sumM.toFixed(2) + ' €, the total row says ' + monthlyFixed.toFixed(2) + ' €.');
    }
    var sumA = annualItems.reduce(function (a, b) { return a + b.amount; }, 0);
    if (Math.abs(sumA - annualFixed) > 0.02) {
      warnings.push('Annual line items add up to ' + sumA.toFixed(2) + ' €, the total row says ' + annualFixed.toFixed(2) + ' €.');
    }

    return {
      monthlyItems: monthlyItems,
      annualItems: annualItems,
      monthlyFixed: monthlyFixed,
      annualFixed: annualFixed,
      fixedMonthly: computed,
      note: null
    };
  }

  /* ------------------------------------------------------------------- API */

  /* Die zwei Blätter, die gelesen werden dürfen — und sonst keines. */
  var WANTED = ['Data Input', 'Expenses'];

  /** Unter welchen Namen die zwei Blätter in dieser Mappe wirklich stehen.
      Groß-/Kleinschreibung und Leerraum dürfen abweichen (norm()), deshalb
      lässt sich der Filter unten nicht einfach mit WANTED füttern. */
  function resolveNames(sheetNames) {
    var found = [];
    WANTED.forEach(function (w) {
      var n = norm(w);
      for (var i = 0; i < sheetNames.length; i++) {
        if (norm(sheetNames[i]) === n) { found.push(sheetNames[i]); return; }
      }
    });
    return found;
  }

  /** Öffnet die Mappe in zwei Durchgängen: erst das Inhaltsverzeichnis, dann
      ausschließlich die zwei erlaubten Blätter.

      Der Umweg ist der Preis dafür, dass SheetJS ohne `sheets` jedes Blatt
      parst — auch das, auf dem jemand seine Gehaltsverhandlung notiert hat.
      `bookSheets: true` liest nur die Namensliste und keinen Blattinhalt.

      Für ods und numbers ignoriert SheetJS den Filter und parst trotzdem
      alles. Deshalb wird danach hart auf die zwei Blätter reduziert: was
      nicht dazugehört, kommt nicht über diese Funktion hinaus. Mit derselben
      Bewegung fallen die Mappen-Eigenschaften weg — dort steht sonst der
      Name dessen, der die Datei angelegt hat. */
  function openWorkbook(X, bytes) {
    var toc = X.read(bytes, { type: 'array', bookSheets: true });
    var names = resolveNames(toc.SheetNames || []);
    if (!names.length) return { SheetNames: [], Sheets: {} };
    var wb = X.read(bytes, {
      type: 'array', cellDates: true, cellFormula: false, cellStyles: false, sheets: names
    });
    var kept = {};
    names.forEach(function (n) { if (wb.Sheets[n]) kept[n] = wb.Sheets[n]; });
    return { SheetNames: names.slice(), Sheets: kept };
  }

  function findSheet(wb, wanted) {
    var w = norm(wanted);
    for (var i = 0; i < wb.SheetNames.length; i++) {
      if (norm(wb.SheetNames[i]) === w) return wb.Sheets[wb.SheetNames[i]];
    }
    return null;
  }

  function parseWorkbook(wb, fileName) {
    var errors = [], warnings = [];
    var wsData = findSheet(wb, 'Data Input');
    var wsExp = findSheet(wb, 'Expenses');
    if (!wsData) errors.push('Sheet "Data Input" is missing.');
    if (!wsExp) errors.push('Sheet "Expenses" is missing.');
    if (errors.length) return { ok: false, errors: errors, warnings: warnings, model: null };

    var data = parseDataInput(wsData, errors, warnings);
    var exp = data ? parseExpenses(wsExp, errors, warnings) : null;
    if (errors.length || !data || !exp) return { ok: false, errors: errors, warnings: warnings, model: null };

    return {
      ok: true, errors: [], warnings: warnings,
      model: {
        version: MODEL_VERSION,
        importedAt: new Date().toISOString(),
        sourceName: fileName || null,
        months: data.months,
        currentIndex: data.currentIndex,
        accounts: data.accounts,
        sectionOrder: data.sectionOrder,
        skipped: data.skipped,
        expenses: exp,
        warnings: warnings
      }
    };
  }

  function parseArrayBuffer(buf, fileName) {
    var X = global.XLSX;
    if (!X) return { ok: false, errors: ['SheetJS (js/vendor/xlsx.full.min.js) was not loaded.'], warnings: [], model: null };
    var wb;
    try {
      wb = openWorkbook(X, new Uint8Array(buf));
    } catch (e) {
      return { ok: false, errors: ['The file could not be read: ' + (e && e.message ? e.message : e)], warnings: [], model: null };
    }
    return parseWorkbook(wb, fileName);
  }

  NS.importer = {
    MODEL_VERSION: MODEL_VERSION,
    parseWorkbook: parseWorkbook,
    parseArrayBuffer: parseArrayBuffer,
    _norm: norm,
    _openWorkbook: openWorkbook
  };
})(typeof window !== 'undefined' ? window : globalThis);
