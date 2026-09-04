/* NORDSTERN: Kopfbereich, Wortmarke und Nordstern.
   Der Stern ist der Orientierungspunkt, nicht die Bühne: er sitzt auf
   Zeilenhöhe der Wortmarke und bleibt klein. */
(function (global) {
  'use strict';
  var NS = global.NORDSTERN || (global.NORDSTERN = {});
  var U = NS.util;

  /* Korona, Kern-Bloom und Beugungsspitzen aus Verläufen statt Filtern, das
     bleibt bei Dauerbewegung billig. `key` hält die Verlaufs-IDs auseinander,
     wenn mehrere Sterne im Dokument stehen. */
  function star(size, key) {
    function spike(len, w) {                      // Raute durch die Mitte
      return 'M50 ' + (50 - len) + ' L' + (50 + w) + ' 50 L50 ' + (50 + len) +
             ' L' + (50 - w) + ' 50 Z';
    }
    var ID = { corona: 'nsCorona-' + key, bloom: 'nsBloom-' + key, spike: 'nsSpike-' + key };
    return U.svg('svg', { class: 'star', viewBox: '0 0 100 100', width: size, height: size, 'aria-hidden': 'true' }, [
      U.svg('defs', {}, [
        U.svg('radialGradient', { id: ID.corona }, [
          U.svg('stop', { offset: '0',    'stop-color': '#f2f8ff', 'stop-opacity': '0.50' }),
          U.svg('stop', { offset: '0.22', 'stop-color': '#bcd9ff', 'stop-opacity': '0.24' }),
          U.svg('stop', { offset: '0.52', 'stop-color': '#6fb0f0', 'stop-opacity': '0.09' }),
          U.svg('stop', { offset: '1',    'stop-color': '#3987e5', 'stop-opacity': '0' })
        ]),
        U.svg('radialGradient', { id: ID.bloom }, [
          U.svg('stop', { offset: '0',    'stop-color': '#ffffff', 'stop-opacity': '1' }),
          U.svg('stop', { offset: '0.34', 'stop-color': '#eaf4ff', 'stop-opacity': '0.72' }),
          U.svg('stop', { offset: '0.68', 'stop-color': '#a9cdf7', 'stop-opacity': '0.22' }),
          U.svg('stop', { offset: '1',    'stop-color': '#7fb2e5', 'stop-opacity': '0' })
        ]),
        /* Ein Verlauf für alle Spitzen: hell in der Mitte, zur Spitze hin fort. */
        U.svg('radialGradient', { id: ID.spike, gradientUnits: 'userSpaceOnUse', cx: 50, cy: 50, r: 48 }, [
          U.svg('stop', { offset: '0',    'stop-color': '#ffffff', 'stop-opacity': '0.95' }),
          U.svg('stop', { offset: '0.14', 'stop-color': '#e8f3ff', 'stop-opacity': '0.55' }),
          U.svg('stop', { offset: '0.45', 'stop-color': '#a8ccf5', 'stop-opacity': '0.20' }),
          U.svg('stop', { offset: '1',    'stop-color': '#7fb2e5', 'stop-opacity': '0' })
        ])
      ]),
      U.svg('circle', { cx: 50, cy: 50, r: 49, fill: 'url(#' + ID.corona + ')', class: 'star-corona' }),
      U.svg('g', { class: 'star-spikes', fill: 'url(#' + ID.spike + ')' }, [
        U.svg('path', { d: spike(47, 2.6) }),                            // senkrecht
        U.svg('path', { d: spike(47, 2.6), transform: 'rotate(90 50 50)' }),
        U.svg('path', { d: spike(26, 1.7), transform: 'rotate(45 50 50)', opacity: '0.5' }),
        U.svg('path', { d: spike(26, 1.7), transform: 'rotate(-45 50 50)', opacity: '0.5' })
      ]),
      U.svg('circle', { cx: 50, cy: 50, r: 13, fill: 'url(#' + ID.bloom + ')', class: 'star-bloom' }),
      U.svg('circle', { cx: 50, cy: 50, r: 2.9, class: 'star-core' })
    ]);
  }

  function create(starRoot) {
    var starBox = U.make('div', { class: 'starbox' });
    starBox.appendChild(star(58, 'head'));
    starRoot.appendChild(starBox);
  }

  function mount(root, size, key) {
    root.innerHTML = '';
    root.appendChild(star(size, key));
  }

  NS.header = { create: create, star: star, mount: mount };
})(typeof window !== 'undefined' ? window : globalThis);
