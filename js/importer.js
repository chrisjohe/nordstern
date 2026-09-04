/* NORDSTERN: Importer.
   SÄMTLICHES Wissen über den Aufbau der Arbeitsmappe lebt in dieser Datei.
   Ausgewertet und gespeichert wird ausschließlich das eine Blatt, das
   chooseSheet auswählt; die Datei wird nur gelesen, nie geschrieben. */
(function (global) {
  'use strict';

  var NS = global.NORDSTERN || (global.NORDSTERN = {});
  /* Wer die Form des Modells ändert, zählt hier hoch; store.js verwirft
     Modelle mit anderer Nummer. */
  var MODEL_VERSION = 3;
  /* Anzeigewährung für den Text der Warnungen; die Mappe wird nicht
     umgerechnet. */
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
     auf, 1,234 statt 1.234,56, ein Faktor tausend ohne ein Zeichen davon im
     Programm. Gelesen wird deshalb nur, was einer Schreibweise ganz entspricht:
     deutsch, englisch oder schweizerisch (Apostroph als Gruppentrenner, nie
     mehrdeutig). Passen beide, deutsch und englisch, gewinnt deutsch: die
     Mappe schreibt ihre Daten deutsch. Ein Währungszeichen zählt nur am Rand,
     vor oder nach dem Vorzeichen oder am Ende; mitten in den Ziffern ist es
     keine Schreibweise, sondern eine kaputte Zelle. */
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

  /* Währung aus dem Zahlenformat (c.z), nicht aus dem Wert. Gebietsschema-
     Tags wie „[$-409]" tragen kein Symbol und fallen zuerst weg; dann
     zählen Symbol-Tags („[$€-407]", „[$CHF]"), dann ein blankes Symbol
     oder Kürzel im Format. Nur die vier Währungen der Einstellungen
     zählen. */
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

  /* Zählung je Lauf; `currencySeen` verhindert, dass die Summenzeile einer
     Sektion doppelt zählt (Monatsreihe und Gegenprobe). */
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

  /* Anzahl und erste Adresse genügen; eine Liste trüge bei hundert
     Textspalten hundert Adressen. */
  var noted = null;
  function noteInit(sheet) {
    noted = { sheet: sheet, textN: 0, textAt: null, badN: 0, badAt: null, errN: 0, errAt: null };
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
    if (n.errN) {
      warnings.push(n.errN + (n.errN === 1 ? ' cell holds' : ' cells hold') +
        ' Excel error values on "' + n.sheet + '" (first: ' + n.errAt +
        '). They count as empty.');
    }
  }

  /* Zelle → Zahl, ohne die Zähltabelle `noted` zu berühren; hasData()
     braucht das, sonst zählte jede Kontozelle doppelt. */
  function numRaw(c) {
    if (!c || c.v == null || c.v === '') return null;
    if (c.t === 'e') return null;               // #N/A, #REF! & co. — kein Betrag
    if (typeof c.v === 'number') return isFinite(c.v) ? c.v : null;
    return parseNumber(c.v);
  }

  function num(ws, row, col) {
    var c = cell(ws, row, col);
    var result = numRaw(c);
    if (c && c.v != null && c.v !== '' && noted) {
      if (c.t === 'e') {
        noted.errN++; if (!noted.errAt) noted.errAt = addr(row, col);
      } else if (typeof c.v !== 'number') {
        if (result == null) { noted.badN++; if (!noted.badAt) noted.badAt = addr(row, col); }
        else { noted.textN++; if (!noted.textAt) noted.textAt = addr(row, col); }
      }
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
      Abstand in Monaten. Eigene Zeile statt js/util.js: diese Datei kommt
      ohne den Rest der Anwendung aus. */
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
    if (isDate(v_(c))) return isFinite(c.v.getTime()) ? c.v : null;   // new Date('x') & Co.
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

  /* Sektionen sind über zwei Beschriftungen in Spalte A verankert, nicht
     über Zeilennummern; eine Schreibweise je Anker. */
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

  /* map trägt je Beschriftung die erste Zeile, rows jedes Vorkommen:
     Kontonamen dürfen sich wiederholen, Anker nicht (need()). */
  function labelRows(ws, range) {
    var map = {}, rows = {}, order = [];
    for (var r = range.r0; r <= range.r1; r++) {
      var l = norm(str(ws, r, 0));
      if (!l) continue;
      if (!(l in map)) map[l] = r;
      (rows[l] || (rows[l] = [])).push(r);
      order.push({ row: r, label: l, raw: str(ws, r, 0).replace(/ /g, ' ').trim() });
    }
    return { map: map, rows: rows, order: order };
  }

  function parseDataInput(ws, errors, warnings) {
    noteInit('Data Input');
    var range = decodeRange(ws);
    var L = labelRows(ws, range);
    /* Eine leere Mappe verfehlt sonst jeden der fünfzehn Anker einzeln —
       fünfzehn Meldungen für denselben Befund. Eine genügt. */
    if (!ws['!ref'] || !L.order.length) {
      errors.push('The sheet "Data Input" is empty.');
      return null;
    }

    function need(anchor) {
      if (!(anchor in L.map)) { errors.push('Row "' + anchor + '" not found.'); return -1; }
      var occ = L.rows[anchor];
      if (occ.length > 1) {
        errors.push('Row "' + anchor + '" appears ' + occ.length + ' times (rows ' +
          occ.map(function (r) { return r + 1; }).join(', ') + '); keep one.');
        return -1;
      }
      return L.map[anchor];
    }

    var rowDates  = need(ANCHOR_DATES);
    var rowNW     = need(ANCHOR_NETWORTH);
    var rowTA     = need(ANCHOR_TOTALASSETS);
    var rowLiab   = need(ANCHOR_LIABILITIES);
    var rowLiabTot = need(ANCHOR_LIAB_TOTAL);
    SECTIONS.forEach(function (s) { s._head = need(s.head); s._total = need(s.total); });
    if (errors.length) return null;

    /* Kopf vor Summe, und die sechs Bereiche ohne Überlappung, sonst liest
       eine Sektion fremde Ankerzeilen als Konten. */
    var spans = SECTIONS.map(function (s) { return { head: s.head, total: s.total, h: s._head, t: s._total }; });
    spans.push({ head: ANCHOR_LIABILITIES, total: ANCHOR_LIAB_TOTAL, h: rowLiab, t: rowLiabTot });
    spans.forEach(function (sp) {
      if (sp.h >= sp.t) {
        errors.push('Row "' + sp.head + '" must come before row "' + sp.total + '" (rows ' +
          (sp.h + 1) + ', ' + (sp.t + 1) + ').');
      }
    });
    if (errors.length) return null;

    var sorted = spans.slice().sort(function (a, b) { return a.h - b.h; });
    for (var sv = 1; sv < sorted.length; sv++) {
      if (sorted[sv].h <= sorted[sv - 1].t) {
        errors.push('Sections overlap: "' + sorted[sv].head + '" (row ' + (sorted[sv].h + 1) +
          ') lies inside "' + sorted[sv - 1].head + '" … "' + sorted[sv - 1].total + '" (rows ' +
          (sorted[sv - 1].h + 1) + ', ' + (sorted[sv - 1].t + 1) + ').');
      }
    }
    var singles = [
      { name: ANCHOR_DATES, row: rowDates },
      { name: ANCHOR_TOTALASSETS, row: rowTA },
      { name: ANCHOR_NETWORTH, row: rowNW }
    ];
    singles.forEach(function (a) {
      spans.forEach(function (sp) {
        if (a.row > sp.h && a.row < sp.t) {
          errors.push('Row "' + a.name + '" (row ' + (a.row + 1) + ') lies inside "' + sp.head +
            '" … "' + sp.total + '" (rows ' + (sp.h + 1) + ', ' + (sp.t + 1) + ').');
        }
      });
    });
    if (errors.length) return null;

    /* Eine Kopfzelle mit Inhalt, der kein Datum ist, wird mitgezählt: das
       unterscheidet eine leere Kopfzeile von einer falschen. */
    var cols = [], badDateN = 0, badDateAt = null;
    for (var c = range.c0 + 1; c <= range.c1; c++) {
      var d = readDate(ws, rowDates, c);
      if (d) { cols.push({ col: c, date: d, key: monthKey(d), iso: isoDay(d) }); continue; }
      var dc = cell(ws, rowDates, c);
      if (dc && dc.v != null && dc.v !== '') {
        badDateN++; if (!badDateAt) badDateAt = addr(rowDates, c);
      }
    }
    if (!cols.length) {
      if (badDateN) {
        errors.push('No month columns found in the header row (' + badDateN +
          (badDateN === 1 ? ' non-empty cell was not a date, first: ' : ' non-empty cells were not dates, first: ') +
          badDateAt + ').');
      } else {
        errors.push('No month columns found in the header row.');
      }
      return null;
    }

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

    /* Welche Spalte „jetzt" ist. Mappen tragen rechts vom letzten echten
       Snapshot oft fortgeschriebene Spalten (ein Auto, das planmäßig
       abschreibt; ein Darlehen, das weiter tilgt). Die Grenze am Betrag zu
       ziehen geht nicht: liquide Mittel dürfen negativ sein, ein Depot darf 0
       sein, beides wäre trotzdem ein echter Monat. Also zählt der Kalender:
       ein Snapshot ist ein Monat, in dessen Spalte etwas steht; eine leere
       Spalte, ob am Rand oder mittendrin, ist eine Lücke, kein Nullstand. Der
       Füllgrad taugt nicht als Kriterium, weil eine Fortschreibung fast so
       viele Kontozeilen füllt wie ein gelebter Monat. */
    var accountRows = [];
    SECTIONS.forEach(function (s) { s._rows.forEach(function (a) { accountRows.push(a.row); }); });
    liabRows.forEach(function (a) { accountRows.push(a.row); });
    if (!accountRows.length) {
      errors.push('No account rows found: every section is empty between its header row and its total row.');
      return null;
    }

    function hasData(col) {
      for (var k = 0; k < accountRows.length; k++) {
        if (numRaw(cell(ws, accountRows[k], col)) != null) return true;
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
      /* "No snapshot found" hat drei verschiedene Ursachen, die sich sonst
         hinter einer Meldung verstecken: alle Spalten liegen in der Zukunft,
         oder die vergangenen sind leer, oder sie tragen nur Text- und
         Fehlerwerte statt Zahlen. Jede zeigt woanders hin. */
      var pastCols = [];
      for (var pi = 0; pi < cols.length; pi++) {
        if (cols[pi].key <= nowKey) pastCols.push(cols[pi]);
      }
      var pastN = pastCols.length;
      if (pastN === 0) {
        errors.push('No snapshot found: all ' + cols.length + ' month column' +
          (cols.length === 1 ? '' : 's') + ' are dated in the future (first: ' + cols[0].key + ').');
        return null;
      }
      var filledN = 0, filledAt = null;
      for (var pc = 0; pc < pastCols.length; pc++) {
        for (var ar = 0; ar < accountRows.length; ar++) {
          var pcell = cell(ws, accountRows[ar], pastCols[pc].col);
          if (pcell && pcell.v != null && pcell.v !== '') {
            filledN++;
            if (!filledAt) filledAt = addr(accountRows[ar], pastCols[pc].col);
          }
        }
      }
      if (filledN === 0) {
        errors.push('No snapshot found: the ' + pastN + ' past month column' +
          (pastN === 1 ? '' : 's') + ' are empty in every account row.');
      } else {
        errors.push('No snapshot found: the ' + pastN + ' past month column' +
          (pastN === 1 ? '' : 's') + ' hold no numbers in any account row, only text or error values (' +
          filledN + ' cells, first: ' + filledAt + ').');
      }
      return null;
    }

    /* Ein Fehlerwert in einer der drei Summenzeilen der aktuellen Spalte
       bricht ab, statt still auf 0 zu fallen: diese Zahl trägt den
       Kopfbereich. */
    var curCol = cols[lastIdx].col;
    var curTotals = [
      { row: rowTA, label: 'Total assets' },
      { row: rowLiabTot, label: 'Total liabilities' },
      { row: rowNW, label: 'Total net worth' }
    ];
    for (var ct = 0; ct < curTotals.length; ct++) {
      var ec = cell(ws, curTotals[ct].row, curCol);
      if (ec && ec.t === 'e') {
        errors.push('"' + curTotals[ct].label + '" holds an Excel error value in the current month column (' +
          addr(curTotals[ct].row, curCol) + ').');
        return null;
      }
    }

    /* Leere Spalten innerhalb der Reihe werden hier ausgesiebt, nicht als
       Nullstand geführt; die Lückenerkennung unten meldet den Sprung, eine
       eigene Warnung nennt die leere Spalte. */
    var used = [], emptyInside = [];
    for (var i2 = 0; i2 <= lastIdx; i2++) {
      if (hasData(cols[i2].col)) used.push(cols[i2]); else emptyInside.push(cols[i2].key);
    }
    /* Spalten rechts von lastIdx, nicht die Längendifferenz (die zählte
       die innen ausgesiebten mit). */
    var skipped = cols.length - (lastIdx + 1);

    /* Aufsteigend, sonst liest die Berechnung die falsche Spalte als
       Vormonat. Lücken und Doppelungen trägt das Programm, eine verrutschte
       Spalte nicht: „zuletzt" wäre der falsche Monat. Sortieren hiesse
       raten, also wird abgelehnt. */
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

    /* Einzelzellen sind endlich, ihre Summe nicht unbedingt (fünf mal
       1e308). NaN besteht danach keine Gegenprobe, also vorher prüfen. */
    for (var mo = 0; mo < months.length; mo++) {
      for (var mk in months[mo]) {
        if (mk === 'key' || mk === 'iso') continue;
        if (typeof months[mo][mk] === 'number' && !isFinite(months[mo][mk])) {
          errors.push('Amounts overflow the representable range (first: ' + months[mo].key + ', ' + mk + ').');
          return null;
        }
      }
    }

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

  /* Vorrangreihenfolge: der erste Name der Liste, der vorkommt, gewinnt;
     ein Einzelblatt braucht keinen (chooseSheet). */
  var SHEET_NAMES = ['Data Input', 'Data', 'Input', 'Snapshots', 'Net Worth',
    'Nordstern', 'Daten', 'Dateneingabe', 'Vermögen', 'Bilanz'];

  /** Bei zwei oder mehr unbekannten Blättern wird nicht geraten und nicht
      in den Inhalt geschaut: das würde jedes Blatt dekodieren. */
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

  /** Zwei Durchgänge: erst die Namensliste (`bookSheets`), dann nur das
      gewählte Blatt, weil SheetJS sonst jedes Blatt parst. Für ods und
      numbers ignoriert SheetJS den Filter, deshalb wird danach hart auf das
      eine Blatt reduziert, mitsamt Mappen-Eigenschaften. `available` nennt
      alle Blattnamen für Fehlermeldungen. */
  function openWorkbook(X, bytes) {
    var toc = X.read(bytes, { type: 'array', bookSheets: true });
    var available = (toc.SheetNames || []).slice();
    var chosen = chooseSheet(available);
    if (!chosen) return { SheetNames: [], Sheets: {}, available: available };
    /* Ohne cellNF legt SheetJS das Zahlenformat (c.z) nicht ab; die
       Währungserkennung hängt daran. */
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
    /* Ein fehlendes Sheets/SheetNames ist derselbe Befund wie ein nicht
       gefundenes Blatt, kein Absturz. */
    var wsData = (wb && wb.Sheets && wb.SheetNames) ? wb.Sheets[wb.SheetNames[0]] : null;
    if (!wsData) {
      var have = ((wb && wb.available) || []).map(function (n) { return '"' + n + '"'; }).join(', ');
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

  /* SheetJS meldet eine gekappte Datei als „Unsupported ZIP file", falsche
     Größen als „Bad compressed size"; alles andere bleibt unübersetzt. */
  var CORRUPT_RE = /bad compressed size|corrupt|unexpected end|cannot find end of central directory|invalid zip|zip/i;

  function parseArrayBuffer(buf, fileName, opts) {
    var X = global.XLSX;
    if (!X) return { ok: false, errors: ['SheetJS (js/vendor/xlsx.full.min.js) was not loaded.'], warnings: [], model: null, currency: null };
    try {
      var wb = openWorkbook(X, new Uint8Array(buf));
      return parseWorkbook(wb, fileName, opts);
    } catch (e) {
      var msg = e && e.message ? e.message : String(e);
      if (CORRUPT_RE.test(msg)) {
        return { ok: false, errors: ['The file is damaged or incomplete and could not be read (' + msg + ').'], warnings: [], model: null, currency: null };
      }
      return { ok: false, errors: ['The file could not be read: ' + msg], warnings: [], model: null, currency: null };
    }
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
