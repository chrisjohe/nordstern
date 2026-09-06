/* NORDSTERN: Verdrahtung.
   Hält den Zustand, verteilt das abgeleitete Modell an die Module und verbindet
   Cards, Route, Marker und Reservering miteinander. */
(function (global) {
  'use strict';
  var NS = global.NORDSTERN;
  var U = NS.util;

  var bus = U.bus();
  /* `arriving` ist wahr für genau ein Refresh: das, in dem neue Daten zum
     ersten Mal auf der Bühne landen. Alles Weitere — Schieberegler, Schalter,
     Fenstergrösse — rendert, aber baut sich nicht neu auf. */
  /* `importError` merkt sich einen fehlgeschlagenen Nach-Import, solange ein
     Modell schon steht (siehe readFile()) — nur für die laufende Sitzung,
     nie gespeichert. Ohne das verschwänden die Diagnosen des Importers
     spurlos, sobald schon etwas auf der Bühne stand: der erste Import zeigt
     sie auf dem Vorhang, ein Nach-Import mit stehendem Modell hätte sonst
     nur einen allgemeinen Toast. */
  var state = { model: null, view: null, settings: NS.store.loadSettings(),
                arriving: false, importError: null };
  var ui = {};

  /* Zwei Dateidialoge kurz nacheinander: die zuerst gewählte, grössere Mappe
     kann nach der zweiten fertig werden und sie überschreiben. Jede Auswahl
     bekommt eine Marke; anwenden darf nur, wessen Marke noch die jüngste ist. */
  var importSeq = 0;

  /* Die Formatierer folgen der gewählten Währung, nicht EUR — vor dem ersten
     Rendern gesetzt und nach jeder Änderung erneut, sonst zeigt eine Zahl
     kurz die alte Schreibweise, bevor refresh() nachzieht. */
  function applyCurrency() { U.setCurrency(state.settings.currency); }
  applyCurrency();

  /* ------------------------------------------------------------- Bewegung */
  var mq = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function motionOn() {
    if (!state.settings.animations) return false;
    return !(mq && mq.matches);
  }
  function applyMotion() {
    var on = motionOn();
    document.documentElement.setAttribute('data-motion',
      !state.settings.animations ? 'off' : (mq && mq.matches) ? 'off'
        : state.settings.motionIntensity === 'ruhig' ? 'calm' : 'on');
    if (ui.mountain) ui.mountain.setMotion(on, state.settings.motionIntensity);
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', applyMotion);

  /* ------------------------------------------------------------------ Thema */
  /* Muss vor applyContrast() stehen: die ruft am Ende refreshTokens() am
     Berg, und der soll dabei die Tokens des jetzt geltenden Themas lesen,
     nicht die des vorigen. */
  function applyTheme() {
    var theme = state.settings.theme === 'dawn' ? 'dawn' : 'night';
    document.documentElement.setAttribute('data-theme', theme);
    try { document.documentElement.style.setProperty('color-scheme', theme === 'dawn' ? 'light' : 'dark'); }
    catch (e) {}
    var meta = U.el('meta[name="color-scheme"]');
    if (meta) meta.setAttribute('content', theme === 'dawn' ? 'light' : 'dark');
  }

  /* --------------------------------------------------------------- Kontrast */
  var mqContrast = global.matchMedia ? global.matchMedia('(prefers-contrast: more)') : null;
  function applyContrast() {
    var on = !!state.settings.highContrast || !!(mqContrast && mqContrast.matches);
    document.documentElement.setAttribute('data-contrast', on ? 'high' : 'normal');
    if (ui.mountain) ui.mountain.refreshTokens();
  }
  if (mqContrast && mqContrast.addEventListener) mqContrast.addEventListener('change', applyContrast);

  /* ---------------------------------------------------------------- Toast */
  var toastTimer = null;
  function toast(msg, kind) {
    var t = U.el('#toast');
    t.textContent = msg;
    t.className = 'toast is-on' + (kind ? ' is-' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 4200);
  }

  /* -----------------------------------------------------------------  Gate
     Der Vorhang deckt die Bühne ab, nicht den Kopf: Einstellungen und der
     Aufbau der Mappe bleiben erreichbar. */
  function showGate(title, copy, errors) {
    var g = U.el('#gate');
    g.hidden = false;
    U.el('#gateTitle').textContent = title;
    U.el('#gateCopy').textContent = copy;
    var box = U.el('#gateErrors');
    box.innerHTML = '';
    (errors || []).forEach(function (e) {
      box.appendChild(U.make('p', { class: 'gate-err', text: e }));
    });
    if (errors && errors.length) {
      box.appendChild(U.make('button', {
        type: 'button', class: 'btn btn-ghost gate-more', text: 'What the workbook needs'
      })).addEventListener('click', function () { ui.settings.open('workbook'); });
    }
    /* `inert`, sonst wanderte der Fokus hinter den Vorhang. */
    U.el('#stage').setAttribute('aria-hidden', 'true');
    U.el('#stage').setAttribute('inert', '');
    document.body.classList.add('is-gated');
  }
  function hideGate() {
    U.el('#gate').hidden = true;
    U.el('#stage').removeAttribute('aria-hidden');
    U.el('#stage').removeAttribute('inert');
    document.body.classList.remove('is-gated');
  }

  /* ---------------------------------------------------------------- Import */
  function readFile(file) {
    if (!file) return;
    /* SheetJS liest auch .xls, .ods, .xlsb und .numbers; Google Sheets
       exportiert nach .xlsx. */
    if (!/\.(xlsx|xlsm|xlsb|xls|ods|numbers)$/i.test(file.name)) {
      toast('Not a spreadsheet nordstern can read (.xlsx, .xlsm, .xlsb, .xls, .ods, .numbers).', 'error');
      return;
    }
    ui.settings.setStatus('busy', 'reading …');
    var token = ++importSeq;
    var fr = new FileReader();
    fr.onerror = function () {
      if (token !== importSeq) return;
      ui.settings.setStatus('error', 'read error');
      toast('The file could not be read.', 'error');
    };
    fr.onload = function () {
      if (token !== importSeq) return;
      var res = NS.importer.parseArrayBuffer(fr.result, file.name, { currency: state.settings.currency, fmt: NS.util.eurIn });
      if (!res.ok) {
        ui.settings.setStatus('error', 'unknown structure');
        /* Mit einem stehenden Modell bleibt die Bühne stehen; der Vorhang
           ist nur für den Fall, dass nichts zu zeigen ist. */
        if (state.model) {
          state.importError = { source: file.name, errors: res.errors || [] };
          /* state.view besteht unverändert fort — es wird nur die
             Einstellungen-Ansicht neu gezogen, kein voller refresh(): das
             stehende Modell hat sich nicht geändert, und ein voller
             Neuaufbau von Route, Scheibe und Karten wäre hier verlorene
             Arbeit. */
          ui.settings.sync(state.view, state.model, state.settings, state.importError);
          toast('The file does not match the expected layout. The current data stays; see the data source in settings.', 'error');
          return;
        }
        showGate('The structure does not match',
          'The file was read, but the expected layout is missing. It was not modified.',
          res.errors);
        return;
      }
      /* Ein gültiger Import löscht die Diagnose eines vorigen Fehlversuchs —
         sie galt nur, solange die alte Mappe noch stand. */
      state.importError = null;
      /* Die Währung gehört zur Mappe, nicht zur Einstellung: sie wird im
         Modell selbst mitgespeichert (ein Schreibvorgang statt zweier), sonst
         hinterliesse ein Fehlschlag in nur einem der beiden Speicherorte ein
         falsches Paar (das alte Modell mit der neuen Währung, oder
         umgekehrt). boot() liest sie beim nächsten Start aus dem Modell
         zurück, siehe dort. */
      res.model.currency = res.currency || state.settings.currency;
      state.model = res.model;
      var saved = NS.store.saveModel(res.model);
      /* Die erkannte Währung wird vor dem ersten Rendern übernommen, sonst
         springt die Schreibweise nach dem ersten Bild um. Geschrieben wird
         sie in die Einstellungen erst nach dem Zeichnen, zusammen mit dem
         Modell-Ergebnis weiter unten: sonst überschriebe ihr eigener Toast
         den Lesehinweis, bevor er zu sehen war. */
      var switchedTo = null;
      if (res.currency && res.currency !== state.settings.currency) {
        switchedTo = res.currency;
        state.settings.currency = res.currency;
        applyCurrency();
      }
      /* Zweiter Boden auch hier, getrennt von dem in boot(): dort wird ein
         gespeichertes Modell nur still wiederhergestellt, hier zieht sich
         gerade der Vorhang und die Bühne baut sich zum ersten Mal auf. Wirft
         ein Modul dabei, bliebe die Bühne halb gezeichnet, kein Vorhang mehr
         davor, der Status noch auf "reading …", ohne jede Meldung. */
      try {
        hideGate();
        state.arriving = true;
        refresh();
        ui.settings.setStatus(res.warnings.length ? 'warn' : 'ok',
          res.warnings.length ? res.warnings.length + (res.warnings.length === 1 ? ' note' : ' notes') : 'import ok');
        var msg = res.warnings.length
          ? 'Read — with ' + res.warnings.length + ' note(s), see settings.'
          : 'Read: ' + res.model.months.length + ' months up to ' + U.monthLong(res.model.months[res.model.currentIndex].key) + '.';
        if (switchedTo) msg += ' Amounts shown in ' + switchedTo + ' (from the workbook’s number formats).';
        toast(msg, res.warnings.length ? 'warn' : 'ok');
      } catch (e) {
        state.model = null;
        state.arriving = false;
        showGate('Something went wrong while drawing',
          'The workbook was read, but the page could not be drawn from it. The file was not modified.',
          [String(e && e.message || e)]);
        ui.settings.setStatus('error', 'render error');
        toast('The page could not be drawn. See the message on the curtain.', 'error');
      }
      /* Erst jetzt geschrieben, siehe Kommentar oben. */
      var savedSettings = switchedTo ? NS.store.saveSettings(state.settings) : null;
      if (!saved.ok) toast('Could not be stored locally: ' + saved.reason, 'warn');
      else if (savedSettings && !savedSettings.ok) toast('Could not be stored locally: ' + savedSettings.reason, 'warn');
    };
    fr.readAsArrayBuffer(file);
  }

  function pickFile() { U.el('#filePicker').click(); }

  /* Vergessen ist mehr als den Vorhang zuziehen: die Module haben ihr Bild
     schon gezeichnet und rendern bei `null` gar nicht erst neu, blieben also
     dahinter sichtbar, jedes Modul muss deshalb einzeln leergeräumt werden. */
  function forget() {
    /* Ein FileReader, der noch liest, käme sonst nach dem Löschen mit
       `onload` zurück und zeichnete und speicherte die Mappe erneut. Die
       Marke entwertet ihn, wie eine zweite Auswahl die erste entwertet. */
    importSeq++;
    var res = NS.store.clearAll();
    state.model = null; state.view = null; state.importError = null;
    state.settings = NS.store.loadSettings();       // mit den Vorgaben als Grund
    applyMotion();
    applyTheme();
    applyContrast();
    applyCurrency();
    ui.position.clear();
    ui.chart.clear();
    ui.orbit.clear();
    ui.cards.clear();
    if (ui.mountain) ui.mountain.clear();
    U.el('#mountStatus').innerHTML = '';
    ui.settings.sync(null, null, state.settings, null);
    showGate('No data yet',
      'Drop the workbook with your snapshots here — or pick it. Only the sheet "Data Input" is read.');
    /* Die Bühne räumt sich in jedem Fall — aber blieb ein Schlüssel liegen,
       kommt er beim nächsten Öffnen zurück, und das muss die Meldung sagen,
       nicht ein Status, der einen sauberen Schnitt behauptet. */
    if (res.ok) {
      ui.settings.setStatus('none', 'no import');
    } else {
      toast('Local data could not be fully deleted. It may reappear when the page is reopened.', 'error');
      ui.settings.setStatus('error', 'not deleted');
    }
    ui.settings.close();
  }

  /* `opts.transient` gilt für den Regler beim Ziehen: der Zustand zieht mit
     und die Bühne rendert neu, aber es wird nichts geschrieben — sonst
     schriebe jedes Eingabe-Ereignis synchron in den localStorage. Geschrieben
     wird erst, wenn settings.js selbst wieder ohne `transient` ruft
     (change/blur am Regler bzw. Zahlenfeld). */
  function patchSettings(patch, opts) {
    for (var k in patch) state.settings[k] = patch[k];
    if (!opts || !opts.transient) {
      var savedSettings = NS.store.saveSettings(state.settings);
      if (!savedSettings.ok) toast('Could not be stored locally: ' + savedSettings.reason, 'warn');
      /* boot() liest die Währung aus dem Modell (siehe dort). Eine Wahl von
         Hand muss deshalb ebenfalls im Modell stehen, sonst setzte der nächste
         Start sie auf die beim Import erkannte zurück. */
      if (state.model && Object.prototype.hasOwnProperty.call(patch, 'currency')
          && state.model.currency !== patch.currency) {
        state.model.currency = patch.currency;
        var savedModel = NS.store.saveModel(state.model);
        if (savedModel.ok === false && savedSettings.ok) toast('Could not be stored locally: ' + savedModel.reason, 'warn');
      }
    }
    applyMotion();
    applyTheme();
    applyContrast();
    applyCurrency();
    refresh();
  }

  /* --------------------------------------------------------------- Refresh */
  function refresh() {
    /* Ohne Modell zeigen die Schalter im Blatt trotzdem ihren Stand. */
    if (!state.model) { ui.settings.sync(null, null, state.settings, state.importError); return; }
    var v = NS.calc.derive(state.model, state.settings);
    var arrive = state.arriving; state.arriving = false;
    state.view = v;
    ui.position.setData(v);
    ui.chart.setData(v, arrive);
    ui.orbit.setData(v, arrive);
    ui.cards.setData(v, arrive);
    if (ui.mountain) ui.mountain.setData(v);
    ui.settings.sync(v, state.model, state.settings, state.importError);
    renderStatus(v);
  }

  function renderStatus(v) {
    var box = U.el('#mountStatus');
    box.innerHTML = '';
    /* Bei 0 € Ausgaben liegt jedes Ziel bei 0 (calc.derive), die Leiter
       hat also nichts zu zeigen: statt einer Kette aus Strichen (pct und
       remaining sind dann null) steht hier eine einzige, ehrliche Zeile. */
    if (!(v.expenses.monthly > 0)) {
      box.appendChild(U.make('span', { class: 'st-pos', text: 'No monthly expenses are set' }));
      var lgEmpty = U.el('#ringLegend');
      lgEmpty.className = 'lg lg-ring';
      lgEmpty.textContent = '';
      return;
    }
    var pos;
    if (v.allReached) pos = 'All seven stations reached';
    else if (v.reachedCount === 0) pos = 'Climbing to ' + v.nextStation.name;
    else pos = 'Between ' + v.stations[v.reachedCount - 1].name + ' and ' + v.nextStation.name;
    box.appendChild(U.make('span', { class: 'st-pos', text: pos }));
    if (!v.allReached) {
      box.appendChild(U.make('span', { class: 'st-next' , text:
        U.pct(v.nextStation.pct, 0) + ' to ' + v.nextStation.name +
        ' · ' + U.eur0(v.nextStation.remaining) + ' to go' }));
    }
    var c = v.contingency;
    var chip = U.make('span', {
      class: 'st-ring ' + (c.reached ? 'is-ok' : 'is-warn'),
      text: c.reached ? 'Reserve covered' : 'Reserve ' + U.pct(c.pct, 0),
      title: c.basisLabel
    });
    chip.addEventListener('pointerenter', function () { link('contingency'); });
    chip.addEventListener('pointerleave', function () { link(null); });
    box.appendChild(chip);

    var lg = U.el('#ringLegend');
    lg.className = 'lg lg-ring ' + (c.reached ? 'is-ok' : 'is-warn');
    lg.textContent = 'Reserve ring';

    if (!v.expenses.set) {
      box.appendChild(U.make('button', {
        type: 'button', class: 'st-hint',
        text: 'expenses are an estimate',
        title: 'The monthly amount is a default, not your figure. Every target moves with it — ' +
               'set your own in Settings → expenses.'
      })).addEventListener('click', function () { ui.settings.open('expenses'); });
    }
  }

  /* ------------------------------------------------- Verbindung der Teile */
  function link(id) {
    ui.cards.highlight(id);
    if (ui.mountain) ui.mountain.setHover(id);
  }

  bus.on('card:hover', function (p) { link(p ? p.id : null); });
  bus.on('mountain:hover', function (p) { link(p ? p.id : null); });
  bus.on('mountain:select', function (p) {
    ui.cards.open(p.id);
    ui.cards.focus(p.id);
    if (ui.mountain) ui.mountain.setSelected(p.id, true);
  });
  bus.on('card:open', function (p) {
    if (ui.mountain) {
      ui.mountain.setSelected(p ? p.id : null, !!p);
      ui.mountain.setPaused(!!p);
    }
  });

  /* ------------------------------------------------------------------ Boot */
  function boot() {
    var railZone = U.el('#railZone');

    NS.header.create(U.el('#starZone'));
    NS.header.mount(U.el('#gateStar'), 84, 'gate');
    ui.position = NS.position.create(U.el('#posZone'));
    ui.chart = NS.chart.create(U.el('#chartZone'), bus);
    ui.orbit = NS.orbit.create(U.el('#orbitZone'), bus);
    ui.cards = NS.cards.create(railZone, bus);
    ui.settings = NS.settings.create(U.el('#settingsZone'), bus, {
      patchSettings: patchSettings, pickFile: pickFile, forget: forget
    });

    var canvas = U.el('#mountain');
    ui.mountain = NS.mountain.create(canvas, bus);
    if (!ui.mountain) {
      canvas.hidden = true;
      U.el('#mountFallback').hidden = false;
    }
    applyMotion();
    applyTheme();
    applyContrast();

    U.el('#btnSettings').addEventListener('click', function () {
      if (ui.settings.isOpen()) ui.settings.close(); else ui.settings.open();
    });
    U.el('#btnImport').addEventListener('click', pickFile);
    U.el('#gatePick').addEventListener('click', pickFile);
    U.el('#filePicker').addEventListener('change', function (ev) {
      readFile(ev.target.files && ev.target.files[0]);
      ev.target.value = '';
    });

    /* Drag & Drop über das ganze Fenster */
    var veil = U.el('#dropVeil'), depth = 0;
    ['dragenter', 'dragover'].forEach(function (t) {
      global.addEventListener(t, function (ev) {
        ev.preventDefault();
        if (t === 'dragenter') depth++;
        veil.classList.add('is-on');
      });
    });
    global.addEventListener('dragleave', function () {
      if (--depth <= 0) { depth = 0; veil.classList.remove('is-on'); }
    });
    global.addEventListener('drop', function (ev) {
      ev.preventDefault(); depth = 0; veil.classList.remove('is-on');
      var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
      readFile(f);
    });

    global.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && ui.cards.openId()) ui.cards.close();
    });

    /* Zweiter Boden unter der Strukturprüfung in js/store.js: die prüft nur,
       woran die Anwendung bekanntermaßen hängt. Ohne diesen Fang wäre der
       Vorhang beim Werfen schon fort, ein leerer Bildschirm ohne Knopf. */
    var stored = NS.store.loadModel();
    var standing = false;
    if (stored) {
      try {
        /* Das Modell trägt seine eigene Währung (siehe readFile()); weicht
           sie von den geladenen Einstellungen ab, gilt das Modell als
           Wahrheit, nicht die Einstellungen: sonst könnte ein Fehlschlag
           beim Schreiben der einen oder anderen Seite die falsche Paarung
           aus altem Bestand und neuer Währung (oder umgekehrt) auf die
           Bühne bringen. */
        if (stored.currency && stored.currency !== state.settings.currency) {
          state.settings.currency = stored.currency;
          applyCurrency();
          NS.store.saveSettings(state.settings);
        }
        state.model = stored;
        hideGate();
        state.arriving = true;
        refresh();
        ui.settings.setStatus(stored.warnings && stored.warnings.length ? 'warn' : 'ok',
          'stored locally');
        standing = true;
      } catch (e) {
        state.model = null;
        state.arriving = false;
        /* Ein Eintrag, der jede Strukturprüfung besteht und trotzdem beim
           Rechnen oder Zeichnen wirft, würde sonst bei jedem Neustart erneut
           anschlagen. Weg damit; die Einstellungen bleiben, sie sind heil. */
        NS.store.clearModel();
      }
    }
    if (!standing) {
      showGate('No data yet',
        'Drop the workbook with your snapshots here — or pick it. Excel, Numbers, LibreOffice, or a spreadsheet exported from Google Sheets. Only the sheet "Data Input" is read. The file stays unchanged, and nothing leaves this machine.');
      ui.settings.setStatus('none', 'no import');
      refresh();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  NS.app = { bus: bus, refresh: refresh, state: state, ui: ui };
})(typeof window !== 'undefined' ? window : globalThis);
