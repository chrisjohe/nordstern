/* NORDSTERN: Grundlagen. Namensraum, Formatierung, DOM- und Mathe-Helfer, Event-Bus. */
(function (global) {
  'use strict';

  var NS = global.NORDSTERN || (global.NORDSTERN = {});

  /* ---------------------------------------------------------------- Zahlen */

  /* Locale je Währung: die Schreibweise folgt der Währung, nicht der
     Sprache der Oberfläche. */
  var CURRENCIES = {
    EUR: { locale: 'de-DE' },
    USD: { locale: 'en-US' },
    GBP: { locale: 'en-GB' },
    CHF: { locale: 'de-CH' }
  };

  var curCode, nfEur, nfEur0, nfNum, nfInt, pctCache, dtf;

  /** Stellt alle Formatierer auf eine Währung um; ein unbekannter Code
      fällt auf EUR zurück. */
  function setCurrency(code) {
    var c = Object.prototype.hasOwnProperty.call(CURRENCIES, code) ? code : 'EUR';
    var locale = CURRENCIES[c].locale;
    curCode = c;
    nfEur = new Intl.NumberFormat(locale, {
      style: 'currency', currency: c,
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
    nfEur0 = new Intl.NumberFormat(locale, {
      style: 'currency', currency: c,
      minimumFractionDigits: 0, maximumFractionDigits: 0
    });
    nfNum = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
    nfInt = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    /* pct() und dateTime() hängen am Locale, deshalb hier zurückgesetzt. */
    pctCache = {};
    dtf = null;
    return curCode;
  }

  function currency() { return curCode; }

  /** Das Symbol, wie Intl es rendert; kein festes Mapping. */
  function currencySymbol() {
    if (!nfEur.formatToParts) return curCode;
    var parts = nfEur.formatToParts(0);
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type === 'currency') return parts[i].value;
    }
    return curCode;
  }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /** Betrag mit Cent. */
  function eur(v) { return isNum(v) ? nfEur.format(v) : '—'; }

  /** Gerundeter Betrag für Achsen, Marker und enge Flächen. */
  function eur0(v) { return isNum(v) ? nfEur0.format(v) : '—'; }

  /** Kompakt (12k / 1,25M), nur für Achsen. */
  function eurShort(v) {
    if (!isNum(v)) return '—';
    var a = Math.abs(v), s = v < 0 ? '−' : '';
    /* ',00' oder '.00', je nach Locale. */
    if (a >= 1e6) return s + nfNum.format(a / 1e6).replace(/[.,]00$/, '') + 'M';
    if (a >= 1e3) return s + Math.round(a / 1e3) + 'k';
    return s + Math.round(a);
  }

  /** Vorzeichenbehaftet, für Veränderungen. */
  function eurSigned(v) {
    if (!isNum(v)) return '—';
    return (v > 0 ? '+' : v < 0 ? '−' : '±') + nfEur.format(Math.abs(v));
  }

  /** Ohne Cent, für die Position. */
  function eurSigned0(v) {
    if (!isNum(v)) return '—';
    return (v > 0 ? '+' : v < 0 ? '−' : '±') + nfEur0.format(Math.abs(v));
  }

  function pct(v, digits) {
    if (!isNum(v)) return '—';
    var d = digits == null ? 1 : digits;
    var f = pctCache[d] || (pctCache[d] = new Intl.NumberFormat(CURRENCIES[curCode].locale, {
      minimumFractionDigits: d, maximumFractionDigits: d
    }));
    return f.format(v * 100) + ' %';
  }

  /** Ein Vielfaches: „1,96×", ab dem Zehnfachen ohne Nachkomma. */
  function mult(v) {
    if (!isNum(v)) return '—';
    return (Math.abs(v) >= 10 ? nfInt.format(v) : nfNum.format(v)) + '\u00d7';
  }

  function pctSigned(v, digits) {
    if (!isNum(v)) return '—';
    return (v > 0 ? '+' : v < 0 ? '−' : '±') + pct(Math.abs(v), digits);
  }

  /* ----------------------------------------------------------------- Datum */

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /** 'YYYY-MM' → 'August 2026' */
  function monthLong(key) {
    if (!key) return '—';
    var p = key.split('-');
    return MONTHS[Number(p[1]) - 1] + ' ' + p[0];
  }
  /** Importzeitpunkt: '23.08.2026, 18:30'. */
  function dateTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    /* hourCycle h23, sonst wechselt en-US auf AM/PM. */
    if (!dtf) dtf = new Intl.DateTimeFormat(CURRENCIES[curCode].locale, {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      hourCycle: 'h23'
    });
    return dtf.format(d);
  }

  /** 'YYYY-MM' → fortlaufende Monatszahl, zum Rechnen mit Abständen. */
  function monthNo(key) {
    if (!key) return null;
    var p = String(key).split('-');
    var y = Number(p[0]), m = Number(p[1]);
    if (!isFinite(y) || !isFinite(m)) return null;
    return y * 12 + (m - 1);
  }

  /** 'YYYY-MM' → 'Aug 2026' */
  function monthShort(key) {
    if (!key) return '—';
    var p = key.split('-');
    return MONTHS_SHORT[Number(p[1]) - 1] + ' ' + p[0];
  }

  /* ------------------------------------------------------------------ Mathe */

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  /** Deterministischer PRNG (mulberry32) — der Berg sieht bei jedem Start gleich aus. */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* -------------------------------------------------------------------- DOM */

  function el(sel, root) { return (root || document).querySelector(sel); }
  function els(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function make(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.indexOf('data-') === 0 || k.indexOf('aria-') === 0) node.setAttribute(k, v);
      else if (k in node) node[k] = v;
      else node.setAttribute(k, v);
    }
    if (children) children.forEach(function (c) {
      if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  var SVGNS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, children) {
    var node = document.createElementNS(SVGNS, tag);
    if (attrs) for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k) && attrs[k] != null) {
        node.setAttribute(k, attrs[k]);
      }
    }
    if (children) children.forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  /* --------------------------------------------------------------- Event-Bus */

  function bus() {
    var map = {};
    return {
      on: function (name, fn) {
        (map[name] || (map[name] = [])).push(fn);
        return function () { this.off(name, fn); }.bind(this);
      },
      off: function (name, fn) {
        var list = map[name]; if (!list) return;
        var i = list.indexOf(fn); if (i >= 0) list.splice(i, 1);
      },
      emit: function (name, payload) {
        var list = map[name]; if (!list) return;
        for (var i = 0; i < list.length; i++) {
          try { list[i](payload); }
          catch (e) { if (global.console) console.error('[bus] ' + name, e); }
        }
      }
    };
  }

  /* Eine Fassung, an einer Stelle. Ohne Bauschritt kann nichts sie aus
     package.json holen, also steht sie hier. */
  NS.VERSION = '1.1.10';

  /* Formatierer müssen vor dem ersten eur()/pct()-Aufruf existieren, auch
     wenn util.js allein geladen wird. */
  setCurrency('EUR');

  NS.util = {
    isNum: isNum, eur: eur, eur0: eur0, eurShort: eurShort, eurSigned: eurSigned, eurSigned0: eurSigned0,
    pct: pct, pctSigned: pctSigned, mult: mult,
    monthLong: monthLong, monthShort: monthShort, monthNo: monthNo, dateTime: dateTime,
    MONTHS_SHORT: MONTHS_SHORT,
    CURRENCIES: CURRENCIES, setCurrency: setCurrency, currency: currency, currencySymbol: currencySymbol,
    clamp: clamp, lerp: lerp, smoothstep: smoothstep, easeOutCubic: easeOutCubic, rng: rng,
    el: el, els: els, make: make, svg: svg, bus: bus
  };
})(typeof window !== 'undefined' ? window : globalThis);
