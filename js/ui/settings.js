/* NORDSTERN — Einstellungen als ruhiges Overlay, keine eigene Seite.
   Eine Ebene: links die Namen, rechts genau ein Abschnitt. Der aktive Name
   ist die Überschrift — er wird im Blatt nicht noch einmal wiederholt. */
(function (global) {
  'use strict';
  var NS = global.NORDSTERN || (global.NORDSTERN = {});
  var U = NS.util;

  /* Die Reihenfolge ist eine Aussage: erst was Geld kostet, dann woher die
     Zahlen kommen, dann wie die Mappe dafür aussehen muss. Bewegung ist eine
     Vorliebe und steht deshalb hinten, About ganz zuletzt. */
  var SECTIONS = [
    { id: 'expenses', label: 'expenses' },
    { id: 'source',   label: 'data source' },
    { id: 'workbook', label: 'workbook' },
    { id: 'motion',   label: 'motion' },
    { id: 'privacy',  label: 'privacy' },
    { id: 'about',    label: 'about' }
  ];

  function create(root, bus, api) {
    /* `aria-modal` gilt nur, solange das Blatt offen ist. Steht es dauerhaft
       am Knoten, behauptet es auch im geschlossenen Zustand einen Dialog, der
       den Rest der Seite verdeckt — und der geschlossene Dialog steht mit all
       seinen Schaltern weiter in der Tabreihenfolge. Deshalb hier nichts
       davon; open() und close() setzen es. */
    var panel = U.make('div', { class: 'sheet', role: 'dialog',
      'aria-label': 'Settings', tabindex: '-1' });
    var scrim = U.make('div', { class: 'sheet-scrim' });
    root.appendChild(scrim);
    root.appendChild(panel);
    /* Zu heisst: für Tastatur und Vorleseprogramm gar nicht da. Dasselbe
       Mittel, mit dem app.js die verdeckte Bühne im Leerzustand stilllegt. */
    root.setAttribute('inert', '');
    root.setAttribute('aria-hidden', 'true');

    var refs = {};
    var tabs = {};
    var panes = {};
    var active = SECTIONS[0].id;

    /* Ein Abschnitt ist ein Paneel, kein Kapitel mit eigener Überschrift —
       die trägt der Name in der Spalte links. */
    function pane(id, children) {
      var p = U.make('section', {
        class: 'sheet-sec', 'data-sec': id, id: 'setPane-' + id,
        role: 'tabpanel', 'aria-labelledby': 'setTab-' + id, tabindex: '0'
      }, children);
      if (id !== active) p.hidden = true;
      panes[id] = p;
      return p;
    }

    function select(id, moveFocus) {
      if (!panes[id]) id = SECTIONS[0].id;
      active = id;
      SECTIONS.forEach(function (s) {
        var on = s.id === id;
        tabs[s.id].setAttribute('aria-selected', String(on));
        tabs[s.id].tabIndex = on ? 0 : -1;
        panes[s.id].hidden = !on;
      });
      if (moveFocus) tabs[id].focus();
    }

    /* ↑/↓ wandern durch die Namen, Pos1/Ende an die Enden — die Liste ist ein
       einziges Tabstopp, nicht fünf. */
    function navKey(ev) {
      var i = SECTIONS.map(function (s) { return s.id; }).indexOf(active);
      var next = null;
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') next = (i + 1) % SECTIONS.length;
      else if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') next = (i + SECTIONS.length - 1) % SECTIONS.length;
      else if (ev.key === 'Home') next = 0;
      else if (ev.key === 'End') next = SECTIONS.length - 1;
      if (next === null) return;
      ev.preventDefault();
      select(SECTIONS[next].id, true);
    }

    function build() {
      panel.innerHTML = '';
      panel.appendChild(U.make('div', { class: 'sheet-head' }, [
        U.make('h2', { text: 'Settings' }),
        (refs.close = U.make('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', text: '✕' }))
      ]));

      var nav = U.make('div', { class: 'sheet-nav', role: 'tablist',
        'aria-orientation': 'vertical', 'aria-label': 'Settings sections' });
      SECTIONS.forEach(function (s) {
        var b = U.make('button', {
          type: 'button', class: 'sheet-nav-item', text: s.label, id: 'setTab-' + s.id,
          role: 'tab', 'aria-controls': 'setPane-' + s.id,
          'aria-selected': String(s.id === active), tabindex: s.id === active ? '0' : '-1'
        });
        b.addEventListener('click', function () { select(s.id); });
        b.addEventListener('keydown', navKey);
        tabs[s.id] = b;
        nav.appendChild(b);
      });
      panel.appendChild(nav);

      var body = U.make('div', { class: 'sheet-body' });
      panel.appendChild(body);

      /* --- Ausgaben ------------------------------------------------------ */
      /* Vorbelegt mit Gedankenstrichen: ohne Import steht hier nichts, und ein
         leeres Feld sähe nach Fehler aus statt nach „noch nichts gelesen". */
      refs.fixed = U.make('b', { class: 'num', text: '—' });
      refs.variable = U.make('b', { class: 'num', text: '—' });
      refs.total = U.make('b', { class: 'num is-total', text: '—' });
      refs.annual = U.make('span', { class: 'sheet-hint', text: '—' });

      refs.varInput = U.make('input', {
        type: 'number', min: '0', max: '10000', step: '10', class: 'field-num',
        id: 'setVar', 'aria-describedby': 'setVarHint'
      });
      refs.varRange = U.make('input', {
        type: 'range', min: '0', max: '3000', step: '10', class: 'field-range',
        'aria-label': 'Variable monthly amount'
      });

      body.appendChild(pane('expenses', [
        U.make('p', { class: 'sheet-copy', id: 'setVarHint', text:
          'Fixed costs come from the "Expenses" sheet of the workbook and cover no food, ' +
          'no leisure, no hobbies and no holidays. The variable amount adds exactly that — ' +
          'together they set all eight target amounts. Until you set it, a default estimate ' +
          'stands here: better a rough figure than eight targets that quietly ignore living.' }),
        U.make('div', { class: 'field' }, [
          U.make('label', { class: 'field-lab', htmlFor: 'setVar', text: 'Variable monthly amount' }),
          U.make('div', { class: 'field-ctl' }, [refs.varInput,
            (refs.varUnit = U.make('span', { class: 'field-unit', text: '€' }))])
        ]),
        refs.varRange,
        /* Die Summe ist der Hauptdarsteller: die beiden Zeilen darüber führen
           sie her, der Jahreswert steht als stille Fußnote darunter. */
        U.make('dl', { class: 'sheet-facts' }, [
          U.make('dt', { text: 'Fixed costs from the workbook' }), U.make('dd', {}, [refs.fixed]),
          U.make('dt', { text: 'Variable amount' }), U.make('dd', {}, [refs.variable]),
          U.make('dt', { class: 'is-sum', text: 'Per month' }), U.make('dd', { class: 'is-sum' }, [refs.total]),
          U.make('dt', { class: 'is-foot', text: 'Per year' }), U.make('dd', { class: 'is-foot' }, [refs.annual])
        ])
      ]));

      /* --- Datenquelle --------------------------------------------------- */
      /* Die Auswahl steht ganz oben im Abschnitt, noch vor dem Importstatus —
         sie ist eine Anzeigefrage, keine Angabe über die eingelesene Mappe,
         und gilt unabhängig davon, ob überhaupt schon etwas gelesen wurde. */
      refs.currency = U.make('select', { id: 'setCurrency', class: 'field-select',
        'aria-describedby': 'setCurrencyHint' },
        Object.keys(U.CURRENCIES).map(function (code) {
          return U.make('option', { value: code, text: code });
        }));
      refs.currencyHint = U.make('p', { class: 'sheet-hint', id: 'setCurrencyHint' });

      refs.status = U.make('span', { class: 'meta-import status-dot', text: 'no import' });
      refs.src = U.make('dd', { class: 'src-name', text: '—' });
      refs.when = U.make('dd', { text: '—' });
      refs.snap = U.make('dd', { text: '—' });
      /* Was der Importer rechts liegen lässt, steht hier. Fortgeschriebene
         Spalten sind kein Fehler und keine Warnung — aber sie still zu
         verwerfen hiesse, über die Datei des Nutzers zu entscheiden, ohne
         es ihm zu sagen. */
      refs.skipped = U.make('dd', { class: 'is-foot' });
      refs.skippedRow = U.make('dt', { class: 'is-foot', text: 'Ignored' });
      refs.warn = U.make('div', { class: 'sheet-warn' });
      refs.reimport = U.make('button', { type: 'button', class: 'btn', text: 'Re-read workbook' });
      refs.forget = U.make('button', { type: 'button', class: 'btn btn-ghost btn-danger', text: 'Delete local data' });

      body.appendChild(pane('source', [
        /* Anzeige, nicht Umrechnung — die Zahlen selbst ändern sich nicht,
           nur ihre Schreibweise. Steht vor dem Importstatus, weil sie auch
           ohne jede Mappe gilt. */
        U.make('div', { class: 'field' }, [
          U.make('label', { class: 'field-lab', htmlFor: 'setCurrency', text: 'Currency' }),
          U.make('div', { class: 'field-ctl' }, [refs.currency])
        ]),
        refs.currencyHint,
        /* Der Importstatus steht oben im Paneel: er gilt für alles darunter. */
        U.make('div', { class: 'sheet-status' }, [refs.status]),
        U.make('dl', { class: 'sheet-facts' }, [
          U.make('dt', { text: 'File' }), refs.src,
          U.make('dt', { text: 'Read on' }), refs.when,
          U.make('dt', { text: 'As of' }), refs.snap,
          refs.skippedRow, refs.skipped
        ]),
        refs.warn,
        U.make('div', { class: 'sheet-actions' }, [refs.reimport, refs.forget]),
        U.make('p', { class: 'sheet-copy', text:
          'Only the sheets "Data Input" and "Expenses" are read. The workbook is never ' +
          'modified, and nothing leaves this machine.' })
      ]));

      /* --- Aufbau der Mappe ------------------------------------------------
         Steht hier und nicht nur in der README: scheitert der Import, ist die
         Oberfläche das Einzige, was offen ist.

         Ein Abbild der Mappe, keine Beschreibung davon — links wörtlich, was
         in Spalte A stehen muss, rechts ein Beispiel. Zeile für Zeile mit der
         eigenen Datei vergleichbar; das kann kein Fließtext. Die Zahlen sind
         erfunden und gehen glatt auf (7.500 + 60.000 + 12.000 + 8.500 =
         88.000 − 20.000 = 68.000): im Code steht kein echter Betrag.

         Optionales fehlt vollständig — die Fälligkeitsspalte wird gelesen,
         wenn es sie gibt, aber wer die Mappe neu baut, soll die kürzeste
         Fassung sehen. Ändert sich js/importer.js, ändert sich diese Tabelle
         mit; tests/behaviour.mjs prüft jede Beschriftung gegen den Importer. */
      function wbRow(r) {
        return U.make('tr', { class: r[2] || '' }, [
          U.make('td', { text: r[0] }),
          U.make('td', { text: r[1] })
        ]);
      }
      /* Die zweite Überschrift benennt, welche Spalten das Beispiel meint —
         in „Data Input" alle Monatsspalten, in „Expenses" nur eine einzige. */
      function wbTable(right, rows) {
        return U.make('table', { class: 'wbt' }, [
          U.make('thead', {}, [U.make('tr', {}, [
            U.make('th', { text: 'Column A' }),
            U.make('th', { text: right })
          ])]),
          U.make('tbody', {}, rows.map(wbRow))
        ]);
      }

      body.appendChild(pane('workbook', [
        U.make('p', { class: 'sheet-copy', text:
          'Two sheets are read, by name: "Data Input" and "Expenses" — everything else in ' +
          'the file is ignored. Rows are found by their label in column A, never by row ' +
          'number, so you can insert, move and rename accounts freely. Case and extra ' +
          'spaces do not matter.' }),

        U.make('h3', { class: 'pane-sub', text: 'Sheet "Data Input"' }),
        wbTable('Column B, C, D …', [
          ['Month', '31.01.2026', 'is-key'],
          ['Liquid', '', 'is-head'],
          ['Checking account', '2.400,00', 'is-item'],
          ['Savings', '5.100,00', 'is-item'],
          ['Total liquid', '7.500,00', 'is-total'],
          ['Claims', '', 'is-head'],
          ['Total claims', '0,00', 'is-total'],
          ['Investments', '', 'is-head'],
          ['SPY', '38.000,00', 'is-item'],
          ['QQQ', '22.000,00', 'is-item'],
          ['Total investments', '60.000,00', 'is-total'],
          ['Property', '', 'is-head'],
          ['Total property', '12.000,00', 'is-total'],
          ['Retirement', '', 'is-head'],
          ['Total retirement', '8.500,00', 'is-total'],
          ['Liabilities', '', 'is-head'],
          ['Total liabilities', '20.000,00', 'is-total'],
          ['Total assets', '88.000,00', 'is-key is-sum'],
          ['Total net worth', '68.000,00', 'is-key']
        ]),
        U.make('p', { class: 'sheet-copy', text:
          'One column per month, each carrying a date in the row "Month". Between a ' +
          'section and its total row you may keep as many account rows as you like, named ' +
          'however you want — the rows in italics are only examples. Every section needs ' +
          'both its head and its total row, even when it stays at zero.' }),
        U.make('h3', { class: 'pane-sub', text: 'Sheet "Expenses"' }),
        wbTable('Column B', [
          ['Rent', '780,00', 'is-item'],
          ['Electricity', '95,00', 'is-item'],
          ['Monthly fixed costs', '875,00', 'is-total'],
          ['Car insurance', '620,00', 'is-item'],
          ['Liability insurance', '84,00', 'is-item'],
          ['Annual fixed costs', '704,00', 'is-total']
        ]),
        U.make('p', { class: 'sheet-copy', text:
          'Column A the name, column B the amount. Monthly items stand above their total ' +
          'row, annual items between the two total rows. Both total rows are needed — they ' +
          'are what tells the two kinds apart. Their amounts may be left blank; then the ' +
          'items above them are added up. Monthly fixed costs = monthly total + annual ' +
          'total ÷ 12.' })
      ]));

      /* --- Bewegung --------------------------------------------------------
         Der Schalter ist eine Fläche, kein Kästchen — darunter liegt weiterhin
         eine echte Checkbox, damit Tastatur und Vorlesen unverändert greifen. */
      function toggle(id, label) {
        var box = U.make('input', { type: 'checkbox', id: id, class: 'field-check' });
        var state = U.make('span', { class: 'sw-state', 'aria-hidden': 'true', text: 'off' });
        var lab = U.make('label', { class: 'metro-sw', htmlFor: id }, [
          box,
          U.make('span', { class: 'sw-track', 'aria-hidden': 'true' }),
          U.make('span', { class: 'sw-lab', text: label }),
          state
        ]);
        return { input: box, state: state, node: lab };
      }
      var anim = toggle('setAnim', 'Animations');
      var calm = toggle('setCalm', 'Calmer motion');
      refs.anim = anim.input; refs.animState = anim.state;
      refs.calm = calm.input; refs.calmState = calm.state;

      body.appendChild(pane('motion', [
        anim.node,
        calm.node,
        U.make('p', { class: 'sheet-copy', text:
          'With animations off the mountain rests and still rotates on demand. ' +
          'The system setting "Reduce motion" is respected.' })
      ]));

      /* --- Datenschutz -----------------------------------------------------
         Die Zusage steht sonst im README, das niemand offen hat, während er
         seine Kontostände hineinzieht. Hier steht sie dort, wo die Frage
         entsteht — und zwar als Liste prüfbarer Tatsachen, nicht als
         Beteuerung: jede Zeile sagt, woran man sie nachsehen kann. */
      function fact(term, detail) {
        return [U.make('dt', { text: term }), U.make('dd', { text: detail })];
      }
      var facts = [];
      [['Read', 'The two sheets "Data Input" and "Expenses" — nothing else is kept, evaluated or stored, not even a sheet name. In .xlsx, .xlsm and .xlsb the parser is handed those two names and decodes no other sheet. For .ods and .numbers SheetJS offers no such filter: there the whole workbook is decoded, and everything but the two is dropped the moment it is open.'],
       ['Written', 'Nothing. There is no write path — the app never calls XLSX.write, and your file is closed again unchanged.'],
       ['Sent', 'Nothing, anywhere. There is no fetch, no XMLHttpRequest, no WebSocket, no image request, no web font, no analytics, no error reporting.'],
       ['Stored', 'Two keys in this browser\u2019s localStorage: the parsed model and your settings. Nothing else, nowhere else.'],
       ['Account', 'None. There is nothing to sign in to.']
      ].forEach(function (f) { facts = facts.concat(fact(f[0], f[1])); });

      body.appendChild(pane('privacy', [
        U.make('p', { class: 'sheet-copy', text:
          'Your workbook is read here, in this browser, on this machine. It is not "we do not ' +
          'collect data" — there is no code in this app that could send any.' }),
        U.make('dl', { class: 'sheet-facts is-wide' }, facts),
        U.make('h3', { class: 'about-title', text: 'How to check it yourself' }),
        U.make('p', { class: 'about-body', text:
          'Open your browser\u2019s network tab and use the app: nothing appears, not even once. ' +
          'Pull the plug and it keeps working — it never needed the network to begin with. ' +
          'The single-file build additionally carries a Content-Security-Policy of ' +
          'default-src \u2018none\u2019, so the browser itself refuses every outbound request ' +
          'rather than asking you to take anyone\u2019s word for it.' }),
        U.make('h3', { class: 'about-title', text: 'Getting rid of it' }),
        U.make('p', { class: 'about-body', text:
          'Data source \u2192 Delete local data removes every stored key and clears the screen. ' +
          'Your workbook stays where it is, untouched. Closing the tab without deleting keeps ' +
          'the data on this machine for the next visit \u2014 and only on this machine.' })
      ]));

      /* --- About ----------------------------------------------------------
         Die Lizenztexte stehen wortgleich so da, wie sie der Urheber gesetzt
         hat. Links werden in den Fließtext eingesetzt, statt darunter zu
         stehen — ein Rechtshinweis liest sich als ein Absatz. Die Werktitel
         bleiben in Gemischtschreibung: „nordstern" ist eine Marke, keine
         Versalzeile. */
      function link(href, label) {
        return U.make('a', { class: 'sheet-link', href: href,
          target: '_blank', rel: 'noopener noreferrer', text: label });
      }
      function legal(parts) {
        return U.make('p', { class: 'about-body' }, parts.map(function (x) {
          return typeof x === 'string' ? global.document.createTextNode(x) : x;
        }));
      }
      var APACHE = 'https://www.apache.org/licenses/LICENSE-2.0';

      /* Der Stern steht über allem, was hier steht — er ist das Werk, um das
         es auf diesem Blatt geht, und derselbe, den der Kopfbereich und der
         Leerzustand tragen. Gezeichnet wird er genau einmal, in header.js.
         Darunter die Fassung: wer eine Datei weitergibt oder einen Fehler
         meldet, muss sagen können, welche er hat. */
      body.appendChild(pane('about', [
        U.make('div', { class: 'about-head' }, [
          NS.header.star(52, 'about'),
          U.make('div', { class: 'about-mark', text: 'nordstern' }),
          U.make('div', { class: 'about-ver', text: 'Version ' + NS.VERSION + ' \u00b7 Apache-2.0' })
        ]),
        U.make('h3', { class: 'about-title', text: 'nordstern and the nordstern star' }),
        legal(['© 2026 Christian J. Heinze. Licensed under the Apache License, Version 2.0 · ',
          link(APACHE, 'apache.org/licenses/LICENSE-2.0'),
          '. Use it, modify it, sell it, fork it. Passing this file on is redistribution: ' +
          'the licence and the notices on this page travel with it. The nordstern star is ' +
          'original work by the same author and is covered by the same licence. nordstern and ' +
          'the nordstern star are trademarks of Christian J. Heinze. No trademark licence is ' +
          'granted under the Apache License; see Section 6. Source: ',
          link('https://github.com/chrisjohe/nordstern', 'github.com/chrisjohe/nordstern'), '.']),

        U.make('h3', { class: 'about-title', text: 'SheetJS' }),
        legal(['\u00a9 2012\u2013present SheetJS LLC. Licensed under the Apache License, ' +
          'Version 2.0 \u00b7 ',
          link(APACHE, 'apache.org/licenses/LICENSE-2.0'),
          '. nordstern reads your workbook with SheetJS Community Edition 0.20.3, ' +
          'vendored unmodified. It is the only library in this app, it runs on this ' +
          'machine like everything else here, and nordstern uses it to read \u2014 never ' +
          'to write. Source: ',
          link('https://git.sheetjs.com/sheetjs/sheetjs', 'git.sheetjs.com/sheetjs/sheetjs'),
          '.']),

        U.make('h3', { class: 'about-title', text: 'Material Symbols' }),
        legal(['© Google LLC. Licensed under the Apache License, Version 2.0 · ',
          link(APACHE, 'apache.org/licenses/LICENSE-2.0'),
          '. Every icon in this app is unmodified Material Symbols path data, recoloured ' +
          'through currentColor. Source: ',
          link('https://github.com/google/material-design-icons', 'github.com/google/material-design-icons'),
          '. Google’s name and trademarks are not used to imply any affiliation with or ' +
          'endorsement of nordstern.']),

        U.make('p', { class: 'about-note', text: 'A summary of what the licenses say, not legal advice.' })
      ]));

      refs.close.addEventListener('click', close);
      scrim.addEventListener('click', close);
      refs.varInput.addEventListener('input', function () {
        if (refs.varInput.value === '') return;          // Feld gerade leergeräumt
        setVar(Number(refs.varInput.value), true);
      });
      refs.varInput.addEventListener('blur', function () {
        if (refs.varInput.value === '') setVar(0);
      });
      refs.varRange.addEventListener('input', function () { setVar(Number(refs.varRange.value)); });
      refs.currency.addEventListener('change', function () {
        api.patchSettings({ currency: refs.currency.value });
      });
      refs.anim.addEventListener('change', function () {
        paintSwitches();
        api.patchSettings({ animations: refs.anim.checked });
      });
      refs.calm.addEventListener('change', function () {
        paintSwitches();
        api.patchSettings({ motionIntensity: refs.calm.checked ? 'ruhig' : 'normal' });
      });
      refs.reimport.addEventListener('click', function () { api.pickFile(); });
      refs.forget.addEventListener('click', function () {
        if (global.confirm('The locally stored data will be deleted. Your workbook stays untouched.')) {
          api.forget();
        }
      });
    }

    /* Das Wort neben dem Schalter kommt aus dem Zustand, nicht aus dem
       Stylesheet — ohne CSS steht dort trotzdem „on" oder „off". */
    function paintSwitches() {
      refs.animState.textContent = refs.anim.checked ? 'on' : 'off';
      refs.calmState.textContent = refs.calm.checked ? 'on' : 'off';
    }

    function setVar(n, fromField) {
      n = U.clamp(Math.round(Number(n) || 0), 0, 10000);
      if (!fromField && refs.varInput.value !== String(n)) refs.varInput.value = String(n);
      refs.varRange.value = String(Math.min(n, 3000));
      api.patchSettings({ variableMonthly: n, variableSet: true });
    }

    /* Was hinter dem Blatt liegt, während es offen ist. Die Bühne steckt in
       der Hülle; der Vorhang steht daneben und wäre sonst mit Tab erreichbar,
       obwohl er verdeckt ist. */
    function behind() {
      return [U.el('#shell'), U.el('#gate')].filter(Boolean);
    }

    /* Alles, was im Blatt Fokus annehmen kann — ohne die Schalter in den
       Abschnitten, die gerade nicht angezeigt werden. `hidden` steht am
       Abschnitt, nicht am einzelnen Schalter, deshalb der Blick nach oben. */
    function focusables() {
      return U.els('a[href], button:not([disabled]), input:not([disabled]), ' +
        'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', panel)
        .filter(function (n) { return !n.closest('[hidden]'); });
    }

    var lastFocus = null;

    /* `open('workbook')` führt direkt dorthin: der Hinweis unter dem Berg
       meint die Ausgaben, ein gescheiterter Import den Aufbau der Mappe. */
    function open(id) {
      if (id) select(id);
      lastFocus = document.activeElement;
      root.removeAttribute('inert');
      root.removeAttribute('aria-hidden');
      panel.setAttribute('aria-modal', 'true');
      behind().forEach(function (n) {
        n.setAttribute('inert', '');
        n.setAttribute('aria-hidden', 'true');
      });
      root.classList.add('is-open');
      panel.focus();
      global.addEventListener('keydown', onKey);
    }
    function close() {
      root.classList.remove('is-open');
      panel.removeAttribute('aria-modal');
      behind().forEach(function (n) {
        n.removeAttribute('inert');
        n.removeAttribute('aria-hidden');
      });
      root.setAttribute('inert', '');
      root.setAttribute('aria-hidden', 'true');
      global.removeEventListener('keydown', onKey);
      /* Der Fokus kommt dorthin zurück, wo er herkam — sonst steht er nach
         dem Schliessen am Seitenanfang, und die Tastatur fängt von vorn an.
         Nur, wenn es das Element noch gibt: „Delete local data" räumt die
         Bühne ab, aus der heraus geöffnet worden sein kann. */
      if (lastFocus && lastFocus.isConnected && lastFocus.focus) lastFocus.focus();
      lastFocus = null;
      bus.emit('settings:close');
    }

    /* Tab läuft im Blatt im Kreis. Ohne das führt die Tabulatortaste hinter
       den Vorhang, wo `inert` alles stilllegt — der Fokus verschwindet dann
       aus dem sichtbaren Teil der Seite. */
    function onKey(ev) {
      if (ev.key === 'Escape') { close(); return; }
      if (ev.key !== 'Tab') return;
      var f = focusables();
      if (!f.length) { ev.preventDefault(); panel.focus(); return; }
      var first = f[0], last = f[f.length - 1], a = document.activeElement;
      if (ev.shiftKey && (a === first || a === panel)) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && (a === last || a === panel)) { ev.preventDefault(); first.focus(); }
    }

    build();
    paintSwitches();

    return {
      open: open, close: close,
      setStatus: function (kind, text) {
        refs.status.textContent = text;
        refs.status.className = 'meta-import status-dot is-' + kind;
      },
      isOpen: function () { return root.classList.contains('is-open'); },
      sync: function (v, model, settings) {
        /* Gilt auch ohne Modell (v === null) — die Wahl der Währung hängt an
           den Einstellungen, nicht am Import. */
        if (refs.currency !== document.activeElement && refs.currency.value !== settings.currency) {
          refs.currency.value = settings.currency;
        }
        refs.varUnit.textContent = U.currencySymbol();
        refs.currencyHint.textContent =
          'Display only, nothing is converted. ' +
          'Importing a workbook whose number formats carry a currency symbol switches this to match.';
        refs.anim.checked = !!settings.animations;
        refs.calm.checked = settings.motionIntensity === 'ruhig';
        paintSwitches();
        var vm = String(settings.variableMonthly || 0);
        if (refs.varInput !== document.activeElement && refs.varInput.value !== vm) refs.varInput.value = vm;
        refs.varRange.value = String(Math.min(settings.variableMonthly || 0, 3000));
        /* Ohne Modell muss hier ein Strich stehen, keine alte Zahl. Das Blatt
           bleibt nach dem Löschen erreichbar — stünden die Ausgaben noch da,
           wäre „Delete local data" eine Behauptung. */
        if (v) {
          refs.fixed.textContent = U.eur(v.expenses.fixedMonthly);
          refs.variable.textContent = U.eur(v.expenses.variableMonthly);
          refs.total.textContent = U.eur(v.expenses.totalMonthly);
          refs.annual.textContent = U.eur(v.expenses.totalAnnual);
          refs.snap.textContent = U.monthLong(v.monthKey);
        } else {
          refs.fixed.textContent = '—';
          refs.variable.textContent = '—';
          refs.total.textContent = '—';
          refs.annual.textContent = '—';
          refs.snap.textContent = '—';
        }
        if (model) {
          refs.src.textContent = model.sourceName || '—';
          var sk = model.skipped;
          refs.skipped.textContent = sk
            ? sk.count + (sk.count === 1 ? ' column' : ' columns') + ' from ' + U.monthLong(sk.from)
            : '';
          refs.skipped.title = sk
            ? 'Dated in the future, so they are not snapshots — projections, most likely. Nothing in them is read.'
            : '';
          refs.skippedRow.hidden = !sk;
          refs.skipped.hidden = !sk;
          refs.when.textContent = U.dateTime(model.importedAt);
          refs.warn.innerHTML = '';
          if (model.warnings && model.warnings.length) {
            refs.warn.appendChild(U.make('p', { class: 'warn-title',
              text: model.warnings.length + (model.warnings.length === 1 ? ' note' : ' notes') + ' while reading' }));
            model.warnings.forEach(function (w) {
              refs.warn.appendChild(U.make('p', { class: 'warn-item', text: w }));
            });
          }
        } else {
          /* Der Dateiname der Mappe ist selbst eine Angabe — er geht mit. */
          refs.src.textContent = '—';
          refs.when.textContent = '—';
          refs.skipped.textContent = '';
          refs.skipped.title = '';
          refs.skippedRow.hidden = true;
          refs.skipped.hidden = true;
          refs.warn.innerHTML = '';
        }
      }
    };
  }

  NS.settings = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
