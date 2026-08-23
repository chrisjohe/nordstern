/* NORDSTERN — Verdrahtung.
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
  var state = { model: null, view: null, settings: NS.store.loadSettings(),
                mountainPaused: false, arriving: false };
  var ui = {};

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
     Der Vorhang deckt die Bühne ab, nicht den Kopf: ohne Daten gibt es nichts
     zu sehen, aber es muss etwas zu tun geben. Einstellungen, Lizenzen und der
     Aufbau der Mappe bleiben deshalb erreichbar — gerade dann, wenn die Mappe
     noch nicht passt. Verborgen wird nur die leere Bühne, und der Stern im
     Kopf tritt zurück, solange der große im Vorhang steht. */
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
    /* Wer hier steht, hat eine Mappe, die nicht passt — der kürzeste Weg
       weiter ist die Beschreibung dessen, was gesucht wird. */
    if (errors && errors.length) {
      box.appendChild(U.make('button', {
        type: 'button', class: 'btn btn-ghost gate-more', text: 'What the workbook needs'
      })).addEventListener('click', function () { ui.settings.open('workbook'); });
    }
    /* `inert` nimmt die verdeckte Bühne zusätzlich aus der Tabreihenfolge —
       sonst wanderte der Fokus hinter den Vorhang. */
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
    /* SheetJS liest mehr als Excel: die ODF-Tabelle aus LibreOffice, das
       Binärformat .xlsb und die Numbers-Datei vom Mac. Google Sheets hat kein
       eigenes Format — dort exportiert man nach .xlsx und ist hier richtig.
       Der Filter stand lange auf .xlsx/.xlsm allein und hat damit Dateien
       abgewiesen, die der Importer längst lesen konnte. */
    if (!/\.(xlsx|xlsm|xlsb|ods|numbers)$/i.test(file.name)) {
      toast('Not a spreadsheet nordstern can read (.xlsx, .xlsm, .xlsb, .ods, .numbers).', 'error');
      return;
    }
    ui.settings.setStatus('busy', 'reading …');
    var fr = new FileReader();
    fr.onerror = function () {
      ui.settings.setStatus('error', 'read error');
      toast('The file could not be read.', 'error');
    };
    fr.onload = function () {
      var res = NS.importer.parseArrayBuffer(fr.result, file.name);
      if (!res.ok) {
        ui.settings.setStatus('error', 'unknown structure');
        showGate('The structure does not match',
          'The file was read, but the expected layout is missing. It was not modified.',
          res.errors);
        return;
      }
      state.model = res.model;
      var saved = NS.store.saveModel(res.model);
      hideGate();
      state.arriving = true;
      refresh();
      ui.settings.setStatus(res.warnings.length ? 'warn' : 'ok',
        res.warnings.length ? res.warnings.length + (res.warnings.length === 1 ? ' note' : ' notes') : 'import ok');
      toast(res.warnings.length
        ? 'Read — with ' + res.warnings.length + ' note(s), see settings.'
        : 'Read: ' + res.model.months.length + ' months up to ' + U.monthLong(res.model.months[res.model.currentIndex].key) + '.',
        res.warnings.length ? 'warn' : 'ok');
      if (!saved.ok) toast('Could not be stored locally: ' + saved.reason, 'warn');
    };
    fr.readAsArrayBuffer(file);
  }

  function pickFile() { U.el('#filePicker').click(); }

  /* Vergessen ist mehr als den Vorhang zuziehen: die Module haben ihr Bild
     schon gezeichnet und rendern bei `null` gar nicht erst neu, blieben also
     dahinter sichtbar. Und der variable Betrag ist die einzige Zahl, die von
     Hand eingegeben wird — er muss genauso aus dem Speicher wie das Modell.
     Was hier passiert, ist deshalb dasselbe wie ein Neustart ohne Mappe:
     Speicher leer, Zustand zurück auf Werk, jedes Modul leergeräumt. */
  function forget() {
    NS.store.clearAll();
    state.model = null; state.view = null;
    state.settings = NS.store.loadSettings();       // mit den Vorgaben als Grund
    applyMotion();
    ui.position.clear();
    ui.chart.clear();
    ui.orbit.clear();
    ui.cards.clear();
    if (ui.mountain) ui.mountain.clear();
    U.el('#mountStatus').innerHTML = '';
    ui.settings.sync(null, null, state.settings);
    showGate('No data yet',
      'Drop the workbook with your snapshots here — or pick it. Only the sheets "Data Input" and "Expenses" are read.');
    ui.settings.setStatus('none', 'no import');
    ui.settings.close();
  }

  function patchSettings(patch) {
    for (var k in patch) state.settings[k] = patch[k];
    NS.store.saveSettings(state.settings);
    applyMotion();
    refresh();
  }

  /* --------------------------------------------------------------- Refresh */
  function refresh() {
    /* Ohne Modell gibt es nichts zu rechnen — die Schalter im Blatt zeigen
       trotzdem ihren wahren Stand, sonst stünde dort „off", während der
       Stern noch atmet. */
    if (!state.model) { ui.settings.sync(null, null, state.settings); return; }
    var v = NS.calc.derive(state.model, state.settings);
    var arrive = state.arriving; state.arriving = false;
    state.view = v;
    ui.position.setData(v);
    ui.chart.setData(v, arrive);
    ui.orbit.setData(v, arrive);
    ui.cards.setData(v, arrive);
    if (ui.mountain) ui.mountain.setData(v);
    ui.settings.sync(v, state.model, state.settings);
    renderStatus(v);
  }

  function renderStatus(v) {
    var box = U.el('#mountStatus');
    box.innerHTML = '';
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
    /* Der Chip ist der zweite Ort, an dem die Reserve als Ausnahme auftaucht —
       hier steht ausgeschrieben, woran sie sich misst. */
    var chip = U.make('span', {
      class: 'st-ring ' + (c.reached ? 'is-ok' : 'is-warn'),
      text: c.reached ? 'Reserve covered' : 'Reserve ' + U.pct(c.pct, 0),
      title: c.basisLabel
    });
    chip.addEventListener('pointerenter', function () { link('contingency'); });
    chip.addEventListener('pointerleave', function () { link(null); });
    box.appendChild(chip);

    var lg = U.el('#ringLegend');       /* nur Farbschlüssel — die Zahl steht oben */
    lg.className = 'lg lg-ring ' + (c.reached ? 'is-ok' : 'is-warn');
    lg.textContent = 'Reserve ring';

    if (!v.expenses.variableSet) {
      box.appendChild(U.make('button', {
        type: 'button', class: 'st-hint',
        text: 'variable amount is an estimate',
        title: 'Food, leisure and holidays are not in the workbook, so a default stands in for them. ' +
               'Every target moves with it — set your own in Settings → expenses.'
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

    ui.header = NS.header.create(U.el('#starZone'));
    NS.header.mount(U.el('#gateStar'), 84, 'gate');
    ui.position = NS.position.create(U.el('#posZone'), bus);
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

    var stored = NS.store.loadModel();
    if (stored) {
      state.model = stored;
      hideGate();
      state.arriving = true;
      refresh();
      ui.settings.setStatus(stored.warnings && stored.warnings.length ? 'warn' : 'ok',
        'stored locally');
    } else {
      showGate('No data yet',
        'Drop the workbook with your snapshots here — or pick it. Excel, Numbers, LibreOffice, or a spreadsheet exported from Google Sheets. Only the sheets "Data Input" and "Expenses" are read. The file stays unchanged, and nothing leaves this machine.');
      ui.settings.setStatus('none', 'no import');
      refresh();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  NS.app = { bus: bus, refresh: refresh, state: state, ui: ui };
})(typeof window !== 'undefined' ? window : globalThis);
