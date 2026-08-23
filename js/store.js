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
    mountainQuality: 'auto'
  };

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

  function loadModel() {
    if (!ok) return null;
    try {
      var raw = LS.getItem(KEY_MODEL);
      if (!raw) return null;
      var m = JSON.parse(raw);
      if (!m || m.version !== NS.importer.MODEL_VERSION) return null;
      return m;
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
    return s;
  }

  function saveSettings(s) {
    if (!ok) return;
    try { LS.setItem(KEY_SETTINGS, JSON.stringify(s)); } catch (e) {}
  }

  NS.store = {
    available: ok,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS, DEFAULT_VARIABLE: DEFAULT_VARIABLE,
    loadModel: loadModel, saveModel: saveModel, clearModel: clearModel, clearAll: clearAll,
    loadSettings: loadSettings, saveSettings: saveSettings
  };
})(typeof window !== 'undefined' ? window : globalThis);
