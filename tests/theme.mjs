/* NORDSTERN: Dawn/Night — Token-Vollständigkeit, WCAG-Kontrast, keine
   Farbliterale ausserhalb von token(...)/.sky/.star-core/--w0-2, und die
   Laufzeitprobe: Thema wechseln, refreshTokens()+refresh() aufrufen, prüfen,
   dass Berg, Scheibe und Kopfzeile die neue Palette tragen. */
import { boot, importFixture, originWorkbook } from './harness.mjs';
import fs from 'fs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
const sec = t => console.log('\n== ' + t);

/* -------------------------------------------------- Tokens: Blöcke lesen -- */
const tokenCss = fs.readFileSync(new URL('../css/tokens.css', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/* Nur der jeweils erste bare Block zählt: die themenspezifischen
   Überschreibungen (etwa `:root[data-theme="dawn"] .masthead`) folgen im
   Quelltext später und tragen weitere Zeichen zwischen `]` und `{`, an denen
   `\s*\{` scheitert. */
function block(re) {
  const m = re.exec(tokenCss);
  return m ? m[1] : '';
}
const rootBody = block(/:root\s*\{([^}]*)\}/);
const rootHCBody = block(/:root\[data-contrast="high"\]\s*\{([^}]*)\}/);
const dawnBody = block(/:root\[data-theme="dawn"\]\s*\{([^}]*)\}/);
const dawnHCBody = block(/:root\[data-theme="dawn"\]\[data-contrast="high"\]\s*\{([^}]*)\}/);

function decls(body) {
  const out = {};
  const re = /--([\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(body))) out[m[1]] = m[2].trim();
  return out;
}
const root = decls(rootBody), rootHC = decls(rootHCBody);
const dawn = decls(dawnBody), dawnHC = decls(dawnHCBody);
const isColor = v => /^#|^rgb/.test(v);

/* ---------- a. Vollständigkeit ---------- */
sec('Tokens: Dawn deklariert jede Nacht-Farbe');
{
  ok(Object.keys(root).length > 0, ':root liest sich aus tokens.css');
  ok(Object.keys(dawn).length > 0, ':root[data-theme="dawn"] liest sich aus tokens.css');
  ok(Object.keys(rootHC).length > 0, ':root[data-contrast="high"] liest sich aus tokens.css');
  ok(Object.keys(dawnHC).length > 0, ':root[data-theme="dawn"][data-contrast="high"] liest sich aus tokens.css');

  const rootColorTokens = Object.keys(root).filter(k => isColor(root[k]));
  const missingInDawn = rootColorTokens.filter(k => !(k in dawn));
  ok(missingInDawn.length === 0,
    'Dawn deklariert jeden Farbtoken aus :root — fehlen: ' + missingInDawn.join(', '));

  const missingInDawnHC = Object.keys(rootHC).filter(k => !(k in dawnHC));
  ok(missingInDawnHC.length === 0,
    'Dawn-Hochkontrast deklariert jeden Token, den Nacht-Hochkontrast überschreibt — fehlen: ' +
    missingInDawnHC.join(', '));
}

/* ---------- b. WCAG-Kontrast ---------- */
sec('WCAG: Kontrast der Schriftstufen und Akzente');
{
  function hexRGB(h) {
    const m = /^#([0-9a-fA-F]{6})$/.exec(h);
    return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : null;
  }
  function lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function luminance(hex) {
    const rgb = hexRGB(hex);
    if (!rgb) return null;
    const [r, g, b] = rgb.map(lin);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a, b) {
    const L1 = luminance(a), L2 = luminance(b);
    if (L1 == null || L2 == null) return null;
    const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
    return (hi + 0.05) / (lo + 0.05);
  }
  const merge = (...srcs) => Object.assign({}, ...srcs);
  /* Spätere Blöcke überschreiben frühere — genau die Kaskade, die im
     Browser gilt. */
  const palettes = {
    'Night': merge(root),
    'Night, hoher Kontrast': merge(root, rootHC),
    'Dawn': merge(root, dawn),
    'Dawn, hoher Kontrast': merge(root, dawn, dawnHC)
  };
  const TOKENS = ['--ink', '--ink-2', '--ink-3', '--ink-4', '--aurora', '--ember-pale', '--amber', '--ice', '--ice-pale'];
  const HIGH_INKS = ['--ink', '--ink-2', '--ink-3', '--ink-4'];
  const NORMAL_SEVEN = ['--ink', '--ink-2'];
  for (const [name, pal] of Object.entries(palettes)) {
    const isHC = /hoher Kontrast/.test(name);
    for (const t of TOKENS) {
      const val = pal[t.replace(/^--/, '')];
      ok(!!val && /^#[0-9a-fA-F]{6}$/.test(val), name + ': ' + t + ' ist ein Hexwert: ' + val);
      if (!val) continue;
      for (const bg of ['--bg-void', '--bg-deep']) {
        const bgv = pal[bg.replace(/^--/, '')];
        const r = contrast(val, bgv);
        const need = isHC ? (HIGH_INKS.includes(t) ? 7 : 4.5) : (NORMAL_SEVEN.includes(t) ? 7 : 4.5);
        ok(r != null && r >= need,
          name + ': ' + t + ' (' + val + ') gegen ' + bg + ' (' + bgv + ') braucht ' + need +
          ':1, erreicht ' + (r == null ? 'n/a' : r.toFixed(2)) + ':1');
      }
    }
  }
}

/* ---------- c. Keine Farbliterale ---------- */
sec('Keine Farbliterale ausserhalb von token(...)/.sky/.star-core/--w0-2');
{
  const literalLines = (src, keep) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(line => {
      if (!/rgba?\(|#[0-9a-fA-F]{3,8}/.test(line)) return false;
      return !keep(line);
    });

  const compSrc = fs.readFileSync(new URL('../css/components.css', import.meta.url), 'utf8');
  const compBad = literalLines(compSrc, line => /\.star-core/.test(line) || /--w[012]\s*:/.test(line));
  ok(compBad.length === 0, 'components.css: nur .star-core und --w0/--w1/--w2 dürfen Literale tragen: ' + compBad.join(' | '));

  const layoutSrc = fs.readFileSync(new URL('../css/layout.css', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  /* Die vier .sky-Regeln (Nacht/Dawn × Grund/::after) fallen als Ganzes weg;
     was danach an Literalen übrig bleibt, ist der Verstoss. */
  const layoutWithoutSky = layoutSrc.replace(/[^{}]*\.sky[^{]*\{[^}]*\}/g, '');
  const layoutBad = layoutWithoutSky.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)/g) || [];
  ok(layoutBad.length === 0, 'layout.css: Farbliterale nur innerhalb von .sky: ' + layoutBad.join(' | '));

  const chartSrc = fs.readFileSync(new URL('../js/ui/chart.js', import.meta.url), 'utf8');
  const chartBad = literalLines(chartSrc, line => {
    if (/rgba?\(/.test(line)) return false;
    const stripped = line.replace(/#fff/gi, '').replace(/#000/gi, '');
    return !/#[0-9a-fA-F]{3,8}/.test(stripped);
  });
  ok(chartBad.length === 0, "chart.js: nur '#fff'/'#000' (Maskenhelligkeit) dürfen Literale sein: " + chartBad.join(' | '));

  const orbitSrc = fs.readFileSync(new URL('../js/ui/orbit.js', import.meta.url), 'utf8');
  const orbitBad = literalLines(orbitSrc, line => line.includes('token('));
  ok(orbitBad.length === 0, 'orbit.js: Farbliterale nur auf Zeilen mit token(...): ' + orbitBad.join(' | '));

  const cardsSrc = fs.readFileSync(new URL('../js/ui/cards.js', import.meta.url), 'utf8');
  const cardsBad = literalLines(cardsSrc, line => line.includes('token('));
  ok(cardsBad.length === 0, 'cards.js: Farbliterale nur auf Zeilen mit token(...): ' + cardsBad.join(' | '));
}

/* ---------- d. Laufzeit: Thema wechseln ---------- */
sec('Laufzeit: refreshTokens() und refresh() unter Dawn');
{
  /* Wie in behaviour.mjs Abschnitt 2: einmal importieren, dann aus
     demselben Speicherobjekt neu starten, damit die Bühne von Anfang an
     etwas zeigt (Legende, Sektionen). */
  const store = {};
  { const { w } = await boot({ storage: store }); importFixture(w); w.close(); }

  const { w, errors } = await boot({ storage: { ...store } });
  const d = w.document;
  const mtn = w.NORDSTERN.app.ui.mountain;
  const approxArr = (a, b, eps) => Array.isArray(a) && a.length === b.length &&
    a.every((v, i) => Math.abs(v - b[i]) <= (eps == null ? 0.01 : eps));
  const chanDist = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

  d.documentElement.setAttribute('data-theme', 'dawn');
  mtn.refreshTokens();
  w.NORDSTERN.app.refresh();

  const pal = mtn.palette();
  ok(approxArr(pal.fillLo, [229, 236, 244, 1], 1),
    'Dawn: fillLo entspricht --mtn-fill-lo (#e5ecf4): ' + JSON.stringify(pal.fillLo));
  ok(chanDist(pal.fillLo, [228, 235, 244]) <= 8,
    'Dawn: fillLo liegt nah an --bg-deep (228,235,244): ' + JSON.stringify(pal.fillLo));
  ok(pal.dimLo[3] >= 0.25, 'Dawn: dimLo-Alpha ist nicht zu blass: ' + pal.dimLo[3]);
  ok(pal.litHi[3] > pal.litLo[3], 'Dawn: lit hi-Alpha über lo-Alpha: ' + pal.litHi[3] + ' > ' + pal.litLo[3]);
  ok(pal.midHi[3] > pal.midLo[3], 'Dawn: mid hi-Alpha über lo-Alpha: ' + pal.midHi[3] + ' > ' + pal.midLo[3]);
  ok(pal.dimHi[3] > pal.dimLo[3], 'Dawn: dim hi-Alpha über lo-Alpha: ' + pal.dimHi[3] + ' > ' + pal.dimLo[3]);
  ok(pal.routeDone[3] >= 0.9, 'Dawn: routeDone-Alpha bleibt kräftig: ' + pal.routeDone[3]);

  /* Die Scheibe liest ihre Töne bei jedem Render neu — kein eigenes
     refreshTokens() nötig, app.refresh() hat sie bereits neu gezeichnet. Die
     Beispielmappe („Data Input") füllt „investment", nicht „education" —
     die Education-Probe folgt weiter unten aus dem Origin-Blatt. */
  const dot = id => d.querySelector('.legend-row[data-id="' + id + '"] .legend-dot');
  const invDot = dot('investment');
  ok(!!invDot, 'die Legende zeigt investment');
  if (invDot) ok(w.getComputedStyle(invDot).backgroundColor === 'rgb(31, 95, 184)',
    'Dawn: investment-Punkt trägt --sec-investment (#1f5fb8): ' + w.getComputedStyle(invDot).backgroundColor);

  /* Die Kopfzeile bleibt Nacht — gescopt, nicht als eigenes Bauteilwissen. */
  const masthead = d.querySelector('.masthead');
  ok(w.getComputedStyle(masthead).getPropertyValue('--ink').trim() === '#e9eff9',
    'Dawn: --ink auf der Kopfzeile bleibt Nachtschrift: ' + w.getComputedStyle(masthead).getPropertyValue('--ink'));
  ok(w.getComputedStyle(d.documentElement).getPropertyValue('--ink').trim() === '#12203a',
    'Dawn: --ink auf der Wurzel ist Dawn-Schrift: ' + w.getComputedStyle(d.documentElement).getPropertyValue('--ink'));

  /* Hoher Kontrast obendrauf. */
  d.documentElement.setAttribute('data-contrast', 'high');
  mtn.refreshTokens();
  const palHC = mtn.palette();
  ok(approxArr(palHC.fillLo, [245, 247, 251, 1], 1),
    'Dawn+Hochkontrast: fillLo entspricht --mtn-fill-lo (#f5f7fb): ' + JSON.stringify(palHC.fillLo));

  /* Die Verlaufsstopps des Charts hängen an Klassen, keine stop-color mehr
     im Markup. */
  const stopClasses = ['chart-fill-a', 'chart-fill-b', 'chart-fill-c', 'chart-fill-d',
    'chart-line-0', 'chart-line-1', 'chart-line-2', 'chart-beam-a', 'chart-beam-b'];
  stopClasses.forEach(c => {
    const n = d.querySelector('.chart-svg stop.' + c);
    ok(!!n, 'die Chart-SVG trägt einen Stopp mit der Klasse ' + c);
    if (n) ok(!n.hasAttribute('stop-color'), 'Stopp .' + c + ' trägt kein stop-color-Attribut mehr');
  });

  /* Die Kartenverläufe kommen jetzt vollständig aus CSS. */
  const washes = [...d.querySelectorAll('.card-wash')];
  ok(washes.length === 8, 'acht Kartenverläufe stehen im DOM: ' + washes.length);
  ok(washes.every(w2 => !w2.getAttribute('style')),
    'keine .card-wash trägt noch eine inline-background: ' +
    washes.filter(w2 => w2.getAttribute('style')).map(w2 => w2.getAttribute('style')).join(' | '));

  ok(errors.length === 0, 'keine Fehler: ' + errors.join(' | '));
  w.close();
}

/* Die Education-Sektion füllt sich nur aus dem Origin-Blatt (529 Plans) —
   ein eigener, kleiner Import nur für diesen einen Legendenpunkt. */
sec('Laufzeit: education-Farbe unter Dawn (Origin-Blatt)');
{
  const originMonths = [[2015, 2], [2015, 3], [2015, 4], [2015, 5]];
  const { w, errors } = await boot();
  const res = w.NORDSTERN.importer.parseWorkbook(originWorkbook(w, originMonths), 'origin.xlsx');
  w.NORDSTERN.app.state.model = res.model;
  w.NORDSTERN.store.saveModel(res.model);
  w.NORDSTERN.app.refresh();
  w.document.getElementById('gate').hidden = true;
  w.document.documentElement.setAttribute('data-theme', 'dawn');
  w.NORDSTERN.app.ui.mountain.refreshTokens();
  w.NORDSTERN.app.refresh();
  const eduDot = w.document.querySelector('.legend-row[data-id="education"] .legend-dot');
  ok(!!eduDot, 'die Legende zeigt education');
  if (eduDot) ok(w.getComputedStyle(eduDot).backgroundColor === 'rgb(196, 143, 42)',
    'Dawn: education-Punkt trägt --sec-education (#c48f2a): ' + w.getComputedStyle(eduDot).backgroundColor);
  ok(errors.length === 0, 'keine Fehler: ' + errors.join(' | '));
  w.close();
}

console.log('\n' + (fail ? '✗' : '✓') + ' ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
