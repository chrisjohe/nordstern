/* NORDSTERN — Net-Worth-Verlauf.
   SVG, damit die Linie bei jeder Fenstergröße scharf bleibt. Atmosphärisch,
   aber messgenau: Fadenkreuz, exakte Werte, Vorjahresvergleich. */
(function (global) {
  'use strict';
  var NS = global.NORDSTERN || (global.NORDSTERN = {});
  var U = NS.util;

  var RANGES = [
    { id: '1y', label: '1 year', months: 13 },
    { id: '5y', label: '5 years', months: 61 },
    { id: '10y', label: '10 years', months: 121 },
    { id: 'all', label: 'All', months: 0 }
  ];

  /* Drei Lesarten desselben Verlaufs, von innen nach außen:
     Net = was übrig bleibt, Total = was da ist, Invested = was arbeitet.
     Net steht vorn, weil die Kennzahlen darüber und die Struktur darunter
     ebenfalls Net Worth meinen — die Route rechts dagegen misst Invested.
     `field` und `past` benennen dieselbe Größe heute und vor einem Jahr;
     die gestrichelte Spur muss der gezeigten Reihe folgen, sonst vergleicht
     sie Äpfel mit Birnen. */
  var SERIES = [
    { id: 'net', label: 'Net', field: 'value', past: 'yearAgo',
      lead: 'Net worth', title: 'Net worth — assets minus liabilities' },
    { id: 'total', label: 'Total', field: 'assets', past: 'assetsYearAgo',
      lead: 'Total assets', title: 'Total assets — before liabilities' },
    { id: 'invested', label: 'Invested', field: 'investment', past: 'investmentYearAgo',
      lead: 'Invested assets', title: 'Invested assets — the basis of the seven stations' }
  ];

  function seriesDef(id) {
    return SERIES.filter(function (s) { return s.id === id; })[0] || SERIES[0];
  }

  function niceStep(span, target) {
    var raw = span / target;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    var step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    return step * mag;
  }

  function create(root, bus) {
    /* Zwei Arten von Schalter, deshalb zwei Gruppen — und in dieser Reihenfolge:
       erst was gezeigt wird, dann über welchen Zeitraum. Die Reihe ist die
       größere Entscheidung, sie steht deshalb vor den Jahren. */
    var seriesBox = U.make('div', { class: 'series', role: 'group', 'aria-label': 'Series' });
    var rangeBox = U.make('div', { class: 'range', role: 'group', 'aria-label': 'Time range' });
    var tools = U.make('div', { class: 'chart-tools' }, [
      seriesBox,
      U.make('span', { class: 'range-sep', 'aria-hidden': 'true' }),
      rangeBox
    ]);
    var head = U.make('div', { class: 'panel-head' }, [
      U.make('h2', { class: 'panel-title', text: 'History' }), tools
    ]);
    var body = U.make('div', { class: 'chart-body' });
    var tip = U.make('div', { class: 'chart-tip', 'aria-hidden': 'true' });
    body.appendChild(tip);
    root.appendChild(head);
    root.appendChild(body);

    var state = { range: '5y', series: 'net', view: null, pts: [], geom: null, hoverIdx: null, arrive: false, w: 0, h: 0, drawnAt: 0 };

    /* Der Verlauf zeigt genau eine Reihe. Der Schalter tauscht sie aus, statt
       eine zweite danebenzulegen — dieselbe Linie, dieselbe Fläche, derselbe
       Puls, nur andere Zahlen darunter. */
    SERIES.forEach(function (s) {
      var b = U.make('button', {
        type: 'button', class: 'range-btn', text: s.label, 'data-series': s.id,
        title: s.title, 'aria-pressed': String(s.id === state.series)
      });
      b.addEventListener('click', function () {
        state.series = s.id;
        U.els('.range-btn', seriesBox).forEach(function (x) {
          x.setAttribute('aria-pressed', String(x.getAttribute('data-series') === s.id));
        });
        state.arrive = true;                 // andere Reihe, andere Linie
        render();
      });
      seriesBox.appendChild(b);
    });

    RANGES.forEach(function (r) {
      var b = U.make('button', {
        type: 'button', class: 'range-btn', text: r.label, 'data-range': r.id,
        'aria-pressed': String(r.id === state.range)
      });
      b.addEventListener('click', function () {
        state.range = r.id;
        U.els('.range-btn', rangeBox).forEach(function (x) {
          x.setAttribute('aria-pressed', String(x.getAttribute('data-range') === r.id));
        });
        state.arrive = true;                 // anderer Zeitraum, andere Linie
        render();
      });
      rangeBox.appendChild(b);
    });

    var svg = null;

    function slice() {
      var s = state.view.series;
      var r = RANGES.filter(function (x) { return x.id === state.range; })[0];
      if (!r.months || s.length <= r.months) return s;
      return s.slice(s.length - r.months);
    }

    function render() {
      if (!state.view) return;
      body.querySelectorAll('svg').forEach(function (n) { n.remove(); });
      var rect = body.getBoundingClientRect();
      var w = Math.max(260, rect.width), h = Math.max(120, rect.height);
      state.w = Math.round(rect.width); state.h = Math.round(rect.height);
      var pad = { l: 8, r: 16, t: 14, b: 20 };
      /* Eine Reihe, drei Quellen. Alles darunter — Fläche, Schein, Lichtsäule,
         Puls, Fadenkreuz — rechnet weiter mit `value` und weiß nicht, welche
         der drei gerade gilt. */
      var src = slice();
      if (src.length < 2) return;
      var sr = seriesDef(state.series);
      var data = src.map(function (d) {
        return {
          key: d.key, index: d.index, assets: d.assets, liabilities: d.liabilities,
          netWorth: d.value, investment: d.investment,
          value: d[sr.field],
          yearAgo: d[sr.past]
        };
      });

      var min = Infinity, max = -Infinity;
      data.forEach(function (d) { if (d.value < min) min = d.value; if (d.value > max) max = d.value; });
      var span = max - min || Math.abs(max) || 1;
      min -= span * 0.16; max += span * 0.14;
      if (min > 0 && min < span * 0.5) min = 0;

      var iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
      /* Die Waagerechte ist Zeit, nicht Reihenfolge.

         Nach Index verteilt sieht ein halbes Jahr ohne Eintrag aus wie ein
         gewöhnlicher Monatsschritt — die Kurve wird flacher, und man hält es
         für ruhige Monate statt für fehlende. Der Abstand kommt deshalb aus
         dem Monatsschlüssel. Ist die Reihe lückenlos, ist es dieselbe Achse
         wie zuvor; steht sie ganz auf einem Monat (Doppelspalten), bleibt es
         beim Index, weil es sonst keine Strecke gäbe. */
      var t0 = U.monthNo(data[0].key);
      var tSpan = U.monthNo(data[data.length - 1].key) - t0;
      var at = data.map(function (d, i) {
        return tSpan > 0 ? (U.monthNo(d.key) - t0) / tSpan : i / (data.length - 1);
      });
      var X = function (i) { return pad.l + at[i] * iw; };
      var Y = function (v) { return pad.t + ih - ((v - min) / (max - min)) * ih; };
      function isGap(i) { return i > 0 && U.monthNo(data[i].key) - U.monthNo(data[i - 1].key) > 1; }

      var edge = Math.min(0.16, Math.max(28, iw * 0.075) / iw);
      var g = U.svg('svg', { class: 'chart-svg', viewBox: '0 0 ' + w + ' ' + h, width: w, height: h,
        preserveAspectRatio: 'none', role: 'img',
        'aria-label': sr.lead + ' from ' +
          U.monthLong(data[0].key) + ' to ' + U.monthLong(data[data.length - 1].key) });

      var defs = U.svg('defs', {}, [
        /* Die Fläche als Polarlicht-Vorhang. Der Verlauf hängt an der Bounding-Box
           der Fläche, nicht am Chart: Offset 0 sitzt damit immer auf dem höchsten
           Punkt der gerade sichtbaren Kurve — der Kamm leuchtet, egal welcher
           Zeitraum gewählt ist. Reihenfolge wie am echten Himmel und wie in der
           Kapitelzeile darüber: Violett oben, Grün darunter, Blau am Boden.
           Bewusst nur als Wäsche mit kleiner Deckkraft — Grün heißt in diesem
           Programm „erreicht" und Violett „Vorjahr"; als Fläche darf die Farbe
           Atmosphäre sein, als Strich wäre sie eine Aussage. */
        U.svg('linearGradient', { id: 'nsFill', x1: '0', y1: '0', x2: '0', y2: '1' }, [
          U.svg('stop', { offset: '0', 'stop-color': '#9085e9', 'stop-opacity': '0.26' }),
          U.svg('stop', { offset: '0.26', 'stop-color': '#2fbd8b', 'stop-opacity': '0.16' }),
          U.svg('stop', { offset: '0.58', 'stop-color': '#3987e5', 'stop-opacity': '0.11' }),
          U.svg('stop', { offset: '1', 'stop-color': '#3987e5', 'stop-opacity': '0' })
        ]),
        /* Blende für die Vorjahreslinie: an beiden Rändern sichtbar, zur Mitte
           hin ausgeblendet — die Spur bleibt angedeutet, ohne den Chart zuzustellen. */
        U.svg('linearGradient', { id: 'nsYaEdge', gradientUnits: 'userSpaceOnUse',
          x1: pad.l, y1: 0, x2: w - pad.r, y2: 0 }, [
          U.svg('stop', { offset: '0', 'stop-color': '#fff' }),
          U.svg('stop', { offset: edge.toFixed(4), 'stop-color': '#000' }),
          U.svg('stop', { offset: (1 - edge).toFixed(4), 'stop-color': '#000' }),
          U.svg('stop', { offset: '1', 'stop-color': '#fff' })
        ]),
        U.svg('mask', { id: 'nsYaMask', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: w, height: h }, [
          U.svg('rect', { x: 0, y: 0, width: w, height: h, fill: 'url(#nsYaEdge)' })
        ]),
        /* Beim Zeigen wandert ein Fenster mit dem Zeiger mit — man sieht ein
           Stück vor und zurück, nicht die ganze Linie. */
        U.svg('linearGradient', { id: 'nsYaCursor', gradientUnits: 'userSpaceOnUse',
          x1: 0, y1: 0, x2: 1, y2: 0 }, [
          U.svg('stop', { offset: '0', 'stop-color': '#000' }),
          U.svg('stop', { offset: '0.32', 'stop-color': '#fff' }),
          U.svg('stop', { offset: '0.68', 'stop-color': '#fff' }),
          U.svg('stop', { offset: '1', 'stop-color': '#000' })
        ]),
        U.svg('mask', { id: 'nsYaWindow', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: w, height: h }, [
          U.svg('rect', { x: 0, y: 0, width: w, height: h, fill: 'url(#nsYaCursor)' })
        ]),
        U.svg('linearGradient', { id: 'nsBeam', x1: '0', y1: '1', x2: '0', y2: '0' }, [
          U.svg('stop', { offset: '0', 'stop-color': '#eaf2ff', 'stop-opacity': '0.42' }),
          U.svg('stop', { offset: '1', 'stop-color': '#eaf2ff', 'stop-opacity': '0' })
        ]),
        U.svg('linearGradient', { id: 'nsLine', x1: '0', y1: '0', x2: '1', y2: '0' }, [
          U.svg('stop', { offset: '0', 'stop-color': '#4d80c0' }),
          U.svg('stop', { offset: '0.72', 'stop-color': '#7fb2e5' }),
          U.svg('stop', { offset: '1', 'stop-color': '#eaf2ff' })
        ])
      ]);
      g.appendChild(defs);

      /* Orientierungslinien */
      var step = niceStep(max - min, 3.2);
      var gy = U.svg('g', { class: 'chart-grid' });
      for (var v = Math.ceil(min / step) * step; v <= max; v += step) {
        var y = Y(v);
        gy.appendChild(U.svg('line', { x1: pad.l, x2: w - pad.r, y1: y, y2: y }));
        var t = U.svg('text', { x: pad.l + 2, y: y - 5, class: 'chart-ylab' });
        t.textContent = U.eurShort(v);
        gy.appendChild(t);
      }
      g.appendChild(gy);

      /* Jahresmarken */
      var gx = U.svg('g', { class: 'chart-xlab' });
      var lastYear = null, minGap = iw / 9;
      var lastX = -999;
      data.forEach(function (d, i) {
        var year = d.key.slice(0, 4);
        if (year === lastYear) return;
        lastYear = year;
        var x = X(i);
        if (x - lastX < minGap) return;
        lastX = x;
        var tx = U.svg('text', { x: x, y: h - 6 });
        tx.textContent = data.length <= 14 ? U.monthShort(d.key) : year;
        gx.appendChild(tx);
      });
      g.appendChild(gx);

      /* Fläche + Linie.

         Über eine Lücke hinweg bricht der Strich ab; die Strecke dorthin
         bekommt stattdessen einen gestrichelten Steg. Zwischen zwei Ständen,
         die ein halbes Jahr auseinanderliegen, ist die Gerade eine Behauptung
         über sechs Monate, die niemand eingetragen hat.

         Die Fläche läuft weiter durch: sie ist Atmosphäre, kein Wert — dieselbe
         Trennung wie oben bei den Farben. Sie braucht ohnehin einen
         geschlossenen Umriss, und ein Vorhang mit Löchern sähe aus wie ein
         zweiter Verlauf. */
      var dFull = '', dLine = '', dGap = '';
      data.forEach(function (d, i) {
        var x = X(i).toFixed(1), y = Y(d.value).toFixed(1);
        dFull += (i ? 'L' : 'M') + x + ' ' + y;
        if (isGap(i)) {
          dGap += 'M' + X(i - 1).toFixed(1) + ' ' + Y(data[i - 1].value).toFixed(1) + 'L' + x + ' ' + y;
        }
        dLine += (i && !isGap(i) ? 'L' : 'M') + x + ' ' + y;
      });
      var dArea = dFull + 'L' + X(data.length - 1).toFixed(1) + ' ' + (pad.t + ih) + 'L' + X(0).toFixed(1) + ' ' + (pad.t + ih) + 'Z';
      g.appendChild(U.svg('path', { d: dArea, class: 'chart-fill', fill: 'url(#nsFill)' }));
      if (dGap) g.appendChild(U.svg('path', { d: dGap, class: 'chart-bridge', fill: 'none' }));

      /* Vorjahreslinie */
      var yaPts = data.filter(function (d) { return d.yearAgo != null; });
      if (yaPts.length > 3) {
        var dYa = '';
        data.forEach(function (d, i) {
          if (d.yearAgo == null) return;
          dYa += (dYa ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(d.yearAgo).toFixed(1);
        });
        g.appendChild(U.svg('path', { d: dYa, class: 'chart-ya chart-ya-stub', fill: 'none',
          mask: 'url(#nsYaMask)' }));
        g.appendChild(U.svg('path', { d: dYa, class: 'chart-ya chart-ya-full', fill: 'none',
          mask: 'url(#nsYaWindow)' }));
      }

      var glow = U.svg('path', { d: dLine, class: 'chart-glow', fill: 'none' });
      var line = U.svg('path', { d: dLine, class: 'chart-line', fill: 'none', stroke: 'url(#nsLine)' });
      g.appendChild(glow);
      g.appendChild(line);

      /* Ankunft: die Linie zeichnet sich einmal von links nach rechts.
         Die Länge steht fest, ohne zu messen — der Pfad ist ein Streckenzug
         durch bekannte Punkte, also ist seine Länge deren Summe. getTotalLength
         gäbe dasselbe, existiert aber nicht in jeder Umgebung, in der diese
         Datei laufen muss.
         Der Auslöser ist bewusst kein Rendern: gerendert wird auch bei jedem
         Zug am Schieberegler und bei jeder Fenstergrösse. Gezeichnet wird nur,
         wenn wirklich eine andere Linie entsteht — neue Mappe, anderer
         Zeitraum, andere Reihe. */
      if (state.arrive) {
        var len = 0;
        for (var q = 1; q < data.length; q++) {
          if (isGap(q)) continue;            /* was nicht gezeichnet wird, zählt nicht mit */
          var ddx = X(q) - X(q - 1), ddy = Y(data[q].value) - Y(data[q - 1].value);
          len += Math.sqrt(ddx * ddx + ddy * ddy);
        }
        [glow, line].forEach(function (n) {
          n.style.setProperty('--len', len.toFixed(1));
          n.style.strokeDasharray = len.toFixed(1);
          n.classList.add('is-drawing');
        });
        g.classList.add('is-arriving');
        state.arrive = false;
        state.drawnAt = Date.now();
      }

      /* Letzter Punkt — und die Lichtsäule, die ihn mit dem Nordstern verbindet */
      var lx = X(data.length - 1), ly = Y(data[data.length - 1].value);
      g.appendChild(U.svg('rect', {
        x: lx - 1.1, y: 0, width: 2.2, height: Math.max(0, ly),
        fill: 'url(#nsBeam)', class: 'chart-beam'
      }));
      g.appendChild(U.svg('circle', { cx: lx, cy: ly, r: 9, class: 'chart-last-halo' }));
      /* Der Herzschlag der linken Hälfte: ein Ring, der im Takt des Sterns aus
         dem letzten Datenpunkt läuft und vergeht. Kein wandernder Balken —
         die Stelle bleibt, nur die Welle geht. */
      g.appendChild(U.svg('circle', { cx: lx, cy: ly, r: 3.2, class: 'chart-last-ping' }));
      g.appendChild(U.svg('circle', { cx: lx, cy: ly, r: 3.2, class: 'chart-last' }));

      /* Fadenkreuz */
      var cross = U.svg('g', { class: 'chart-cross', opacity: '0' }, [
        U.svg('line', { x1: 0, x2: 0, y1: pad.t, y2: pad.t + ih }),
        U.svg('circle', { cx: 0, cy: 0, r: 4 })
      ]);
      g.appendChild(cross);

      body.appendChild(g);
      state.geom = { X: X, Y: Y, at: at, data: data, pad: pad, w: w, h: h, cross: cross, ih: ih,
        yaCursor: g.querySelector('#nsYaCursor') };
    }

    function onMove(ev) {
      var geo = state.geom;
      if (!geo) return;
      var r = body.getBoundingClientRect();
      var x = ev.clientX - r.left;
      /* Nicht mehr zurückgerechnet, sondern gesucht: die Punkte stehen seit
         der echten Zeitachse nicht mehr in gleichen Abständen. Gemeint ist
         der nächstgelegene — auch mitten in einer Lücke. */
      var frac = (x - geo.pad.l) / (geo.w - geo.pad.l - geo.pad.r);
      var i = 0;
      for (var k = 1; k < geo.at.length; k++) {
        if (Math.abs(geo.at[k] - frac) < Math.abs(geo.at[i] - frac)) i = k;
      }
      var d = geo.data[i];
      var px = geo.X(i), py = geo.Y(d.value);
      geo.cross.setAttribute('opacity', '1');
      geo.cross.children[0].setAttribute('x1', px);
      geo.cross.children[0].setAttribute('x2', px);
      geo.cross.children[1].setAttribute('cx', px);
      geo.cross.children[1].setAttribute('cy', py);

      var delta = d.yearAgo != null ? d.value - d.yearAgo : null;
      var relY = NS.calc.rel(d.value, d.yearAgo);
      tip.innerHTML = '';
      tip.appendChild(U.make('div', { class: 'tip-key', text: U.monthLong(d.key) }));
      tip.appendChild(U.make('div', { class: 'tip-val', text: U.eur(d.value) }));
      /* Die große Zahl ist die gezeigte Reihe; darunter stehen die beiden
         Größen, die sie einordnen — je Reihe die, die sie nicht selbst ist.
         Net nennt seine Bestandteile, Total den Abzug und was bleibt,
         Invested sein Gewicht am Vermögen. */
      function row(label, node) {
        tip.appendChild(U.make('div', { class: 'tip-row' }, [U.make('span', { text: label }), node]));
      }
      if (state.series === 'invested') {
        row('Share of assets', U.make('b', { text: d.assets > 0 ? U.pct(d.value / d.assets) : '—' }));
        row('Net worth', U.make('b', { text: U.eur0(d.netWorth) }));
      } else if (state.series === 'total') {
        row('Liabilities', U.make('b', { class: 'neg', text: U.eur0(d.liabilities) }));
        row('Net worth', U.make('b', { text: U.eur0(d.netWorth) }));
      } else {
        row('Assets', U.make('b', { text: U.eur0(d.assets) }));
        row('Liabilities', U.make('b', { class: 'neg', text: U.eur0(d.liabilities) }));
      }
      tip.appendChild(U.make('div', { class: 'tip-row' }, [
        U.make('span', { text: 'vs. last year' }),
        U.make('b', { class: delta == null ? 'muted' : delta >= 0 ? 'pos' : 'neg',
          text: delta == null ? 'no year-ago value' : U.eurSigned(delta) + '  ' + U.pctSigned(relY) })
      ]));
      tip.classList.add('is-on');
      body.classList.add('is-probing');
      if (geo.yaCursor) {                     /* Sichtfenster der Vorjahreslinie mitführen */
        var half = Math.min(118, geo.w * 0.22);
        geo.yaCursor.setAttribute('x1', (px - half).toFixed(1));
        geo.yaCursor.setAttribute('x2', (px + half).toFixed(1));
      }
      /* Das Fenster hängt über dem Punkt, den es beschreibt, und darf dabei
         über den oberen Rand des Charts hinaus — über Schalter, Kapitelwort
         und notfalls die Kennzahlen. Am Rand abgefangen läge es genau dort,
         wo die Linie hinwill: oben rechts. Die Schalter stehen still und sind
         wieder da, sobald der Zeiger den Chart verlässt; die Linie ist das,
         was man gerade liest. Grenze ist der Fensterrand. */
      var tw = tip.offsetWidth || 190;
      var th = tip.offsetHeight || 96;
      tip.style.left = U.clamp(px - tw / 2, 4, geo.w - tw - 4) + 'px';
      tip.style.top = Math.max(py - th - 14, -(r.top - 4)) + 'px';
    }

    function onLeave() {
      if (state.geom) state.geom.cross.setAttribute('opacity', '0');
      tip.classList.remove('is-on');
      body.classList.remove('is-probing');
    }

    body.addEventListener('pointermove', onMove);
    body.addEventListener('pointerleave', onLeave);

    /* Der Beobachter meldet sich einmal von selbst, sobald er zu beobachten
       beginnt — mit derselben Grösse, die gerade gezeichnet wurde. Genau
       dieser Leerlauf hat die Ankunft der Linie gefressen: gezeichnet, und im
       nächsten Bild ohne Not neu gebaut, diesmal ohne Aufbau. Also wird nur
       neu gebaut, wenn die Fläche sich wirklich geändert hat — und wenn das
       mitten in der Ankunft passiert, fängt sie eben von vorn an. */
    var ro = global.ResizeObserver ? new ResizeObserver(function () {
      var r = body.getBoundingClientRect();
      if (Math.round(r.width) === state.w && Math.round(r.height) === state.h) return;
      if (state.drawnAt && Date.now() - state.drawnAt < 1400) state.arrive = true;
      render();
    }) : null;
    if (ro) ro.observe(body);

    return {
      clear: function () {
        state.view = null; state.arrive = false;
        body.querySelectorAll('svg').forEach(function (n) { n.remove(); });
      },
      setData: function (view, arrive) { state.view = view; if (arrive) state.arrive = true; render(); },
      render: render
    };
  }

  NS.chart = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
