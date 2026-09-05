/* NORDSTERN: lokale Persistenz.
   Modell und Einstellungen liegen ausschließlich im localStorage dieses Rechners.
   Es verlässt nichts das Gerät. */
(function (global) {
  'use strict';

  var NS = global.NORDSTERN || (global.NORDSTERN = {});

  var KEY_MODEL = 'nordstern.model.v1';
  var KEY_SETTINGS = 'nordstern.settings.v1';

  /* Die eine Zahl, die nicht aus der Mappe kommt. Bei 0 lägen alle Ziele
     bei null; 2.500 € ist eine Hausnummer, niemandes echte Ausgabe
     (docs/CUSTOMISE.md). */
  var DEFAULT_EXPENSES = 2500;

  var DEFAULT_SETTINGS = {
    monthlyExpenses: DEFAULT_EXPENSES,
    expensesSet: false,        // hat je ein Mensch das Blatt geöffnet und die Summe gesehen?
    animations: true,
    motionIntensity: 'normal', // 'ruhig' | 'normal'
    highContrast: false,
    currency: 'EUR'
  };

  /* Eigene Liste, weil store.js in Tests ohne util.js läuft. */
  var FALLBACK_CURRENCIES = { EUR: 1, USD: 1, GBP: 1, CHF: 1 };
  function currencyCodes() {
    return (NS.util && NS.util.CURRENCIES) || FALLBACK_CURRENCIES;
  }

  /* Schon das Lesen von localStorage kann werfen (opakes Origin unter
     file://); ohne Speicher läuft die App weiter, nur ohne Merken. */
  var LS = null;
  try { LS = global.localStorage || null; } catch (e) { LS = null; }

  function available() {
    if (!LS) return false;
    try {
      var k = '__ns_probe__';
      LS.setItem(k, '1');
      LS.removeItem(k);
      return true;
    } catch (e) { return false; }
  }

  var ok = available();

  /* Die Versionsnummer allein sagt nichts über den Inhalt; ein kaputter
     Eintrag würfe sonst erst nach dem Ausblenden des Leerzustands, vor
     einem leeren Bildschirm. Geprüft wird, woran die Anwendung hängt,
     nicht mehr: kein Schema-Validator. */
  function usable(m) {
    if (!m || typeof m !== 'object') return false;
    if (m.version !== NS.importer.MODEL_VERSION) return false;
    if (!Array.isArray(m.months) || !m.months.length) return false;
    for (var i = 0; i < m.months.length; i++) {
      var mo = m.months[i];
      if (!mo || typeof mo !== 'object') return false;
      /* Der Monat muss im Kalender vorkommen, nicht nur zweistellig sein,
         sonst besteht auch '2026-99' die Prüfung. */
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mo.key)) return false;
      if (!num(mo.netWorth) || !num(mo.totalAssets) || !num(mo.liabilities)) return false;
      /* Alle fünf Sektionen, sonst liest die Rechnung NaN. */
      if (!num(mo.liquid) || !num(mo.receivables) || !num(mo.investment) ||
          !num(mo.tangible) || !num(mo.retirement)) return false;
    }
    /* Ganzzahlig: months[0.5] ist undefined. `% 1`, weil ES5. */
    if (!num(m.currentIndex) || m.currentIndex % 1 !== 0) return false;
    if (m.currentIndex < 0 || m.currentIndex >= m.months.length) return false;
    /* Auch „liabilities", das nicht in sectionOrder steht und trotzdem
       gelesen wird. */
    if (!m.accounts || typeof m.accounts !== 'object') return false;
    for (var k in m.accounts) {
      if (!Object.prototype.hasOwnProperty.call(m.accounts, k)) continue;
      if (!accountList(m.accounts[k], m.months.length)) return false;
    }
    if (!Array.isArray(m.sectionOrder) || !m.sectionOrder.length) return false;
    for (var j = 0; j < m.sectionOrder.length; j++) {
      if (!Array.isArray(m.accounts[m.sectionOrder[j]])) return false;
    }
    /* Die vier Felder, an denen settings.js beim Anzeigen hängt (sync()):
       ein Array aus Zeichenketten wirft sonst beim ersten forEach/length,
       ein falscher sourceName oder skipped steht nur falsch da, aber ein
       kaputtes warnings reisst die ganze Anzeige mit. */
    if (!strArray(m.warnings)) return false;
    if (typeof m.importedAt !== 'string') return false;
    if (m.sourceName !== null && typeof m.sourceName !== 'string') return false;
    if (m.skipped !== null) {
      if (!m.skipped || typeof m.skipped !== 'object') return false;
      if (!num(m.skipped.count) || typeof m.skipped.from !== 'string') return false;
    }
    return true;
  }
  function num(v) { return typeof v === 'number' && isFinite(v); }
  function strArray(a) {
    if (!Array.isArray(a)) return false;
    for (var i = 0; i < a.length; i++) if (typeof a[i] !== 'string') return false;
    return true;
  }

  function accountList(rows, monthCount) {
    if (!Array.isArray(rows)) return false;
    for (var i = 0; i < rows.length; i++) {
      var a = rows[i];
      if (!a || typeof a.name !== 'string') return false;
      if (!Array.isArray(a.values) || a.values.length !== monthCount) return false;
      for (var j = 0; j < a.values.length; j++) if (!num(a.values[j])) return false;
    }
    return true;
  }

  function loadModel() {
    if (!ok) return null;
    var raw;
    try { raw = LS.getItem(KEY_MODEL); } catch (e) { return null; }
    if (!raw) return null;
    var m = null;
    try { m = JSON.parse(raw); } catch (e) { m = null; }
    if (m && usable(m)) return m;
    /* Abgeschnitten, halb überschrieben oder von Hand gesetzt: was hier
       liegt, besteht die Prüfung nie wieder und würfe bei jedem Neustart
       erneut. Weg damit; die Einstellungen bleiben, sie sind heil. */
    clearModel();
    return null;
  }

  function saveModel(model) {
    if (!ok) return { ok: false, reason: 'localStorage unavailable' };
    try {
      LS.setItem(KEY_MODEL, JSON.stringify(model));
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e && e.name === 'QuotaExceededError'
        ? 'Local storage is full.' : String(e && e.message || e) };
    }
  }

  /* „Delete local data" heisst alles, nicht das Modell allein: die
     Ausgaben sind eine von Hand eingetippte Zahl, genauso persönlich wie
     jeder Kontostand. Erst sammeln, dann löschen: wer während des
     Durchlaufs entfernt, überspringt Einträge, weil der Index weiterrutscht. */
  function clearModel() {
    if (!ok) return;
    try { LS.removeItem(KEY_MODEL); } catch (e) {}
  }

  function clearAll() {
    if (!ok) return 0;
    var mine = [];
    try {
      if (typeof LS.length === 'number' && typeof LS.key === 'function') {
        for (var i = 0; i < LS.length; i++) {
          var k = LS.key(i);
          if (k && k.indexOf('nordstern.') === 0) mine.push(k);
        }
      } else {
        /* Ein Speicher ohne length/key ist keiner, den wir durchgehen können —
           dann wenigstens die beiden, die wir sicher selbst geschrieben haben. */
        mine = [KEY_MODEL, KEY_SETTINGS];
      }
    } catch (e) { mine = [KEY_MODEL, KEY_SETTINGS]; }
    var n = 0;
    for (var j = 0; j < mine.length; j++) {
      try { LS.removeItem(mine[j]); n++; } catch (e) {}
    }
    return n;
  }

  function loadSettings() {
    var s = {};
    for (var k in DEFAULT_SETTINGS) s[k] = DEFAULT_SETTINGS[k];
    if (!ok) return s;
    try {
      var raw = LS.getItem(KEY_SETTINGS);
      if (raw) {
        var stored = JSON.parse(raw);
        for (var j in DEFAULT_SETTINGS) {
          if (Object.prototype.hasOwnProperty.call(stored, j)) s[j] = stored[j];
        }
      }
    } catch (e) {}
    s.monthlyExpenses = Math.max(0, Number(s.monthlyExpenses) || 0);
    if (!Object.prototype.hasOwnProperty.call(currencyCodes(), s.currency)) s.currency = 'EUR';
    return s;
  }

  function saveSettings(s) {
    if (!ok) return;
    try { LS.setItem(KEY_SETTINGS, JSON.stringify(s)); } catch (e) {}
  }

  NS.store = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS, DEFAULT_EXPENSES: DEFAULT_EXPENSES,
    loadModel: loadModel, saveModel: saveModel, clearModel: clearModel, clearAll: clearAll,
    _usable: usable,
    loadSettings: loadSettings, saveSettings: saveSettings
  };
})(typeof window !== 'undefined' ? window : globalThis);
