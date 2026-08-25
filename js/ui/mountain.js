/* NORDSTERN — der FIRE-Berg.
   Echte Topografie: ein deterministisches Höhenfeld, daraus per Marching Squares
   Höhenlinien, projiziert über eine eigene Rotationsmatrix auf Canvas 2D.
   Die Bänder werden von unten nach oben gefüllt und gestrichelt — dadurch verdeckt
   der Berg sich selbst korrekt, ohne Tiefenpuffer und ohne 3D-Bibliothek. */
(function (global) {
  'use strict';

  /* Die Leinwand kennt keine Marken, sie will eine fertige Zeichenkette.
     Geholt wird sie trotzdem aus derselben Marke wie alles andere: ein
     eigener Stapel hier hiesse, dass der Berg auf jedem Rechner ohne Avenir
     in einer anderen Schrift schreibt als die Oberfläche daneben. Der
     Rückfall gilt nur, wo Marken nicht aufgelöst werden. */
  var FONT = null;
  function displayFont() {
    if (FONT) return FONT;
    var v = '';
    try {
      v = (global.getComputedStyle(global.document.documentElement)
        .getPropertyValue('--font-display') || '').trim();
    } catch (e) { v = ''; }
    FONT = v || '"Avenir Next", Avenir, Futura, "Segoe UI", "Century Gothic", "URW Gothic", "Trebuchet MS", sans-serif';
    return FONT;
  }
  var NS = global.NORDSTERN || (global.NORDSTERN = {});
  var U = NS.util;

  /* ====================================================== Höhenfeld ======= */

  var GRID = 156;                 // Auflösung des Höhenfelds
  var LEVELS = 26;                // Anzahl der Höhenlinien
  var Z_MAX = 1.10;               // Gipfelhöhe in Modelleinheiten
  var TERRAIN_R = 0.99;           // Radius, an dem das Gelände auf null läuft
  var PLATE_R = 1.12;             // Kompassteller
  var RING_R = 1.02;              // Reservering

  /* Kamera. Die Bildaufteilung steckt in frame() und projectPt(), damit sie
     kopflos nachgerechnet werden kann — siehe tests/geometry.mjs. */
  var CAM_F = 9.0;                // Brennweite; groß = fast orthografisch
  var PITCH_DEF = 0.46;           // Standardneigung ≈ 26°
  var PITCH_MIN = 0.30, PITCH_MAX = 0.78;
  var YAW_DEF = -0.35;
  /* Der Bildausschnitt wird aus der tatsächlichen Ausdehnung abgeleitet, nicht
     geraten: je nach Neigung ist mal der Berg, mal die Tellerellipse das
     bestimmende Maß. Ein fester Ausschnitt kann beide Extreme nicht abdecken. */
  var EDGE = PLATE_R;             // äußerster Punkt: die Teilung des Kompasstellers
  var LETTER_R = PLATE_R - 0.045; // Himmelsrichtungen liegen in der Teilung
  var LETTER_H = 0.105;           // Buchstabenhöhe in Modelleinheiten
  /* Waagerecht und senkrecht unterschiedlich: die seitlichen Extrempunkte des
     Tellers liegen bei Tiefe 0 und werden von der Perspektive kaum vergrößert,
     die vordere Kante dagegen deutlich. */
  var PERSP_X = 1.03, PERSP_Y = 1.13;
  var SHIFT_MAX = 56;             // wie weit ein Pin höchstens nach oben rutscht
  var PAD_TOP = 13 + SHIFT_MAX + 6;               // Pin-Kopf und Entzerrung über dem obersten Mast
  var PAD_BOT = 16, PAD_X = 8;

  /* Silhouette: Radius/Höhe-Paare der äußersten Punkte. Entscheidend ist, dass
     ein Punkt WEIT HINTEN UND HOCH beides zugleich nach oben schiebt — Radius
     und Höhe getrennt zu betrachten unterschätzt den Platzbedarf. */
  var SIL_FALLBACK = [[EDGE, 0], [0.86, Z_MAX * 0.35], [0.35, Z_MAX * 0.85], [0.12, Z_MAX + 0.13]];

  function buildSilhouette(levels, stations, poles) {
    var pts = [[EDGE, 0]];
    levels.forEach(function (lv) {
      var maxR = 0;
      lv.loops.forEach(function (lp) {
        for (var i = 0; i < lp.n; i++) {
          var r = Math.sqrt(lp.xs[i] * lp.xs[i] + lp.ys[i] * lp.ys[i]);
          if (r > maxR) maxR = r;
        }
      });
      pts.push([maxR, lv.level * Z_MAX]);
    });
    stations.forEach(function (q, i) {
      pts.push([Math.sqrt(q.x * q.x + q.y * q.y), q.z + (poles[i] || 0)]);
    });
    return pts;
  }

  function frame(w, h, pitch, sil) {
    var p = pitch == null ? PITCH_DEF : pitch;
    var se = Math.sin(p), ce = Math.cos(p);
    var S = sil || SIL_FALLBACK;
    var top = 0;
    for (var i = 0; i < S.length; i++) {
      var v = S[i][0] * se + S[i][1] * ce;
      if (v > top) top = v;
    }
    top *= PERSP_Y;
    var bot = EDGE * se * PERSP_Y;
    var usableH = Math.max(60, h - PAD_TOP - PAD_BOT);
    var usableW = Math.max(60, w - 2 * PAD_X);
    var R = Math.min(usableW / (2 * EDGE * PERSP_X), usableH / (top + bot));
    var cy = PAD_TOP + top * R + (usableH - (top + bot) * R) * 0.5;
    return { cx: w * 0.5, cy: cy, R: R };
  }

  function makeCam(yaw, pitch, cx, cy, R) {
    return {
      ca: Math.cos(yaw), sa: Math.sin(yaw),
      ce: Math.cos(pitch), se: Math.sin(pitch),
      cx: cx, cy: cy, R: R
    };
  }

  var _p = { x: 0, y: 0, d: 0, s: 1 };
  function projectPt(c, x, y, z) {
    var rx = x * c.ca - y * c.sa;
    var ry = x * c.sa + y * c.ca;
    var sy = ry * c.se - z * c.ce;
    var d = ry * c.ce + z * c.se;
    var s = CAM_F / (CAM_F - d);
    _p.x = c.cx + rx * s * c.R;
    _p.y = c.cy + sy * s * c.R;
    _p.d = d; _p.s = s;
    return _p;
  }

  /* Gipfel und Schultern — bewusst asymmetrisch, damit der Berg beim Drehen
     eine erkennbare Vorder- und Rückseite hat. */
  var PEAKS = [
    { x:  0.04, y: -0.03, sx: 0.34, sy: 0.29, a: 1.00, rot:  0.30, p: 1.45 },
    { x: -0.40, y:  0.22, sx: 0.26, sy: 0.21, a: 0.46, rot: -0.55, p: 1.70 },
    { x:  0.37, y:  0.26, sx: 0.22, sy: 0.27, a: 0.40, rot:  0.85, p: 1.70 },
    { x: -0.16, y: -0.44, sx: 0.31, sy: 0.22, a: 0.34, rot:  1.20, p: 1.75 },
    { x:  0.48, y: -0.29, sx: 0.19, sy: 0.17, a: 0.21, rot:  0.00, p: 1.90 },
    { x: -0.56, y: -0.23, sx: 0.20, sy: 0.16, a: 0.17, rot:  0.60, p: 1.90 }
  ];

  function makeNoise(seed) {
    var G = 64, rnd = U.rng(seed), tbl = new Float32Array(G * G), i;
    for (i = 0; i < G * G; i++) tbl[i] = rnd() * 2 - 1;
    return function (x, y) {
      var fx = x - Math.floor(x), fy = y - Math.floor(y);
      var ix = ((Math.floor(x) % G) + G) % G, iy = ((Math.floor(y) % G) + G) % G;
      var ix1 = (ix + 1) % G, iy1 = (iy + 1) % G;
      var u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      var a = tbl[iy * G + ix], b = tbl[iy * G + ix1];
      var c = tbl[iy1 * G + ix], d = tbl[iy1 * G + ix1];
      return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
    };
  }

  function buildField() {
    var N = GRID, n1 = N + 1;
    var h = new Float32Array(n1 * n1);
    var noise = makeNoise(0x4E4F5244);      // "NORD"
    var max = 0, i, j;
    for (j = 0; j <= N; j++) {
      var y = (j / N) * 2 - 1;
      for (i = 0; i <= N; i++) {
        var x = (i / N) * 2 - 1;
        var v = 0, k;
        for (k = 0; k < PEAKS.length; k++) {
          var p = PEAKS[k];
          var dx = x - p.x, dy = y - p.y;
          var c = Math.cos(p.rot), s = Math.sin(p.rot);
          var uu = (dx * c + dy * s) / p.sx, vv = (-dx * s + dy * c) / p.sy;
          /* Schwere Flanken (Cauchy-artig) statt Gauß: der Berg bekommt einen
             breiten Fuß und gleichmäßiger verteilte Höhenlinien. */
          v += p.a * Math.pow(1 + uu * uu + vv * vv, -p.p);
        }
        var shape = v > 1 ? 1 : v;
        v += shape * (noise(x * 3.1 + 9, y * 3.1 + 4) * 0.075
                    + noise(x * 6.7 + 31, y * 6.7 + 17) * 0.036
                    + noise(x * 13.3 + 5, y * 13.3 + 23) * 0.016);
        var r = Math.sqrt(x * x + y * y);
        var edge = U.smoothstep((TERRAIN_R - r) / 0.36);
        v = v < 0 ? 0 : v * edge;
        h[j * n1 + i] = v;
        if (v > max) max = v;
      }
    }
    for (i = 0; i < h.length; i++) h[i] /= max;   // auf 0…1 normieren
    return { N: N, n1: n1, h: h };
  }

  /** Bilineare Höhe an einer Modellposition (x,y ∈ −1…1). */
  function sampleH(field, x, y) {
    var N = field.N, n1 = field.n1;
    var gx = U.clamp((x + 1) / 2 * N, 0, N - 0.0001);
    var gy = U.clamp((y + 1) / 2 * N, 0, N - 0.0001);
    var i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j;
    var h = field.h;
    var a = h[j * n1 + i], b = h[j * n1 + i + 1];
    var c = h[(j + 1) * n1 + i], d = h[(j + 1) * n1 + i + 1];
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
  }

  /* ================================================== Höhenlinien ========= */

  /* Marching Squares mit gemeinsam genutzten Kantenpunkten — dadurch lassen sich
     die Segmente exakt zu geschlossenen Ringen verketten. */
  function buildContours(field) {
    var N = field.N, n1 = field.n1, h = field.h;
    var nH = N * n1;                     // waagerechte Kanten
    var nV = n1 * N;                     // senkrechte Kanten
    var total = nH + nV;
    var ex = new Float32Array(total), ey = new Float32Array(total);
    var link0 = new Int32Array(total), link1 = new Int32Array(total);
    var seen = new Uint8Array(total), visited = new Uint8Array(total);
    var levels = [];

    function connect(a, b) {
      if (link0[a] < 0) link0[a] = b; else link1[a] = b;
      if (link0[b] < 0) link0[b] = a; else link1[b] = a;
    }

    for (var L = 0; L < LEVELS; L++) {
      var lvl = 0.030 + (L / (LEVELS - 1)) * (0.985 - 0.030);
      link0.fill(-1); link1.fill(-1); seen.fill(0); visited.fill(0);

      var i, j, a, b, t, idx;
      /* Kantenschnitte */
      for (j = 0; j <= N; j++) {
        for (i = 0; i < N; i++) {
          a = h[j * n1 + i]; b = h[j * n1 + i + 1];
          if ((a < lvl) !== (b < lvl)) {
            t = (lvl - a) / (b - a);
            idx = j * N + i;
            ex[idx] = ((i + t) / N) * 2 - 1;
            ey[idx] = (j / N) * 2 - 1;
            seen[idx] = 1;
          }
        }
      }
      for (j = 0; j < N; j++) {
        for (i = 0; i <= N; i++) {
          a = h[j * n1 + i]; b = h[(j + 1) * n1 + i];
          if ((a < lvl) !== (b < lvl)) {
            t = (lvl - a) / (b - a);
            idx = nH + j * n1 + i;
            ex[idx] = (i / N) * 2 - 1;
            ey[idx] = ((j + t) / N) * 2 - 1;
            seen[idx] = 1;
          }
        }
      }

      /* Zellen verketten */
      for (j = 0; j < N; j++) {
        for (i = 0; i < N; i++) {
          var tl = h[j * n1 + i] >= lvl, tr = h[j * n1 + i + 1] >= lvl;
          var br = h[(j + 1) * n1 + i + 1] >= lvl, bl = h[(j + 1) * n1 + i] >= lvl;
          var code = (tl ? 1 : 0) | (tr ? 2 : 0) | (br ? 4 : 0) | (bl ? 8 : 0);
          if (code === 0 || code === 15) continue;
          var eT = j * N + i, eB = (j + 1) * N + i;
          var eL = nH + j * n1 + i, eR = nH + j * n1 + i + 1;
          switch (code) {
            case 1: case 14: connect(eL, eT); break;
            case 2: case 13: connect(eT, eR); break;
            case 3: case 12: connect(eL, eR); break;
            case 4: case 11: connect(eR, eB); break;
            case 6: case 9:  connect(eT, eB); break;
            case 7: case 8:  connect(eL, eB); break;
            case 5:  connect(eL, eT); connect(eR, eB); break;
            case 10: connect(eT, eR); connect(eL, eB); break;
          }
        }
      }

      /* Ringe auslesen */
      var loops = [];
      for (var e = 0; e < total; e++) {
        if (!seen[e] || visited[e] || link0[e] < 0) continue;
        var pts = [], cur = e, prev = -1, guard = 0;
        while (cur >= 0 && !visited[cur] && guard++ < 400000) {
          visited[cur] = 1;
          pts.push(ex[cur], ey[cur]);
          var nx = link0[cur] !== prev ? link0[cur] : link1[cur];
          prev = cur; cur = nx;
        }
        if (pts.length >= 14) loops.push(finishLoop(pts));
      }
      if (loops.length) levels.push({ index: L, level: lvl, loops: loops });
    }
    return levels;
  }

  /** Entrümpeln, glätten, nach außen zeigende Normalen berechnen. */
  function finishLoop(flat) {
    var n = flat.length / 2, i;

    /* 1. zu dichte Punkte verwerfen */
    /* MIN in Modelleinheiten; nach dem Chaikin-Durchlauf liegen die Punkte
       rund 1,8 px auseinander — feiner bringt sichtbar nichts und kostet
       jeden Frame Zeichenaufrufe. */
    var MIN = 0.013, out = [flat[0], flat[1]], lx = flat[0], ly = flat[1];
    for (i = 1; i < n; i++) {
      var x = flat[i * 2], y = flat[i * 2 + 1];
      if ((x - lx) * (x - lx) + (y - ly) * (y - ly) >= MIN * MIN) { out.push(x, y); lx = x; ly = y; }
    }
    n = out.length / 2;
    if (n < 5) { out = flat; n = out.length / 2; }

    /* 2. eine Runde Chaikin — weiche, fließende Linien */
    var sm = new Float32Array(n * 4);
    for (i = 0; i < n; i++) {
      var j = (i + 1) % n;
      var ax = out[i * 2], ay = out[i * 2 + 1], bx = out[j * 2], by = out[j * 2 + 1];
      sm[i * 4]     = ax * 0.75 + bx * 0.25;
      sm[i * 4 + 1] = ay * 0.75 + by * 0.25;
      sm[i * 4 + 2] = ax * 0.25 + bx * 0.75;
      sm[i * 4 + 3] = ay * 0.25 + by * 0.75;
    }
    var m = sm.length / 2;
    var xs = new Float32Array(m), ys = new Float32Array(m);
    for (i = 0; i < m; i++) { xs[i] = sm[i * 2]; ys[i] = sm[i * 2 + 1]; }

    /* 3. Umlaufsinn vereinheitlichen (gegen den Uhrzeigersinn) */
    var area = 0;
    for (i = 0; i < m; i++) {
      var k = (i + 1) % m;
      area += xs[i] * ys[k] - xs[k] * ys[i];
    }
    if (area < 0) {
      for (i = 0; i < (m >> 1); i++) {
        var t1 = xs[i]; xs[i] = xs[m - 1 - i]; xs[m - 1 - i] = t1;
        var t2 = ys[i]; ys[i] = ys[m - 1 - i]; ys[m - 1 - i] = t2;
      }
    }

    /* 4. Normalenwinkel je Punkt, danach in Bündel zusammengefasst */
    var CH = 14, chunks = Math.max(1, Math.round(m / CH));
    var step = m / chunks;
    var cStart = new Int32Array(chunks), cAng = new Float32Array(chunks);
    for (var c = 0; c < chunks; c++) {
      var s0 = Math.round(c * step) % m, s1 = Math.round((c + 1) * step) % m;
      cStart[c] = s0;
      var p0 = (s0 + m - 1) % m, p1 = (s1 + 1) % m;
      var tx = xs[p1] - xs[p0], ty = ys[p1] - ys[p0];
      cAng[c] = Math.atan2(-tx, ty);        // Außennormale bei CCW-Umlauf
    }
    return { xs: xs, ys: ys, n: m, cStart: cStart, cAng: cAng, chunks: chunks, step: step };
  }

  /* ======================================================= Route ========== */

  /* Die Route ist keine formelhafte Spirale, sondern ein Weg mit Ankern — sie
     hält sich ans Gelände wie ein echter Steig:

       · Zwischen zwei Ankern werden Winkel und Zielhöhe interpoliert, der
         Radius wird aus dem Höhenfeld gesucht (radiusFor). Der Weg steigt
         dadurch stetig, statt Rinnen zu queren und wieder herauszuklettern.
       · Zwei Anker sitzen fest auf dem Gelände: Aurora auf dem Nebengipfel,
         Apex auf dem Hauptgipfel.
       · Der Abschnitt Aurora → Passage ist als 'ridge' markiert: dort wird
         direkt in Polarkoordinaten interpoliert, sodass der Weg dem Grat
         folgt, statt in den Sattel abzusteigen. Die 0,02 Höhenverlust gleich
         hinter dem Nebengipfel sind der Grat selbst.
       · Oberhalb der Passage dreht der Weg auf die abgewandte Seite: Polaris
         liegt dem Grat gegenüber, der Anstieg wird zur Wendeltreppe statt zur
         Falllinie.

     `seg` ist die Zahl der Zwischenpunkte bis zu diesem Anker. Daraus ergibt
     sich der Wegparameter jeder Station — er muss zu `t` in calc.js passen,
     tests/geometry.mjs rechnet das nach. */
  var ROUTE_ANCHORS = [
    { a: -135, z: 0.012 },
    { a:  -95, z: 0.105, seg: 3, st: true },   // First Light
    { a:  -30, z: 0.245, seg: 5, st: true },   // Velocity
    { a:   12, z: 0.300, seg: 5, st: true },   // Stable Course
    { a:   55, r: 0.407, seg: 5, st: true },   // Aurora — Nebengipfel
    { a:   61, r: 0.209, seg: 3, st: true, mode: 'ridge' },   // Passage — Grat
    { a:  250, z: 0.900, seg: 5, st: true },   // Polaris — Gegenseite
    /* Der Gipfel liegt bei 135°. Als 495° (= 135° + 360°) geschrieben dreht der
       Weg weiter, statt gleich hinter Polaris zurückzuknicken — ein Knick, der
       als eckiger Übergang sichtbar wäre. */
    { a:  495, r: 0.047, seg: 8, st: true }    // Apex — Gipfel
  ];

  function polar(a, r) { return [Math.sin(a * Math.PI / 180) * r, Math.cos(a * Math.PI / 180) * r]; }

  /** Radius, bei dem der Strahl `a` von außen kommend die Höhe z erreicht.
      Grob suchen, dann halbieren — ein gerasterter Radius würde den Weg
      zwischen den Kontrollpunkten zappeln lassen. */
  function radiusFor(field, a, z) {
    var r, p, hit = 0.03;
    for (r = 0.95; r > 0.03; r -= 0.01) {
      p = polar(a, r);
      if (sampleH(field, p[0], p[1]) * Z_MAX >= z) { hit = r; break; }
    }
    var inner = hit, outer = Math.min(0.95, hit + 0.01);
    for (var k = 0; k < 8; k++) {
      var m = (inner + outer) / 2;
      p = polar(a, m);
      if (sampleH(field, p[0], p[1]) * Z_MAX >= z) inner = m; else outer = m;
    }
    return inner;
  }

  function anchorZ(field, an) {
    if (an.z != null) return an.z;
    var p = polar(an.a, an.r);
    return sampleH(field, p[0], p[1]) * Z_MAX;
  }
  function anchorR(field, an) { return an.r != null ? an.r : radiusFor(field, an.a, an.z); }

  /** Kontrollpolygon + Wegparameter der Stationen. */
  function routeControls(field) {
    var pts = [polar(ROUTE_ANCHORS[0].a, anchorR(field, ROUTE_ANCHORS[0]))];
    var stationT = [];
    for (var k = 1; k < ROUTE_ANCHORS.length; k++) {
      var prev = ROUTE_ANCHORS[k - 1], an = ROUTE_ANCHORS[k];
      var r0 = anchorR(field, prev), r1 = anchorR(field, an);
      var z0 = anchorZ(field, prev), z1 = anchorZ(field, an);
      for (var s = 1; s <= an.seg; s++) {
        var t = s / an.seg;
        var a = prev.a + (an.a - prev.a) * t;
        var r;
        if (an.mode === 'ridge') r = r0 + (r1 - r0) * t;
        else if (s === an.seg && an.r != null) r = an.r;
        else r = radiusFor(field, a, z0 + (z1 - z0) * t);
        pts.push(polar(a, r));
      }
      if (an.st) stationT.push(pts.length - 1);
    }
    var last = pts.length - 1;
    for (var i = 0; i < stationT.length; i++) stationT[i] /= last;
    return { pts: pts, stationT: stationT };
  }

  function catmull(pts, samples) {
    var p = [pts[0]].concat(pts, [pts[pts.length - 1]]);
    var out = [];
    for (var s = 0; s < samples; s++) {
      var u = s / (samples - 1) * (pts.length - 1);
      var i = Math.min(Math.floor(u), pts.length - 2);
      var t = u - i;
      var p0 = p[i], p1 = p[i + 1], p2 = p[i + 2], p3 = p[i + 3];
      var t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
      ]);
    }
    return out;
  }

  function buildRoute(field) {
    var ctl = routeControls(field);
    var raw = catmull(ctl.pts, 300);
    var n = raw.length;
    var xs = new Float32Array(n), ys = new Float32Array(n), zs = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      xs[i] = raw[i][0]; ys[i] = raw[i][1];
      zs[i] = sampleH(field, xs[i], ys[i]) * Z_MAX + 0.007;
    }
    return { xs: xs, ys: ys, zs: zs, n: n, stationT: ctl.stationT };
  }

  /** Position auf der Route beim Wegparameter t (0 = Fuß, 1 = Gipfel). */
  function routeAt(route, t) {
    var f = U.clamp(t, 0, 1) * (route.n - 1);
    var i = Math.min(route.n - 2, f | 0), u = f - i;
    return {
      x: route.xs[i] + (route.xs[i + 1] - route.xs[i]) * u,
      y: route.ys[i] + (route.ys[i + 1] - route.ys[i]) * u,
      z: route.zs[i] + (route.zs[i + 1] - route.zs[i]) * u
    };
  }

  /* ==================================================== Darstellung ======= */

  /* Mastlängen werden aus den Stationshöhen abgeleitet, sodass die Pin-Köpfe
     schon im Modellraum einen Mindestabstand halten. Was danach aus einem
     bestimmten Blickwinkel trotzdem aufeinanderfällt, entzerrt drawMarkers()
     im Bildraum. */
  var POLE_MIN = 0.115, POLE_GAP = 0.118, POLE_MAX = 0.40;
  function polesFor(zs) {
    var out = [], top = -1e9;
    for (var i = 0; i < zs.length; i++) {
      var t = Math.max(zs[i] + POLE_MIN, top + POLE_GAP);
      out.push(Math.min(t - zs[i], POLE_MAX));
      top = zs[i] + out[i];
    }
    return out;
  }

  var T0 = (global.performance && performance.now) ? performance.now() : Date.now();

  function create(canvas, bus) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;

    var field = buildField();
    var levels = buildContours(field);
    var route = buildRoute(field);

    /* Projizierte Punkte je Level (Scratch, einmal alloziert) */
    levels.forEach(function (lv) {
      lv.loops.forEach(function (lp) {
        lp.px = new Float32Array(lp.n); lp.py = new Float32Array(lp.n);
      });
      var f = lv.index / (LEVELS - 1);
      lv.fill = mix('#060b14', '#122036', f * f * 0.85 + f * 0.15);
      lv.strokeLit = rgba(mix('#7fb2e5', '#e8f2ff', f), 0.30 + 0.44 * f);
      lv.strokeMid = rgba(mix('#7fb2e5', '#dfeaff', f), 0.17 + 0.27 * f);
      lv.strokeDim = rgba(mix('#5c86b8', '#9fc0e4', f), 0.09 + 0.14 * f);
      lv.z = lv.level * Z_MAX;
    });

    var stationPts = NS.calc.MILESTONES.filter(function (m) { return m.t != null; })
      .map(function (m) { return routeAt(route, m.t); });
    var stationPoles = polesFor(stationPts.map(function (q) { return q.z; }));
    var silhouette = buildSilhouette(levels, stationPts, stationPoles);

    var state = {
      yaw: YAW_DEF, pitch: PITCH_DEF,
      spin: 0.055,               // rad/s im Ruhezustand
      vel: 0, idle: 0, dragging: false,
      motion: true, intensity: 'normal',
      view: null, hover: null, selected: null, ringHover: false,
      yawTarget: null, yawEase: 0,
      w: 0, h: 0, cx: 0, cy: 0, R: 1, dpr: 1, offX: 0, offY: 0,
      hits: [], ringPts: null, needsDraw: true, poles: [],
      ringFill: 0, ringFrom: 0, ringTo: 0, ringT0: 0
    };

    /* ---------------------------------------------------------- Farbhelfer */
    function hex(c) {
      return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    }
    function mix(a, b, t) {
      var A = hex(a), B = hex(b);
      return '#' + [0, 1, 2].map(function (i) {
        var v = Math.round(A[i] + (B[i] - A[i]) * U.clamp(t, 0, 1));
        return (v < 16 ? '0' : '') + v.toString(16);
      }).join('');
    }
    function rgba(c, a) { var C = hex(c); return 'rgba(' + C[0] + ',' + C[1] + ',' + C[2] + ',' + a.toFixed(3) + ')'; }

    /* Ringfarben kommen aus den Tokens, damit Warm und Grün nur an einer
       Stelle festgelegt sind. Fehlt der Wert (alte Engine, Testumgebung),
       greift der Rückfallwert. */
    function token(name, fb) {
      try {
        var v = global.getComputedStyle(global.document.documentElement).getPropertyValue(name).trim();
        return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fb;
      } catch (e) { return fb; }
    }
    var RGB_OK = hex(token('--aurora', '#2fbd8b')).join(',');
    var RGB_WARN = hex(token('--amber', '#d46a2e')).join(',');

    /* ------------------------------------------------------------ Kamera */
    var cam = makeCam(state.yaw, state.pitch, 0, 0, 1);
    var ca = 1, sa = 0, ce = 1, se = 0;   // von visible() mitbenutzt
    function updateCam() {
      /* Der Ausschnitt hängt an der Neigung und wird deshalb je Bild bestimmt. */
      var f = frame(state.w, state.h, state.pitch, silhouette);
      state.cx = f.cx; state.cy = f.cy; state.R = f.R;
      cam = makeCam(state.yaw, state.pitch, f.cx, f.cy, f.R);
      ca = cam.ca; sa = cam.sa; ce = cam.ce; se = cam.se;
    }
    function project(x, y, z) { return projectPt(cam, x, y, z); }

    /* Verdeckungsprüfung: von einem Punkt aus in Richtung Kamera marschieren.
       Steigt das Gelände über die Sichtlinie, liegt der Punkt hinter dem Berg.
       Der Strahl endet, sobald er den Gipfel überragt — nichts kann ihn dann
       noch verdecken, deshalb bleibt das billig. */
    var visStep = 0.075;
    function visible(x, y, z) {
      var tanE = se / (ce || 1e-6);
      var tMax = (Z_MAX - z) / Math.max(tanE, 1e-6);
      if (tMax <= 0) return true;
      if (tMax > 2.4) tMax = 2.4;
      var dx = sa, dy = ca;                    // Richtung zur Kamera
      for (var t = visStep; t <= tMax; t += visStep) {
        var qx = x + dx * t, qy = y + dy * t;
        if (qx * qx + qy * qy > 1.02) break;
        if (sampleH(field, qx, qy) * Z_MAX > z + t * tanE + 0.006) return false;
      }
      return true;
    }

    /* -------------------------------------------------------- Größe/DPR */
    /* Der Schein hinter der Hälfte folgt dem Berg: hier wird nur gemeldet, wo
       sein Mittelpunkt in der Zone liegt und wie groß er ausfällt. Gerechnet
       wird das aus dem bei resize() gemessenen Versatz — pro Bild wird nichts
       aus dem Layout gelesen. */
    var glowHost = null, glowKey = '';
    function publishGlow() {
      if (!glowHost) return;
      var x = Math.round(state.offX + state.cx);
      var y = Math.round(state.offY + state.cy);
      var d = Math.round(state.R * 3.1);
      var key = x + '|' + y + '|' + d;
      if (key === glowKey) return;
      glowKey = key;
      glowHost.style.setProperty('--glow-x', x + 'px');
      glowHost.style.setProperty('--glow-y', y + 'px');
      glowHost.style.setProperty('--glow-d', d + 'px');
    }

    function resize() {
      var r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      glowHost = canvas.closest ? canvas.closest('.zone') : null;
      if (glowHost) {
        var hr = glowHost.getBoundingClientRect();
        state.offX = r.left - hr.left; state.offY = r.top - hr.top;
        glowKey = '';
      }
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      state.w = r.width; state.h = r.height; state.dpr = dpr;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      state.needsDraw = true;
    }

    /* ------------------------------------------------------------ Zeichnen */
    function angDist(a, b) {
      var d = Math.abs(a - b) % (Math.PI * 2);
      return d > Math.PI ? Math.PI * 2 - d : d;
    }
    var CARDINALS = [['N', 0], ['W', Math.PI / 2], ['S', Math.PI], ['E', -Math.PI / 2]];

    function drawPlate(now) {
      var i, p;
      /* Der Grundschein liegt als CSS-Schein hinter der ganzen Hälfte, nicht in
         der Leinwand — siehe publishGlow(). In der Leinwand bräche er an deren
         Unterkante ab und legte einen dunklen Kasten unter die Karten. */

      /* Teilung — mit Lücken dort, wo die Himmelsrichtungen liegen */
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(127,178,229,0.26)';
      ctx.beginPath();
      for (i = 0; i < 120; i++) {
        var an = i / 120 * Math.PI * 2;
        var blocked = false;
        for (var k = 0; k < 4; k++) {
          if (angDist(an, CARDINALS[k][1]) < 0.115) { blocked = true; break; }
        }
        if (blocked) continue;
        var major = i % 10 === 0, mid = i % 5 === 0;
        var r1 = PLATE_R, r2 = PLATE_R - (major ? 0.085 : mid ? 0.055 : 0.032);
        var sn = Math.sin(an), cs = Math.cos(an);
        p = project(sn * r1, cs * r1, 0); var x1 = p.x, y1 = p.y;
        p = project(sn * r2, cs * r2, 0);
        ctx.moveTo(x1, y1); ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();

      drawCardinals();
    }

    /* Die Himmelsrichtungen liegen flach in der Tellerebene, nicht als Etikett
       davor. Dafür wird die Schrift über die projizierten Basisvektoren der
       Ebene geschert — Tangente als Leserichtung, Radius als Hochachse. */
    /* Die Himmelsrichtungen liegen in der Ebene des Tellers und drehen sich mit
       ihm — wie die Rose eines echten Kompasses: Leserichtung entlang der
       Teilung, Kopf nach außen, von der Mitte aus gelesen.

       Der Vorzeichenwechsel ist kein Schönheitsgriff: Die Projektion bildet
       die Bodenebene seitenverkehrt ab (+y zeigt zur Kamera, +x nach rechts).
       Flach gelegte Schrift erbt das und stünde gespiegelt da. Beide
       Achsen umgedreht ergibt dieselbe Lage in der Ebene, aber eine
       seitenrichtige Schrift auf dem Bildschirm. tests/geometry.mjs prüft
       das über alle Drehungen mit. */
    function drawCardinals() {
      ctx.font = '500 100px ' + displayFont();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (var i = 0; i < 4; i++) {
        var a = CARDINALS[i][1];
        var p0 = project(Math.sin(a) * LETTER_R, Math.cos(a) * LETTER_R, 0);
        var tx = Math.cos(a), ty = -Math.sin(a);      // Tangente = Leserichtung
        var rx = Math.sin(a), ry = Math.cos(a);       // nach außen = Hochachse
        var kk = LETTER_H / 100 * p0.s * state.R;
        var tsx = (tx * ca - ty * sa) * kk;
        var tsy = (tx * sa + ty * ca) * se * kk;
        var osx = (rx * ca - ry * sa) * kk;
        var osy = (rx * sa + ry * ca) * se * kk;
        /* Der hintere Buchstabe darf zurücktreten, aber nicht verschwinden. */
        var fade = U.clamp(0.34 + 0.66 * (p0.d + 1.2) / 2.4, 0.48, 1);
        ctx.save();
        ctx.transform(-tsx, -tsy, -osx, -osy, p0.x, p0.y);
        ctx.fillStyle = 'rgba(196,212,236,' + fade.toFixed(2) + ')';
        ctx.fillText(CARDINALS[i][0], 0, 0);
        ctx.restore();
      }
    }

    function drawRing(now) {
      var v = state.view;
      if (!v || !v.contingency) return;
      /* Beim ersten Zeichnen (und nach jeder Änderung) läuft der Ring von der
         alten auf die neue Deckung — er baut sich auf, statt fertig dazustehen. */
      var pct = state.ringTo;
      if (state.motion && state.ringT0) {
        var el = (now - state.ringT0) / 1500;
        if (el < 1) { pct = state.ringFrom + (state.ringTo - state.ringFrom) * U.easeOutCubic(el); state.needsDraw = true; }
        else state.ringT0 = 0;
      }
      pct = U.clamp(pct, 0, 1);
      state.ringFill = pct;
      var reached = v.contingency.reached && pct >= U.clamp(v.contingency.pct, 0, 1) - 0.001;
      var i, p;

      /* Ein Punkt der Laufbahn, Schritt 0…144, Start im Norden.
         Das Minus dreht die Füllrichtung: `[sin a, cos a]` legt a = 90° nach
         Westen, wachsendes a liefe die Rose also rückwärts ab und der Ring
         füllte sich gegen den Uhrzeigersinn. Fortschritt läuft rechtsherum. */
      function ringAt(i) {
        var t = -i / 144 * Math.PI * 2;
        return project(Math.sin(t) * RING_R, Math.cos(t) * RING_R, 0.004);
      }

      /* Laufbahn */
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = 'rgba(127,178,229,0.13)';
      ctx.beginPath();
      var pts = state.ringPts || (state.ringPts = new Float32Array(2 * 145));
      for (i = 0; i <= 144; i++) {
        p = ringAt(i);
        pts[i * 2] = p.x; pts[i * 2 + 1] = p.y;
        if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
      }
      ctx.stroke();

      /* Zielmarke bei 100 % */
      p = project(0, RING_R, 0.004);
      var pin = project(0, RING_R + 0.055, 0.004);
      ctx.strokeStyle = 'rgba(' + (reached ? RGB_OK : RGB_WARN) + ',' + (reached ? 0.75 : 0.68) + ')';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(pin.x, pin.y); ctx.stroke();

      if (pct <= 0) return;
      var last = Math.max(1, Math.round(144 * pct));
      var col = reached ? RGB_OK : RGB_WARN;
      var hot = state.ringHover ? 0.28 : 0;

      /* Erreichter Anteil */
      ctx.lineCap = 'round';
      ctx.lineWidth = reached ? 4.4 : 3.8;
      ctx.strokeStyle = 'rgba(' + col + ',' + (0.62 + hot).toFixed(2) + ')';
      ctx.shadowColor = 'rgba(' + col + ',' + (reached ? 0.55 : 0.35) + ')';
      ctx.shadowBlur = (reached ? 16 : 9) * (state.motion ? 1 : 0.7);
      ctx.beginPath();
      for (i = 0; i <= last; i++) {
        p = ringAt(i);
        if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      /* Puls: wandert im Takt des Sterns vom Start bis zum aktuellen Stand */
      if (state.motion) {
        var dur = state.intensity === 'ruhig' ? 8500 : 5600;
        var ph = ((now - T0) % dur) / dur;
        var head = U.smoothstep(ph < 0.72 ? ph / 0.72 : 1);
        var tail = Math.max(0, head - 0.22);
        var i0 = Math.round(last * tail), i1 = Math.round(last * head);
        if (i1 > i0) {
          var fade = ph > 0.72 ? 1 - (ph - 0.72) / 0.28 : 1;
          ctx.lineWidth = reached ? 5.2 : 4.6;
          ctx.strokeStyle = 'rgba(' + (reached ? '190,255,228' : '255,214,150') + ',' + (0.55 * fade).toFixed(3) + ')';
          ctx.beginPath();
          for (i = i0; i <= i1; i++) {
            p = ringAt(i);
            if (i > i0) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
          }
          ctx.stroke();
        }
      }
      ctx.lineCap = 'butt';
    }

    function drawTerrain() {
      var lightAng = -0.9;                 // Licht aus Bildschirm-Links-Oben
      for (var l = 0; l < levels.length; l++) {
        var lv = levels[l], k, lp, i, p;

        /* projizieren */
        for (k = 0; k < lv.loops.length; k++) {
          lp = lv.loops[k];
          for (i = 0; i < lp.n; i++) {
            p = project(lp.xs[i], lp.ys[i], lv.z);
            lp.px[i] = p.x; lp.py[i] = p.y;
          }
        }
        /* füllen — verdeckt die Rückseite der tieferen Bänder */
        ctx.fillStyle = lv.fill;
        ctx.beginPath();
        for (k = 0; k < lv.loops.length; k++) {
          lp = lv.loops[k];
          ctx.moveTo(lp.px[0], lp.py[0]);
          for (i = 1; i < lp.n; i++) ctx.lineTo(lp.px[i], lp.py[i]);
          ctx.closePath();
        }
        ctx.fill();

        /* streichen, in drei Helligkeitsstufen nach Lichteinfall */
        ctx.lineWidth = 1;
        for (var b = 0; b < 3; b++) {
          ctx.strokeStyle = b === 0 ? lv.strokeLit : b === 1 ? lv.strokeMid : lv.strokeDim;
          ctx.beginPath();
          var any = false;
          for (k = 0; k < lv.loops.length; k++) {
            lp = lv.loops[k];
            for (var c = 0; c < lp.chunks; c++) {
              var f = Math.cos(lp.cAng[c] + state.yaw - lightAng);
              var bucket = f > 0.35 ? 0 : f > -0.4 ? 1 : 2;
              if (bucket !== b) continue;
              var s0 = lp.cStart[c];
              var s1 = lp.cStart[(c + 1) % lp.chunks];
              var count = (s1 - s0 + lp.n) % lp.n || lp.n;
              ctx.moveTo(lp.px[s0], lp.py[s0]);
              for (i = 1; i <= count; i++) {
                var idx = (s0 + i) % lp.n;
                ctx.lineTo(lp.px[idx], lp.py[idx]);
              }
              any = true;
            }
          }
          if (any) ctx.stroke();
        }
      }
    }

    var routeVis = null;
    function computeRouteVis() {
      if (!routeVis) routeVis = new Uint8Array(route.n);
      for (var i = 0; i < route.n; i++) {
        routeVis[i] = visible(route.xs[i], route.ys[i], route.zs[i]) ? 1 : 0;
      }
    }

    /** Sichtbare Teilstücke zwischen den Indizes i0…i1 als Pfad legen. */
    function pathRuns(i0, i1) {
      var open = false, drew = false;
      for (var i = i0; i <= i1; i++) {
        if (!routeVis[i]) { open = false; continue; }
        var p = project(route.xs[i], route.ys[i], route.zs[i]);
        if (open) ctx.lineTo(p.x, p.y);
        else { ctx.moveTo(p.x, p.y); open = true; }
        drew = true;
      }
      return drew;
    }

    function drawRoute() {
      var v = state.view;
      var t = v ? v.routeT : 0;
      var i, p;
      computeRouteVis();

      /* offener Teil — zurückhaltend gestrichelt */
      ctx.setLineDash([2.5, 5]);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = 'rgba(163,180,207,0.34)';
      ctx.beginPath();
      if (pathRuns(0, route.n - 1)) ctx.stroke();
      ctx.setLineDash([]);

      /* hervorgehobener Abschnitt: vom vorherigen Meilenstein zum betrachteten */
      var hi = state.hover || state.selected;
      if (hi && v) {
        var idx = -1;
        v.stations.forEach(function (st, k) { if (st.id === hi) idx = k; });
        if (idx >= 0) {
          var tA = idx === 0 ? 0 : v.stations[idx - 1].t, tB = v.stations[idx].t;
          var iA = Math.floor(U.clamp(tA, 0, 1) * (route.n - 1));
          var iB = Math.floor(U.clamp(tB, 0, 1) * (route.n - 1));
          ctx.lineWidth = 3.4;
          ctx.strokeStyle = 'rgba(234,242,255,0.55)';
          ctx.shadowColor = 'rgba(127,178,229,0.8)';
          ctx.shadowBlur = 14;
          ctx.beginPath();
          if (pathRuns(iA, iB)) ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }

      /* zurückgelegter Teil — leuchtend */
      var upto = Math.floor(U.clamp(t, 0, 1) * (route.n - 1));
      if (t > 0) {
        ctx.lineWidth = 2.1;
        ctx.strokeStyle = 'rgba(198,222,255,0.92)';
        ctx.shadowColor = 'rgba(127,178,229,0.65)';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        if (pathRuns(0, upto)) ctx.stroke();
        ctx.shadowBlur = 0;

        /* aktuelle Position */
        var head = routeAt(route, t);
        if (visible(head.x, head.y, head.z)) {
          p = project(head.x, head.y, head.z);
          ctx.fillStyle = '#eaf2ff';
          ctx.beginPath(); ctx.arc(p.x, p.y, 3.4, 0, 6.2832); ctx.fill();
          ctx.strokeStyle = 'rgba(234,242,255,0.35)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(p.x, p.y, 7.5, 0, 6.2832); ctx.stroke();
        }
      }
    }

    function drawMarkers() {
      var v = state.view;
      if (!v) return;
      state.hits.length = 0;

      var list = v.stations.map(function (s, i) {
        return { s: s, q: routeAt(route, s.t), pole: state.poles[i] || 0.15 };
      });
      list.forEach(function (m) {
        var b = project(m.q.x, m.q.y, m.q.z);
        m.bx = b.x; m.by = b.y; m.depth = b.d;
        m.hidden = !visible(m.q.x, m.q.y, m.q.z);
        var t = project(m.q.x, m.q.y, m.q.z + m.pole);
        m.hx = t.x;
        m.r = (state.hover === m.s.id || state.selected === m.s.id) ? 15 : 13;
        m.hy = t.y - m.r;
        m.hy0 = m.hy;
      });

      /* Entzerrung im Bildraum: von unten nach oben; was zu dicht steht, wandert
         nach oben — der Mast wächst mit, die Verankerung bleibt exakt. */
      var byY = list.slice().sort(function (a, b) { return b.hy - a.hy; });
      for (var i = 1; i < byY.length; i++) {
        for (var j = 0; j < i; j++) {
          var a = byY[i], b2 = byY[j];
          if (Math.abs(a.hx - b2.hx) > a.r + b2.r + 3) continue;
          var need = b2.hy - (a.r + b2.r + 4);
          if (a.hy > need) a.hy = Math.max(a.hy0 - SHIFT_MAX, Math.min(a.hy, need));
        }
      }

      list.sort(function (a, b) { return a.depth - b.depth; });
      list.forEach(function (m) {
        var s = m.s;
        var isHover = state.hover === s.id, isSel = state.selected === s.id;
        var alpha = m.hidden && !isHover && !isSel ? 0.34 : 1;
        var col = s.status === 'reached' ? '#2fbd8b' : s.status === 'current' ? '#eaf2ff' : '#7fb2e5';
        var dim = s.status === 'future' ? 0.66 : 1;
        var r = m.r;

        ctx.globalAlpha = alpha * dim;
        /* Verdeckte Masten werden gestrichelt — der Pin bleibt anklickbar,
           der Berg bleibt trotzdem undurchsichtig. */
        if (m.hidden) ctx.setLineDash([2, 3]);
        ctx.strokeStyle = s.status === 'future' ? 'rgba(127,178,229,0.42)' : 'rgba(198,222,255,0.58)';
        ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(m.bx, m.by); ctx.lineTo(m.hx, m.hy + r); ctx.stroke();
        ctx.setLineDash([]);
        /* Der Fußpunkt ist ein kleiner Pin: dunkler Grund, farbiger Ring.
           Ein heller Punkt allein verschwindet auf der weißen Route. */
        if (!m.hidden) {
          var fr = (isHover || isSel) ? 4.6 : 3.7;
          ctx.beginPath(); ctx.arc(m.bx, m.by, fr, 0, 6.2832);
          ctx.fillStyle = 'rgba(6,11,20,0.92)';
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = col;
          ctx.stroke();
        }

        ctx.beginPath(); ctx.arc(m.hx, m.hy, r, 0, 6.2832);
        ctx.fillStyle = s.status === 'reached' ? 'rgba(8,30,24,0.95)'
          : s.status === 'current' ? 'rgba(11,21,38,0.97)' : 'rgba(8,13,24,0.92)';
        ctx.fill();
        ctx.lineWidth = (isHover || isSel) ? 2 : 1.3;
        ctx.strokeStyle = col;
        if (isHover || isSel) { ctx.shadowColor = col; ctx.shadowBlur = 14; }
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.save();
        ctx.translate(m.hx, m.hy);
        NS.icons.draw(ctx, s.id, r * 1.26, col);
        ctx.restore();

        if (s.status === 'current') {
          ctx.strokeStyle = 'rgba(234,242,255,0.28)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(m.hx, m.hy, r + 4.5, 0, 6.2832); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        state.hits.push({ id: s.id, x: m.hx, y: m.hy, r: r + 6, hidden: m.hidden });
      });
    }

    function draw(now) {
      if (!state.w) return;
      updateCam();
      publishGlow();
      ctx.clearRect(0, 0, state.w, state.h);
      drawPlate(now);
      drawRing(now);
      drawTerrain();
      drawRoute();
      drawMarkers();
      state.needsDraw = false;
    }

    /* ------------------------------------------------------------- Schleife */
    var last = T0, raf = 0;
    function tick(now) {
      raf = global.requestAnimationFrame(tick);
      var dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      if (state.yawTarget != null) {
        var d = state.yawTarget - state.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) < 0.004) { state.yaw = state.yawTarget; state.yawTarget = null; }
        else { state.yaw += d * Math.min(1, dt * 3.4); }
        state.needsDraw = true;
      } else if (state.dragging) {
        state.idle = 0;
      } else {
        if (Math.abs(state.vel) > 0.0005) {          /* Trägheit */
          state.yaw += state.vel * dt;
          state.vel *= Math.pow(0.10, dt);
          state.idle = 0;
          state.needsDraw = true;
        } else {
          state.vel = 0;
          state.idle += dt;
          if (state.motion && !state.paused && state.idle > 2.4) {
            var ramp = U.smoothstep((state.idle - 2.4) / 2.2);
            state.yaw += state.spin * ramp * dt * (state.intensity === 'ruhig' ? 0.6 : 1);
            state.needsDraw = true;
          }
        }
      }
      if (state.motion && state.view && state.view.contingency) state.needsDraw = true;
      if (state.needsDraw) draw(now);
    }

    /* ---------------------------------------------------------- Interaktion */
    var drag = null;
    function localPos(ev) {
      var r = canvas.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    }
    function hitTest(pt) {
      for (var i = state.hits.length - 1; i >= 0; i--) {
        var h = state.hits[i];
        var dx = pt.x - h.x, dy = pt.y - h.y;
        if (dx * dx + dy * dy <= h.r * h.r) return h.id;
      }
      return null;
    }
    function ringHitTest(pt) {
      if (!state.ringPts) return false;
      var best = 1e9;
      for (var i = 0; i <= 144; i++) {
        var dx = pt.x - state.ringPts[i * 2], dy = pt.y - state.ringPts[i * 2 + 1];
        var d = dx * dx + dy * dy;
        if (d < best) best = d;
      }
      return best < 12 * 12;
    }

    canvas.addEventListener('pointerdown', function (ev) {
      canvas.setPointerCapture(ev.pointerId);
      var pt = localPos(ev);
      drag = { x: pt.x, y: pt.y, t: performance.now(), moved: 0, startId: hitTest(pt), startRing: ringHitTest(pt) };
      state.dragging = true;
      state.yawTarget = null;
      state.vel = 0;
      canvas.style.cursor = 'grabbing';
    });

    canvas.addEventListener('pointermove', function (ev) {
      var pt = localPos(ev);
      if (drag) {
        var dx = pt.x - drag.x, dy = pt.y - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        var now = performance.now(), dt = Math.max(1, now - drag.t) / 1000;
        state.yaw -= dx * 0.0068;
        state.pitch = U.clamp(state.pitch + dy * 0.0048, PITCH_MIN, PITCH_MAX);
        state.vel = -dx * 0.0068 / dt * 0.55;
        if (state.vel > 3) state.vel = 3; if (state.vel < -3) state.vel = -3;
        drag.x = pt.x; drag.y = pt.y; drag.t = now;
        state.needsDraw = true;
        return;
      }
      var id = hitTest(pt);
      var ring = ringHitTest(pt);
      if (id !== state.hover || ring !== state.ringHover) {
        state.hover = id; state.ringHover = ring;
        canvas.style.cursor = (id || ring) ? 'pointer' : 'grab';
        state.needsDraw = true;
        bus.emit('mountain:hover', id ? { id: id } : ring ? { id: 'contingency' } : null);
      }
    });

    function endDrag(ev) {
      if (!drag) return;
      state.dragging = false;
      state.idle = 0;
      if (drag.moved < 5) {
        var pt = localPos(ev);
        var id = hitTest(pt);
        if (id) bus.emit('mountain:select', { id: id });
        else if (ringHitTest(pt)) bus.emit('mountain:select', { id: 'contingency' });
        state.vel = 0;
      }
      drag = null;
      canvas.style.cursor = 'grab';
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', function () { state.dragging = false; drag = null; canvas.style.cursor = 'grab'; });
    canvas.addEventListener('pointerleave', function () {
      if (state.hover || state.ringHover) {
        state.hover = null; state.ringHover = false; state.needsDraw = true;
        bus.emit('mountain:hover', null);
      }
    });
    canvas.addEventListener('dblclick', function () {
      state.yawTarget = YAW_DEF; state.pitch = PITCH_DEF; state.needsDraw = true;
    });
    canvas.addEventListener('keydown', function (ev) {
      var step = 0.14;
      if (ev.key === 'ArrowLeft') { state.yaw -= step; state.idle = 0; }
      else if (ev.key === 'ArrowRight') { state.yaw += step; state.idle = 0; }
      else if (ev.key === 'ArrowUp') { state.pitch = U.clamp(state.pitch + 0.06, PITCH_MIN, PITCH_MAX); }
      else if (ev.key === 'ArrowDown') { state.pitch = U.clamp(state.pitch - 0.06, PITCH_MIN, PITCH_MAX); }
      else return;
      ev.preventDefault();
      state.yawTarget = null; state.needsDraw = true;
    });

    var ro = global.ResizeObserver ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(canvas); else global.addEventListener('resize', resize);
    resize();
    raf = global.requestAnimationFrame(tick);

    /* ---------------------------------------------------------------- API */
    return {
      /* Der Berg bleibt stehen — er ist Kulisse, keine Zahl. Fort müssen die
         Marker, der Ring und alles, was aus dem Modell kam. */
      clear: function () {
        state.selected = null; state.hover = null; state.ringHover = false;
        this.setData(null);
      },
      setData: function (view) {
        var target = view && view.contingency ? U.clamp(view.contingency.pct || 0, 0, 1) : 0;
        if (Math.abs(target - state.ringTo) > 0.0005 || !state.view) {
          state.ringFrom = state.view ? state.ringFill : 0;
          state.ringTo = target;
          state.ringT0 = (global.performance && performance.now) ? performance.now() : Date.now();
        }
        state.view = view;
        state.poles = polesFor((view && view.stations || []).map(function (s) {
          return routeAt(route, s.t).z;
        }));
        state.needsDraw = true;
      },
      setMotion: function (on, intensity) {
        state.motion = !!on;
        state.intensity = intensity || 'normal';
        state.needsDraw = true;
      },
      setPaused: function (p) { state.paused = !!p; if (!p) state.idle = 0; },
      setHover: function (id) {
        var ring = id === 'contingency';
        var st = ring ? null : id;
        if (state.hover === st && state.ringHover === ring) return;
        state.hover = st; state.ringHover = ring; state.needsDraw = true;
      },
      setSelected: function (id, turnTo) {
        state.selected = id; state.needsDraw = true;
        if (turnTo && id && state.view) {
          var st = null;
          state.view.stations.forEach(function (s) { if (s.id === id) st = s; });
          if (st) {
            var q = routeAt(route, st.t);
            state.yawTarget = Math.atan2(q.x, q.y);
            state.idle = 0;
          }
        }
      },
      /* Nur für kopflose Prüfungen — spiegelt den inneren Zustand. */
      peek: function () {
        return { hover: state.hover, ringHover: state.ringHover, selected: state.selected,
          paused: !!state.paused, motion: state.motion, yaw: state.yaw, pitch: state.pitch,
          ringFill: state.ringFill, markers: state.hits.length,
          hiddenMarkers: state.hits.filter(function (h) { return h.hidden; }).length };
      },
      destroy: function () {
        global.cancelAnimationFrame(raf);
        if (ro) ro.disconnect(); else global.removeEventListener('resize', resize);
      }
    };
  }

  NS.mountain = {
    create: create,
    /* nur für kopflose Prüfungen */
    _geom: {
      buildField: buildField, buildContours: buildContours, buildRoute: buildRoute,
      sampleH: sampleH, routeAt: routeAt,
      frame: frame, makeCam: makeCam, projectPt: projectPt, polesFor: polesFor,
      LETTER_R: LETTER_R, LETTER_H: LETTER_H, CARDINAL_A: [0, Math.PI / 2, Math.PI, -Math.PI / 2],
      buildSilhouette: buildSilhouette,
      C: { Z_MAX: Z_MAX, PLATE_R: PLATE_R, RING_R: RING_R, TERRAIN_R: TERRAIN_R,
           PITCH_DEF: PITCH_DEF, PITCH_MIN: PITCH_MIN, PITCH_MAX: PITCH_MAX, CAM_F: CAM_F }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
