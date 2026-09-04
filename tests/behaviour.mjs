import {boot, importFixture, tick, FIXTURE, tinySheet, tinyWorkbook, TINY_ROWS, arcSweep} from './harness.mjs';
import fs from 'fs';
let pass=0, fail=0;
const ok=(c,m)=>{ if(c){pass++;} else {fail++; console.log('  ✗ '+m);} };
const sec=t=>console.log('\n== '+t);
const N=s=>String(s).replace(/\u00a0/g,' ');
const U8=(w,n)=>w.NORDSTERN.util.eur0(n);

/* ---------- 1. Leerzustand ---------- */
sec('Leerzustand ohne gespeicherte Daten');
{ const {w,errors}=await boot();
  const d=w.document;
  ok(!d.getElementById('gate').hidden,'Gate sichtbar');

  /* Der Vorhang deckt die leere Bühne ab — der Kopf bleibt bedienbar. */
  ok(d.getElementById('stage').getAttribute('aria-hidden')==='true','Bühne für AT verborgen');
  ok(d.getElementById('stage').hasAttribute('inert'),'und aus der Tabreihenfolge genommen');
  ok(!d.getElementById('shell').hasAttribute('aria-hidden'),'Kopfbereich bleibt für AT erreichbar');
  ok(d.body.classList.contains('is-gated'),'Leerzustand ist am body markiert');

  /* Und der Weg zu den Einstellungen steht offen, obwohl noch nichts gelesen wurde. */
  ok(!d.querySelector('.overlay').classList.contains('is-open'),'Einstellungen zunächst zu');
  d.getElementById('btnSettings').dispatchEvent(new w.Event('click'));
  ok(d.querySelector('.overlay').classList.contains('is-open'),'Zahnrad öffnet sie auch ohne Daten');
  /* Die Ausgaben kommen aus den Einstellungen, nicht aus der Mappe — die
     Vorgabe steht deshalb schon vor jedem Import da, nicht als Strich. */
  ok(N(d.querySelector('.sheet-facts .num').textContent)===N(w.NORDSTERN.util.eur0(w.NORDSTERN.store.DEFAULT_EXPENSES)),
     'die Ausgaben-Vorgabe steht schon ohne Import: '+d.querySelector('.sheet-facts .num').textContent);

  /* Eine Ebene: sechs Namen links, genau ein Abschnitt rechts. */
  const tabs=[...d.querySelectorAll('.sheet-nav-item')];
  const shown=()=>[...d.querySelectorAll('.sheet-sec')].filter(p=>!p.hidden).map(p=>p.dataset.sec);
  const sel=()=>tabs.filter(b=>b.getAttribute('aria-selected')==='true').map(b=>b.textContent).join();
  const key=(el,k)=>el.dispatchEvent(new w.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));
  ok(shown().length===1,'immer genau ein Paneel sichtbar: '+shown().join(' + '));
  ok(sel()==='expenses'&&shown().join()==='expenses','beim Öffnen steht expenses: '+sel());
  tabs[2].dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  ok(sel()==='workbook'&&shown().join()==='workbook','Klick tauscht das Paneel: '+shown().join());
  ok(tabs.every(b=>b.tabIndex===(b.getAttribute('aria-selected')==='true'?0:-1)),
     'die Liste ist ein einziger Tabstopp');
  key(tabs[2],'ArrowDown');
  ok(shown().join()==='motion','↓ wandert weiter: '+shown().join());
  key(tabs[3],'End');
  ok(shown().join()==='about','Ende springt ans Ende: '+shown().join());
  key(tabs[4],'ArrowDown');
  ok(shown().join()==='expenses','und läuft dabei rundherum: '+shown().join());
  ok(tabs.every(b=>b.getAttribute('role')==='tab'&&d.getElementById(b.getAttribute('aria-controls'))),
     'jeder Name zeigt auf sein Paneel');
  ok([...d.querySelectorAll('.sheet-sec')].every(p=>p.getAttribute('role')==='tabpanel'
       &&d.getElementById(p.getAttribute('aria-labelledby'))===tabs.find(b=>b.id===p.getAttribute('aria-labelledby'))),
     'und jedes Paneel zurück auf seinen Namen');
  d.querySelector('.sheet-scrim').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));

  ok(d.querySelector('.sheet-sec[data-sec="source"] .sheet-status .meta-import').textContent==='no import',
     'Importstatus steht oben im Abschnitt „data source“');

  ok(d.getElementById('mountFallback').hasAttribute('hidden'),'Ersatztext ist ausgeblendet');
  /* Gegen Bilder auf den Karten haben wir uns entschieden — es gibt keinen
     Weg mehr, eine Datei neben der Anwendung nachzuladen. */
  ok(d.querySelectorAll('.card-wash').length===8,'acht gerechnete Verläufe');
  ok(d.querySelectorAll('.rail .card').length===8,'acht Cards');
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 2. Import + Persistenz ---------- */
sec('Import, Persistenz, Wiederöffnen');
const store={};
{ const {w,errors}=await boot({storage:store});
  const res=importFixture(w);
  ok(res.ok,'Import ok');
  ok(res.warnings.length===0,'keine Warnungen: '+res.warnings.join(' | '));
  ok(Object.keys(store).some(k=>k.includes('model')),'Modell gespeichert');
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}
{ const {w,errors}=await boot({storage:store});
  const d=w.document;
  ok(d.getElementById('gate').hidden,'Gate zu nach Neustart');
  ok(N(d.querySelector('.hero-val').textContent)==='450.239 €','Net Worth aus Speicher: '+d.querySelector('.hero-val').textContent);
  /* Eine Genauigkeit für den ganzen Block. Zwei Nachkommastellen beim Stand
     und keine bei der Kennzahl darunter läse sich wie zwei verschiedene
     Messungen — es ist dieselbe Spalte derselben Mappe. */
  { const money=[d.querySelector('.hero-val'),
                 ...d.querySelectorAll('.hero-deltas .delta-abs'),
                 ...d.querySelectorAll('.kpi-val'),...d.querySelectorAll('.kpi-sub')]
                .map(n=>N(n.textContent)).filter(t=>t.includes('€'));
    ok(money.length>=7&&money.every(t=>!/,\d/.test(t)),
       'kein Cent in der Position: '+money.join(' · ')); }
  const kpi=lab=>[...d.querySelectorAll('.kpi')].find(k=>k.querySelector('.kpi-lab').textContent===lab);
  ok(kpi('As of').querySelector('.kpi-val').textContent==='August 2026','Datenstand als Kennzahl: '+kpi('As of').querySelector('.kpi-val').textContent);
  ok(kpi('Snapshots').querySelector('.kpi-val').textContent==='84','Snapshots als Kennzahl: '+kpi('Snapshots').querySelector('.kpi-val').textContent);

  /* Der Hebel: 883.024,38 / 450.239,15 = 1,96. Er steht neben dem Tempo, weil
     beide nichts über den Stand sagen, sondern über seine Art. */
  ok(!!kpi('Leverage'),'es gibt eine Kennzahl „Leverage"');
  ok(kpi('Leverage').querySelector('.kpi-val').textContent==='1,96\u00d7',
     'Eigenkapitalhebel: '+kpi('Leverage').querySelector('.kpi-val').textContent);
  ok(N(kpi('Leverage').querySelector('.kpi-sub').textContent)==='49,0 % of assets is debt',
     'und der Schuldenanteil darunter: '+N(kpi('Leverage').querySelector('.kpi-sub').textContent));
  /* Die Zahl muss zur Legende der Scheibe passen, sonst stehen zwei Wahrheiten
     über dieselbe Sache auf demselben Schirm. */
  const liabPct=d.querySelector('.legend-row[data-id="liabilities"] .legend-pct');
  ok(N(liabPct.textContent).replace('-','')===N(kpi('Leverage').querySelector('.kpi-sub').textContent).split(' ').slice(0,2).join(' '),
     'derselbe Anteil wie in der Legende: '+liabPct.textContent);

  /* Vorzeichen bekommen in beide Richtungen Farbe. */
  ok(kpi('Portfolio pace').classList.contains('is-pos'),
     'ein positives Tempo ist als solches gekennzeichnet: '+kpi('Portfolio pace').className);
  const rangeOn=[...d.querySelectorAll('.range .range-btn')].filter(b=>b.getAttribute('aria-pressed')==='true');
  ok(d.querySelectorAll('.range .range-btn').length===4&&rangeOn.length===1&&rangeOn[0].textContent==='5 years',
    'Verlauf startet auf 5 Jahren, vier Zeiträume: '+[...d.querySelectorAll('.range .range-btn')].map(b=>b.textContent).join(' · '));

  /* Drei Lesarten, eine Linie: der Schalter tauscht die Reihe aus. */
  const ser=[...d.querySelectorAll('.series .range-btn')];
  const serBy=n=>ser.find(b=>b.textContent===n);
  const on=()=>ser.filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.textContent);
  const lineD=()=>d.querySelector('.chart-line').getAttribute('d');
  const label=()=>d.querySelector('.chart-svg').getAttribute('aria-label');
  const before=lineD();
  ok(on().join()==='Net'&&label().startsWith('Net worth from'),'Vorauswahl ist Net: '+on().join());
  const click=b=>{b.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));};
  click(serBy('Total')); await tick(20);
  const totalD=lineD();
  ok(on().join()==='Total'&&label().startsWith('Total assets from'),'Total schaltet um: '+on().join());
  ok(totalD!==before,'Total zeichnet eine andere Kurve');
  click(serBy('Invested')); await tick(20);
  ok(on().join()==='Invested'&&label().startsWith('Invested assets from'),'Invested schaltet um: '+on().join());
  ok(lineD()!==before&&lineD()!==totalD,'alle drei Reihen unterscheiden sich');
  ok(d.querySelectorAll('.chart-line').length===1&&d.querySelectorAll('.chart-last').length===1,
     'es bleibt bei genau einer Linie und einem Endpunkt');
  click(serBy('Net')); await tick(20);
  ok(lineD()===before&&label().startsWith('Net worth from'),'Zurückschalten stellt den alten Stand her');
  ok(d.querySelector('.sheet-status .meta-import').textContent==='stored locally',
     'Speicherstatus im Abschnitt „data source“: '+d.querySelector('.sheet-status .meta-import').textContent);
  /* Der Zeitpunkt des Imports kommt aus js/util.js und sieht überall gleich
     aus: Tag, Monat, Jahr, Uhrzeit — ohne Sekunden. */
  const readOn=[...d.querySelectorAll('#settingsZone dt')].find(n=>n.textContent==='Read on');
  ok(readOn&&/^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}$/.test(readOn.nextElementSibling.textContent),
     'der Lesezeitpunkt steht in einer Schreibweise: '+(readOn&&readOn.nextElementSibling.textContent));
  ok(errors.length===0,'keine Fehler');
  w.close();
}

/* ---------- 2b. Beschädigter Speicher ---------- */
/* Die Versionsnummer allein ist keine Zusicherung. Was im localStorage steht,
   kann abgeschnitten, halb überschrieben oder von Hand gesetzt sein — und
   fällt es beim ersten Zugriff um, ist der Leerzustand schon ausgeblendet und
   der Bildschirm bleibt leer, ohne Weg zurück. Also: als läge nichts da. */
sec('Beschädigtes Modell im Speicher');
{
  const KEY=Object.keys(store).find(k=>k.includes('model'));
  const good=JSON.parse(store[KEY]);
  const bend=f=>{const m=JSON.parse(store[KEY]); f(m); return JSON.stringify(m);};
  const broken={
    'nur die Versionsnummer':          JSON.stringify({version:good.version}),
    'kaputtes JSON':                   '{"version":'+good.version+',"months":[',
    'currentIndex neben der Reihe':    JSON.stringify({...good,currentIndex:good.months.length+5}),
    'ein Monat ohne Net Worth':        JSON.stringify({...good,months:good.months.map((m,i)=>i===3?{...m,netWorth:null}:m)}),
    'keine Monate':                    JSON.stringify({...good,months:[]}),
    /* Alles, was durch die erste Fassung der Prüfung noch durchkam und dann
       beim Start warf — die Zahl zwischen zwei Monaten, das leere Konto. */
    'currentIndex als Bruch':          JSON.stringify({...good,currentIndex:0.5}),
    'ein Konto ist null':              bend(m=>{m.accounts.liquid=[null];}),
    'ein Konto ohne Stände':           bend(m=>{delete m.accounts.liquid[0].values;}),
    'eine zu kurze Kontenreihe':       bend(m=>{m.accounts.liquid[0].values.pop();}),
    'ein Stand ist keine Zahl':        bend(m=>{m.accounts.liquid[0].values[3]=null;}),
    'die Verbindlichkeiten sind hin':  bend(m=>{m.accounts.liabilities=[{name:'Darlehen'}];}),
    'ein Monatsschlüssel entstellt':   bend(m=>{m.months[2].key='2026-8';}),
    /* Eine laxe Prüfung (\d{2} passt auf jede zweistellige Zahl) würde
       '2026-99' durchlassen — der Monat muss im Kalender vorkommen. */
    'ein Monat mit Monat 99':          bend(m=>{m.months[2].key='2026-99';}),
    /* Jedes Feld eines Monats zählt, nicht nur liquid und investment — ein
       Monat ohne tangible darf nicht unbemerkt NaN in die Rechnung tragen. */
    'tangible fehlt in einem Monat':   bend(m=>{delete m.months[3].tangible;}),
    /* Die Versionsnummer allein ist der schnellste Weg, ein Modell aus einer
       alten Form zu verwerfen. */
    'alte Modellversion (v2)':         JSON.stringify({...good,version:2})
  };
  for(const [what,raw] of Object.entries(broken)){
    const {w,errors}=await boot({storage:{[KEY]:raw}});
    const d=w.document;
    ok(!d.getElementById('gate').hidden,what+': der Leerzustand steht');
    ok(errors.length===0,what+': ohne Fehler — '+errors.join(' | '));
    ok(d.querySelector('.sheet-status .meta-import').textContent==='no import',
       what+': und die Einstellungen sagen es — '+d.querySelector('.sheet-status .meta-import').textContent);
    w.close();
  }
  /* Und das heile Modell kommt weiter durch — die Prüfung darf nicht mehr
     aussortieren, als sie soll. */
  const {w}=await boot({storage:{...store}});
  ok(w.NORDSTERN.store.loadModel()!==null,'das heile Modell lädt unverändert');
  w.close();

  /* Der zweite Boden: das Modell besteht jede Prüfung, und die Berechnung
     wirft trotzdem. Dann steht der Vorhang, statt dass ein leerer Bildschirm
     ohne Knopf zurückbleibt. */
  { const {w,errors}=await boot({storage:{...store},
      patch:win=>{ win.NORDSTERN.calc.derive=()=>{ throw new TypeError('geplatzt'); }; }});
    const d=w.document;
    ok(!d.getElementById('gate').hidden,'wirft die Berechnung, steht der Leerzustand');
    ok(d.querySelector('.sheet-status .meta-import').textContent==='no import',
       'und die Einstellungen sagen es: '+d.querySelector('.sheet-status .meta-import').textContent);
    ok(!d.querySelector('.hero-val'),'auf der Bühne steht nichts Halbfertiges');
    ok(errors.length===0,'und nichts dringt als Ausnahme nach draussen: '+errors.join(' | '));
    w.close();
  }
}

/* ---------- 3. Monatliche Ausgaben wirken sofort ---------- */
sec('Monatliche Ausgaben verschieben alle Ziele');
{ const {w,errors}=await boot({storage:{...store}});
  const d=w.document;
  const before=d.querySelector('.card[data-id="coast"]').dataset.status;
  const beforeTarget=d.querySelector('.card[data-id="coast"] .f-target').textContent;
  /* Der Hinweis unter dem Berg meint die Ausgaben — und landet dort auch. */
  d.querySelector('.st-hint').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  ok(d.querySelector('.overlay').classList.contains('is-open'),'der Hinweis öffnet das Blatt');
  ok(d.querySelector('.sheet-nav-item[aria-selected="true"]').textContent==='expenses',
     'und zwar in expenses: '+d.querySelector('.sheet-nav-item[aria-selected="true"]').textContent);
  /* Der Betrag ist bewusst gross: die Vorgabe von 2.500 € liegt weit unter dem
     Depot der Beispielmappe (345.198,39 €), ein kleiner Ausschlag verschöbe
     keine einzige Station über ihre Schwelle. */
  const inp=d.getElementById('setExp');
  inp.value='6000'; inp.dispatchEvent(new w.Event('input'));
  await tick(30);
  const after=d.querySelector('.card[data-id="coast"]').dataset.status;
  const afterTarget=d.querySelector('.card[data-id="coast"] .f-target').textContent;
  ok(before==='reached'&&after==='current','Coast FI kippt von erreicht auf aktuell ('+before+'→'+after+')');
  /* Vorher steht die Vorgabe von 2.500 € im Betrag, nicht null — der Hinweis
     oben ist trotzdem da, weil sie niemand bestätigt hat. */
  ok(N(beforeTarget)==='150.000 €','Ziel vorher '+beforeTarget);
  ok(N(afterTarget)==='360.000 €','Ziel nachher '+afterTarget);
  ok(N(d.querySelector('.sheet-facts .is-total').textContent)==='6.000 €','Gesamtausgaben: '+d.querySelector('.sheet-facts .is-total').textContent);
  ok(!d.querySelector('.st-hint'),'Hinweis „expenses are an estimate“ verschwindet');
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 2b. Ausgabenfeld: Klammern beim Verlassen, nicht beim Tippen ---------- */
/* Während des Tippens bleibt das Zahlenfeld unangetastet, damit "10001" nicht
   unter der Hand zu "10000" wird. Beim Verlassen (blur) zeigt es dagegen, was
   wirklich angewendet wurde — geklemmt auf 0..10000, wie der Regler und die
   gespeicherte Einstellung. */
sec('Ausgabenfeld klemmt beim Verlassen auf die Vorgabe');
{ const {w,errors}=await boot({storage:{...store}});
  const d=w.document;
  d.querySelector('.st-hint').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  const inp=d.getElementById('setExp');
  const range=d.querySelector('.field-range');

  /* Fokus wie bei echter Eingabe — sonst schreibt der Re-Render aus dem
     Zustand das Feld sofort zurück (settings.js gleicht nur ab, während es
     nicht das aktive Element ist). */
  inp.focus();
  inp.value='10001'; inp.dispatchEvent(new w.Event('input'));
  ok(inp.value==='10001','während des Tippens bleibt das Feld unangetastet: '+inp.value);
  inp.dispatchEvent(new w.Event('blur'));
  ok(inp.value==='10000','beim Verlassen klemmt das Feld auf die Vorgabe: '+inp.value);
  ok(range.value==='10000','der Regler steht ebenfalls auf der Vorgabe: '+range.value);
  ok(w.NORDSTERN.app.state.settings.monthlyExpenses===10000,
     'und die gespeicherte Einstellung stimmt überein: '+w.NORDSTERN.app.state.settings.monthlyExpenses);

  /* Das leere Feld ist der Sonderfall von vorher — er muss weiter gelten. */
  inp.value=''; inp.dispatchEvent(new w.Event('input'));
  inp.dispatchEvent(new w.Event('blur'));
  ok(inp.value==='0','ein leergeräumtes Feld landet auf 0: '+inp.value);
  ok(range.value==='0','der Regler folgt auf 0: '+range.value);
  ok(w.NORDSTERN.app.state.settings.monthlyExpenses===0,
     'und die Einstellung ebenfalls: '+w.NORDSTERN.app.state.settings.monthlyExpenses);

  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 3b. Währung ---------- */
/* Die Formatierer selbst — eigenes, kurzlebiges Fenster, das am Ende
   verworfen wird. Sonst rechnete jede folgende Reihe in Dollar weiter, weil
   setCurrency() den Zustand an den Formatierern selbst hält, nicht am
   Fenster. */
sec('Währung: Formatierer');
{ const {w,errors}=await boot();
  const Ut=w.NORDSTERN.util;
  Ut.setCurrency('USD');
  ok(Ut.eur(1234.56)==='$1,234.56','USD: eur() '+Ut.eur(1234.56));
  ok(Ut.eur0(450239)==='$450,239','USD: eur0() '+Ut.eur0(450239));
  ok(Ut.pct(0.125)==='12.5 %','USD-Locale: pct() bleibt bei Punkt und Leerzeichen vor %: '+Ut.pct(0.125));
  ok(Ut.eurShort(1250000)==='1.25M','USD: eurShort(1250000) '+Ut.eurShort(1250000));
  ok(Ut.eurShort(2000000)==='2M','USD: eurShort(2000000) '+Ut.eurShort(2000000));
  ok(Ut.currencySymbol()==='$','USD-Symbol: '+Ut.currencySymbol());
  const dt=Ut.dateTime('2026-08-23T16:30:00Z');
  ok(!/AM|PM/.test(dt),'24-Stunden-Uhr auch bei US-Locale: '+dt);

  Ut.setCurrency('GBP');
  ok(Ut.eur(1234.56)==='£1,234.56','GBP: eur() '+Ut.eur(1234.56));

  /* Das Gruppierzeichen von de-CH schwankt zwischen ICU-Fassungen (Apostroph
     oder schmales Leerzeichen) — geprüft wird nur, was sich verlässlich sagen
     lässt: der Code führt, die Nachkommastellen stimmen. */
  Ut.setCurrency('CHF');
  const chf=Ut.eur(1234.56);
  ok(chf.indexOf('CHF')===0&&chf.indexOf('234.56')>=0,
     'CHF beginnt mit dem Code und trägt die Nachkommastellen: '+chf);

  ok(Ut.setCurrency('XXX')==='EUR','unbekannter Code fällt beim Setzen auf EUR zurück');
  ok(N(Ut.eur(1234.56))==='1.234,56 €','und die Schreibweise ist wieder deutsch: '+N(Ut.eur(1234.56)));

  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* Oberfläche, Persistenz über einen Neustart und Rückbau durch „Delete local
   data“ — an einem eigenen Speicherobjekt, das eine Kopie der Mappe aus
   Abschnitt 2 trägt, damit '.hero-val' von Anfang an etwas zeigt. */
sec('Währung: Oberfläche, Neustart, Löschen');
{ const cur={...store};
  const {w,errors}=await boot({storage:cur});
  const d=w.document;
  d.getElementById('btnSettings').dispatchEvent(new w.Event('click'));
  const sel=d.getElementById('setCurrency');
  ok(!!sel,'#setCurrency steht im Blatt „data source“');
  const optVals=[...sel.options].map(o=>o.value);
  ok(optVals.join(',')==='EUR,USD,GBP,CHF','vier Optionen in dieser Reihenfolge: '+optVals.join(','));
  ok(sel.value==='EUR','Anfangswert EUR');
  const unit=d.querySelector('.field-unit');
  ok(N(unit.textContent)==='€','Einheit neben dem Ausgabenbetrag zu Beginn: '+unit.textContent);

  sel.value='USD';
  sel.dispatchEvent(new w.Event('change'));
  await tick(30);
  const hero=()=>d.querySelector('.hero-val').textContent;
  ok(hero().startsWith('$'),'Nettovermögen steht jetzt in Dollar: '+hero());
  ok(hero()==='$450,239','und mit dem erwarteten Betrag der Beispielmappe: '+hero());
  ok((cur['nordstern.settings.v1']||'').includes('"currency":"USD"'),
     'die Wahl liegt im Speicher: '+cur['nordstern.settings.v1']);
  ok(N(unit.textContent)==='$','Einheit folgt der neuen Währung: '+unit.textContent);

  sel.value='EUR';
  sel.dispatchEvent(new w.Event('change'));
  await tick(30);
  ok(N(hero())==='450.239 €','zurück auf EUR steht wieder der ursprüngliche Text: '+hero());

  /* Erneut auf USD — für den Neustart-Vergleich gleich im Anschluss. */
  sel.value='USD';
  sel.dispatchEvent(new w.Event('change'));
  await tick(30);
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();

  /* Neustart auf demselben Speicher: die Wahl übersteht ihn, und die Bühne
     zeigt von der ersten Zeichnung an Dollar — nicht erst EUR und dann
     ruckartig um. */
  const again=await boot({storage:cur});
  ok(again.w.NORDSTERN.app.state.settings.currency==='USD','die Währung überlebt den Neustart');
  ok(again.w.document.querySelector('.hero-val').textContent.startsWith('$'),
     'und die Bühne steht sofort in Dollar: '+again.w.document.querySelector('.hero-val').textContent);
  ok(again.errors.length===0,'keine Fehler: '+again.errors.join(' | '));

  /* „Delete local data“ setzt die Währung mit zurück auf die Vorgabe —
     dieselbe Prüfung wie für den Ausgabenbetrag (Abschnitt 14), hier für
     die Währung. */
  again.w.confirm=()=>true;
  const del=[...again.w.document.querySelectorAll('#settingsZone button')]
    .find(b=>/Delete local data/.test(b.textContent));
  ok(!!del,'der Knopf ist da');
  del.dispatchEvent(new again.w.MouseEvent('click',{bubbles:true}));
  await tick(60);
  ok(again.w.NORDSTERN.app.state.settings.currency==='EUR','Löschen setzt die Währung zurück auf EUR');
  again.w.close();
}

/* Ein Code, den es nicht gibt, im Speicher noch vor dem ersten Start —
   loadSettings() in js/store.js muss ihn beim Laden abfangen. */
sec('Währung: unbekannter Code im Speicher');
{ const {w,errors}=await boot({storage:{'nordstern.settings.v1':JSON.stringify({currency:'XXX'})}});
  ok(w.NORDSTERN.app.state.settings.currency==='EUR',
     'ein unbekannter Code fällt beim Laden auf EUR zurück: '+w.NORDSTERN.app.state.settings.currency);
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* Import übernimmt die von der Mappe erkannte Währung (js/app.js, readFile). */
sec('Währung: Import übernimmt die Formatwährung');
{ /* Die Beispielmappe trägt kein Währungsformat, und XLSX.write/read verliert
     Zellformate ohnehin — eine echte USD-Mappe lässt sich so nicht bauen.
     Geprüft wird deshalb der Übernahmepfad in app.js: parseArrayBuffer wird
     umhüllt und behauptet `currency: 'USD'`, wie es der Importer bei einer
     echten USD-Mappe täte. */
  const {w,errors}=await boot();
  const orig=w.NORDSTERN.importer.parseArrayBuffer;
  w.NORDSTERN.importer.parseArrayBuffer=function(){
    var r=orig.apply(null,arguments);
    if (r.ok) r.currency='USD';
    return r;
  };
  const d=w.document;
  const buf=fs.readFileSync(FIXTURE);
  const ab=buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);
  const file=new w.File([ab],'nordstern-example.xlsx');
  const picker=d.getElementById('filePicker');
  Object.defineProperty(picker,'files',{value:[file],configurable:true});
  picker.dispatchEvent(new w.Event('change'));
  await tick(120);
  ok(w.NORDSTERN.app.state.settings.currency==='USD',
     'die Einstellung übernimmt die erkannte Währung: '+w.NORDSTERN.app.state.settings.currency);
  ok(d.querySelector('.hero-val').textContent.startsWith('$'),
     'die Bühne rendert sofort in Dollar: '+d.querySelector('.hero-val').textContent);
  ok(d.getElementById('toast').textContent.includes('Amounts shown in USD'),
     'der Toast nennt den Wechsel: '+d.getElementById('toast').textContent);
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* Zwei Dateidialoge kurz hintereinander: wenn die zuerst gewählte Mappe
   grösser ist, kann ihr FileReader nach dem zweiten fertig werden. Ohne
   Gegenmassnahme gewinnt dann der langsamere, veraltete Import (js/app.js,
   readFile/importSeq). */
sec('Import: eine spät eintreffende erste Auswahl überschreibt die zweite nicht');
{ const {w,errors}=await boot();
  const d=w.document;
  const orig=w.NORDSTERN.importer.parseArrayBuffer;
  w.NORDSTERN.importer.parseArrayBuffer=function(){
    const r=orig.apply(null,arguments);
    if (r.ok) r.model._src=arguments[1];   // Marke, um die zwei Importe auseinanderzuhalten
    return r;
  };
  /* Ein FileReader, der nichts von selbst tut: `finish` löst `onload` erst auf
     Zuruf aus, damit die Reihenfolge der Antworten in der Hand des Tests
     liegt, nicht in der Länge der Datei. */
  const pending=[];
  w.FileReader=function () { pending.push(this); };
  w.FileReader.prototype.readAsArrayBuffer=function (file) { this.file=file; };
  const buf=fs.readFileSync(FIXTURE);
  const ab=buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);
  function finish(reader) { reader.result=ab; reader.onload(); }

  const picker=d.getElementById('filePicker');
  const first=new w.File([ab],'first.xlsx');
  const second=new w.File([ab],'second.xlsx');
  Object.defineProperty(picker,'files',{value:[first],configurable:true});
  picker.dispatchEvent(new w.Event('change'));
  Object.defineProperty(picker,'files',{value:[second],configurable:true});
  picker.dispatchEvent(new w.Event('change'));
  ok(pending.length===2,'beide Auswahlen haben einen Reader angelegt: '+pending.length);

  finish(pending[1]);            // die zweite, jüngere Auswahl kommt zuerst an
  await tick(20);
  finish(pending[0]);            // die erste, ältere Auswahl trudelt verspätet ein
  await tick(20);

  ok(w.NORDSTERN.app.state.model && w.NORDSTERN.app.state.model._src==='second.xlsx',
     'im Zustand steht das Ergebnis der zweiten Auswahl: '+(w.NORDSTERN.app.state.model&&w.NORDSTERN.app.state.model._src));
  const stored=w.NORDSTERN.store.loadModel();
  ok(stored && stored._src==='second.xlsx',
     'auch im Speicher steht die zweite Auswahl: '+(stored&&stored._src));
  ok(d.querySelector('.meta-import').textContent!=='read error',
     'der Status zeigt keinen Fehler aus dem verspäteten ersten Import: '+d.querySelector('.meta-import').textContent);
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 4. Card ↔ Berg ---------- */
sec('Verbindung Card ↔ Berg');
{ const {w,errors}=await boot({storage:{...store}});
  const d=w.document;
  const card=d.querySelector('.card[data-id="lean"]');
  card.dispatchEvent(new w.Event('pointerenter'));
  await tick(20);
  ok(card.classList.contains('is-linked'),'Hover verlinkt die Card');
  card.dispatchEvent(new w.Event('click'));
  await tick(20);
  ok(card.classList.contains('is-flipped'),'Klick dreht die Card');
  ok(card.getAttribute('aria-expanded')==='true','aria-expanded gesetzt');
  const others=[...d.querySelectorAll('.card')].filter(c=>c!==card&&c.classList.contains('is-flipped'));
  ok(others.length===0,'nur eine Card offen');
  // Auswahl vom Berg her
  w.NORDSTERN.app.bus.emit('mountain:select',{id:'fat'});
  await tick(20);
  ok(w.NORDSTERN.app.ui.mountain.peek().paused===true,'offene Card pausiert die Bergrotation');
  ok(d.querySelector('.card[data-id="fat"]').classList.contains('is-flipped'),'Klick auf Station dreht die zugehörige Card');
  ok(!card.classList.contains('is-flipped'),'vorherige Card schließt');
  // Escape
  d.querySelector('.card[data-id="fat"]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  await tick(20);
  ok(!d.querySelector('.card[data-id="fat"]').classList.contains('is-flipped'),'Escape schließt');
  ok(w.NORDSTERN.app.ui.mountain.peek().paused===false,'Rotation wird wieder freigegeben');
  // Rückseite: Kreuz, Fortschrittsbalken, Prozent unten rechts, kein Fachbegriff
  const bk=d.querySelector('.card[data-id="lean"] .card-back');
  ok(bk.querySelector('.card-bar i').style.width===d.querySelector('.card[data-id="lean"] .card-front .card-bar i').style.width,
     'Fortschrittsbalken auf beiden Seiten gleich');
  ok([...bk.querySelectorAll('.card-facts dd, .card-back-foot .f-pct')].every(n=>!/,\d/.test(n.textContent)),
     'keine Dezimalstellen auf der Karte: '+[...bk.querySelectorAll('.card-facts dd')].map(n=>n.textContent).join(' · '));
  /* Woran sich die Station misst, steht in der Zeile, die den Betrag trägt. */
  const basis=[...d.querySelectorAll('.card')].map(c=>({
    id:c.dataset.id, w:c.querySelector('.f-value-lab').textContent,
    q:c.querySelector('.f-value-lab i').textContent,
    t:c.querySelector('.f-value-lab').getAttribute('title')}));
  ok(basis.filter(b=>b.q==='liquid').map(b=>b.id).join()==='contingency',
     'genau die Reserve zählt gegen liquide Mittel: '+basis.filter(b=>b.q==='liquid').map(b=>b.id).join());
  ok(basis.filter(b=>b.q==='invested').length===7,
     'die sieben Stationen zählen gegen das Depot: '+basis.filter(b=>b.q==='invested').length);
  /* Der ausgeschriebene Grund hängt an derselben Zeile — und stammt aus calc.js,
     damit Zielbetrag und Erklärung nicht auseinanderlaufen können. */
  const MS=Object.fromEntries(w.NORDSTERN.calc.MILESTONES.map(m=>[m.id,m.basisLabel]));
  ok(basis.every(b=>b.t===MS[b.id]),'jede Zeile trägt ihre Begründung: '+basis[0].t);
  ok(/covered by liquid assets$/.test(MS.contingency)&&/covered by investments$/.test(MS.fat),
     'und die Begründung nennt die Deckung: '+MS.contingency);
  ok(/from liquid assets$/.test(d.querySelector('.card[data-id="contingency"]').getAttribute('aria-label'))
     &&/from invested assets$/.test(d.querySelector('.card[data-id="fat"]').getAttribute('aria-label')),
     'auch vorgelesen: '+d.querySelector('.card[data-id="contingency"]').getAttribute('aria-label'));
  ok(d.querySelector('.st-ring').getAttribute('title')===MS.contingency,
     'der Reservechip über dem Berg sagt dasselbe: '+d.querySelector('.st-ring').getAttribute('title'));
  // Contingency-Card muss den Reservering im Fundament heben
  const cc=d.querySelector('.card[data-id="contingency"]');
  cc.dispatchEvent(new w.Event('pointerenter'));
  await tick(20);
  ok(cc.classList.contains('is-linked'),'Contingency-Card verlinkt');
  ok(w.NORDSTERN.app.ui.mountain.peek().ringHover===true,'Reservering wird hervorgehoben');
  cc.dispatchEvent(new w.Event('pointerleave'));
  await tick(20);
  ok(w.NORDSTERN.app.ui.mountain.peek().ringHover===false,'Hervorhebung endet wieder');
  // Station-Hover setzt den Marker, nicht den Ring
  d.querySelector('.card[data-id="semi"]').dispatchEvent(new w.Event('pointerenter'));
  await tick(20);
  const pk=w.NORDSTERN.app.ui.mountain.peek();
  ok(pk.hover==='semi'&&pk.ringHover===false,'Station-Hover trifft den Marker ('+pk.hover+')');
  ok(pk.markers===7,'sieben Marker sind zeichnerisch verankert ('+pk.markers+')');
  // Drehen muss Teile des Berges verdecken — sonst wirkt er durchsichtig
  const cv=d.getElementById('mountain'); const hid=new Set();
  for(let k=0;k<24;k++){ cv.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight'})); await tick(18); hid.add(w.NORDSTERN.app.ui.mountain.peek().hiddenMarkers); }
  ok(Math.max(...hid)>0,'Marker hinter dem Berg werden als verdeckt erkannt ('+[...hid].sort().join(',')+')');
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 4b. Chart: Vorjahres-Sichtfenster ---------- */
sec('Vorjahreslinie folgt dem Zeiger');
{ const {w,errors}=await boot({storage:{...store}});
  const d=w.document;
  ok(d.querySelector('.chart-ya-stub[mask]')&&d.querySelector('.chart-ya-full[mask]'),'beide Vorjahres-Pfade sind ausgeblendet');
  const grad=d.querySelector('#nsYaCursor');
  const before=grad.getAttribute('x1');
  const body=d.querySelector('.chart-body');
  const ev=new w.Event('pointermove'); ev.clientX=300; ev.clientY=80;
  body.dispatchEvent(ev);
  await tick(20);
  ok(body.classList.contains('is-probing'),'Chart erkennt den Zeiger');
  ok(grad.getAttribute('x1')!==before,'Sichtfenster wandert mit ('+grad.getAttribute('x1')+' … '+grad.getAttribute('x2')+')');
  const span=Number(grad.getAttribute('x2'))-Number(grad.getAttribute('x1'));
  ok(span>0 && span < 520,'Fenster bleibt ein Ausschnitt, nicht die ganze Linie ('+span.toFixed(0)+'px)');

  /* Das Lesefenster läuft mit der Linie mit: wo sie tief liegt, bleibt es im
     Chart; wo sie hoch steht, tritt es über den Rand hinaus, statt sich vom
     hohen Kurvenpunkt verdecken zu lassen. */
  const tip=d.querySelector('.chart-tip');
  const hover=x=>{ const e=new w.Event('pointermove'); e.clientX=x; e.clientY=300; body.dispatchEvent(e); };
  ok(tip.classList.contains('is-on'),'das Lesefenster ist da');
  hover(40);
  const early=Number.parseFloat(tip.style.top);
  hover(505);
  const late=Number.parseFloat(tip.style.top);
  ok(early>0,'wo die Linie tief liegt, bleibt es im Chart: top '+early);
  ok(late<0,'wo sie hoch steht, tritt es darüber hinaus: top '+late);
  ok(late<early,'es folgt also der Linie: '+early+' → '+late);
  ok(Number.parseFloat(tip.style.left)>=4,'waagerecht folgt es dem Punkt: left '+tip.style.left);

  /* Und die Prozentzahl darin kommt aus derselben Funktion wie die Kachel
     darüber: aus einem negativen Vorjahreswert heraus ist −100 → −50 ein
     Plus von 50 %, nicht ein Minus von 150 % mit umgedrehtem Vorzeichen. */
  const mm=JSON.parse(JSON.stringify(w.NORDSTERN.store.loadModel()));
  const LL=mm.currentIndex;
  mm.months[LL].netWorth=-50; mm.months[LL-12].netWorth=-100;
  w.NORDSTERN.app.state.model=mm; w.NORDSTERN.app.refresh(); await tick(30);
  hover(600);
  const ya=[...d.querySelectorAll('.chart-tip .tip-row')].find(r=>r.textContent.includes('vs. last year'));
  ok(ya,'das Lesefenster nennt den Vorjahresvergleich');
  ok(N(ya.querySelector('b').textContent).includes('+50,0 %'),
     'aus −100 wird +50 %, nicht −150 %: '+N(ya.querySelector('b').textContent));
  ok(ya.querySelector('b').classList.contains('pos'),'und die Verbesserung steht nicht in Rot');
  ok(w.NORDSTERN.calc.rel(-50,-100)===0.5,'Chart und Kennzahlen rechnen dieselbe Zahl');

  body.dispatchEvent(new w.Event('pointerleave'));
  await tick(20);
  ok(!body.classList.contains('is-probing'),'nach dem Verlassen wieder nur die Randspuren');
  ok(!tip.classList.contains('is-on'),'und das Lesefenster gibt die Schalter sofort wieder frei');
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 4c. Chart: Stationslinien ---------- */
/* Nur „Invested" misst gegen dieselbe Größe wie die sieben Stationen — auf
   Net oder Total stünde die Schwelle an der falschen Stelle. Die Gruppe
   g.chart-stations steht trotzdem immer im SVG, auch leer, damit sich der
   Aufbau des Dokuments nicht mit der gewählten Reihe ändert. */
sec('Stationslinien im Verlauf');
{ const {w,errors}=await boot({storage:{...store}});
  const d=w.document;
  const stationsG=()=>d.querySelector('.chart-stations');
  const stations=()=>[...stationsG().querySelectorAll('.chart-station')];
  const click=b=>b.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  const clickText=(sel,text)=>click([...d.querySelectorAll(sel)].find(b=>b.textContent===text));

  /* 1: Vorauswahl ist Net — die Gruppe ist da, aber leer; auf Total ebenso. */
  ok(!!stationsG(),'g.chart-stations steht im SVG, auch ohne Stationen');
  ok(stations().length===0,'auf Net zeigt sie keine Station: '+stations().length);
  clickText('.series .range-btn','Total'); await tick(20);
  ok(stations().length===0,'auf Total ebenso leer: '+stations().length);

  /* 2: Invested, 5 Jahre (Vorauswahl) — vier Stationen, alle im Beispieldepot
     (345.198,39 €) bereits erreicht, aufsteigend nach Ziel sortiert. */
  clickText('.series .range-btn','Invested'); await tick(20);
  const st=stations();
  ok(st.length===4,'vier Stationen im sichtbaren Fenster: '+st.length);
  ok(st.map(s=>s.dataset.id).join()==='snowball,fyou,coast,barista',
     'aufsteigend nach Ziel: '+st.map(s=>s.dataset.id).join());
  ok(st.every(s=>s.classList.contains('is-reached')),'alle vier gelten als erreicht');
  ok(st.every(s=>s.querySelectorAll('line').length===1&&s.querySelectorAll('text').length===1),
     'jede Station trägt genau eine Linie und ein Label');

  /* 5+6: Labels rechtsbündig, mindestens 12 px Grundlinienabstand zueinander —
     auch wenn die Linien selbst enger stehen. */
  ok(st.every(s=>s.querySelector('text').getAttribute('text-anchor')==='end'),
     'alle Labels rechtsbündig gesetzt');
  const labelYs=st.map(s=>Number(s.querySelector('text').getAttribute('y')));
  for (var pi=0; pi<labelYs.length; pi++) for (var pj=pi+1; pj<labelYs.length; pj++)
    ok(Math.abs(labelYs[pi]-labelYs[pj])>=12,
       'Label '+pi+' und '+pj+' halten 12 px Abstand: '+labelYs.join(' · '));

  /* 7: 1 Jahr — nur, wessen Ziel ins schmale Fenster fällt. */
  clickText('.range .range-btn','1 year'); await tick(20);
  const st1y=stations();
  ok(st1y.length===1&&st1y[0].dataset.id==='barista'&&st1y[0].classList.contains('is-reached'),
     'im 1-Jahres-Fenster nur Aurora: '+st1y.map(s=>s.dataset.id).join());
  clickText('.range .range-btn','5 years'); await tick(20);

  /* 8: Ausgaben verschieben alle Ziele — und damit, welche Station im
     Fenster liegt und ob sie erreicht ist. */
  const setExp=v=>{ var inp=d.getElementById('setExp'); inp.value=String(v); inp.dispatchEvent(new w.Event('input')); };
  setExp(1500); await tick(30);
  const st1500=stations();
  ok(st1500.length===5,'bei 1.500 €/Monat kommt eine fünfte Station ins Fenster: '+st1500.length);
  const passage=st1500.find(s=>s.dataset.id==='semi');
  ok(!!passage&&!passage.classList.contains('is-reached'),'Passage (360.000 €) ist dabei, aber nicht erreicht');
  const passageY=Number(passage.querySelector('line').getAttribute('y1'));
  const auroraY1500=Number(st1500.find(s=>s.dataset.id==='barista').querySelector('line').getAttribute('y1'));
  ok(passageY<auroraY1500,'ihre Linie liegt höher im Chart als die von Aurora: '+passageY.toFixed(1)+' < '+auroraY1500.toFixed(1));

  setExp(4000); await tick(30);
  const st4000=stations();
  ok(st4000.length===3&&st4000.every(s=>['snowball','fyou','coast'].indexOf(s.dataset.id)>=0),
     'bei 4.000 €/Monat bleiben nur die ersten drei — Aurora (480.000 €) läge über der Skala: '
     +st4000.map(s=>s.dataset.id).join());

  setExp(2500); await tick(30);
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 5. Bewegung aus ---------- */
sec('Animationen abschaltbar & Systemvorgabe');
{ const {w,errors}=await boot({storage:{...store}});
  const d=w.document;
  ok(d.documentElement.getAttribute('data-motion')==='on','Standard: Bewegung an');
  const ping=d.querySelector('.chart-last-ping'), last=d.querySelector('.chart-last');
  ok(ping.getAttribute('cx')===last.getAttribute('cx')&&ping.getAttribute('cy')===last.getAttribute('cy'),
     'Ping sitzt genau auf dem letzten Punkt');

  d.getElementById('btnSettings').dispatchEvent(new w.Event('click'));
  const cb=d.getElementById('setAnim'); cb.checked=false; cb.dispatchEvent(new w.Event('change'));
  await tick(20);
  ok(d.documentElement.getAttribute('data-motion')==='off','Bewegung aus');
  ok(w.NORDSTERN.app.ui.mountain.peek().motion===false,'Berg hält an');
  cb.checked=true; cb.dispatchEvent(new w.Event('change'));
  const calm=d.getElementById('setCalm'); calm.checked=true; calm.dispatchEvent(new w.Event('change'));
  await tick(20);
  ok(d.documentElement.getAttribute('data-motion')==='calm','gedämpft');
  ok(errors.length===0,'keine Fehler');
  w.close();
}
{ const {w}=await boot({storage:{...store},reducedMotion:true});
  ok(w.document.documentElement.getAttribute('data-motion')==='off','prefers-reduced-motion respektiert');
  w.close();
}

/* ---------- 5b. Das Blatt ist ein echter Dialog ---------- */
/* Zu heisst zu: kein Schalter des geschlossenen Blatts steht in der
   Tabreihenfolge, und kein Vorleseprogramm liest darin. Offen heisst offen:
   dahinter ist nichts erreichbar, Tab läuft im Kreis, und nach dem Schliessen
   steht der Fokus wieder dort, wo er losging. */
sec('Einstellungen als Dialog: Fokus, inert, Rückgabe');
{ const {w,errors}=await boot({storage:{...store}});
  const d=w.document;
  const zone=d.getElementById('settingsZone');
  const panel=d.querySelector('.sheet');
  const gear=d.getElementById('btnSettings');
  const key=k=>w.dispatchEvent(new w.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));
  const shiftKey=()=>w.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));

  ok(zone.hasAttribute('inert'),'geschlossen: aus der Tabreihenfolge genommen');
  ok(zone.getAttribute('aria-hidden')==='true','geschlossen: für Vorleseprogramme fort');
  ok(!panel.hasAttribute('aria-modal'),'geschlossen: kein Dialog, der etwas verdeckt');

  gear.focus();
  gear.dispatchEvent(new w.Event('click'));
  ok(!zone.hasAttribute('inert')&&!zone.hasAttribute('aria-hidden'),'offen: das Blatt ist da');
  ok(panel.getAttribute('aria-modal')==='true','offen: und es ist modal');
  ok(d.getElementById('shell').hasAttribute('inert'),'offen: die Hülle dahinter liegt still');
  ok(d.getElementById('shell').getAttribute('aria-hidden')==='true','offen: und wird nicht mehr vorgelesen');
  ok(d.getElementById('gate').hasAttribute('inert'),'offen: der Vorhang daneben auch');
  ok(d.activeElement===panel,'offen: der Fokus steht im Blatt');

  /* Tab läuft im Kreis — vom Blatt auf den ersten Schalter, vom letzten
     zurück auf den ersten, mit Shift andersherum. */
  const inSheet=()=>panel.contains(d.activeElement);
  const list=[...panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter(n=>!n.closest('[hidden]'));
  ok(list.length>2,'im sichtbaren Abschnitt stehen mehrere Schalter: '+list.length);
  key('Tab');
  ok(d.activeElement===list[0],'Tab führt auf den ersten Schalter im Blatt');
  list[list.length-1].focus();
  key('Tab');
  ok(d.activeElement===list[0]&&inSheet(),'vom letzten Schalter geht es wieder von vorn los');
  list[0].focus();
  shiftKey();
  ok(d.activeElement===list[list.length-1]&&inSheet(),'Shift+Tab andersherum');

  key('Escape');
  ok(!zone.classList.contains('is-open'),'Escape schliesst');
  ok(zone.hasAttribute('inert'),'und legt das Blatt wieder still');
  ok(!panel.hasAttribute('aria-modal'),'und nimmt den Dialog zurück');
  ok(!d.getElementById('shell').hasAttribute('inert'),'die Hülle ist wieder bedienbar');
  ok(d.activeElement===gear,'der Fokus steht wieder auf dem Zahnrad');
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 6. Fehlerhafte Mappe ---------- */
sec('Unbrauchbare Mappenstruktur');
{ const {w,errors}=await boot();
  const XLSX=w.XLSX;
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['irgendwas',1]]),'Data Input');
  const res=w.NORDSTERN.importer.parseWorkbook(wb,'kaputt.xlsx');
  ok(!res.ok,'Import wird abgelehnt');
  ok(res.errors.length>=3,'nennt die fehlenden Zeilen ('+res.errors.length+')');
  console.log('    →', res.errors.slice(0,3).join(' / '));
  /* Ein einzelnes Blatt wird über den Einzelblatt-Fallback trotzdem genommen
     (siehe unten, „Blattname") — erst zwei oder mehr Blätter ohne Treffer
     sind ein Fehler. Dafür muss der echte Zwei-Durchgänge-Weg laufen, nicht
     parseWorkbook direkt: das vertraut inzwischen darauf, dass SheetNames[0]
     bereits das gewählte Blatt ist. */
  const wb2=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb2,XLSX.utils.aoa_to_sheet([['x']]),'Tabelle1');
  XLSX.utils.book_append_sheet(wb2,XLSX.utils.aoa_to_sheet([['y']]),'Tabelle2');
  const opened2=w.NORDSTERN.importer._openWorkbook(XLSX,XLSX.write(wb2,{type:'array',bookType:'xlsx'}));
  const res2=w.NORDSTERN.importer.parseWorkbook(opened2,'leer.xlsx');
  ok(!res2.ok && res2.errors.length===1,'kein Blattname trifft, kein Raten: '+res2.errors.join(' / '));

  /* Und derselbe Weg einmal ganz: Datei einlesen, Vorhang mit Begründung,
     und daneben der kürzeste Weg zu dem, was gesucht wird. */
  const d=w.document;
  const file=new w.File([XLSX.write(wb,{type:'array',bookType:'xlsx'})],'kaputt.xlsx');
  const picker=d.getElementById('filePicker');
  Object.defineProperty(picker,'files',{value:[file],configurable:true});
  picker.dispatchEvent(new w.Event('change'));
  await tick(80);
  ok(!d.getElementById('gate').hidden&&d.querySelectorAll('.gate-err').length>=3,
     'der Vorhang nennt die fehlenden Zeilen: '+d.querySelectorAll('.gate-err').length);
  const more=d.querySelector('.gate-more');
  ok(more,'daneben steht der Weg zum Aufbau der Mappe');
  more.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  ok(d.querySelector('.overlay').classList.contains('is-open')
     &&d.querySelector('.sheet-nav-item[aria-selected="true"]').textContent==='workbook',
     'er führt direkt nach workbook: '+d.querySelector('.sheet-nav-item[aria-selected="true"]').textContent);
  ok(d.querySelector('.sheet-sec[data-sec="workbook"]').hidden===false,'und das Paneel steht offen');
  ok(errors.length===0,'keine Fehler');
  w.close();
}

/* ---------- 5b. Unbrauchbarer Import bei stehendem Modell ---------- */
/* Der Vorhang ist die Ansage „hier gibt es nichts zu sehen" — und die stimmt
   nicht mehr, sobald schon eine Mappe geladen ist. Ein zweiter, kaputter
   Import darf dann das stehende Dashboard nicht hinter dem Vorhang
   verschwinden lassen, ohne einen Weg zurück ausser Neustart. */
sec('Unbrauchbarer Import bei bereits geladenem Modell');
{ const {w,errors}=await boot({storage:{...store}});
  const d=w.document;
  const modelBefore=w.NORDSTERN.app.state.model;
  ok(!!modelBefore&&d.getElementById('gate').hidden,'ein Modell steht, der Vorhang ist zu');

  const XLSX=w.XLSX;
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['irgendwas',1]]),'Data Input');
  const file=new w.File([XLSX.write(wb,{type:'array',bookType:'xlsx'})],'kaputt.xlsx');
  const picker=d.getElementById('filePicker');
  Object.defineProperty(picker,'files',{value:[file],configurable:true});
  picker.dispatchEvent(new w.Event('change'));
  await tick(80);

  ok(d.getElementById('gate').hidden,'der Vorhang bleibt zu — die stehende Bühne bleibt sichtbar');
  ok(w.NORDSTERN.app.state.model===modelBefore,'das Modell im Zustand bleibt dasselbe');
  ok(d.querySelector('.hero-val'),'die Bühne zeigt weiter, was vorher stand');
  ok(d.querySelector('.sheet-status .meta-import').textContent==='unknown structure',
     'der Status meldet den Fehler: '+d.querySelector('.sheet-status .meta-import').textContent);
  ok(d.getElementById('toast').textContent.includes('does not match the expected layout')&&
     d.getElementById('toast').className.includes('is-error'),
     'der Toast nennt den Fehler, statt den Vorhang zu ziehen: '+d.getElementById('toast').textContent);
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 6a. Blattname: Aliase und Einzelblatt-Fallback ---------- */
/* „Data Input" ist der erste Name der Liste, nicht der einzige — und eine
   Mappe mit nur einem Blatt braucht überhaupt keinen Treffer. Erst zwei
   oder mehr unbekannte Blätter sind ein Fehler, der beide Namen und die
   Aliase nennt. */
sec('Blattname: Aliase und Einzelblatt-Fallback');
{ const {w,errors}=await boot();
  const XLSX=w.XLSX;
  const months=[[2026,1],[2026,2]];
  const open=(wb)=>w.NORDSTERN.importer._openWorkbook(XLSX,XLSX.write(wb,{type:'array',bookType:'xlsx'}));

  const rOne=w.NORDSTERN.importer.parseWorkbook(open(tinyWorkbook(w,months,'Mappe1')),'a.xlsx');
  ok(rOne.ok,'ein einzelnes Blatt „Mappe1" wird gelesen, wie auch immer es heißt: '+rOne.errors.join(' / '));

  const wbAlias=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbAlias,XLSX.utils.aoa_to_sheet([['Hinweise'],['bitte lesen']]),'Read me');
  XLSX.utils.book_append_sheet(wbAlias,tinySheet(w,months),'daten');
  const rAlias=w.NORDSTERN.importer.parseWorkbook(open(wbAlias),'b.xlsx');
  ok(rAlias.ok,'unter zwei Blättern gewinnt der Alias „daten" (Groß/Klein egal): '+rAlias.errors.join(' / '));

  const wbNone=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbNone,tinySheet(w,months),'Mappe1');
  XLSX.utils.book_append_sheet(wbNone,tinySheet(w,months),'Tabelle2');
  const rNone=w.NORDSTERN.importer.parseWorkbook(open(wbNone),'c.xlsx');
  ok(!rNone.ok,'zwei Blätter, keins bekannt: kein Raten');
  const msg=rNone.errors.join(' | ');
  ok(msg.includes('"Mappe1"')&&msg.includes('"Tabelle2"'),'die Meldung nennt beide vorhandenen Namen: '+msg);
  ok(msg.includes('also accepted:')&&msg.includes('Dateneingabe'),'und listet die Aliase: '+msg);
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 6a1. Robustheit: Fehlerwerte, kaputte Daten, leere Mappe ---------- */
/* Fünf Löcher, die eine Mappe unbemerkt durchreichen konnte, statt sie zu
   melden oder abzulehnen: ein Fehlerwert (#N/A & Co.) wie eine Zahl gelesen,
   ein ungültiges Datum als Monatsspalte, eine Spalte aus lauter Text als
   Schnappschuss, eine Summe, die über den darstellbaren Bereich läuft, und
   eine kaputte oder leere Datei ohne verständliche Meldung. */
sec('Robustheit: Fehlerwerte, kaputte Daten, leere Mappe');
{ const {w,errors}=await boot();
  const XLSX=w.XLSX;
  const D=(y,m)=>new w.Date(y,m-1,1);
  const EC=(r,c)=>XLSX.utils.encode_cell({r,c});
  const ROW=TINY_ROWS;
  const full=(months)=>tinySheet(w,months);
  const wbOf=(ws)=>{ const b=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(b,ws,'Data Input'); return b; };
  const parse=(ws)=>w.NORDSTERN.importer.parseWorkbook(wbOf(ws),'x.xlsx');

  /* aoa_to_sheet legt nie eine Fehlerzelle an — sie wird direkt in der
     Zellentabelle gesetzt, wie es die SheetJS-eigene API sonst auch tut.
     Kein Umweg über Schreiben und Lesen nötig: parseWorkbook nimmt eine
     Arbeitsmappe entgegen, wie XLSX.utils.book_new() sie liefert, auch ohne
     Rundreise durch XLSX.write/read (siehe „Zahlen als Text" oben). */
  const wsErrInAccount=full([[2026,1],[2026,2]]);
  wsErrInAccount[EC(ROW.CASH,1)]={t:'e', v:42, w:'#N/A'};      // Monat 1, nicht der aktuelle
  const errAccount=parse(wsErrInAccount);
  ok(errAccount.ok,'ein Fehlerwert in einer Kontozeile lehnt den Import nicht ab: '+errAccount.errors.join(' | '));
  ok(errAccount.warnings.some(t=>/Excel error values/.test(t)),
     'er wird benannt: '+errAccount.warnings.join(' | '));
  ok(errAccount.model.accounts.liquid[0].values[0]===0,
     'und zählt als leer, nicht als 42: '+errAccount.model.accounts.liquid[0].values[0]);

  const wsErrInTotal=full([[2026,1],[2026,2]]);
  wsErrInTotal[EC(ROW.NETWORTH,2)]={t:'e', v:42, w:'#N/A'};    // Monat 2 = die aktuelle Spalte
  const errTotal=parse(wsErrInTotal);
  ok(!errTotal.ok,'ein Fehlerwert in „Total net worth" der aktuellen Spalte bricht ab');
  ok(errTotal.errors.some(t=>/Total net worth/.test(t)&&/Excel error value/.test(t)),
     'die Meldung nennt Zeile und Grund: '+errTotal.errors.join(' | '));

  const wsBadDate=full([[2026,1]]);
  wsBadDate[EC(ROW.MONTH,1)]={t:'d', v:new w.Date('x')};       // new Date('x') ist ungültig
  const badDate=parse(wsBadDate);
  ok(!badDate.ok&&badDate.errors.some(t=>/No month columns found in the header row \(1 non-empty cell was not a date, first: B1\)\.$/.test(t)),
     'ein ungültiges Datum zählt nicht als Monatsspalte: '+badDate.errors.join(' | '));

  const wsTextDate=full([[2026,1]]);
  wsTextDate[EC(ROW.MONTH,1)]={t:'s', v:'2026-08-01'};         // Text statt Datum
  const textDate=parse(wsTextDate);
  ok(!textDate.ok&&textDate.errors.some(t=>/1 non-empty cell was not a date, first: B1/.test(t)),
     'ein Datum als Text ebenso wenig: '+textDate.errors.join(' | '));

  /* Eine Spalte, deren Kontozeilen ausschließlich unlesbaren Text tragen, ist
     kein Schnappschuss — hasData() darf sich nicht am rohen Zellinhalt
     orientieren, sondern muss dieselbe Zahl sehen, die auch num() sähe. */
  const wsAllNA=full([[2020,1]]);
  wsAllNA[EC(ROW.CASH,1)]={t:'s', v:'N/A'};
  wsAllNA[EC(ROW.DEPOT,1)]={t:'s', v:'N/A'};
  wsAllNA[EC(ROW.LOAN,1)]={t:'s', v:'N/A'};
  const allNA=parse(wsAllNA);
  ok(!allNA.ok&&allNA.errors.some(t=>/No snapshot found/.test(t)),
     'eine Spalte aus lauter „N/A" ist kein Schnappschuss: '+allNA.errors.join(' | '));

  /* Fünf Sektionssummen an der Grenze des Zahlenbereichs, „Total assets" und
     „Total net worth" leer — die Addition der Sektionen läuft über, bevor
     eine der Gegenproben das je sehen könnte. */
  const wsOverflow=XLSX.utils.aoa_to_sheet([
    ['Month', D(2026,1)],
    ['Liquid'],['  Cash', 0],['Total liquid', 1e308],
    ['Claims'],['Total claims', 1e308],
    ['Investments'],['  Depot', 0],['Total investments', 1e308],
    ['Property'],['Total property', 1e308],
    ['Retirement'],['Total retirement', 1e308],
    ['Total assets', ''],
    ['Liabilities'],['  Loan', 0],['Total liabilities', 0],
    ['Total net worth', '']
  ],{cellDates:true});
  const overflow=parse(wsOverflow);
  ok(!overflow.ok&&overflow.errors.some(t=>/overflow the representable range/.test(t)),
     'fünf mal 1e308 läuft über, statt eine falsche Zahl zu zeigen: '+overflow.errors.join(' | '));

  /* Weder ein fehlendes noch ein leeres Arbeitsmappen-Objekt darf durchfallen —
     beide sind derselbe Befund wie ein Blatt, das nicht gefunden wurde. */
  let threw=false, rNull=null, rEmpty=null;
  try { rNull=w.NORDSTERN.importer.parseWorkbook(null,'x.xlsx'); } catch(e) { threw=true; }
  try { rEmpty=w.NORDSTERN.importer.parseWorkbook({},'x.xlsx'); } catch(e) { threw=true; }
  ok(!threw,'parseWorkbook(null) und parseWorkbook({}) werfen nicht');
  ok(rNull&&!rNull.ok&&rEmpty&&!rEmpty.ok,'beide werden sauber abgelehnt');

  /* Eine zur Hälfte gekappte Datei ist kein Programmfehler, sondern eine
     beschädigte Datei — die Meldung soll das auch so nennen. */
  const written=XLSX.write(wbOf(full([[2026,1],[2026,2]])),{type:'array',bookType:'xlsx'});
  const half=written.slice(0, Math.floor(written.byteLength/2));
  const truncated=w.NORDSTERN.importer.parseArrayBuffer(half,'trunc.xlsx');
  ok(!truncated.ok&&truncated.errors[0].indexOf('The file is damaged or incomplete')===0,
     'die gekappte Datei bekommt die verständliche Meldung: '+truncated.errors.join(' | '));

  /* Ein leeres Blatt verfehlt sonst jeden der fünfzehn Anker einzeln. */
  const wsEmpty=XLSX.utils.aoa_to_sheet([[]]);
  const empty=parse(wsEmpty);
  ok(!empty.ok&&empty.errors.length===1&&/is empty/.test(empty.errors[0]),
     'ein leeres Blatt meldet sich einmal, nicht fünfzehnmal: '+empty.errors.join(' | '));

  /* Und zur Gegenprobe: die unveränderte, vollständige Mappe kommt weiterhin
     ohne jeden Hinweis durch — keiner der Befunde oben ist ein Fehlalarm. */
  const clean=parse(full([[2026,1],[2026,2]]));
  ok(clean.ok&&clean.warnings.length===0,'die unveränderte Mappe bleibt sauber: '+clean.warnings.join(' | '));

  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 6a2. Anker: Doppel, Reihenfolge, Überlappung; Schnappschuss-Diagnose ---------- */
/* Vier Fälle, die eine Mappe an der Ankerprüfung vorbeischleusen könnten,
   bliebe jeder für sich unbemerkt: ein Anker mehrfach, Kopf und Summe
   vertauscht, eine Sektion, die in eine andere hineinragt — und eine
   Sammelmeldung „No snapshot found", die vier verschiedene Befunde hinter
   einem Satz verstecken würde. */
sec('Anker: Doppel, Reihenfolge, Überlappung; Schnappschuss-Diagnose');
{ const {w,errors}=await boot();
  const XLSX=w.XLSX;
  const EC=(r,c)=>XLSX.utils.encode_cell({r,c});
  const ROW=TINY_ROWS;
  const full=(months)=>tinySheet(w,months);
  const wbOf=(ws)=>{ const b=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(b,ws,'Data Input'); return b; };
  const parse=(ws)=>w.NORDSTERN.importer.parseWorkbook(wbOf(ws),'x.xlsx');
  const months=[[2026,1],[2026,2]];

  /* Ein zweites „Liquid": das erste Vorkommen still zu bevorzugen würde den
     Fehler ohne ein Wort verschlucken. */
  const wsDup=full(months);
  wsDup[EC(ROW.CASH,0)]={t:'s', v:'Liquid'};
  const dup=parse(wsDup);
  ok(!dup.ok&&dup.errors.some(t=>/appears 2 times/.test(t)&&/rows 2, 3/.test(t)),
     'ein zweites „Liquid" wird als Doppel gemeldet, mit beiden Zeilen: '+dup.errors.join(' | '));

  /* Kopf und Summe vertauscht — die Sektion sähe leer aus, ohne dass irgendwo
     stünde, warum. */
  const wsSwap=full(months);
  wsSwap[EC(ROW.LIQUID,0)]={t:'s', v:'Total liquid'};
  wsSwap[EC(ROW.TOTALLIQUID,0)]={t:'s', v:'Liquid'};
  const swap=parse(wsSwap);
  ok(!swap.ok&&swap.errors.some(t=>/must come before/.test(t)),
     'vertauschte Anker melden die falsche Reihenfolge: '+swap.errors.join(' | '));

  /* „Total liquid" auf eine Zeile mitten in Investments verschoben — die
     Sektion reicht damit über Claims hinweg. */
  const wsOverlap=full(months);
  wsOverlap[EC(ROW.TOTALLIQUID,0)]={t:'s', v:''};
  wsOverlap[EC(ROW.DEPOT,0)]={t:'s', v:'Total liquid'};
  const overlap=parse(wsOverlap);
  ok(!overlap.ok&&overlap.errors.some(t=>/Sections overlap|lies inside/.test(t)),
     'eine Sektion, die eine andere überlappt, wird abgelehnt: '+overlap.errors.join(' | '));

  /* „Total assets" mitten in eine Sektion verschoben statt eine Sektion in
     eine andere — derselbe Befund aus der anderen Richtung. */
  const wsTA=full(months);
  wsTA[EC(ROW.TOTALASSETS,0)]={t:'s', v:''};
  wsTA[EC(ROW.DEPOT,0)]={t:'s', v:'Total assets'};
  const taInside=parse(wsTA);
  ok(!taInside.ok&&taInside.errors.some(t=>/lies inside/.test(t)),
     '„Total assets" mitten in einer Sektion wird ebenso abgelehnt: '+taInside.errors.join(' | '));

  /* Keine einzige beschriftete Kontozeile in der ganzen Mappe — weder eine
     leere Mappe noch ein fehlender Schnappschuss, sondern ein eigener Befund. */
  const wsNoAccounts=full(months);
  wsNoAccounts[EC(ROW.CASH,0)]={t:'s', v:''};
  wsNoAccounts[EC(ROW.DEPOT,0)]={t:'s', v:''};
  wsNoAccounts[EC(ROW.LOAN,0)]={t:'s', v:''};
  const noAccounts=parse(wsNoAccounts);
  ok(!noAccounts.ok&&noAccounts.errors.some(t=>/No account rows found/.test(t)),
     'keine einzige Kontozeile wird eigens gemeldet: '+noAccounts.errors.join(' | '));

  /* Nur Monate in der Zukunft — eine blosse Sammelmeldung würde nicht sagen,
     dass es daran liegt. */
  const wsFuture=full([[2099,1]]);
  const future=parse(wsFuture);
  ok(!future.ok&&future.errors.some(t=>/dated in the future/.test(t)&&/2099-01/.test(t)),
     'lauter zukünftige Spalten werden benannt: '+future.errors.join(' | '));

  /* Eine vergangene Spalte, deren Kontozeilen alle leer sind. */
  const wsPastEmpty=full([[2020,1]]);
  delete wsPastEmpty[EC(ROW.CASH,1)];
  delete wsPastEmpty[EC(ROW.DEPOT,1)];
  delete wsPastEmpty[EC(ROW.LOAN,1)];
  const pastEmpty=parse(wsPastEmpty);
  ok(!pastEmpty.ok&&pastEmpty.errors.some(t=>/No snapshot found/.test(t)&&/are empty in every account row/.test(t)),
     'eine leere vergangene Spalte wird von einer zukünftigen unterschieden: '+pastEmpty.errors.join(' | '));

  /* Dieselbe Spalte, aber mit Text statt Zahlen — ein anderer Befund als
     „leer", auch wenn beide unter „No snapshot found" laufen. */
  const wsPastText=full([[2020,1]]);
  wsPastText[EC(ROW.CASH,1)]={t:'s', v:'N/A'};
  wsPastText[EC(ROW.DEPOT,1)]={t:'s', v:'N/A'};
  wsPastText[EC(ROW.LOAN,1)]={t:'s', v:'N/A'};
  const pastText=parse(wsPastText);
  ok(!pastText.ok&&pastText.errors.some(t=>/No snapshot found/.test(t)&&/only text or error values/.test(t)&&/3 cells, first: B3/.test(t)),
     'Text statt Zahlen wird als solches benannt, mit Anzahl und erster Adresse: '+pastText.errors.join(' | '));

  /* Und zur Gegenprobe: die unveränderte Mappe bleibt sauber. */
  const clean=parse(full(months));
  ok(clean.ok&&clean.warnings.length===0,'die unveränderte Mappe bleibt ohne jeden Hinweis: '+clean.warnings.join(' | '));

  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 6a. Der Erste des Monats, westlich von UTC ---------- */
/* SheetJS liefert jede Datumszelle als Mitternacht UTC, aus der Datei wie im
   Speicher. Wer den Kalendertag mit lokalen Gettern daraus liest, ist westlich
   von Greenwich noch am Vortag: aus dem 1. Juli wird der 30. Juni, aus dem
   Juli der Juni. Die Beispielmappe merkt das nicht, sie datiert ihre Spalten
   auf das Monatsende. Also der Erste, unter drei Uhren; die Uhr des Rechners
   wird dafür kurz verstellt und danach zurückgedreht. */
sec('Datumsspalten unter fremden Zeitzonen');
{ const {w,errors}=await boot();
  const months=[[2026,1],[2026,2],[2026,3]];
  const tz0=process.env.TZ;
  for(const tz of ['Europe/Berlin','America/New_York','Pacific/Kiritimati']){
    process.env.TZ=tz;
    const mem=w.NORDSTERN.importer.parseWorkbook(tinyWorkbook(w,months),'erster.xlsx');
    const bytes=w.XLSX.write(tinyWorkbook(w,months),{type:'array',bookType:'xlsx'});
    const file=w.NORDSTERN.importer.parseArrayBuffer(bytes,'erster.xlsx',{});
    for(const [via,res] of [['im Speicher',mem],['aus Bytes',file]]){
      const keys=res.ok?res.model.months.map(m=>m.key).join(' '):res.errors.join(' | ');
      ok(keys==='2026-01 2026-02 2026-03',tz+', '+via+': die Monate heissen wie ihre Spalten: '+keys);
      ok(res.ok&&res.model.months[0].iso==='2026-01-01',tz+', '+via+': der Kalendertag bleibt der Erste: '+(res.ok&&res.model.months[0].iso));
    }
  }
  if(tz0===undefined) delete process.env.TZ; else process.env.TZ=tz0;
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 6b. Löchrige Zeitreihe ---------- */
/* Eine Monatsspalte fehlt, eine steht doppelt. Beides sieht in der Mappe
   harmlos aus und macht aus „im Vormonat" und „vor einem Jahr" stillschweigend
   etwas anderes. Der Import sagt es, und die Berechnung vergleicht lieber
   nicht, als falsch zu vergleichen. */
sec('Lücken und Doppel in der Monatsreihe');
{ const {w,errors}=await boot();
  const read=(months)=>w.NORDSTERN.importer.parseWorkbook(tinyWorkbook(w,months),'reihe.xlsx');

  /* Zum Vergleich: dieselbe Mappe ohne Loch. */
  const clean=read([[2026,1],[2026,2],[2026,3]]);
  ok(clean.ok&&clean.warnings.length===0,'die lückenlose Reihe kommt ohne Hinweis durch: '+clean.warnings.join(' | '));
  /* Kein zweites Blatt nötig — es wird nicht gelesen, und das Modell trägt
     danach kein expenses-Feld mehr. */
  ok(!('expenses' in clean.model),'ohne zweites Blatt importiert: kein expenses-Feld im Modell');

  const gap=read([[2026,1],[2026,2],[2026,4]]);
  ok(gap.ok,'die löchrige Reihe wird trotzdem gelesen');
  ok(gap.warnings.some(t=>/skips 1 month/.test(t)),'der Import nennt die Lücke: '+gap.warnings.join(' | '));

  const dup=read([[2026,1],[2026,2],[2026,2]]);
  ok(dup.warnings.some(t=>/more than one column/.test(t)),'und das Doppel: '+dup.warnings.join(' | '));

  /* Die verrutschte Spalte ist kein Hinweis, sondern ein Abbruch: „zuletzt"
     ist die Spalte ganz rechts, und die hiesse hier Februar. Ein falscher
     aktueller Stand trägt jede weitere Zahl mit sich. */
  const back=read([[2026,1],[2026,3],[2026,2]]);
  ok(!back.ok&&back.errors.some(t=>/ascending order/.test(t)),
     'die verrutschte Spalte wird abgelehnt: '+back.errors.concat(back.warnings).join(' | '));
  ok(back.errors.some(t=>/column D \(2026-02\)/.test(t)),
     'und die Meldung nennt die Spalte: '+back.errors.join(' | '));
  ok(back.model===null,'nichts davon wird zum Modell');

  /* Und die Zahl daneben: über die Lücke hinweg wird verglichen, aber mit
     dem echten Abstand — „vor zwei Monaten", nicht „im Vormonat". */
  const set=w.NORDSTERN.store.loadSettings();
  const dClean=w.NORDSTERN.calc.derive(clean.model,set);
  const dGap=w.NORDSTERN.calc.derive(gap.model,set);
  ok(dClean.mom!==null&&dClean.mom.span===1,'ohne Lücke steht der Vormonatsvergleich, Abstand 1');
  ok(dGap.mom!==null,'über die Lücke hinweg wird trotzdem verglichen');
  ok(dGap.mom.span===2,'und der Abstand steht dabei: '+dGap.mom.span);
  /* Wird die Position gerendert, steht der Abstand auch in der Beschriftung —
     geprüft weiter unten, in der Quartalsreihe, wo derselbe Mechanismus über
     den vollen Weg (App, nicht nur calc.derive) läuft. */

  /* Dasselbe eine Ebene höher: Januar 2025 fehlt, das Vorjahr liegt also elf
     statt zwölf Monate zurück — noch innerhalb der Toleranz, mit dem
     tatsächlichen Abstand in yoy.span und im Tempo. */
  const year=[]; for(let m=1;m<=13;m++) year.push(m<=12?[2025,m]:[2026,1]);
  const full=read(year);
  const holed=read(year.filter(([y,m])=>!(y===2025&&m===1)));
  const dFull=w.NORDSTERN.calc.derive(full.model,set);
  const dHoled=w.NORDSTERN.calc.derive(holed.model,set);
  ok(dFull.yoy!==null&&dFull.yoy.span===12&&dFull.pace!==null&&dFull.paceSpan===12,
     'zwölf volle Monate ergeben Vorjahr und Tempo über 12 Monate');
  ok(dHoled.yoy!==null&&dHoled.yoy.span===11,
     'mit dem Loch bei Januar bleibt der elf Monate entfernte Snapshot der Vorjahresvergleich: span='+
     (dHoled.yoy&&dHoled.yoy.span));
  ok(dHoled.pace!==null&&dHoled.paceSpan===11,
     'und das Tempo teilt durch diese elf Monate, nicht durch zwölf: paceSpan='+dHoled.paceSpan);
  /* Und dieselben elf Monate stehen an der Serie fürs Chart — nicht nur am
     obersten yoy-Feld, sonst zeigt der Zeiger dort weiter „vs. last year". */
  ok(dHoled.series[dHoled.series.length-1].yearAgoSpan===11,
     'die Serie trägt den Abstand selbst: '+dHoled.series[dHoled.series.length-1].yearAgoSpan);

  /* Einmal ganz: Modell in die App, Chart zeigen, Zeiger auf den letzten
     Punkt — das Lesefenster muss denselben Abstand nennen wie oben, nicht
     hart „vs. last year". */
  w.NORDSTERN.app.state.model=holed.model;
  w.NORDSTERN.app.refresh(); await tick(30);
  const d=w.document;
  const body=d.querySelector('.chart-body');
  const hover=x=>{ const e=new w.Event('pointermove'); e.clientX=x; e.clientY=300; body.dispatchEvent(e); };
  hover(9999);
  const ya=[...d.querySelectorAll('.chart-tip .tip-row')]
    .find(r=>/months ago|last year/.test(r.textContent));
  ok(ya&&/^vs\. 11 months ago/.test(ya.textContent),
     'das Lesefenster nennt den echten Abstand: '+(ya&&ya.textContent));
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 6b1. Quartalsreihe ---------- */
/* Wer nur zum Quartalsende einträgt, hat nie einen echten Vormonat — der
   Abstand ist immer drei. Das Vorjahr trifft trotzdem genau, weil vier
   Quartale wieder zwölf Monate sind. Hier läuft der volle Weg über die App,
   damit auch die Beschriftung und der Chart mitgeprüft werden, nicht nur
   calc.derive. */
sec('Quartalsreihe: Abstand 3, Vorjahr trotzdem exakt');
{ const {w,errors}=await boot();
  const quarters=[]; for(const y of [2024,2025]) for(const m of [1,4,7,10]) quarters.push([y,m]);
  const res=w.NORDSTERN.importer.parseWorkbook(tinyWorkbook(w,quarters),'quartale.xlsx');
  ok(res.ok,'die Quartalsreihe wird gelesen: '+res.errors.join(' | '));
  ok(res.model.months.length===8,'acht Quartalsspalten: '+res.model.months.length);

  const set=w.NORDSTERN.store.loadSettings();
  const dv=w.NORDSTERN.calc.derive(res.model,set);
  ok(dv.mom!==null&&dv.mom.span===3,'Vormonatsvergleich hat Abstand 3: '+(dv.mom&&dv.mom.span));
  ok(dv.yoy!==null&&dv.yoy.span===12,'Vorjahresvergleich trifft trotzdem exakt zwölf Monate: '+(dv.yoy&&dv.yoy.span));
  const expectedPace=(res.model.months[7].investment-res.model.months[3].investment)/12;
  ok(dv.paceSpan===12&&Math.abs(dv.pace-expectedPace)<1e-9,
     'Tempo ist die Investmentdifferenz geteilt durch 12: '+dv.pace+' vs '+expectedPace);

  /* Und in der Oberfläche stehen die Abstände in der Beschriftung. */
  w.NORDSTERN.app.state.model=res.model;
  w.NORDSTERN.app.refresh();
  const d=w.document;
  const heroLabs=[...d.querySelectorAll('.hero-deltas .delta-lab')].map(n=>n.textContent);
  ok(heroLabs.join(' · ')==='vs. 3 months ago · vs. last year',
     'Hero nennt den Abstand beim Vormonat, aber „vs. last year" beim Vorjahr: '+heroLabs.join(' · '));
  const paceSub=[...d.querySelectorAll('.kpi')].find(k=>k.querySelector('.kpi-lab').textContent==='Portfolio pace')
    .querySelector('.kpi-sub').textContent;
  ok(paceSub==='avg. per month, 12 months','Tempo-Unterzeile nennt die 12 Monate: '+paceSub);

  /* Und der Chart schneidet nach Zeit: „1 year" zeigt fünf Quartalsspalten
     (Abstand 0, 3, 6, 9, 12 zum letzten Punkt), nicht zwölf oder eine. */
  const rangeBtn=[...d.querySelectorAll('.range .range-btn')].find(b=>b.textContent==='1 year');
  rangeBtn.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  await tick(30);
  const pts=[...d.querySelector('.chart-line').getAttribute('d').matchAll(/[ML]([\d.]+) [\d.]+/g)];
  ok(pts.length===5,'„1 year" zeigt fünf Punkte über vier Quartale: '+pts.length);
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 6b2. Lückenlose Monatsreihe: Abstände und Bereichsgrößen ---------- */
/* Eine lückenlose Reihe hat überall Abstand eins zum Vormonat und zwölf zum
   Vorjahr. Geprüft an der Beispielmappe, die 84 Monate trägt — für „1 year"
   und „5 years" reicht das für die volle Punktzahl (13 / 61), für „10 years"
   und „All" ist die Mappe kürzer als 121 Punkte, also müssen beide auf
   dieselbe, volle Monatszahl kommen. */
sec('Lückenlose Monatsreihe: Abstände und Bereichsgrößen');
{ const {w,errors}=await boot();
  importFixture(w);
  const set=w.NORDSTERN.store.loadSettings();
  const model=w.NORDSTERN.store.loadModel();
  const dv=w.NORDSTERN.calc.derive(model,set);
  ok(dv.mom!==null&&dv.mom.span===1,'Vormonat: Abstand 1');
  ok(dv.yoy!==null&&dv.yoy.span===12,'Vorjahr: Abstand 12');

  const d=w.document;
  const total=model.months.length;
  ok(total===84,'die Beispielmappe trägt 84 Monate: '+total);
  const rangeBtn=lab=>[...d.querySelectorAll('.range .range-btn')].find(b=>b.textContent===lab);
  const countFor=lab=>{
    rangeBtn(lab).dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
    return [...d.querySelector('.chart-line').getAttribute('d').matchAll(/[ML]([\d.]+) [\d.]+/g)].length;
  };
  ok(countFor('1 year')===13,'„1 year" bei lückenloser Reihe: 13 Punkte');
  ok(countFor('5 years')===61,'„5 years" bei lückenloser Reihe: 61 Punkte');
  /* Die Mappe reicht nicht bis 121 Punkte — „10 years" und „All" fallen
     deshalb beide auf die volle Monatszahl zurück. */
  ok(countFor('10 years')===total,'„10 years" zeigt alles, was da ist: '+countFor('10 years'));
  ok(countFor('All')===total,'„All" ebenso: '+countFor('All'));
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 6c. Zahlen, die als Text in der Zelle stehen ---------- */
/* Wer Beträge aus einem Kontoauszug in die Mappe kopiert, hat sie oft als
   Text darin: „1.234,56". Eine Lesart, die nur das Komma tauscht und den
   Rest parseFloat überlässt, bricht am zweiten Punkt ab und ergäbe 1,234 —
   ein Faktor tausend, unbemerkt von einer Gegenprobe gegen die Summenzeile,
   die genauso falsch gelesen würde. Die Fälle für `_parseNumber` selbst
   stehen in tests/formats.mjs; hier geht es um den Fall, den die Gegenprobe
   nicht sieht: Posten und Summenzeile beide als Text. */
sec('Zahlen als Text');
{ const {w,errors}=await boot();
  const XLSX=w.XLSX;
  const D=(y,m)=>new w.Date(y,m-1,1);
  const wb=(depot)=>{
    const b=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet([
      ['Month',        D(2026,1), D(2026,2)],
      ['Liquid'],['  Cash',0,0],['Total liquid',0,0],
      ['Claims'],['Total claims',0,0],
      ['Investments'],['  Depot',depot,depot],['Total investments',depot,depot],
      ['Property'],['Total property',0,0],
      ['Retirement'],['Total retirement',0,0],
      ['Total assets',depot,depot],
      ['Liabilities'],['  Loan',0,0],['Total liabilities',0,0],
      ['Total net worth',depot,depot]
    ],{cellDates:true}),'Data Input');
    return w.NORDSTERN.importer.parseWorkbook(b,'text.xlsx');
  };
  const asText=wb('1.234,56'), asNumber=wb(1234.56);
  ok(asText.ok&&asText.model.months[1].investment===1234.56,
     'die Textzelle ergibt denselben Betrag wie die Zahl: '+asText.model.months[1].investment);
  ok(asNumber.model.months[1].netWorth===asText.model.months[1].netWorth,
     'und denselben Vermögensstand');
  ok(asText.warnings.some(t=>/stored as text/.test(t)),
     'dass sie Text war, steht in den Hinweisen: '+asText.warnings.join(' | '));
  ok(asNumber.warnings.length===0,'die Zahlenfassung schweigt: '+asNumber.warnings.join(' | '));

  /* Was auf keine der beiden Schreibweisen passt, wird nicht halb gelesen. */
  const broken=wb('1.234.56');
  ok(broken.warnings.some(t=>/not a number/.test(t)),
     'Unleserliches wird benannt: '+broken.warnings.join(' | '));
  ok(broken.model.months[1].investment===0,
     'und zählt als leer, nicht als 1,234: '+broken.model.months[1].investment);
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 6d. Die Lücke im Verlauf ---------- */
/* Nach Index verteilt sah ein halbes Jahr ohne Eintrag aus wie ein
   Monatsschritt: die Kurve wurde flacher, und man las ruhige Monate statt
   fehlender. Jetzt trägt die Waagerechte Zeit, und über die Lücke geht kein
   durchgezogener Strich. */
sec('Zeitlücken im Verlauf');
{ const {w,errors}=await boot({storage:{...store}});
  const d=w.document;
  const base=JSON.parse(JSON.stringify(w.NORDSTERN.store.loadModel()));
  const cut=(keys)=>{
    const m=JSON.parse(JSON.stringify(base));
    m.months=m.months.slice(0,keys.length).map((mo,i)=>({...mo,key:keys[i],iso:keys[i]+'-01'}));
    Object.keys(m.accounts).forEach(k=>
      m.accounts[k]=m.accounts[k].map(a=>({...a,values:a.values.slice(0,keys.length)})));
    m.currentIndex=keys.length-1;
    return m;
  };
  const show=(keys)=>{ w.NORDSTERN.app.state.model=cut(keys); w.NORDSTERN.app.refresh();
    return d.querySelector('.chart-line').getAttribute('d'); };
  const xs=dd=>[...dd.matchAll(/[ML]([\d.]+) [\d.]+/g)].map(m=>Number(m[1]));

  const dense=show(['2026-01','2026-02','2026-03']);
  ok(!d.querySelector('.chart-bridge'),'ohne Lücke kein Steg');
  ok((dense.match(/M/g)||[]).length===1,'und ein durchgehender Strich');
  const a=xs(dense);
  ok(Math.abs((a[1]-a[0])/(a[2]-a[0])-0.5)<0.01,
     'drei Monate stehen in gleichen Abständen: '+a.join(' · '));

  /* Januar, Februar, August: der zweite Punkt gehört auf ein Siebtel der
     Strecke, nicht auf die Hälfte. */
  const holed=show(['2026-01','2026-02','2026-08']);
  const b=xs(holed);
  ok(Math.abs((b[1]-b[0])/(b[2]-b[0])-1/7)<0.01,
     'mit Loch nach Monatsabstand: '+b.join(' · '));
  ok((holed.match(/M/g)||[]).length===2,'der Strich bricht an der Lücke ab: '+holed);
  const bridge=d.querySelector('.chart-bridge');
  ok(!!bridge,'und ein gestrichelter Steg deutet sie an');
  ok(Math.abs(xs(bridge.getAttribute('d'))[0]-b[1])<0.01,
     'der Steg beginnt am letzten eingetragenen Monat');
  ok(w.getComputedStyle(bridge).strokeDasharray!=='none','der Steg ist gestrichelt');
  /* Die Fläche bleibt geschlossen — sie ist Atmosphäre, kein Wert. */
  ok((d.querySelector('.chart-fill').getAttribute('d').match(/M/g)||[]).length===1,
     'der Vorhang dahinter bleibt einer');

  /* Und das Lesefenster trifft weiterhin den gemeinten Punkt, obwohl die
     Punkte nicht mehr in gleichen Abständen stehen. */
  const body=d.querySelector('.chart-body');
  const hover=x=>{ const e=new w.Event('pointermove'); e.clientX=x; e.clientY=300; body.dispatchEvent(e);
    return d.querySelector('.chart-tip .tip-key').textContent; };
  ok(hover(400)==='August 2026','ganz rechts steht der letzte Stand: '+hover(400));
  ok(hover(0)==='January 2026','ganz links der erste: '+hover(0));
  ok(hover(Math.round(b[1]))==='February 2026',
     'und am zweiten Punkt der zweite: '+hover(Math.round(b[1])));
  /* Im Loch steht kein Punkt — gezeigt wird der nähere Rand. */
  ok(hover(Math.round(b[1]+(b[2]-b[1])*0.75))==='August 2026','in der Lücke der nähere Rand');
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 6b. Chart-Geometrie folgt der eigenen Zeichnung ---------- */
sec('Chart-Geometrie nach leerer Zeichnung');
{ const {w,errors}=await boot({storage:{...store}});
  const d=w.document;
  const body=d.querySelector('.chart-body');
  const tip=()=>d.querySelector('.chart-tip');
  const hover=x=>{ const e=new w.Event('pointermove'); e.clientX=x; e.clientY=300; body.dispatchEvent(e); };

  hover(200);
  ok(tip().classList.contains('is-on'),'Tooltip zeigt nach Hover');
  ok(!!d.querySelector('.chart-tip .tip-key'),'und trägt einen Monat: '+(d.querySelector('.chart-tip .tip-key')||{}).textContent);

  /* Wechsel auf eine Serie mit nur einem Punkt: render() bricht ab (slice() < 2
     Punkte), die alte Geometrie darf dabei nicht überleben — sonst zeigt der
     Zeiger auf der leeren Fläche noch Werte des vorigen Workbooks. */
  const view1=JSON.parse(JSON.stringify(w.NORDSTERN.app.state.view));
  view1.series=view1.series.slice(-1);
  w.NORDSTERN.app.ui.chart.setData(view1,false);
  ok(d.querySelectorAll('.chart-body svg').length===0,'keine Zeichnung bei nur einem Punkt');
  hover(200);
  ok(!tip().classList.contains('is-on'),
     'Tooltip bleibt aus, statt den Wert des vorigen Workbooks zu zeigen: '+tip().className);

  /* clear() räumt dieselbe Geometrie mit auf. */
  w.NORDSTERN.app.ui.chart.setData(w.NORDSTERN.app.state.view,false);
  hover(200);
  ok(tip().classList.contains('is-on'),'Tooltip wieder an nach normalem Modell (Testaufbau)');
  w.NORDSTERN.app.ui.chart.clear();
  hover(200);
  ok(!tip().classList.contains('is-on'),'clear() löscht die Geometrie mit: '+tip().className);

  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 7. Alle Meilensteine erreicht / kein Vorjahr ---------- */
sec('Randfälle im Modell');
{ const {w}=await boot({storage:{...store}});
  const m=JSON.parse(JSON.stringify(w.NORDSTERN.store.loadModel()));
  // alles erreicht
  const i=m.currentIndex; m.months[i].investment=5e6; m.months[i].liquid=5e5;
  w.NORDSTERN.app.state.model=m; w.NORDSTERN.app.refresh();
  const st=w.document.querySelector('.mount-status').textContent;
  ok(st.includes('All seven stations reached'),'Endzustand: '+st.slice(0,60));
  ok(w.document.querySelector('.card[data-id="contingency"]').dataset.status==='reached','Contingency erreicht');
  // kein Vorjahreswert
  const m2=JSON.parse(JSON.stringify(w.NORDSTERN.store.loadModel()));
  m2.months=m2.months.slice(-6); m2.currentIndex=5;
  w.NORDSTERN.app.state.model=m2; w.NORDSTERN.app.refresh();
  const dt=w.document.querySelectorAll('.delta')[1].textContent;
  ok(dt.includes('no year-ago value'),'YoY-Leerzustand: '+dt);
  ok(w.document.querySelector('.kpi.is-neg')!==null,'Schulden-KPI vorhanden');

  /* Veränderung aus einem negativen Ausgangswert: von −100 auf −50 sind
     +50 %, nicht −150 % mit umgedrehtem Vorzeichen. */
  const m3=JSON.parse(JSON.stringify(w.NORDSTERN.store.loadModel()));
  const j=m3.currentIndex;
  const set=w.NORDSTERN.store.loadSettings();
  m3.months[j-1].netWorth=-100; m3.months[j].netWorth=-50;
  const up=w.NORDSTERN.calc.derive(m3,set).mom.rel;
  ok(Math.abs(up-0.5)<1e-9,'−100 → −50 ist +50 %: '+(up*100).toFixed(1)+' %');
  m3.months[j].netWorth=-150;
  const down=w.NORDSTERN.calc.derive(m3,set).mom.rel;
  ok(Math.abs(down+0.5)<1e-9,'−100 → −150 ist −50 %: '+(down*100).toFixed(1)+' %');
  m3.months[j-1].netWorth=200; m3.months[j].netWorth=250;
  const plain=w.NORDSTERN.calc.derive(m3,set).mom.rel;
  ok(Math.abs(plain-0.25)<1e-9,'und im Positiven bleibt es, wie es war: '+(plain*100).toFixed(1)+' %');
  w.close();
}

/* ---------- 9. Blick in eine Sektion ---------- */
sec('Klick öffnet eine Sektion der Scheibe');
{ const {w,errors}=await boot({storage:{...store}});
  const d=w.document;
  const click=n=>n.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  const rows=()=>[...d.querySelectorAll('.orbit-legend .legend-row')];
  const arc=id=>d.querySelector('.orbit-dial [data-id="'+id+'"]');

  ok(arc('investment').getAttribute('role')==='button','Sektionsbogen ist eine Schaltfläche');
  ok(!d.querySelector('.legend-back'),'kein Zurück in der Übersicht');
  /* Hover: Bogen und Legendenzeile sind dieselbe Sache und heben sich gegenseitig. */
  const enter=n=>n.dispatchEvent(new w.Event('pointerenter'));
  const leave=n=>n.dispatchEvent(new w.Event('pointerleave'));
  const legRow=id=>d.querySelector('.orbit-legend .legend-row[data-id="'+id+'"]');
  enter(arc('tangible'));
  ok(arc('tangible').classList.contains('is-hot')&&legRow('tangible').classList.contains('is-hot')&&
     d.querySelector('.zone--structure, #orbitZone').classList.contains('has-hover'),
     'Zeigen auf den Bogen hebt Bogen und Legendenzeile');
  ok(!legRow('liquid').classList.contains('is-hot'),'die übrigen Zeilen treten zurück');
  leave(arc('tangible'));
  ok(!arc('tangible').classList.contains('is-hot')&&!legRow('tangible').classList.contains('is-hot'),
     'Verlassen löscht die Hervorhebung wieder');
  enter(legRow('liquid'));
  ok(arc('liquid').classList.contains('is-hot'),'und andersherum: Zeile hebt den Bogen');
  leave(legRow('liquid'));
  enter(arc('liabilities'));
  ok(arc('liabilities').classList.contains('is-hot')&&legRow('liabilities').classList.contains('is-hot'),
     'auch der Gegenring der Verbindlichkeiten');
  leave(arc('liabilities'));

  click(arc('investment'));
  await tick(20);
  const items=rows().filter(r=>r.getAttribute('data-id').startsWith('item-'));
  const model=w.NORDSTERN.store.loadModel();
  const raw=model.accounts.investment.map(a=>a.values[model.currentIndex]);
  ok(items.length===raw.filter(v=>v>0.005).length,
     'nur Posten über null: '+items.length+' von '+raw.length+' Konten');
  ok(items.every(r=>r.querySelector('.legend-val').textContent!=='0,00 €'),
     'keine Nullzeilen: '+items.map(r=>r.querySelector('.legend-val').textContent).join(' · '));
  ok(N(rows().find(r=>r.classList.contains('is-sum')).querySelector('.legend-val').textContent)==='345.198,39 €',
     'Summe der Sektion stimmt: '+rows().find(r=>r.classList.contains('is-sum')).querySelector('.legend-val').textContent);
  /* Auch im Drill-down, obwohl die Posten dort nicht anklickbar sind. */
  enter(arc('item-0'));
  ok(arc('item-0').classList.contains('is-hot')&&legRow('item-0').classList.contains('is-hot'),
     'Hover wirkt auch auf die Einzelposten');
  leave(arc('item-0'));
  ok(d.querySelector('.orbit-core-hit')&&d.querySelector('.legend-back'),'zwei Wege zurück: Kern und Legende');
  ok([...d.querySelectorAll('.orbit-dial .orbit-arc')].every(a=>a.getAttribute('data-id')!=='liquid'),
     'die Übersichtsbögen sind ersetzt');

  click(d.querySelector('.legend-back'));
  await tick(20);
  ok(!d.querySelector('.legend-back')&&arc('investment'),'Zurück führt in die Übersicht');

  // Verbindlichkeiten lassen sich genauso öffnen
  click(arc('liabilities'));
  await tick(20);
  const liab=rows().filter(r=>r.getAttribute('data-id').startsWith('item-'));
  ok(liab.length===3&&liab.every(r=>r.querySelector('.legend-val').textContent.startsWith('-')),
     'Verbindlichkeiten öffnen sich mit Vorzeichen: '+liab.length+' Posten');
  d.querySelector('.orbit-legend').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  await tick(20);
  ok(!d.querySelector('.legend-back'),'Escape schließt die Sektion');
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 10. Eingesetzte Icons ---------- */
sec('Eingesetzte Material Symbols');
{ const {w,errors}=await boot({storage:{...store}});
  const I=w.NORDSTERN.icons;
  const IDS=w.NORDSTERN.calc.MILESTONES.map(m=>m.id);

  /* Jeder Meilenstein hat beide optischen Größen, keine Platzhalter. */
  const missing=IDS.filter(id=>{const g=I.GLYPHS[id];return !(g&&g.pin&&g.card);});
  ok(missing.length===0,'alle acht Meilensteine haben pin und card ('+(missing.join(',')||'—')+')');
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 12. Mehr Schulden als Vermögen ---------- */
sec('Negativer Net Worth');
{ const {w,errors}=await boot({storage:{...store}});
  const d=w.document;
  const total=()=>['liquid','receivables','investment','tangible','retirement']
    .map(id=>arcSweep(d,id)).filter(x=>x!=null).reduce((a,b)=>a+b,0);

  /* Normalfall: die Sektionen füllen den Kreis, es fehlt nichts. */
  const fullRing=total();
  ok(Math.abs(fullRing-Math.PI*2)<0.2,'im Normalfall schliesst sich der Vermögensring: '+fullRing.toFixed(2)+' von '+(Math.PI*2).toFixed(2));
  ok(!d.querySelector('.orbit-short'),'und es gibt keine Fehlstrecke');
  ok(!d.querySelector('.orbit-liab.is-over'),'der Gegenring ist kein Übermass');
  ok(d.querySelector('.orbit-liab').tagName==='path','er ist ein Bogen, kein voller Kreis');
  ok(!d.querySelector('.orbit-core-val').classList.contains('is-neg'),'der Kern steht im normalen Ton');

  /* Erzwungen: Schulden über dem Vermögen. Der Vermögensring darf sich dann
     nicht schliessen, und der Gegenring darf bei 355° nicht sättigen — sonst
     sähen 116 % aus wie 99 %. */
  const m=w.NORDSTERN.app.state.model, L=m.currentIndex;
  const assets=m.months[L].totalAssets;
  m.months[L].liabilities=assets*1.25;
  m.months[L].netWorth=assets-m.months[L].liabilities;
  w.NORDSTERN.app.refresh(); await tick(40);

  /* Ohne positives Eigenkapital gibt es keinen Faktor — ein ehrlicher Strich
     statt einer Zahl, die durch fast nichts geteilt wurde. Der Schuldenanteil
     bleibt, und er steht dann über 100 %. */
  const kpiOf=lab=>[...d.querySelectorAll('.kpi')].find(k=>k.querySelector('.kpi-lab').textContent===lab);
  const lev=kpiOf('Leverage');
  ok(lev.querySelector('.kpi-val').textContent==='—','ohne Eigenkapital kein Hebel: '+lev.querySelector('.kpi-val').textContent);
  ok(lev.classList.contains('is-neg'),'die Kachel steht im Ton der Verbindlichkeiten');
  ok(/^125,0 %/.test(N(lev.querySelector('.kpi-sub').textContent)),
     'der Schuldenanteil steht weiter da, über 100 %: '+N(lev.querySelector('.kpi-sub').textContent));

  /* Und ein negatives Tempo bekommt seine Farbe wie ein positives — nur die
     andere. */
  const inv0=m.months[L].investment;
  m.months[L].investment=m.months[L-12].investment-240000;
  w.NORDSTERN.app.refresh(); await tick(30);
  const pace=kpiOf('Portfolio pace');
  ok(pace.classList.contains('is-neg')&&!pace.classList.contains('is-pos'),
     'ein schrumpfendes Depot ist rot: '+pace.className+' '+pace.querySelector('.kpi-val').textContent);
  m.months[L].investment=inv0;              // der Ring unten misst weiter das Original
  w.NORDSTERN.app.refresh(); await tick(30);
  ok(kpiOf('Portfolio pace').classList.contains('is-pos'),'ein wachsendes grün');

  const shortRing=total();
  console.log('    → Vermögensring '+(fullRing/(Math.PI*2)*100).toFixed(1)+' % → '+(shortRing/(Math.PI*2)*100).toFixed(1)+' %, Fehlstrecke '+(arcSweep(d,'shortfall')/(Math.PI*2)*100).toFixed(1)+' %');
  ok(shortRing<fullRing*0.85,'jetzt bleibt der Vermögensring offen: '+shortRing.toFixed(2)+' statt '+fullRing.toFixed(2));
  ok(Math.abs(shortRing-Math.PI*2*0.8)<0.25,'und zwar um genau den Fehlbetrag: '+(shortRing/(Math.PI*2)*100).toFixed(1)+' % statt 80 %');
  const sh=d.querySelector('.orbit-short');
  ok(sh,'die offene Stelle trägt eine Fehlstrecke');
  ok(sh&&/Not covered by assets/.test(sh.getAttribute('aria-label')),'benannt: '+(sh&&sh.getAttribute('aria-label')));
  ok(sh&&!sh.hasAttribute('role')&&!sh.hasAttribute('tabindex'),'sie ist keine Schaltfläche — es gibt nichts zu öffnen');
  const lp=d.querySelector('.orbit-liab');
  ok(lp.tagName==='path'&&/A/.test(lp.getAttribute('d')),'der Gegenring ist geschlossen — als Bogen ein Haar vor 2π, nicht als Bogen von 0 nach genau 2π, der verschwände');
  ok(lp.classList.contains('is-over'),'und als Übermass gekennzeichnet');
  ok(/125,0 %/.test(lp.getAttribute('aria-label'))&&/more than there is/.test(lp.getAttribute('aria-label')),
     'der Prozentsatz bleibt am Vermögen gemessen: '+lp.getAttribute('aria-label'));
  ok(d.querySelector('.orbit-core-val').classList.contains('is-neg'),'der Kern wechselt in den Schuldenton');
  ok(d.querySelector('.orbit-core-val').textContent.trim().startsWith('-'),'und zeigt einen negativen Betrag: '+d.querySelector('.orbit-core-val').textContent);
  /* Die Anteile der Sektionen bleiben am Vermögen gemessen — sonst hiesse
     „39 % investiert" plötzlich etwas anderes, nur weil Schulden dazukamen. */
  ok(/3,7 %/.test(d.querySelector('.orbit-arc[data-id="liquid"]').getAttribute('aria-label')),
     'die Sektionsanteile bleiben Anteile am Vermögen: '+d.querySelector('.orbit-arc[data-id="liquid"]').getAttribute('aria-label'));
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 12b. Eine negative Sektion in der Übersicht ---------- */
/* Nicht dasselbe wie oben: dort überwiegen die Schulden, hier ist eine
   einzelne Sektion (liquid) selbst negativ und fällt deshalb aus `sections`
   heraus — `total` sinkt mit ihr, während die übrigen, gezeichneten Anteile
   unverändert bleiben. Ohne die Positiv-Summe in der Skala reichten deren
   Bögen zusammen über eine volle Umdrehung hinaus. */
sec('Negative Sektion in der Übersicht');
{ const {w,errors}=await boot({storage:{...store}});
  const d=w.document;
  const ringTotal=()=>['liquid','receivables','investment','tangible','retirement']
    .map(id=>arcSweep(d,id)).filter(x=>x!=null).reduce((a,b)=>a+b,0);

  const m=w.NORDSTERN.app.state.model, L=m.currentIndex;
  const liqBefore=m.months[L].liquid;
  /* totalAssets folgt der veränderten Sektion, wie eine echte Mappe es täte:
     ein überzogenes Girokonto zieht die Summe mit herunter. */
  m.months[L].totalAssets=m.months[L].totalAssets-liqBefore-20000;
  m.months[L].liquid=-20000;
  m.months[L].netWorth=m.months[L].totalAssets-m.months[L].liabilities;
  w.NORDSTERN.app.refresh(); await tick(30);

  ok(!d.querySelector('.orbit-arc[data-id="liquid"]'),
     'die negative Sektion trägt keinen Bogen: '+m.months[L].liquid);
  const rt=ringTotal();
  ok(rt<=Math.PI*2+0.02,
     'die übrigen, positiven Bögen bleiben zusammen unter einer vollen Umdrehung: '+
     rt.toFixed(3)+' von '+(Math.PI*2).toFixed(3));
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 13. Dispos: negative Stände innerhalb einer Sektion ---------- */
sec('Negative Kontostände in einer Sektion');
{ const {w,errors}=await boot({storage:{...store}});
  const d=w.document;
  const m=w.NORDSTERN.app.state.model, L=m.currentIndex;

  /* Ein überzogenes Girokonto: der Stand wird negativ, die Summenzeile der
     Sektion sinkt entsprechend. Genau so steht es in einer Mappe, in der die
     Dispositionskredite oben mitlaufen statt unten. */
  const acc=m.accounts.liquid[0];
  const before=acc.values[L];
  acc.values[L]=-1850;
  m.months[L].liquid=m.months[L].liquid-before-1850;
  w.NORDSTERN.app.refresh(); await tick(40);

  const click=n=>n.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  const open=async()=>{
    const back=d.querySelector('.legend-back');
    if(back){ click(back); await tick(20); }
    click(d.querySelector('.orbit-arc[data-id="liquid"]')); await tick(30);
  };
  const secTotal=d.querySelector('.legend-row[data-id="liquid"] .legend-val').textContent;
  await open();

  const rows=[...d.querySelectorAll('.legend-row[data-id^="item-"]')];
  const vals=rows.map(r=>r.querySelector('.legend-val').textContent);
  ok(vals.some(t=>t.trim().startsWith('-')),'das überzogene Konto steht in der Legende: '+vals.join(' · '));
  const negRow=rows.find(r=>r.querySelector('.legend-val').textContent.trim().startsWith('-'));
  ok(negRow.classList.contains('is-owed'),'und ist als Abzug gekennzeichnet');
  ok(/negative balance/.test(negRow.getAttribute('title')||''),'mit Erklärung: '+negRow.getAttribute('title'));
  ok(negRow.querySelector('.legend-val').classList.contains('neg'),'im Ton der Verbindlichkeiten');

  /* Kein Bogen — eine negative Länge gibt es nicht. */
  const negIdx=rows.indexOf(negRow);
  ok(!d.querySelector('.orbit-arc[data-id="item-'+negIdx+'"]'),'es gibt keinen Bogen dafür');
  const arcCount=d.querySelectorAll('.orbit-arc[data-id^="item-"]').length;
  ok(arcCount===rows.length-1,'ein Bogen weniger als Zeilen: '+arcCount+' zu '+rows.length);

  /* Die Summe im Drill-down muss die aus der Mappe sein, nicht die der
     gezeigten Bögen — sonst stehen zwei Zahlen für dieselbe Sektion auf
     demselben Schirm. */
  const drillSum=d.querySelector('.legend-row[data-id="sum"] .legend-val').textContent;
  ok(N(drillSum)===N(secTotal),'die Summe stimmt mit der Übersicht überein: '+drillSum+' vs '+secTotal);
  ok(N(d.querySelector('.orbit-core-val').textContent)===N(U8(w,m.months[L].liquid)),
     'und steht so auch im Kern: '+d.querySelector('.orbit-core-val').textContent);

  /* Der Prozentsatz des Abzugs ist negativ, die positiven Posten dürfen
     zusammen über 100 % liegen — zusammen ergeben sie wieder 100 %. */
  const pcts=rows.map(r=>r.querySelector('.legend-pct').textContent);
  ok(pcts.some(t=>t.trim().startsWith('-')),'der Abzug zählt negativ: '+pcts.join(' · '));

  /* Eine Null bleibt draußen — ein geschlossenes Konto ist kein Posten. */
  m.accounts.liquid[1].values[L]=0;
  w.NORDSTERN.app.refresh(); await tick(30);
  await open();
  const vals2=[...d.querySelectorAll('.legend-row[data-id^="item-"] .legend-val')].map(n=>n.textContent);
  ok(!vals2.includes('0,00 €'),'Nullzeilen bleiben draußen: '+vals2.join(' · '));
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 14. Löschen räumt wirklich auf ---------- */
/* Wer löscht, erwartet den Zustand vor dem ersten Import — nicht einen
   zugezogenen Vorhang, hinter dem Verlauf, Scheibe und Karten weiterstehen,
   und nicht ein Einstellungsblatt, das die Ausgaben samt dem von Hand
   eingegebenen Betrag weiter zeigt. Genau das prüft diese Reihe. */
sec('Delete local data lässt nichts stehen');
{ const store3={};
  const {w,errors}=await boot({storage:store3});
  const d=w.document;
  importFixture(w);
  /* Die monatlichen Ausgaben sind die einzige Zahl, die nicht aus der Mappe
     kommt, sondern von Hand eingetippt wird — sie muss genauso verschwinden. */
  w.NORDSTERN.app.ui.settings.open('expenses');
  const expIn=d.querySelector('#setExp');
  expIn.value='640';
  expIn.dispatchEvent(new w.Event('input',{bubbles:true}));
  await tick(30);
  ok(Object.keys(store3).length===2,'vorher liegen Modell und Einstellungen im Speicher: '+Object.keys(store3).join(' · '));
  ok(/640/.test(store3['nordstern.settings.v1']||''),'und der Ausgabenbetrag steht drin');
  ok(!!d.querySelector('.hero-val'),'die Bühne ist gefüllt');

  w.confirm=()=>true;
  const del=[...d.querySelectorAll('#settingsZone button')].find(b=>/Delete local data/.test(b.textContent));
  ok(!!del,'der Knopf ist da');
  del.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  await tick(60);

  ok(Object.keys(store3).length===0,'der Speicher ist leer: '+JSON.stringify(Object.keys(store3)));
  ok(!d.getElementById('gate').hidden,'der Vorhang ist zu');
  ok(!d.querySelector('.hero-val'),'kein Vermögensstand mehr auf der Bühne');
  ok(d.querySelectorAll('.kpi').length===0,'keine Kennzahlen mehr');
  ok(d.querySelectorAll('.chart-body svg').length===0,'der Verlauf ist fort');
  ok(d.querySelector('.orbit-dial').children.length===0,'die Scheibe ist leer');
  ok(d.querySelector('.orbit-legend').children.length===0,'die Legende ist leer');
  ok(d.querySelector('#mountStatus').children.length===0,'die Zeile unter dem Berg ist leer');
  ok([...d.querySelectorAll('.card')].every(c=>!c.hasAttribute('data-status')),'keine Karte trägt noch einen Stand');
  ok([...d.querySelectorAll('.card-bar i')].every(i=>i.style.width==='0%'),'alle Balken stehen auf null');
  ok([...d.querySelectorAll('.card-back-foot .f-value')].every(n=>n.textContent==='—'),'keine Beträge mehr auf den Rückseiten');

  /* Das Blatt bleibt erreichbar — die Ausgaben kommen aus den Einstellungen,
     nicht aus der Mappe, und stehen deshalb wieder auf der Vorgabe, nicht auf
     einem Strich. Nur der Dateiname, der wirklich aus dem Import stammt, wird
     zum Strich. */
  ok(d.querySelector('#settingsZone .src-name').textContent==='—','der Dateiname der Mappe ist fort');
  const DEF=w.NORDSTERN.store.DEFAULT_EXPENSES;
  ok(DEF>0,'die Vorgabe für die Ausgaben ist keine Null: '+DEF);
  ok(expIn.value===String(DEF),'der Ausgabenbetrag steht wieder auf der Vorgabe: '+expIn.value);
  ok(N(d.querySelector('#settingsZone .num').textContent)===N(w.NORDSTERN.util.eur0(DEF)),
     'und die Summe im Blatt zeigt wieder die Vorgabe, keinen Strich: '+d.querySelector('#settingsZone .num').textContent);
  /* Der Hinweis unter dem Berg steht hier nicht — es gibt keinen Berg mehr,
     über den er etwas sagen könnte. Dass er mit der Vorgabe wiederkommt,
     sobald wieder eine Mappe da ist, prüft Abschnitt 3. */
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();

  /* Und nach einem Neustart darf nichts zurückkommen. */
  const again=await boot({storage:store3});
  ok(!again.w.document.getElementById('gate').hidden,'nach dem Neustart bleibt der Vorhang zu');
  ok(again.w.NORDSTERN.app.state.model===null,'kein Modell mehr im Zustand');
  ok(again.w.NORDSTERN.app.state.settings.monthlyExpenses===again.w.NORDSTERN.store.DEFAULT_EXPENSES,
     'und der Ausgabenbetrag ist wieder die Vorgabe: '+again.w.NORDSTERN.app.state.settings.monthlyExpenses);
  ok(again.w.NORDSTERN.app.state.settings.expensesSet===false,'als Schätzung, nicht als bestätigter Wert');
  again.w.close();
}

/* ---------- 15. Ankunft ---------- */
/* Bewegung soll etwas sagen. „Hier kommen deine Daten an" ist eine Aussage,
   „hier ist ein Chart" nicht — deshalb läuft der Aufbau genau dann, wenn eine
   andere Linie entsteht, und sonst nie. Der Fallstrick liegt im Refresh: es
   läuft auch bei jedem input-Ereignis des Schiebereglers. Hinge die Animation
   am Rendern, flackerte beim Ziehen die halbe Fläche. */
sec('Aufbau beim Ankommen der Daten');
{ const {w,errors}=await boot({storage:{...store}});
  const d=w.document;
  const line=()=>d.querySelector('.chart-line');
  ok(line().classList.contains('is-drawing'),'die Linie zeichnet sich beim Start');
  ok(Number(line().style.getPropertyValue('--len'))>100,
     'sie kennt ihre Länge: '+line().style.getPropertyValue('--len'));
  ok(Number(line().style.strokeDasharray)>100&&line().style.strokeDasharray===line().style.getPropertyValue('--len'),
     'und trägt sie als Strichfolge: '+line().style.strokeDasharray);
  ok(d.querySelector('.chart-glow').classList.contains('is-drawing'),'die Glut zeichnet sich mit');
  ok(d.querySelector('.chart-svg').classList.contains('is-arriving'),'Fläche und Randwerk blenden auf');
  ok(d.querySelector('.rail').classList.contains('is-arriving'),'die Balken der Karten füllen sich');
  ok([...d.querySelectorAll('.card')].every((c,i)=>c.style.getPropertyValue('--i')===String(i)),
     'jede Karte kennt ihren Platz in der Reihenfolge der Leiter');

  /* Die Scheibe: beide Ringe gleichzeitig, gegenläufig, gleiche
     Winkelgeschwindigkeit. Die Abschnitte des äusseren Rings setzen
     nacheinander an und ergeben zusammen eine Umdrehung. */
  ok(d.querySelector('#orbitZone').classList.contains('is-arriving'),'die Scheibe baut sich auf');
  const secArcs=[...d.querySelectorAll('.orbit-arc:not(.orbit-liab)')];
  ok(secArcs.length===5&&secArcs.every(a=>a.classList.contains('is-drawing')),
     'alle fünf Sektionsbögen zeichnen sich: '+secArcs.length);
  const liab=d.querySelector('.orbit-liab');
  ok(liab.classList.contains('is-drawing'),'der Gegenring zeichnet sich mit');
  ok(Number(liab.style.getPropertyValue('--off'))===0,'und startet mit dem äusseren zugleich');

  /* Ein Zug am Regler rendert alles neu — aufbauen darf sich nichts. */
  const varIn=d.getElementById('setExp');
  varIn.value='700'; varIn.dispatchEvent(new w.Event('input',{bubbles:true}));
  await tick(40);
  ok(!line().classList.contains('is-drawing'),'ein Zug am Regler zeichnet die Linie nicht neu');
  ok(!d.querySelector('.chart-svg').classList.contains('is-arriving'),'und blendet nichts auf');
  ok(!d.querySelector('.rail').classList.contains('is-arriving'),'und füllt die Balken nicht neu');
  ok(!d.querySelector('#orbitZone').classList.contains('is-arriving'),'und baut die Scheibe nicht neu auf');
  ok(![...d.querySelectorAll('.orbit-arc')].some(a=>a.classList.contains('is-drawing')),
     'kein Bogen zeichnet sich noch einmal');

  /* Ein anderer Zeitraum ist dagegen wirklich eine andere Linie. */
  const click=n=>n.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  const range=[...d.querySelectorAll('.range .range-btn')].find(b=>b.getAttribute('aria-pressed')==='false');
  click(range); await tick(30);
  ok(line().classList.contains('is-drawing'),'ein anderer Zeitraum zeichnet sie neu: '+range.textContent);

  varIn.value='710'; varIn.dispatchEvent(new w.Event('input',{bubbles:true}));
  await tick(30);
  ok(!line().classList.contains('is-drawing'),'danach ist wieder Ruhe');

  const ser=[...d.querySelectorAll('.series .range-btn')].find(b=>b.getAttribute('aria-pressed')==='false');
  click(ser); await tick(30);
  ok(line().classList.contains('is-drawing'),'und eine andere Reihe ebenso: '+ser.textContent);

  /* Nach dem Löschen darf nichts stehenbleiben, was sich noch aufbaut. */
  w.confirm=()=>true;
  click([...d.querySelectorAll('#settingsZone button')].find(b=>/Delete local data/.test(b.textContent)));
  await tick(40);
  ok(!d.querySelector('.rail').classList.contains('is-arriving'),'nach dem Löschen baut sich nichts mehr auf');
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 16. Der Kopf des About-Blatts ---------- */
sec('About: Fassung');
{ const {w,errors}=await boot({storage:{...store}});
  const d=w.document;
  const head=d.querySelector('.about-head');
  ok(!!head,'das Blatt hat einen Kopf');
  /* Die Fassung steht an einer Stelle im Quelltext und an einer in
     package.json — laufen sie auseinander, sagt eine von beiden die Unwahrheit,
     und man erfährt es erst, wenn jemand einen Fehler mit falscher Nummer meldet. */
  const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  ok(w.NORDSTERN.VERSION===pkg.version,'NORDSTERN.VERSION und package.json stimmen überein: '+w.NORDSTERN.VERSION+' / '+pkg.version);
  ok(head.querySelector('.about-ver').textContent==='Version '+pkg.version+' \u00b7 Apache-2.0',
     'und die Zeile darunter sagt es: '+head.querySelector('.about-ver').textContent);
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

console.log('\n'+pass+' bestanden, '+fail+' fehlgeschlagen');
process.exit(fail?1:0);
