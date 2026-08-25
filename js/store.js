/* NORDSTERN — lokale Persistenz.
   Modell und Einstellungen liegen ausschließlich im localStorage dieses Rechners.
   Es verlässt nichts das Gerät. */
(function (global) {
  'use strict';

  var NS = global.NORDSTERN || (global.NORDSTERN = {});

  var KEY_MODEL = 'nordstern.model.v1';
  var KEY_SETTINGS = 'nordstern.settings.v1';

  /* Der eine Betrag, den niemand aus der Mappe lesen kann: was Essen,
     Freizeit und Urlaub im Monat kosten. Bei 0 zählen alle acht Ziele nur die
     Fixkosten — und liegen damit sichtbar zu niedrig, was schlimmer ist als
     eine grobe Schätzung. Deshalb steht hier eine: 20 € am Tag, gerundet auf
     600 € im Monat. Das ist eine Hausnummer und niemandes echte Ausgabe;
     wer sie dauerhaft anders haben will, ändert diese Zeile (siehe
     docs/CUSTOMISE.md), wer sie einmal anders haben will, tippt sie in
     Einstellungen → expenses. */
  var DEFAULT_VARIABLE = 600;

  var DEFAULT_SETTINGS = {
    variableMonthly: DEFAULT_VARIABLE,
    variableSet: false,        // hat je ein Mensch den Betrag bestätigt?
    animations: true,
    motionIntensity: 'normal', // 'ruhig' | 'normal'
    currency: 'EUR'
  };

  /* Eigene Liste statt NS.util.CURRENCIES als einziger Quelle — diese Datei
     wird in Tests auch ohne geladenes util.js benutzt, und Ladereihenfolge
     ist kein Vertrag, auf den sich store.js verlassen sollte. */
  var FALLBACK_CURRENCIES = { EUR: 1, USD: 1, GBP: 1, CHF: 1 };
  function currencyCodes() {
    return (NS.util && NS.util.CURRENCIES) || FALLBACK_CURRENCIES;
  }

  /* Der Zugriff auf localStorage kann schon beim Lesen der Eigenschaft werfen —
     unter file:// gilt in manchen Browsern ein opakes Origin. Deshalb komplett
     defensiv: ohne Speicher läuft die App weiter, nur ohne Merken. */
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

  /* Die Versionsnummer allein sagt nichts über den Inhalt: ein von Hand
     abgeschnittener, halb überschriebener oder aus einer Bastelei stammender
     Eintrag wie {"version":2} kommt durch und wirft dann beim ersten Zugriff
     — und zwar nach dem Ausblenden des Leerzustands, also vor einem leeren
     Bildschirm ohne Weg zurück.

     Geprüft wird deshalb, woran die Anwendung tatsächlich hängt. Nicht mehr:
     das hier ist kein Schema-Validator, sondern die Frage, ob das Modell
     benutzbar ist. Fällt es durch, ist es, als läge nichts da — „No data
     yet", und die Mappe wird neu gezogen. */
  function usable(m) {
    if (!m || typeof m !== 'object') return false;
    if (m.version !== NS.importer.MODEL_VERSION) return false;
    if (!Array.isArray(m.months) || !m.months.length) return false;
    for (var i = 0; i < m.months.length; i++) {
      var mo = m.months[i];
      if (!mo || typeof mo !== 'object') return false;
      if (!/^\d{4}-\d{2}$/.test(mo.key)) return false;
      if (!num(mo.netWorth) || !num(mo.totalAssets) || !num(mo.liabilities)) return false;
      if (!num(mo.liquid) || !num(mo.investment)) return false;
    }
    /* Ganzzahlig, nicht nur im Bereich: months[0.5] ist undefined, und der
       Zugriff darauf wirft. `% 1` statt Number.isInteger — diese Datei bleibt
       ES5, wie der Rest der Anwendung. */
    if (!num(m.currentIndex) || m.currentIndex % 1 !== 0) return false;
    if (m.currentIndex < 0 || m.currentIndex >= m.months.length) return false;
    /* Jede Kontenliste, nicht nur die aus sectionOrder: „liabilities" steht
       nicht darin und wird trotzdem gelesen (js/calc.js, itemsOf). Ein
       Schlüssel, den der Importer nie schreibt, gilt als beschädigt. */
    if (!m.accounts || typeof m.accounts !== 'object') return false;
    for (var k in m.accounts) {
      if (!Object.prototype.hasOwnProperty.call(m.accounts, k)) continue;
      if (!accountList(m.accounts[k], m.months.length)) return false;
    }
    if (!Array.isArray(m.sectionOrder) || !m.sectionOrder.length) return false;
    for (var j = 0; j < m.sectionOrder.length; j++) {
      if (!Array.isArray(m.accounts[m.sectionOrder[j]])) return false;
    }
    if (!m.expenses || typeof m.expenses !== 'object') return false;
    if (!num(m.expenses.fixedMonthly)) return false;
    if (!items(m.expenses.monthlyItems) || !items(m.expenses.annualItems)) return false;
    return true;
  }
  function num(v) { return typeof v === 'number' && isFinite(v); }

  /* Ein Konto trägt einen Namen und für jeden Monat einen Stand — eine kürzere
     Reihe fällt genau dann auf, wenn jemand den letzten Monat ansieht. */
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

  function items(rows) {
    if (!Array.isArray(rows)) return false;
    for (var i = 0; i < rows.length; i++) {
      if (!rows[i] || typeof rows[i].name !== 'string' || !num(rows[i].amount)) return false;
    }
    return true;
  }

  function loadModel() {
    if (!ok) return null;
    try {
      var raw = LS.getItem(KEY_MODEL);
      if (!raw) return null;
      var m = JSON.parse(raw);
      return usable(m) ? m : null;
    } catch (e) { return null; }
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

  function clearModel() { if (ok) try { LS.removeItem(KEY_MODEL); } catch (e) {} }

  /* „Delete local data" heisst alles, nicht das Modell allein. In den
     Einstellungen steht der variable monatliche Betrag — eine von Hand
     eingetippte Zahl, also genauso persönlich wie jeder Kontostand.
     Wer den Knopf drückt, will nichts zurücklassen; deshalb wird hier über
     alle Schlüssel gegangen und jeder entfernt, der uns gehört. Erst
     sammeln, dann löschen: entfernt man während des Durchlaufs, rutscht der
     Index weiter und überspringt Einträge. */
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
    s.variableMonthly = Math.max(0, Number(s.variableMonthly) || 0);
    if (!Object.prototype.hasOwnProperty.call(currencyCodes(), s.currency)) s.currency = 'EUR';
    return s;
  }

  function saveSettings(s) {
    if (!ok) return;
    try { LS.setItem(KEY_SETTINGS, JSON.stringify(s)); } catch (e) {}
  }

  NS.store = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS, DEFAULT_VARIABLE: DEFAULT_VARIABLE,
    loadModel: loadModel, saveModel: saveModel, clearModel: clearModel, clearAll: clearAll,
    _usable: usable,
    loadSettings: loadSettings, saveSettings: saveSettings
  };
})(typeof window !== 'undefined' ? window : globalThis);
