/* NORDSTERN: finanzielle Position.
   Die wichtigste Zahl groß, die Veränderungen daneben, die Nebenkennzahlen
   in einer ruhigen Reihe darunter. */
(function (global) {
  'use strict';
  var NS = global.NORDSTERN || (global.NORDSTERN = {});
  var U = NS.util;

  function delta(label, d, fallback) {
    var cls = !d ? 'muted' : d.abs > 0 ? 'pos' : d.abs < 0 ? 'neg' : 'muted';
    return U.make('div', { class: 'delta ' + cls }, [
      U.make('span', { class: 'delta-lab', text: label }),
      U.make('span', { class: 'delta-abs', text: d ? U.eurSigned0(d.abs) : (fallback || '—') }),
      U.make('span', { class: 'delta-rel', text: d && d.rel != null ? U.pctSigned(d.rel) : '' })
    ]);
  }

  function kpi(label, value, sub, cls, title) {
    var box = U.make('div', { class: 'kpi ' + (cls || '') }, [
      U.make('span', { class: 'kpi-lab', text: label }),
      U.make('b', { class: 'kpi-val', text: value }),
      U.make('span', { class: 'kpi-sub', text: sub || '' })
    ]);
    if (title) box.setAttribute('title', title);
    return box;
  }

  function create(root) {
    var hero = U.make('div', { class: 'hero' });
    var kpis = U.make('div', { class: 'kpi-row' });
    root.appendChild(hero);
    root.appendChild(kpis);

    return {
      /* Leeren heisst hier wirklich leeren. Der Vorhang legt sich nur über die
         Bühne — was darunter steht, steht weiter da, und beim nächsten Blick
         durch eine Lücke steht dort der alte Vermögensstand. */
      clear: function () { hero.innerHTML = ''; kpis.innerHTML = ''; },
      setData: function (v) {
        hero.innerHTML = '';
        kpis.innerHTML = '';

        hero.appendChild(U.make('div', { class: 'hero-lab' }, [
          U.make('h2', { class: 'panel-title is-hero', text: 'Net worth' })
        ]));
        /* Ohne Cent, wie alles in diesem Block. Ein Vermögensstand auf zwei
           Nachkommastellen sagt eine Genauigkeit zu, die es nicht gibt: die
           Depotspalte der Mappe ist ein Kurs von einem Stichtag. */
        hero.appendChild(U.make('div', { class: 'hero-val', text: U.eur0(v.current.netWorth) }));
        /* Der Abstand steht in der Beschriftung, sobald er von der Regel
           abweicht — eine Quartalsreihe zeigt „vs. 3 months ago" statt eines
           „vs. last month", das drei Monate meint. */
        var momLabel = v.mom && v.mom.span !== 1 ? 'vs. ' + v.mom.span + ' months ago' : 'vs. last month';
        var yoyLabel = v.yoy && v.yoy.span !== 12 ? 'vs. ' + v.yoy.span + ' months ago' : 'vs. last year';
        var deltas = U.make('div', { class: 'hero-deltas' }, [
          delta(momLabel, v.mom),
          delta(yoyLabel, v.yoy, 'no year-ago value')
        ]);
        hero.appendChild(deltas);

        /* Spaltenweise gelesen: Vermögen/Verbindlichkeiten · Anteile · Tempo/Ziel ·
           Herkunft des Stands.
           Das Raster füllt sich spaltenweise, die Reihenfolge hier ist damit
           zugleich die sinnvolle Vorlesereihenfolge. */
        kpis.appendChild(kpi('Total assets', U.eur0(v.current.totalAssets),
          v.assetsMom && v.assetsMom.rel != null
            ? U.pctSigned(v.assetsMom.rel) + (v.assetsMom.span === 1 ? ' MoM' : ' vs. ' + v.assetsMom.span + ' mo') : ''));
        kpis.appendChild(kpi('Liabilities', U.eur0(v.current.liabilities),
          v.liabMom && v.liabMom.rel != null
            ? U.pctSigned(v.liabMom.rel) + (v.liabMom.span === 1 ? ' MoM' : ' vs. ' + v.liabMom.span + ' mo') : '', 'is-neg'));
        kpis.appendChild(kpi('Liquid share', U.pct(v.shares.liquid),
          U.eur0(v.current.liquid)));
        kpis.appendChild(kpi('Invested share', U.pct(v.shares.invested),
          U.eur0(v.current.investment)));
        /* Ein Vorzeichen bekommt in beide Richtungen seine Farbe. Rot für
           unten und Weiss für oben hiesse: das eine ist eine Nachricht, das
           andere der Normalzustand — und direkt darüber, bei den Deltas am
           Hero, sind beide Richtungen längst gefärbt. */
        kpis.appendChild(kpi('Portfolio pace', v.pace == null ? '—' : U.eurSigned0(v.pace),
          v.pace == null ? 'no year-ago value' : 'avg. per month, ' + v.paceSpan + ' months',
          v.pace == null ? '' : v.pace < 0 ? 'is-neg' : v.pace > 0 ? 'is-pos' : ''));
        /* Der Hebel steht neben dem Tempo: beides sagt nichts über den Stand,
           sondern über die Art, wie er zustande kommt. */
        kpis.appendChild(kpi('Leverage',
          U.mult(v.leverage.factor),
          v.leverage.debtRatio == null ? 'no assets'
            : U.pct(v.leverage.debtRatio) + ' of assets is debt',
          v.leverage.factor == null ? 'is-neg' : '',
          'Total assets divided by net worth. 1,00× is debt-free; 2,00× means half the ' +
          'balance sheet is borrowed. Without positive net worth there is no meaningful ' +
          'factor — the debt ratio below still holds.'));
        /* Vierte Spalte: woher der Stand kommt. Sie steht bei den Kennzahlen,
           nicht im Kopfbereich. */
        kpis.appendChild(kpi('As of', U.monthLong(v.monthKey), 'latest snapshot', 'is-meta'));
        kpis.appendChild(kpi('Snapshots', String(v.monthCount),
          v.firstKey ? 'since records began' : '', 'is-meta'));
      }
    };
  }

  NS.position = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
