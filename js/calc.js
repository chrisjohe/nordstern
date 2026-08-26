/* NORDSTERN — Ableitungen.
   Alles, was aus dem normalisierten Modell + den Einstellungen berechnet wird.
   Keine Kenntnis über den Aufbau der Arbeitsmappe, keine DOM-Berührung. */
(function (global) {
  'use strict';

  var NS = global.NORDSTERN || (global.NORDSTERN = {});
  var U = NS.util;

  /* Die acht Meilensteine. `months` = Vielfaches der monatlichen Gesamtausgaben.
     Contingency zählt gegen die liquiden Mittel, alle übrigen gegen das
     investierte Vermögen. `t` ist die Position auf der Bergroute (0…1) und
     entspricht dem Kontrollpunkt der Route in js/ui/mountain.js — die Werte
     stehen deshalb als Bruch 'Kontrollpunkt / letzter Kontrollpunkt'; tests/geometry.mjs prüft, dass beide Seiten
     dasselbe meinen. */
  var MILESTONES = [
    { id: 'contingency', name: 'Contingency',   term: 'Emergency fund', months: 3, basis: 'liquid',
      meaning: 'Three months of expenses, liquid. Room to breathe.',
      basisLabel: '3 × monthly expenses, covered by liquid assets' },
    { id: 'snowball',    name: 'First Light',   term: 'Snowball',     months: 6,   basis: 'investment', t: 3 / 34,
      meaning: 'The portfolio carries half a year. Compounding starts.',
      basisLabel: '6 × monthly expenses, covered by investments' },
    { id: 'fyou',        name: 'Velocity',      term: 'F-You Money',  months: 12,  basis: 'investment', t: 8 / 34,
      meaning: 'A year of expenses invested — enough to walk away.',
      basisLabel: '1 × annual expenses, covered by investments' },
    { id: 'coast',       name: 'Stable Course', term: 'Coast FI',     months: 60,  basis: 'investment', t: 13 / 34,
      meaning: 'Five years of expenses. A break of years, not months.',
      basisLabel: '5 × annual expenses, covered by investments' },
    { id: 'barista',     name: 'Aurora',        term: 'Barista FI',   months: 120, basis: 'investment', t: 18 / 34,
      meaning: 'Ten years of expenses. Part-time covers the rest.',
      basisLabel: '10 × annual expenses, covered by investments' },
    { id: 'semi',        name: 'Passage',       term: 'Semi FI',      months: 240, basis: 'investment', t: 21 / 34,
      meaning: 'Twenty years of expenses. Halfway to independent.',
      basisLabel: '20 × annual expenses, covered by investments' },
    { id: 'lean',        name: 'Polaris',       term: 'Lean FI',      months: 300, basis: 'investment', t: 26 / 34,
      meaning: '25 years of expenses. The 4 % rule starts here.',
      basisLabel: '25 × annual expenses (4 % rule), covered by investments' },
    { id: 'fat',         name: 'Apex',          term: 'Fat FI',       months: 396, basis: 'investment', t: 34 / 34,
      meaning: '33 years of expenses — the 3 % rule, with slack.',
      basisLabel: '33 × annual expenses (3 % rule), covered by investments' }
  ];

  /* Die Namen der Sektionen in der Oberfläche — nicht die in der Mappe. Dort
     heißen die Zeilen weiter „Liquid assets", „Receivables towards third
     party" und „Tangible assets"; der Importer sucht danach, und diese Tabelle
     hat damit nichts zu tun. Kurz und ohne „assets": In einer Spalte, die
     „Structure" überschrieben ist und deren Summe „Total assets" heißt, ist
     jede Zeile ohnehin ein Vermögensposten. */
  var SECTION_LABELS = {
    liquid: 'Liquid',
    receivables: 'Claims',
    investment: 'Investments',
    tangible: 'Property',
    retirement: 'Retirement'
  };

  /* Die Veränderung, bezogen auf den Betrag des Ausgangswerts.

     Der Betrag im Nenner, nicht der Wert: von −100 auf −50 ist eine
     Verbesserung um 50 %, nicht um −50 %. Der Zähler muss dann aber die
     Differenz sein — `now / |before| − 1` ergäbe hier −150 % und drehte das
     Vorzeichen um. Bei einem Net Worth im Minus, dem Fall, in dem die Zahl am
     meisten sagt, wäre das genau verkehrt. */
  function rel(now, before) {
    if (!U.isNum(now) || !U.isNum(before) || before === 0) return null;
    return (now - before) / Math.abs(before);
  }

  /* Der Snapshot vor `i`, dessen Abstand `target` Monaten am nächsten kommt
     — nicht der `target`-te Index davor.

     Die Reihe kommt aus einer Tabelle. Dort können Monate fehlen (wer
     quartalsweise einträgt, hat nie einen echten Vormonat), doppelt stehen
     (zwei Spalten für denselben Monat) oder in falscher Reihenfolge liegen;
     `i - n` heisst dann weder „vor einem Jahr" noch „im Vormonat". Gesucht
     wird deshalb rückwärts über den Schlüsselabstand, nicht über den Index.
     Ohne Toleranz (`tol == null`, „Vormonat") zählt der erste eigenständige
     Snapshot davor, so weit zurück er auch liegt — Doppelungen (Abstand 0)
     werden übersprungen, es gibt keine Geschichte zu erzählen. Mit Toleranz
     (`tol`, „Vorjahr") gewinnt der Treffer mit dem kleinsten Abstand zu
     `target`; bei Gleichstand bleibt der zuerst gefundene, also der zeitlich
     nähere. Kein Treffer ist besser als ein falscher: die Oberfläche zeigt
     dafür einen Strich. */
  function nearest(months, i, target, tol) {
    var here = U.monthNo(months[i] && months[i].key);
    if (here == null) return null;
    var best = null, bestSpan = null, bestDiff = null;
    for (var j = i - 1; j >= 0; j--) {
      var there = U.monthNo(months[j] && months[j].key);
      if (there == null) continue;
      var d = here - there;
      if (d === 0) continue;                  // Doppelspalte, kein eigener Monat
      if (tol == null) {
        if (d >= 1) return { m: months[j], span: d };
      } else {
        if (d > target + tol) break;           // ab hier wird der Abstand nur noch größer
        var diff = Math.abs(d - target);
        if (diff <= tol && (best === null || diff < bestDiff)) {
          best = months[j]; bestSpan = d; bestDiff = diff;
        }
      }
    }
    return tol == null ? null : (best ? { m: best, span: bestSpan } : null);
  }

  /** Fortschritt entlang der Bergroute aus dem investierten Vermögen. */
  function routePosition(stations, invested) {
    if (!stations.length) return 0;
    if (invested <= 0) return 0;
    /* Ohne Ausgaben stehen alle Ziele auf null. Dann ist keines „erreicht" —
       es gibt schlicht keine Route. Ohne diese Zeile fällt der Weg unten
       durch jede Verzweigung und endet auf 1: die Figur stünde am Gipfel,
       während unter dem Berg „no station reached" steht. */
    if (!(stations[stations.length - 1].target > 0)) return 0;
    if (invested < stations[0].target) {
      return stations[0].t * (invested / stations[0].target);
    }
    for (var i = 0; i < stations.length - 1; i++) {
      var a = stations[i], b = stations[i + 1];
      if (invested < b.target) {
        var f = (invested - a.target) / (b.target - a.target);
        return a.t + (b.t - a.t) * f;
      }
    }
    return 1;
  }

  function derive(model, settings) {
    if (!model || !model.months || !model.months.length) return null;

    var months = model.months;
    var i = model.currentIndex;
    var current = months[i];
    var prev = nearest(months, i, 1, null);
    var yearAgo = nearest(months, i, 12, 1);

    /* --- Ausgaben ------------------------------------------------------- */
    var totalMonthly = Math.max(0, Number(settings.monthlyExpenses) || 0);
    var totalAnnual = totalMonthly * 12;

    /* --- Position ------------------------------------------------------- */
    var totalAssets = current.totalAssets;
    var shares = {
      liquid: totalAssets > 0 ? current.liquid / totalAssets : null,
      invested: totalAssets > 0 ? current.investment / totalAssets : null
    };

    /* Der Eigenkapitalhebel: wie viel Bilanz auf einem Euro eigenem Geld
       steht. 1,0× heisst schuldenfrei, 2,0× heisst, die Hälfte ist geliehen.

       Bewusst nicht „investiert / Net Worth", was naheliegt und trügt: diese
       Zahl steigt auch dann, wenn nur das Eigenkapital wächst, und stand in
       der Beispielreihe bei sechsfachem Hebel niedriger als heute bei
       zweifachem. Sie misst den Hebel nicht, sie mischt ihn mit dem Erfolg.

       Bei Net Worth <= 0 gibt es keinen sinnvollen Faktor — dann bleibt der
       Schuldenanteil, der auch dort noch etwas sagt (und über 100 % geht). */
    var leverage = {
      factor: current.netWorth > 0 ? totalAssets / current.netWorth : null,
      debtRatio: totalAssets > 0 ? current.liabilities / totalAssets : null
    };

    var sections = model.sectionOrder.map(function (id) {
      return {
        id: id,
        label: SECTION_LABELS[id] || id,
        value: current[id],
        share: totalAssets > 0 ? current[id] / totalAssets : 0
      };
    });

    /* Einzelposten je Sektion — für den Blick in eine Sektion hinein.
       Draußen bleibt nur, was nichts trägt: eine Null ist ein geschlossenes
       Konto oder eine Zeile auf Vorrat.

       Ein negativer Stand bleibt drin: wer seine Dispositionskredite in den
       liquiden Mitteln führt statt bei den Verbindlichkeiten, hat dort echtes
       Geld stehen. Ihn auszublenden hiesse, eine Summe zu zeigen, deren Posten
       sie nicht ergeben. Sortiert wird absteigend, negative Stände stehen
       damit am Ende. */
    function itemsOf(id) {
      return (model.accounts[id] || []).map(function (a) {
        return { name: a.name, value: a.values[i] };
      }).filter(function (a) { return Math.abs(a.value) > 0.005; })
        .sort(function (a, b) { return b.value - a.value; });
    }
    var sectionItems = {};
    model.sectionOrder.forEach(function (id) { sectionItems[id] = itemsOf(id); });
    sectionItems.liabilities = itemsOf('liabilities');

    /* --- Meilensteine ---------------------------------------------------- */
    var stations = [], contingency = null;
    MILESTONES.forEach(function (ms) {
      var target = ms.months * totalMonthly;
      var value = ms.basis === 'liquid' ? current.liquid : current.investment;
      var entry = {
        id: ms.id, name: ms.name, term: ms.term, meaning: ms.meaning,
        basis: ms.basis, basisLabel: ms.basisLabel, months: ms.months,
        target: target, value: value,
        pct: target > 0 ? U.clamp(value / target, 0, 1) : null,
        rawPct: target > 0 ? value / target : null,
        remaining: Math.max(0, target - value),
        reached: target > 0 ? value >= target : false,
        t: ms.t
      };
      if (ms.basis === 'liquid') contingency = entry; else stations.push(entry);
    });

    var reachedCount = 0;
    stations.forEach(function (s) { if (s.reached) reachedCount++; });
    stations.forEach(function (s, idx) {
      s.index = idx;
      s.status = s.reached ? 'reached' : (idx === reachedCount ? 'current' : 'future');
    });
    contingency.status = contingency.reached ? 'reached' : 'current';

    var nextStation = stations[reachedCount] || null;
    var routeT = routePosition(stations, current.investment);

    /* --- Tempo: Depotveränderung pro Monat, über den tatsächlichen Abstand
       zum Vorjahresvergleich — bei einer Lücke ist das nicht immer 12. ----- */
    var pace = null;
    if (yearAgo) pace = (current.investment - yearAgo.m.investment) / yearAgo.span;
    var etaMonths = null;
    if (nextStation && pace && pace > 0) {
      etaMonths = Math.ceil(nextStation.remaining / pace);
      if (etaMonths > 1200) etaMonths = null;
    }

    /* --- Serie für den Verlaufs-Chart ------------------------------------ */
    var series = months.map(function (m, idx) {
      var ya = nearest(months, idx, 12, 1);
      return {
        key: m.key, iso: m.iso, value: m.netWorth,
        assets: m.totalAssets, liabilities: m.liabilities,
        investment: m.investment, liquid: m.liquid,
        yearAgo: ya ? ya.m.netWorth : null,
        /* Eigener Vorjahreswert je Reihe — die gestrichelte Spur muss dem
           folgen, was gerade gezeichnet wird, sonst vergleicht sie Äpfel. */
        assetsYearAgo: ya ? ya.m.totalAssets : null,
        investmentYearAgo: ya ? ya.m.investment : null,
        /* Der tatsächliche Abstand — bei einer Lücke im Vorjahr nicht immer
           zwölf. Der Chart braucht ihn für dieselbe Beschriftungsregel, die
           js/ui/position.js schon für die Kennzahl darüber anwendet. */
        yearAgoSpan: ya ? ya.span : null,
        index: idx
      };
    });

    return {
      current: current, prev: prev ? prev.m : null, yearAgo: yearAgo ? yearAgo.m : null,
      monthKey: current.key,
      mom: prev ? { abs: current.netWorth - prev.m.netWorth, rel: rel(current.netWorth, prev.m.netWorth), span: prev.span } : null,
      yoy: yearAgo ? { abs: current.netWorth - yearAgo.m.netWorth, rel: rel(current.netWorth, yearAgo.m.netWorth), span: yearAgo.span } : null,
      assetsMom: prev ? { abs: current.totalAssets - prev.m.totalAssets, rel: rel(current.totalAssets, prev.m.totalAssets), span: prev.span } : null,
      liabMom: prev ? { abs: current.liabilities - prev.m.liabilities, rel: rel(current.liabilities, prev.m.liabilities), span: prev.span } : null,
      shares: shares,
      leverage: leverage,
      sections: sections,
      sectionItems: sectionItems,
      expenses: {
        monthly: totalMonthly,
        annual: totalAnnual,
        /* „Gesetzt" heisst: ein Mensch hat den Betrag angefasst — nicht,
           dass einer dasteht. Die Vorgabe ist eine Schätzung, und solange
           niemand sie bestätigt hat, sagt der Hinweis unter dem Berg das auch. */
        set: !!settings.expensesSet
      },
      contingency: contingency,
      stations: stations,
      milestones: [contingency].concat(stations),
      reachedCount: reachedCount,
      allReached: reachedCount === stations.length,
      nextStation: nextStation,
      routeT: routeT,
      pace: pace,
      paceSpan: yearAgo ? yearAgo.span : null,
      etaMonths: etaMonths,
      series: series,
      firstKey: months[0].key,
      monthCount: months.length
    };
  }

  NS.calc = {
    MILESTONES: MILESTONES,
    SECTION_LABELS: SECTION_LABELS,
    derive: derive,
    /* Nach draussen, weil der Chart dieselbe Veränderung zeigt wie die
       Kennzahlen darüber. Zwei Formeln für eine Zahl waren schon einmal eine
       zu viel: die eine wurde korrigiert, die andere blieb falsch stehen. */
    rel: rel,
    routePosition: routePosition
  };
})(typeof window !== 'undefined' ? window : globalThis);
