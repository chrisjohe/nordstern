/* NORDSTERN — Vermögensinstrument.
   Kein Balken-, kein Säulendiagramm: eine Navigationsscheibe. Der äußere Ring
   trägt das Vermögen nach Sektionen, der innere Gegenring die Verbindlichkeiten
   — beide auf derselben Skala, sodass das Verhältnis unmittelbar ablesbar ist.
   Die exakten Beträge stehen in der Legende daneben, nicht nur im Tooltip. */
(function (global) {
  'use strict';
  var NS = global.NORDSTERN || (global.NORDSTERN = {});
  var U = NS.util;

  var SIZE = 268, C = SIZE / 2;
  var R_OUT = 108, W_OUT = 15;      // Vermögensring
  var R_IN = 82, W_IN = 9;          // Verbindlichkeiten
  var GAP = 0.030;                  // Fuge zwischen Sektoren (rad)

  /* Verbindlichkeiten tragen den Emberton der Tokens — hier als Hexwert, weil der
     Ring in einer SVG-Präsentationsangabe steckt. */
  var LIAB_TONE = '#c9352f';

  var TONE = {
    liquid:      '#b6d4f2',
    receivables: '#5f93cc',
    investment:  '#3987e5',
    tangible:    '#8f7fd0',
    retirement:  '#2fbd8b'
  };

  function polar(r, a) { return [C + Math.sin(a) * r, C - Math.cos(a) * r]; }

  function arcPath(r, a0, a1) {
    var p0 = polar(r, a0), p1 = polar(r, a1);
    /* Der Betrag, nicht die Differenz: ein Bogen kann auch rückwärts laufen,
       und dann ist er nicht plötzlich klein. */
    var large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
    var sweep = a1 > a0 ? 1 : 0;
    return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) +
      'A' + r + ' ' + r + ' 0 ' + large + ' ' + sweep + ' ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2);
  }

  /* Tönungen innerhalb einer Sektion: gleiche Farbe, heller werdend.
     Der größte Posten trägt den vollen Sektionston. */
  function hex(c) {
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  }
  function mix(a, b, t) {
    var A = hex(a), B = hex(b);
    return '#' + [0, 1, 2].map(function (i) {
      var v = Math.round(A[i] + (B[i] - A[i]) * t);
      return (v < 16 ? '0' : '') + v.toString(16);
    }).join('');
  }
  function tints(tone, n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(mix(tone, '#e9f2ff', n < 2 ? 0 : (i / (n - 1)) * 0.62));
    return out;
  }

  function create(root, bus) {
    root.appendChild(U.make('div', { class: 'panel-head' }, [
      U.make('h2', { class: 'panel-title', text: 'Structure' }),
      U.make('div', { class: 'panel-note', id: 'orbitNote' })
    ]));
    var wrap = U.make('div', { class: 'orbit-wrap' });
    var dial = U.make('div', { class: 'orbit-dial' });
    var legend = U.make('div', { class: 'orbit-legend' });
    /* Legende links, Scheibe rechts: so bekommt die Scheibe die volle Höhe
       der Spalte und darf in die Kapitelzeile hineinragen. */
    wrap.appendChild(legend); wrap.appendChild(dial);
    root.appendChild(wrap);

    var state = { view: null, hover: null, open: null, arrive: false };

    /* Bogen und Legendenzeile sind dieselbe Sache in zwei Ansichten — wer eines
       von beiden anfasst, hebt beide. Auch per Tastatur: Fokus zählt als Zeigen. */
    function linkHover(node, id) {
      node.addEventListener('pointerenter', function () { setHover(id); });
      node.addEventListener('pointerleave', function () { setHover(null); });
      node.addEventListener('focus', function () { setHover(id); });
      node.addEventListener('blur', function () { setHover(null); });
      return node;
    }

    /* Ankunft: ein Bogen zeichnet sich, statt dazustehen.
       `frac` und `off` sind Bruchteile einer vollen Umdrehung, keine Zeiten —
       die Dauer steht als Marke im Stylesheet, damit sie nur an einer Stelle
       lebt. Beide Ringe laufen dadurch mit derselben Winkelgeschwindigkeit:
       der kürzere ist früher fertig, was er auch sein soll — es zeichnet ein
       Stift, kein Balken füllt sich.
       Aufgedeckt wird immer vom Pfadanfang her — deshalb beginnt jeder Bogen
       dort, wo er auch beginnen soll: an der Zwölf. */
    function drawIn(node, len, frac, off) {
      if (!(len > 0)) return node;
      node.style.setProperty('--len', len.toFixed(1));
      node.style.strokeDasharray = len.toFixed(1);
      node.style.setProperty('--frac', Math.max(0.04, frac).toFixed(4));
      node.style.setProperty('--off', Math.max(0, off).toFixed(4));
      node.classList.add('is-drawing');
      return node;
    }
    var TURN = Math.PI * 2;

    /* ------------------------------------------------------------ Scheibe */
    function dialRoot(label) {
      var g = U.svg('svg', { viewBox: '-4 -4 276 276', class: 'orbit-svg', role: 'img', 'aria-label': label });
      /* Ruhige Teilung im Hintergrund — Navigationsscheibe statt Diagrammrahmen */
      var grid = U.svg('g', { class: 'orbit-grid' });
      for (var i = 0; i < 72; i++) {
        var a = i / 72 * Math.PI * 2;
        var r1 = R_OUT + W_OUT / 2 + 6, r2 = r1 + (i % 6 === 0 ? 7 : 3.5);
        var p1 = polar(r1, a), p2 = polar(r2, a);
        grid.appendChild(U.svg('line', { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1],
          'stroke-opacity': i % 6 === 0 ? 0.4 : 0.18 }));
      }
      grid.appendChild(U.svg('circle', { cx: C, cy: C, r: R_IN - W_IN / 2 - 9, class: 'orbit-inner-ring' }));
      g.appendChild(grid);
      return g;
    }

    /* Ein Ring aus Anteilen. `open` macht die Bögen zu Schaltflächen.
       `total` ist die Skala, auf der gezeichnet wird; `opts.pctOf` die Bezugs-
       größe, gegen die der Anteil ausgesprochen wird. Normalerweise dasselbe —
       auseinander gehen sie nur, wenn der Ring sich nicht mehr schliessen darf
       (siehe renderOverview). */
    function arcs(g, items, total, radius, width, opts) {
      var a0 = 0;
      var base = opts.pctOf || total;
      items.forEach(function (it, idx) {
        if (!(it.value > 0.005) || !(total > 0)) return;
        var sweep = (it.value / total) * Math.PI * 2;
        var pad = Math.min(GAP, sweep * 0.25);
        var at = {
          d: arcPath(radius, a0 + pad / 2, a0 + sweep - pad / 2),
          class: 'orbit-arc' + (opts.cls ? ' ' + opts.cls : ''),
          'stroke-width': width, stroke: it.tone,
          'data-id': it.key,
          'aria-label': it.name + ': ' + U.eur(it.value) + ', ' + U.pct(it.value / base)
        };
        if (opts.open) { at.tabindex = '0'; at.role = 'button'; }
        var path = U.svg('path', at);
        if (opts.open) {
          path.addEventListener('click', function () { openSection(it.id); });
          path.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') { ev.preventDefault(); openSection(it.id); }
          });
        }
        if (state.arrive) {
          var drawn = sweep - pad;
          drawIn(path, drawn * radius, drawn / TURN, (a0 + pad / 2) / TURN);
        }
        linkHover(path, it.key);
        g.appendChild(path);
        a0 += sweep;
      });
    }

    function core(g, label, value, back, neg) {
      var lab = U.svg('text', { x: C, y: C - 11, 'text-anchor': 'middle', class: 'orbit-core-lab' });
      lab.textContent = label;
      /* Ein negativer Net Worth ist keine Zahl wie jede andere in dieser
         Scheibe — er bekommt den Ton, den die Schulden auch aussen tragen. */
      var val = U.svg('text', { x: C, y: C + 15, 'text-anchor': 'middle',
        class: 'orbit-core-val' + (neg ? ' is-neg' : '') });
      val.textContent = value;
      g.appendChild(lab); g.appendChild(val);
      if (back) {
        var hint = U.svg('text', { x: C, y: C + 34, 'text-anchor': 'middle', class: 'orbit-core-back' });
        hint.textContent = '← back';
        g.appendChild(hint);
        var hit = U.svg('circle', { cx: C, cy: C, r: R_IN - W_IN / 2 - 9, class: 'orbit-core-hit',
          tabindex: '0', role: 'button', 'aria-label': 'Back to the overview' });
        hit.addEventListener('click', function () { openSection(null); });
        hit.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') { ev.preventDefault(); openSection(null); }
        });
        g.appendChild(hit);
      }
    }

    /* ------------------------------------------------------------ Legende */
    function row(id, tone, label, value, share, kind) {
      var r = U.make('div', {
        class: 'legend-row' + (kind === 'sum' ? ' is-sum' : ''), 'data-id': id
      }, [
        U.make('i', { class: 'legend-dot', style: tone ? 'background:' + tone : 'background:transparent' }),
        U.make('span', { class: 'legend-lab', text: label }),
        U.make('b', { class: 'legend-val' + (value < 0 ? ' neg' : ''), text: U.eur(value) }),
        U.make('span', { class: 'legend-pct', text: share == null ? '' : U.pct(share) })
      ]);
      return linkHover(r, id);
    }

    /* Zeilen, hinter denen eine Sektion steckt, sind Schaltflächen — und nur
       die: eine Zeile ohne Einzelposten führt nirgendwohin. */
    function openable(r, id) {
      r.classList.add('is-open-able');
      r.setAttribute('role', 'button');
      r.setAttribute('tabindex', '0');
      r.addEventListener('click', function () { openSection(id); });
      r.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') { ev.preventDefault(); openSection(id); }
      });
      return r;
    }

    function rule() { return U.make('div', { class: 'legend-rule' }); }

    function items(v, id) { return (v.sectionItems && v.sectionItems[id]) || []; }

    /* -------------------------------------------------------- Übersicht */
    function renderOverview(v) {
      var total = v.current.totalAssets;
      var liab = v.current.liabilities;
      var sections = v.sections.filter(function (s) { return s.value > 0.005; });

      /* Beide Ringe teilen sich eine Skala, und die ist der grössere der
         beiden Beträge — nicht das Vermögen.

         Solange das Vermögen überwiegt, ändert das nichts: der äussere Ring
         schliesst sich, der Gegenring bleibt kürzer, und die Lücke zwischen
         ihnen ist der Net Worth. Überwiegen die Schulden, dreht sich das um.
         Dann schliesst sich der innere Ring, und im äusseren bleibt offen,
         was fehlt — genau der negative Betrag, der in der Mitte steht.

         Der Gegenring darf dabei nicht in die Sättigung laufen: gedeckelt bei
         355° sähen 98 %, 116 % und 300 % gleich aus, und er hörte genau dort
         auf, etwas zu sagen, wo er am meisten zu sagen hätte. */
      /* `total` allein reicht als Skala nicht immer: eine negative Sektion
         (ein überzogenes Konto in „liquid" etwa) fällt aus `sections` heraus,
         zieht `total` aber weiter mit herunter. Ohne die Summe der wirklich
         gezeichneten, positiven Anteile in der Skala reichten deren Bögen
         dann über 360° hinaus. */
      var positive = sections.reduce(function (a, s) { return a + s.value; }, 0);
      var scale = Math.max(total, liab, positive);
      var short = liab > total ? liab - total : 0;

      var g = dialRoot('Assets ' + U.eur(total) + ', liabilities ' + U.eur(liab) +
        (short > 0 ? ', exceeding assets by ' + U.eur(short) : ''));
      arcs(g, sections.map(function (s) {
        return { id: s.id, key: s.id, name: s.label, value: s.value, tone: TONE[s.id] || '#7fb2e5' };
      /* Der Anteil bleibt am Vermögen gemessen — ausser `total` selbst ist
         zu klein dafür (derselbe Fall wie oben), dann tritt `positive` an
         seine Stelle, sonst läse eine einzelne Sektion über 100 %. */
      }), scale, R_OUT, W_OUT, { open: true, pctOf: Math.max(total, positive) });

      /* Die offene Stelle im Vermögensring bleibt nicht leer: eine blasse
         Spur im Schuldenton füllt sie. Eine Lücke allein läse sich als
         „hier ist nichts", und es ist das Gegenteil. */
      if (short > 0.005 && scale > 0) {
        var sh0 = (total / scale) * TURN + GAP / 2, sh1 = TURN - 0.004;
        var shp = U.svg('path', {
          d: arcPath(R_OUT, sh0, sh1),
          class: 'orbit-short', 'stroke-width': W_OUT, stroke: LIAB_TONE,
          'data-id': 'shortfall',
          'aria-label': 'Not covered by assets: ' + U.eur(short)
        });
        if (state.arrive) drawIn(shp, (sh1 - sh0) * R_OUT, (sh1 - sh0) / TURN, sh0 / TURN);
        g.appendChild(shp);
      }

      /* Innerer Gegenring: gegenläufig, auf derselben Skala — und immer von
         der Zwölf aus, wie der äussere auch. Er wird deshalb von 0 nach
         -liabSweep gezeichnet: dort beginnt sein Pfad, und dort beginnt auch
         sein Aufbau.

         Ein Bogen von 0 nach genau -2π hätte Anfang und Ende im selben Punkt
         und verschwände; ein Haar davor nicht. Dieselbe Hilfe nimmt die
         Fehlstrecke oben schon. Der Spalt ist 0,23° breit, bei diesem Radius
         ein Drittel Pixel. */
      var liabSweep = scale > 0 ? (liab / scale) * Math.PI * 2 : 0;
      g.appendChild(U.svg('circle', { cx: C, cy: C, r: R_IN, class: 'orbit-track', 'stroke-width': W_IN }));
      if (liabSweep > 0.001) {
        var lsw = Math.min(liabSweep, TURN - 0.004);
        var lp = U.svg('path', {
          d: arcPath(R_IN, 0, -lsw),
          class: 'orbit-arc orbit-liab' + (short > 0 ? ' is-over' : ''),
          'stroke-width': W_IN, stroke: LIAB_TONE, fill: 'none',
          'data-id': 'liabilities', tabindex: '0', role: 'button',
          'aria-label': 'Liabilities: ' + U.eur(liab) + ', ' + U.pct(total > 0 ? liab / total : 0) +
            ' of assets' + (short > 0 ? ' — ' + U.eur(short) + ' more than there is' : '')
        });
        if (state.arrive) drawIn(lp, lsw * R_IN, lsw / TURN, 0);
        lp.addEventListener('click', function () { openSection('liabilities'); });
        lp.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') { ev.preventDefault(); openSection('liabilities'); }
        });
        linkHover(lp, 'liabilities');
        g.appendChild(lp);
      }

      core(g, 'NET WORTH', U.eur0(v.current.netWorth), false, v.current.netWorth < 0);
      dial.appendChild(g);

      /* Legende: exakte Beträge, nicht nur im Tooltip */
      sections.forEach(function (s) {
        var r = row(s.id, TONE[s.id], s.label, s.value, s.share);
        if (items(v, s.id).length) openable(r, s.id);
        legend.appendChild(r);
      });
      legend.appendChild(rule());
      legend.appendChild(row('assets', null, 'Total assets', total, null, 'sum'));
      var lr = row('liabilities', LIAB_TONE, 'Liabilities', -liab, total > 0 ? liab / total : null);
      if (items(v, 'liabilities').length) openable(lr, 'liabilities');
      legend.appendChild(lr);
      legend.appendChild(rule());
      legend.appendChild(row('nw', null, 'Net worth', v.current.netWorth, null, 'sum'));
    }

    /* ------------------------------------------- Blick in eine Sektion */
    function renderSection(v, id) {
      var isLiab = id === 'liabilities';
      var sec = v.sections.filter(function (s) { return s.id === id; })[0];
      var label = isLiab ? 'Liabilities' : (sec ? sec.label : id);
      var list = items(v, id);
      /* Die Summe kommt aus der Mappe, nicht aus dieser Liste. Solange alle
         Posten positiv sind, ist das dasselbe — sobald einer negativ ist,
         nicht mehr, und dann muss hier stehen, was auch in der Übersicht
         steht. Zwei verschiedene Zahlen für dieselbe Sektion auf demselben
         Schirm wären das Schlimmste von beidem. */
      var sum = isLiab ? v.current.liabilities : (sec ? sec.value : 0);
      /* Der Ring trägt nur, was eine Länge haben kann. Negative Stände haben
         keine — sie stehen in der Legende, mit ihrem echten Betrag und im Ton
         der Verbindlichkeiten, und sie erscheinen im Prozentsatz als das, was
         sie sind: ein Abzug. Die positiven Anteile schliessen den Kreis unter
         sich, sonst zeigte der Ring eine Sektion, die es so nicht gibt. */
      var pos = list.filter(function (it) { return it.value > 0.005; });
      var posSum = pos.reduce(function (a, b) { return a + b.value; }, 0);
      var tone = isLiab ? LIAB_TONE : (TONE[id] || '#7fb2e5');
      var tone_ = tints(tone, list.length);
      var total = v.current.totalAssets;

      var g = dialRoot(label + ': ' + list.length + ' items, ' + U.eur(sum));
      arcs(g, list.map(function (it, i) {
        return { id: id, key: 'item-' + i, name: it.name, value: it.value, tone: tone_[i] };
      }), posSum, R_OUT, W_OUT, { open: false, pctOf: sum });

      /* Innerer Ring: was diese Sektion im Ganzen wiegt. */
      var share = total > 0 ? sum / total : 0;
      g.appendChild(U.svg('circle', { cx: C, cy: C, r: R_IN, class: 'orbit-track', 'stroke-width': W_IN }));
      if (share > 0.001) {
        g.appendChild(U.svg('path', {
          d: arcPath(R_IN, 0, Math.min(share, 0.999) * Math.PI * 2),
          class: 'orbit-arc orbit-weight', 'stroke-width': W_IN, stroke: tone,
          'data-id': 'weight', 'aria-hidden': 'true'
        }));
      }

      core(g, label.toUpperCase(), U.eur0(sum), true);
      dial.appendChild(g);

      var back = U.make('button', { type: 'button', class: 'legend-back', text: '← All assets' });
      back.addEventListener('click', function () { openSection(null); });
      legend.appendChild(back);
      list.forEach(function (it, i) {
        var neg = it.value < 0;
        var r = row('item-' + i, neg ? LIAB_TONE : tone_[i], it.name,
          isLiab ? -it.value : it.value, sum !== 0 ? it.value / sum : null);
        if (neg) {
          r.classList.add('is-owed');
          r.setAttribute('title', 'A negative balance — it reduces ' + label +
            ' and has no arc on the dial.');
        }
        legend.appendChild(r);
      });
      legend.appendChild(rule());
      legend.appendChild(row('sum', null, label, isLiab ? -sum : sum,
        total > 0 ? sum / total : null, 'sum'));
      legend.appendChild(U.make('p', { class: 'legend-foot', text: 'of total assets' }));
    }

    function render() {
      var v = state.view;
      if (!v) return;
      dial.innerHTML = ''; legend.innerHTML = '';
      state.hover = null;
      root.classList.remove('has-hover');
      /* Die Marke sagt nur „gerade jetzt": Kern und Legende blenden mit den
         Ringen auf, und beim nächsten Rendern steht wieder alles still da. */
      root.classList.toggle('is-arriving', !!state.arrive);
      if (state.open && items(v, state.open).length) renderSection(v, state.open);
      else { state.open = null; renderOverview(v); }
      state.arrive = false;
    }

    function openSection(id) {
      state.open = state.open === id ? null : id;
      render();
      /* Der Fokus darf nicht ins Leere fallen, wenn die Scheibe neu entsteht. */
      var next = state.open ? legend.querySelector('.legend-back')
        : legend.querySelector('.legend-row.is-open-able');
      if (next && next.focus) next.focus();
    }

    root.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && state.open) { ev.stopPropagation(); openSection(null); }
    });

    function setHover(id) {
      state.hover = id;
      U.els('[data-id]', root).forEach(function (n) {
        n.classList.toggle('is-hot', !!id && n.getAttribute('data-id') === id);
      });
      root.classList.toggle('has-hover', !!id);
    }

    return {
      clear: function () {
        state.view = null; state.open = null; state.hover = null; state.arrive = false;
        dial.innerHTML = ''; legend.innerHTML = '';
        root.classList.remove('has-hover');
        root.classList.remove('is-arriving');
      },
      setData: function (v, arrive) { state.view = v; if (arrive) state.arrive = true; render(); }
    };
  }

  NS.orbit = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
