/* NORDSTERN: Meilenstein-Cards.
   Acht Karten als zusammengehörige Sammlung. Vorderseite: Verlauf mit Marke,
   Name, schmaler Fortschrittsbalken. Rückseite: die Zahlen. Bedienbar per Maus, Touch, Tastatur. */
(function (global) {
  'use strict';
  var NS = global.NORDSTERN || (global.NORDSTERN = {});
  var U = NS.util;

  var STATUS_LABEL = { reached: 'reached', current: 'current', future: 'ahead' };

  /* Sieben Stationen messen gegen das Depot, die Reserve gegen liquide
     Mittel. */
  var BASIS_LABEL = { liquid: 'liquid', investment: 'invested' };
  var BASIS_ARIA  = { liquid: 'from liquid assets', investment: 'from invested assets' };

  function span(months) {
    if (months < 12) return months + ' months';
    var y = months / 12;
    return (Math.round(y * 10) / 10) + (y === 1 ? ' year' : ' years');
  }

  function tag(months) {
    return U.make('span', { class: 'card-tag' }, [
      U.make('b', { text: span(months) }),
      U.make('i', { text: ' of expenses' })
    ]);
  }

  /* Der Verlauf selbst steht in css/components.css als
     `.card[data-id="…"] { --w0/--w1/--w2 }` — Night und Dawn — und wird von
     `.card-wash` gelesen; hier bleibt nur, was der Verlauf trägt: Marke und
     Zeitspanne. */
  function wash(ms) {
    var box = U.make('div', { class: 'card-wash' });
    box.appendChild(NS.icons.svg(ms.id, 64, 'card-watermark'));
    box.appendChild(tag(ms.months));
    return box;
  }

  /* Das Kreuz ist Andeutung, die ganze Card schliesst; ein Knopf im Knopf
     wäre für Tastatur und Screenreader schlechter. */
  function closeMark() {
    return U.make('span', { class: 'card-x', 'aria-hidden': 'true' }, [
      U.svg('svg', { viewBox: '0 0 16 16', width: 11, height: 11, fill: 'none' }, [
        U.svg('path', { d: 'M3.5 3.5 L12.5 12.5 M12.5 3.5 L3.5 12.5',
          stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round' })
      ])
    ]);
  }

  function create(root, bus) {
    var cards = {};
    var state = { view: null, openId: null };

    function build(ms) {
      /* Die Card ist ein einziger Knopf, ihre Kinder sind für Vorleser reine
         Präsentation — `aria-expanded` allein sagt nichts über Sinn, Zahlen
         oder Status. `aria-describedby` holt genau die drei Stellen zurück,
         nie die ganze Rückseite (die trüge Namen und das Kreuz doppelt). */
      var idBase = 'card-' + ms.id;
      var art = U.make('article', {
        class: 'card', 'data-id': ms.id, tabindex: '0', role: 'button',
        'aria-expanded': 'false',
        'aria-describedby': idBase + '-meaning ' + idBase + '-facts ' + idBase + '-foot'
      });
      var inner = U.make('div', { class: 'card-inner' });

      var front = U.make('div', { class: 'card-face card-front' });
      var img = wash(ms);
      front.appendChild(img);
      front.appendChild(U.make('div', { class: 'card-scrim' }));
      front.appendChild(U.make('div', { class: 'card-front-body' }, [
        U.make('i', { class: 'card-status' }),
        U.make('h3', { class: 'card-name', text: ms.name })
      ]));
      front.appendChild(U.make('div', { class: 'card-bar' }, [U.make('i', {})]));

      var back = U.make('div', { class: 'card-face card-back' }, [
        U.make('div', { class: 'card-back-head' }, [
          U.make('h3', { class: 'card-name', text: ms.name }),
          closeMark()
        ]),
        U.make('p', { class: 'card-meaning', id: idBase + '-meaning', text: ms.meaning }),
        /* Die Leerzeichen zwischen den Zeilen tragen nichts zum Bild bei —
           `.card-facts` ist ein Grid, das reinen Leerraum nicht als Kind
           rendert, siehe css/components.css — sie sorgen nur dafür, dass
           Ziel, Betrag und Status beim Verketten der Texte für
           `aria-describedby` nicht aneinanderkleben. */
        U.make('dl', { class: 'card-facts', id: idBase + '-facts' }, [
          U.make('dt', { text: 'Target' }), ' ', U.make('dd', { class: 'f-target num' }), ' ',
          U.make('dt', { class: 'f-value-lab', title: ms.basisLabel }, [
            'Now ', U.make('i', { text: BASIS_LABEL[ms.basis] })
          ]), ' ',
          U.make('dd', { class: 'f-value num' })
        ]),
        U.make('div', { class: 'card-back-foot', id: idBase + '-foot' }, [
          U.make('span', { class: 'card-badge' }), ' ',
          U.make('b', { class: 'f-pct num' })
        ]),
        U.make('div', { class: 'card-bar' }, [U.make('i', {})])
      ]);

      inner.appendChild(front); inner.appendChild(back);
      art.appendChild(inner);

      art.addEventListener('click', function () { toggle(ms.id); });
      art.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
          ev.preventDefault(); toggle(ms.id);
        } else if (ev.key === 'Escape' && state.openId === ms.id) {
          toggle(ms.id);
        }
      });
      art.addEventListener('pointerenter', function () { bus.emit('card:hover', { id: ms.id }); });
      art.addEventListener('pointerleave', function () { bus.emit('card:hover', null); });
      art.addEventListener('focus', function () { bus.emit('card:hover', { id: ms.id }); });
      art.addEventListener('blur', function () { bus.emit('card:hover', null); });

      cards[ms.id] = { root: art, front: front, back: back, inactive: false };
      return art;
    }

    function toggle(id, force) {
      var open = force != null ? force : state.openId !== id;
      /* Eine inaktive Karte lässt sich nicht öffnen; schliessen (etwa weil
         sie gerade inaktiv geworden ist, während sie aufgeklappt war) bleibt
         erlaubt, das räumt nur auf. */
      if (open && cards[id] && cards[id].inactive) return;
      Object.keys(cards).forEach(function (k) {
        var on = open && k === id;
        cards[k].root.classList.toggle('is-flipped', on);
        cards[k].root.setAttribute('aria-expanded', String(on));
      });
      state.openId = open ? id : null;
      bus.emit('card:open', state.openId ? { id: state.openId } : null);
    }

    function render(arrive) {
      var v = state.view;
      if (!v) return;
      v.milestones.forEach(function (ms) {
        var c = cards[ms.id];
        if (!c) return;
        /* Ohne Ausgaben liegt jedes Ziel bei 0, das steht schon im
           berechneten Modell (calc.derive), nicht erst in den Einstellungen;
           die Karte richtet sich danach, nicht nach settings.monthlyExpenses. */
        var inactive = !(ms.target > 0);
        c.inactive = inactive;
        c.root.classList.toggle('is-inactive', inactive);
        if (inactive) c.root.setAttribute('aria-disabled', 'true');
        else c.root.removeAttribute('aria-disabled');
        c.root.setAttribute('tabindex', inactive ? '-1' : '0');
        if (inactive && state.openId === ms.id) toggle(ms.id, false);
        var pct = ms.pct == null ? 0 : ms.pct;
        c.root.setAttribute('data-status', ms.status);
        var w = (pct * 100).toFixed(1) + '%';
        c.front.querySelector('.card-bar i').style.width = w;
        c.back.querySelector('.card-bar i').style.width = w;
        c.front.querySelector('.card-status').setAttribute('title', STATUS_LABEL[ms.status]);
        c.back.querySelector('.f-target').textContent = U.eur0(ms.target);
        c.back.querySelector('.f-value').textContent = U.eur0(ms.value);
        /* Der Topf kommt aus der Ableitung, nicht aus der Tabelle: ohne
           Depot in der Mappe misst eine Station an den liquiden Mitteln. */
        var lab = c.back.querySelector('.f-value-lab');
        lab.setAttribute('title', ms.basisLabel);
        lab.querySelector('i').textContent = BASIS_LABEL[ms.basis];
        /* Über 100 % hinaus sagt der Wert nichts mehr — gedeckelt. */
        var shown = Math.min(ms.rawPct == null ? 0 : ms.rawPct, 1);
        c.back.querySelector('.f-pct').textContent = U.pct(shown, 0);
        c.back.querySelector('.card-bar').className = 'card-bar';
        var badge = c.back.querySelector('.card-badge');
        badge.textContent = STATUS_LABEL[ms.status];
        badge.className = 'card-badge is-' + ms.status;
        c.root.setAttribute('aria-label', ms.name + ', ' +
          STATUS_LABEL[ms.status] + ', ' + U.pct(shown, 0) + ' of ' + U.eur0(ms.target) +
          ' ' + BASIS_ARIA[ms.basis]);
      });

      /* Klasse ab- und wieder anhängen, sonst startet die Animation nicht
         neu; das Auslesen der Breite erzwingt den Reflow dazwischen. */
      root.classList.remove('is-arriving');
      if (arrive) {
        void root.offsetWidth;
        root.classList.add('is-arriving');
      }
    }

    /* Der Index steht am Element, damit das Stylesheet die Karten nacheinander
       füllen kann — Reihenfolge der Leiter, nicht Reihenfolge im Raster. */
    NS.calc.MILESTONES.forEach(function (ms, i) {
      var el = build(ms);
      el.style.setProperty('--i', i);
      root.appendChild(el);
    });

    return {
      clear: function () {
        state.view = null;
        root.classList.remove('is-arriving');
        if (state.openId) toggle(state.openId, false);
        Object.keys(cards).forEach(function (k) {
          var c = cards[k];
          c.root.removeAttribute('data-status');   // wie vor dem ersten Import
          c.root.classList.remove('is-linked');
          c.root.classList.remove('is-inactive');
          c.root.removeAttribute('aria-disabled');
          /* Sonst nennte der Vorleser weiter den Zielbetrag des letzten
             Imports — build() setzt hier gar keins, das entfernen stellt
             genau den Ausgangszustand wieder her. */
          c.root.removeAttribute('aria-label');
          c.root.setAttribute('tabindex', '0');
          c.inactive = false;
          c.front.querySelector('.card-bar i').style.width = '0%';
          c.back.querySelector('.card-bar i').style.width = '0%';
          c.back.querySelector('.f-target').textContent = '—';
          c.back.querySelector('.f-value').textContent = '—';
          c.back.querySelector('.f-pct').textContent = '—';
          var badge = c.back.querySelector('.card-badge');
          badge.textContent = ''; badge.className = 'card-badge';
        });
      },
      setData: function (v, arrive) { state.view = v; render(arrive); },
      highlight: function (id) {
        Object.keys(cards).forEach(function (k) {
          cards[k].root.classList.toggle('is-linked', k === id);
        });
      },
      open: function (id) { toggle(id, true); },
      close: function () { if (state.openId) toggle(state.openId, false); },
      openId: function () { return state.openId; },
      focus: function (id) { if (cards[id]) cards[id].root.focus(); }
    };
  }

  NS.cards = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
