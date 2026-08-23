/* NORDSTERN — Grundlagen: Namensraum, Formatierung, DOM- und Mathe-Helfer, Event-Bus.
   Klassisches Script, keine Module — läuft unter file:// ohne Build. */
(function (global) {
  'use strict';

  var NS = global.NORDSTERN || (global.NORDSTERN = {});

  /* ---------------------------------------------------------------- Zahlen */

  var nfEur = new Intl.NumberFormat('de-DE', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
  var nfEur0 = new Intl.NumberFormat('de-DE', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 0
  });
  var nfNum = new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
  var nfInt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /** Vollständiger Betrag mit Cent — überall dort, wo Genauigkeit zählt. */
  function eur(v) { return isNum(v) ? nfEur.format(v) : '—'; }

  /** Gerundeter Betrag für Achsen, Marker und enge Flächen. */
  function eur0(v) { return isNum(v) ? nfEur0.format(v) : '—'; }

  /** Kompakt (12,4k / 1,25M) — nur für Achsenbeschriftungen. Die Sprache ist
      englisch, die Zahlenschreibweise bleibt deutsch: es ist dasselbe Geld. */
  function eurShort(v) {
    if (!isNum(v)) return '—';
    var a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1e6) return s + nfNum.format(a / 1e6).replace(',00', '') + 'M';
    if (a >= 1e3) return s + Math.round(a / 1e3) + 'k';
    return s + Math.round(a);
  }

  /** Vorzeichenbehaftet, für Veränderungen. */
  function eurSigned(v) {
    if (!isNum(v)) return '—';
    return (v > 0 ? '+' : v < 0 ? '−' : '±') + nfEur.format(Math.abs(v));
  }

  /** Dasselbe ohne Cent — für die Position, wo Stand, Veränderung und
      Kennzahlen nebeneinander stehen. Zwei Nachkommastellen bei der einen und
      keine bei der nächsten liest sich wie zwei verschiedene Genauigkeiten;
      es ist aber dieselbe Zahl aus derselben Zeile der Mappe. */
  function eurSigned0(v) {
    if (!isNum(v)) return '—';
    return (v > 0 ? '+' : v < 0 ? '−' : '±') + nfEur0.format(Math.abs(v));
  }

  var pctCache = {};
  function pct(v, digits) {
    if (!isNum(v)) return '—';
    var d = digits == null ? 1 : digits;
    var f = pctCache[d] || (pctCache[d] = new Intl.NumberFormat('de-DE', {
      minimumFractionDigits: d, maximumFractionDigits: d
    }));
    return f.format(v * 100) + ' %';
  }

  /** Ein Vielfaches: „1,96×". Ab dem Zehnfachen ohne Nachkomma — wer dort
      steht, dem sagt die zweite Stelle nichts mehr, und die Kachel ist eng. */
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
  /** Zeitpunkt eines Imports: '23.08.2026, 18:30'. Ohne Sekunden — wann eine
      Mappe gelesen wurde, ist eine Angabe für den Menschen, keine Messung. */
  var dtf = null;
  function dateTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    if (!dtf) dtf = new Intl.DateTimeFormat('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    return dtf.format(d);
  }

  /** 'YYYY-MM' → fortlaufende Monatszahl. Nur zum Rechnen mit Abständen:
      der Unterschied zweier Werte ist die Anzahl Monate dazwischen. */
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
      else if (k === 'html') node.innerHTML = v;
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
     package.json holen, also steht sie hier — und tests/behaviour.mjs hält
     beide gegeneinander, damit sie nicht auseinanderlaufen. */
  NS.VERSION = '1.0.2';

  NS.util = {
    isNum: isNum, eur: eur, eur0: eur0, eurShort: eurShort, eurSigned: eurSigned, eurSigned0: eurSigned0,
    pct: pct, pctSigned: pctSigned, mult: mult,
    monthLong: monthLong, monthShort: monthShort, monthNo: monthNo, dateTime: dateTime,
    MONTHS_SHORT: MONTHS_SHORT,
    clamp: clamp, lerp: lerp, smoothstep: smoothstep, easeOutCubic: easeOutCubic, rng: rng,
    el: el, els: els, make: make, svg: svg, bus: bus
  };
})(typeof window !== 'undefined' ? window : globalThis);
