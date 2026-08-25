import {boot, importFixture, tick, FIXTURE} from './harness.mjs';
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
  ok(!d.getElementById('gate').hidden,'Gate sichtbar');  /* Ein Stern, zwei Größen — der alte Zackenstern im Leerzustand ist weg. */
  const gs=d.querySelector('#gateStar .star');
  ok(gs&&gs.querySelector('.star-corona')&&gs.querySelector('.star-spikes')&&gs.querySelector('.star-core'),
     'Leerzustand trägt denselben gezeichneten Stern');
  ok(Number(gs.getAttribute('width'))>Number(d.querySelector('#starZone .star').getAttribute('width')),
     'im Leerzustand größer als im Kopfbereich: '+gs.getAttribute('width')+' vs '+
     d.querySelector('#starZone .star').getAttribute('width'));
  ok(!d.querySelector('svg.gate-star')&&!/M32 6 L34\.4/.test(d.documentElement.innerHTML),
     'kein zweiter, gezackter Stern im Dokument');
  const ids=[...d.querySelectorAll('radialGradient[id]')].map(n=>n.id);
  ok(ids.length===new Set(ids).size,'keine doppelten Verlaufs-IDs: '+ids.join(' · '));

  /* Der Vorhang deckt die leere Bühne ab — der Kopf bleibt bedienbar. */
  ok(d.getElementById('stage').getAttribute('aria-hidden')==='true','Bühne für AT verborgen');
  ok(d.getElementById('stage').hasAttribute('inert'),'und aus der Tabreihenfolge genommen');
  ok(!d.getElementById('shell').hasAttribute('aria-hidden'),'Kopfbereich bleibt für AT erreichbar');
  ok(d.body.classList.contains('is-gated'),'Leerzustand ist am body markiert');
  /* jsdom rechnet Kaskade und Schichten nicht aus — geprüft wird deshalb die
     Regel selbst: der Vorhang setzt unter dem Kopf an und liegt unter dem Blatt. */
  const css=fs.readFileSync(new URL('../css/components.css',import.meta.url),'utf8');
  const zOf=sel=>Number((new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*\\{[^}]*z-index:\\s*(\\d+)').exec(css)||[])[1]);
  ok(/\.gate\s*\{[^}]*inset:\s*var\(--head-h\) 0 0 0/.test(css),'der Vorhang beginnt unter dem Kopf');
  ok(zOf('.overlay')>zOf('.gate'),
     'die Einstellungen liegen über dem Vorhang: '+zOf('.overlay')+' vs '+zOf('.gate'));
  ok(/body\.is-gated \.mast-star\s*\{[^}]*display:\s*none/.test(css),
     'der Stern im Kopf tritt hinter den großen zurück');
  /* Und der Weg dorthin steht offen, obwohl noch nichts gelesen wurde. */
  ok(!d.querySelector('.overlay').classList.contains('is-open'),'Einstellungen zunächst zu');
  d.getElementById('btnSettings').dispatchEvent(new w.Event('click'));
  ok(d.querySelector('.overlay').classList.contains('is-open'),'Zahnrad öffnet sie auch ohne Daten');
  ok([...d.querySelectorAll('.sheet-facts .num')].every(n=>n.textContent==='—'),
     'Beträge stehen als Gedankenstrich statt leer');
  /* Eine Ebene: sechs Namen links, genau ein Abschnitt rechts. */
  const tabs=[...d.querySelectorAll('.sheet-nav-item')];
  const names=tabs.map(b=>b.textContent).join(' · ');
  ok(names==='expenses · data source · workbook · motion · privacy · about',
     'sechs Namen in der gesetzten Reihenfolge: '+names);
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
  ok(!d.querySelector('.sheet-sec-title')&&!d.querySelector('.sec-head'),
     'die Kapitelüberschriften im Blatt sind weg — den Namen trägt die Spalte');
  /* Der Metro-Schalter bleibt eine echte Checkbox mit sichtbarem Zustandswort. */
  ok(d.querySelectorAll('.metro-sw .field-check[type="checkbox"]').length===2
     &&[...d.querySelectorAll('.sw-state')].map(n=>n.textContent).join(' ')==='on off',
     'zwei Schalter, Zustand ausgeschrieben: '+[...d.querySelectorAll('.sw-state')].map(n=>n.textContent).join(' '));
  d.querySelector('.sheet-scrim').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  /* Aufbau der Mappe: was der Importer in Spalte A sucht, steht in der Oberfläche. */
  const layout=d.querySelector('.sheet-sec[data-sec="workbook"]');
  ok(layout,'Abschnitt „workbook" vorhanden: '+names);
  const at=n=>tabs.findIndex(b=>b.textContent===n);
  ok(at('workbook')<at('motion')&&at('privacy')===at('about')-1,
     'workbook vor motion, privacy direkt vor about');
  const src=fs.readFileSync(new URL('../js/importer.js',import.meta.url),'utf8');
  /* Die Tabelle ist ein Abbild der Mappe: zwei Spalten, links der wörtliche
     Zellinhalt, rechts ein Beispiel. */
  const tbl=[...layout.querySelectorAll('.wbt')];
  ok(tbl.length===2,'ein Abbild je gelesenem Blatt: '+tbl.length);
  ok(tbl.map(t=>[...t.querySelectorAll('thead th')].map(n=>n.textContent).join('|')).join(' / ')
       ==='Column A|Column B, C, D … / Column A|Column B',
     'linke Spalte und Beispielspalte sind überschrieben: '+
     tbl.map(t=>t.querySelector('th:last-child').textContent).join(' / '));
  ok(tbl.every(t=>[...t.querySelectorAll('tbody tr')].every(r=>r.children.length===2)),
     'jede Zeile hat genau zwei Zellen');
  /* Pflichtwort oder Beispiel — kursiv gesetzte Zeilen sind frei benennbar und
     dürfen deshalb nicht gegen den Importer geprüft werden. Alles andere muss
     er wirklich suchen, sonst beschreibt das Blatt eine fremde Mappe. */
  const rows=tbl.flatMap(t=>[...t.querySelectorAll('tbody tr')]);
  const labels=rows.filter(r=>!r.classList.contains('is-item'))
                   .map(r=>r.children[0].textContent.trim());
  ok(labels.length===17,'siebzehn Pflichtzeilen genannt: '+labels.length);
  ok(rows.filter(r=>r.classList.contains('is-item')).length===8,
     'acht Beispielzeilen, frei benennbar: '+rows.filter(r=>r.classList.contains('is-item'))
       .map(r=>r.children[0].textContent).join(' · '));
  ok(labels.every(l=>src.toLowerCase().includes(l.toLowerCase())),
     'jede kommt im Importer vor: '+labels.filter(l=>!src.toLowerCase().includes(l.toLowerCase())).join(' | '));
  /* Eine Schreibweise je Zeile, und zwar die kurze. Die langen Namen stehen
     nirgends — weder als Anker noch als geduldete Zweitform. */
  ok(['liquid','claims','investments','property','retirement']
       .every(l=>src.includes("head: '"+l+"'")),'die kurzen Namen sind die Anker im Importer');
  const longForm=['liquid assets','receivables towards third party','receivables',
    'investment assets','tangible assets','retirement assets'];
  /* Nur Ankerzeichenketten prüfen, nicht die IDs: „receivables" heißt die
     Sektion, die Zeile in der Mappe heißt anders. */
  const found=longForm.filter(l=>src.includes("head: '"+l+"'")||src.includes("total: '"+l+"'")
                            ||src.includes("total: 'total "+l+"'"));
  ok(found.length===0,'keine Langform als Anker im Importer: '+(found.join(' | ')||'—'));
  ok(!longForm.some(l=>new RegExp('"'+l+'"','i').test(layout.textContent)),
     'und das Blatt nennt sie auch nicht');
  /* Keine echten Beträge im Code — die Beispielspalte geht als erfundene
     Rechnung auf: 7.500 + 60.000 + 12.000 + 8.500 = 88.000 − 20.000 = 68.000. */
  const ex=Object.fromEntries(rows.map(r=>[r.children[0].textContent.trim(),
    Number(r.children[1].textContent.replace(/\./g,'').replace(',','.'))||0]));
  ok(ex['Total liquid']+ex['Total claims']+ex['Total investments']+ex['Total property']
     +ex['Total retirement']===ex['Total assets'],'das Beispiel summiert sich: '+ex['Total assets']);
  ok(ex['Total assets']-ex['Total liabilities']===ex['Total net worth'],
     'und die Differenz stimmt auch: '+ex['Total net worth']);
  ok(layout.textContent.includes('"Data Input"')&&layout.textContent.includes('"Expenses"'),
     'beide gelesenen Blätter sind benannt');
  ok(layout.textContent.includes('never by row number'),'der Hinweis auf die Ankerlogik steht dabei');
  ok(d.querySelector('.sheet-sec[data-sec="source"] .sheet-status .meta-import').textContent==='no import',
     'Importstatus steht oben im Abschnitt „data source“');
  ok(!d.querySelector('.masthead .meta-import'),'kein Speicherstatus im Kopfbereich');

  /* Die Kopfzeile trägt Material Symbols: gefüllte Flächen, keine Striche. */
  const mast=[...d.querySelectorAll('.masthead .icon-btn svg')];
  ok(mast.length===2&&mast.every(n=>n.getAttribute('viewBox')==='0 -960 960 960'),
     'beide Kopfsymbole tragen die Material-viewBox');
  ok(mast.every(n=>n.querySelector('path').getAttribute('fill')==='currentColor'
       &&!n.querySelector('[stroke]')),'gefüllt statt gestrichen');
  ok(/M480-160q-134 0-227-93/.test(d.querySelector('#btnImport path').getAttribute('d')),
     'Import trägt das Refresh-Symbol');

  ok(!d.querySelector('.wordmark-sub'),'keine Unterzeile an der Wortmarke');
  const about=d.querySelector('.sheet-sec[data-sec="about"]');
  ok(about&&about.textContent.includes('© 2026 Christian J. Heinze'),'About-Kapitel mit Urheberzeile');
  ok(about&&about.textContent.includes('Apache License, Version 2.0')&&about.textContent.includes('Material Symbols'),
     'beide Lizenzhinweise stehen im Blatt');
  /* SheetJS wird mit jeder Weitergabe mitverteilt, nicht nur benutzt — der
     Hinweis gehört deshalb ins Blatt, nicht nur in den Ordner. */
  const titles=[...about.querySelectorAll('.about-title')].map(h=>h.textContent);
  ok(titles.join(' · ')==='nordstern and the nordstern star · SheetJS · Material Symbols',
     'drei Kapitel, eigenes Werk zuerst: '+titles.join(' · '));
  ok(about.textContent.includes('SheetJS LLC')&&about.textContent.includes('0.20.3'),
     'SheetJS mit Urheber und Fassung genannt');
  ok(/read \u2014 never to write/.test(about.textContent),
     'und mit dem Versprechen, dass nur gelesen wird');
  const hrefs=[...about.querySelectorAll('a.sheet-link')].map(a=>a.getAttribute('href'));
  const has=new Set(hrefs);
  ok(has.has('https://github.com/chrisjohe/nordstern')&&
     has.has('https://git.sheetjs.com/sheetjs/sheetjs')&&
     has.has('https://github.com/google/material-design-icons')&&
     hrefs.filter(h=>h==='https://www.apache.org/licenses/LICENSE-2.0').length===3,
     'alle sechs Verweise: '+hrefs.join(' · '));
  ok([...about.querySelectorAll('a.sheet-link')].every(a=>a.getAttribute('rel')==='noopener noreferrer'&&a.getAttribute('target')==='_blank'),
     'Verweise öffnen abgeschottet in einem neuen Tab');
  ok(d.getElementById('mountFallback').hasAttribute('hidden'),'Ersatztext ist ausgeblendet');
  ok(d.querySelector('.zone--mountain .rail'),'Kartenschiene liegt in der Bergspalte');
  /* Gegen Bilder auf den Karten haben wir uns entschieden — es gibt keinen
     Weg mehr, eine Datei neben der Anwendung nachzuladen. */
  ok(d.querySelectorAll('.card-wash').length===8,'acht gerechnete Verläufe');
  ok(!d.querySelector('.card-img')&&!d.querySelector('.card img'),'keine Bildfläche auf den Karten');
  ok(!/img\//.test(fs.readFileSync(new URL('../js/ui/cards.js',import.meta.url),'utf8')),
     'cards.js kennt keine Bildpfade');
  ok(!d.querySelector('.legend-tag'),'keine Anteilsmarken in der Legende');
  ok(!d.querySelector('.legend-sub'),'keine Schulden-Unterzeile in der Legende');
  ok(!d.querySelector('.orbit-flag-val')&&!d.querySelector('.orbit-leader'),'keine Prozentmarken an der Scheibe');
  ok(!d.querySelector('.orbit-core-sub'),'keine Unterzeile im Kern');
  ok([...d.querySelectorAll('.panel-title')].some(n=>n.textContent==='Structure'),'Kapitel heißt Structure');
  /* Die Sektionsnamen in der Oberfläche sind kurz — unter „Structure", über
     einer Summe namens „Total assets", ist jede Zeile ohnehin ein Posten.
     Die Zeilennamen der Mappe bleiben davon unberührt: der Importer sucht
     nach den Ankern in Spalte A, nicht nach diesen Etiketten. */
  const SL=w.NORDSTERN.calc.SECTION_LABELS;
  ok(Object.keys(SL).map(k=>SL[k]).join(' · ')==='Liquid · Claims · Investments · Property · Retirement',
     'Sektionsnamen: '+Object.keys(SL).map(k=>SL[k]).join(' · '));
  ok(Object.keys(SL).every(k=>!/assets/i.test(SL[k])),'keiner trägt „assets" im Namen');
  /* Anzeige und Mappe tragen dieselben Namen — die Langformen stehen deshalb
     an keiner Stelle im Code. */
  const longRowNames=['Liquid assets','Receivables towards third party','Tangible assets',
    'Investment assets','Retirement assets'];
  const files=['../js/importer.js','../js/calc.js','../js/ui/settings.js'];
  const left=files.flatMap(f=>{const t=fs.readFileSync(new URL(f,import.meta.url),'utf8');
    return longRowNames.filter(a=>new RegExp('[\'"]'+a+'[\'"]','i').test(t)).map(a=>f+': '+a);});
  ok(left.length===0,'keine Langform als Zeilenbezeichnung im Code: '+(left.join(' | ')||'—'));
  /* Zahlen und Daten laufen über js/util.js, nicht über ein toLocaleString
     an Ort und Stelle — sonst driftet die Schreibweise zwischen den Kacheln
     auseinander, und niemand merkt es. AGENTS.md sagt es, hier steht es. */
  const raw=['../js/util.js','../js/importer.js','../js/calc.js','../js/store.js','../js/app.js',
    '../js/ui/settings.js','../js/ui/header.js','../js/ui/position.js','../js/ui/chart.js',
    '../js/ui/orbit.js','../js/ui/cards.js','../js/ui/mountain.js','../js/ui/icons.js']
    .filter(f=>f!=='../js/util.js')
    .filter(f=>/toLocaleString|toLocaleDateString|toLocaleTimeString/.test(fs.readFileSync(new URL(f,import.meta.url),'utf8')));
  ok(raw.length===0,'keine rohe Formatierung ausserhalb von js/util.js: '+(raw.join(' | ')||'—'));
  ok(d.querySelector('#starZone .star-corona')&&d.querySelector('#starZone .star-spikes'),'Stern hat Korona und Spitzen');
  ok([...d.querySelectorAll('.panel-title')].some(n=>n.textContent==='Route'),'Bergspalte heißt Route');
  ok(d.querySelectorAll('.rail .card').length===8,'acht Cards');
  ok(d.querySelector('#starZone .star')&&!d.querySelector('.masthead .mast-meta'),'im Kopf steht nur der Stern');
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
  ok(d.documentElement.getAttribute('lang')==='en','Seitensprache ist Englisch');
  ok(d.title==='nordstern','der Fenstertitel ist die Wortmarke, klein: '+d.title);
  /* Eine geteilte Verknüpfung zeigt sonst nur den Titel. Beide Beschreibungen
     müssen dasselbe sagen — zwei Fassungen wären zwei Versprechen. */
  const desc=d.querySelector('meta[name="description"]');
  const ogd=d.querySelector('meta[property="og:description"]');
  ok(desc&&desc.content.length>60&&desc.content.length<=160,
     'die Seite beschreibt sich in einem Satz ('+(desc?desc.content.length:0)+' Zeichen)');
  ok(ogd&&ogd.content===desc.content,'und die Vorschau sagt denselben Satz');
  ok(d.querySelector('meta[property="og:title"]').content===d.title,'auch der Vorschautitel ist die Wortmarke');
  ok(!/\bsends\b(?!\s+nothing)/.test(desc.content)&&/sends nothing/.test(desc.content),
     'und die Zusage steht darin: „'+desc.content.slice(-30).trim()+'"');
  ok(!d.querySelector('.hero-month'),'kein Monat an der Bühne');
  ok(kpi('As of').querySelector('.kpi-val').textContent==='August 2026','Datenstand als Kennzahl: '+kpi('As of').querySelector('.kpi-val').textContent);
  ok(kpi('Snapshots').querySelector('.kpi-val').textContent==='84','Snapshots als Kennzahl: '+kpi('Snapshots').querySelector('.kpi-val').textContent);
  ok(kpi('Snapshots').querySelector('.kpi-sub').textContent==='since records began','Unterzeile der Snapshot-Zahl: '+kpi('Snapshots').querySelector('.kpi-sub').textContent);
  ok(d.querySelectorAll('.kpi-row .kpi').length===8,'acht Kennzahlen in vier Spalten: '+d.querySelectorAll('.kpi-row .kpi').length);

  /* Der Hebel: 883.024,38 / 450.239,15 = 1,96. Er steht neben dem Tempo, weil
     beide nichts über den Stand sagen, sondern über seine Art. */
  ok(!!kpi('Leverage'),'es gibt eine Kennzahl „Leverage"');
  ok(!kpi('Next milestone'),'die nächste Station steht nicht doppelt in den Kennzahlen');
  ok(kpi('Leverage').querySelector('.kpi-val').textContent==='1,96\u00d7',
     'Eigenkapitalhebel: '+kpi('Leverage').querySelector('.kpi-val').textContent);
  ok(N(kpi('Leverage').querySelector('.kpi-sub').textContent)==='49,0 % of assets is debt',
     'und der Schuldenanteil darunter: '+N(kpi('Leverage').querySelector('.kpi-sub').textContent));
  ok(/net worth/.test(kpi('Leverage').getAttribute('title')||''),
     'mit Erklärung, woraus er sich errechnet');
  /* Die Zahl muss zur Legende der Scheibe passen, sonst stehen zwei Wahrheiten
     über dieselbe Sache auf demselben Schirm. */
  const liabPct=d.querySelector('.legend-row[data-id="liabilities"] .legend-pct');
  ok(N(liabPct.textContent).replace('-','')===N(kpi('Leverage').querySelector('.kpi-sub').textContent).split(' ').slice(0,2).join(' '),
     'derselbe Anteil wie in der Legende: '+liabPct.textContent);

  /* Vorzeichen bekommen in beide Richtungen Farbe. */
  ok(kpi('Portfolio pace').classList.contains('is-pos'),
     'ein positives Tempo ist als solches gekennzeichnet: '+kpi('Portfolio pace').className);
  /* Die vierte Spalte tritt über die Farbe zurück, nicht über eine zweite Größe. */
  const metaVals=[...d.querySelectorAll('.kpi.is-meta .kpi-val')];
  ok(metaVals.length===2,'zwei Herkunfts-KPIs: '+metaVals.map(n=>n.textContent).join(' · '));
  ok(metaVals.every(n=>{const c=w.getComputedStyle(n);
       return c.fontSize===w.getComputedStyle(d.querySelector('.kpi:not(.is-meta) .kpi-val')).fontSize;}),
     'gleiche Schriftgröße wie die übrigen Kennzahlen');
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
  ok(ser.map(b=>b.textContent).join(' ')==='Net Total Invested',
     'Net / Total / Invested in dieser Reihenfolge: '+ser.map(b=>b.textContent).join(' · '));
  ok(d.querySelector('.chart-tools').firstElementChild.classList.contains('series'),
     'die Reihen stehen vor den Jahren');
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
  ok(d.querySelector('.chart-glow')&&d.querySelector('.chart-last-ping')&&d.querySelector('#nsFill'),
     'Schein, Puls und Polarlicht-Fläche gelten unverändert');
  ok(!d.querySelector('.range-btn.is-series'),'der alte Ein-Aus-Schalter ist weg');
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
    'Ausgaben fehlen':                 JSON.stringify({...good,expenses:null}),
    /* Alles, was durch die erste Fassung der Prüfung noch durchkam und dann
       beim Start warf — die Zahl zwischen zwei Monaten, das leere Konto. */
    'currentIndex als Bruch':          JSON.stringify({...good,currentIndex:0.5}),
    'ein Konto ist null':              bend(m=>{m.accounts.liquid=[null];}),
    'ein Konto ohne Stände':           bend(m=>{delete m.accounts.liquid[0].values;}),
    'eine zu kurze Kontenreihe':       bend(m=>{m.accounts.liquid[0].values.pop();}),
    'ein Stand ist keine Zahl':        bend(m=>{m.accounts.liquid[0].values[3]=null;}),
    'die Verbindlichkeiten sind hin':  bend(m=>{m.accounts.liabilities=[{name:'Darlehen'}];}),
    'ein Posten ohne Betrag':          bend(m=>{m.expenses.monthlyItems[0].amount='viel';}),
    'ein Monatsschlüssel entstellt':   bend(m=>{m.months[2].key='2026-8';})
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

/* ---------- 3. Variabler Anteil wirkt sofort ---------- */
sec('Variabler Anteil verschiebt alle Ziele');
{ const {w,errors}=await boot({storage:{...store}});
  const d=w.document;
  const before=d.querySelector('.card[data-id="coast"]').dataset.status;
  const beforeTarget=d.querySelector('.card[data-id="coast"] .f-target').textContent;
  /* Der Hinweis unter dem Berg meint die Ausgaben — und landet dort auch. */
  d.querySelector('.st-hint').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  ok(d.querySelector('.overlay').classList.contains('is-open'),'der Hinweis öffnet das Blatt');
  ok(d.querySelector('.sheet-nav-item[aria-selected="true"]').textContent==='expenses',
     'und zwar in expenses: '+d.querySelector('.sheet-nav-item[aria-selected="true"]').textContent);
  /* Der Betrag ist bewusst gross: die Fixkosten dieses Haushalts werden von
     der Annuität beherrscht, ein kleiner variabler Anteil verschöbe keine
     einzige Station über ihre Schwelle. */
  const inp=d.getElementById('setVar');
  inp.value='2600'; inp.dispatchEvent(new w.Event('input'));
  await tick(30);
  const after=d.querySelector('.card[data-id="coast"]').dataset.status;
  const afterTarget=d.querySelector('.card[data-id="coast"] .f-target').textContent;
  ok(before==='reached'&&after==='current','Coast FI kippt von erreicht auf aktuell ('+before+'→'+after+')');
  /* Vorher steht die Vorgabe von 600 € im Betrag, nicht null — der Hinweis
     oben ist trotzdem da, weil sie niemand bestätigt hat. */
  ok(N(beforeTarget)==='231.300 €','Ziel vorher '+beforeTarget);
  ok(N(afterTarget)==='351.300 €','Ziel nachher '+afterTarget);
  ok(N(d.querySelector('.sheet-facts .is-total').textContent)==='5.855,00 €','Gesamtausgaben: '+d.querySelector('.sheet-facts .is-total').textContent);
  ok(!d.querySelector('.st-hint'),'Hinweis „variabler Anteil“ verschwindet');
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
  ok(N(unit.textContent)==='€','Einheit neben dem variablen Betrag zu Beginn: '+unit.textContent);

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
     dieselbe Prüfung wie für den variablen Betrag (Abschnitt 14), hier für
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
{ /* Die ausgelieferte Beispielmappe trägt selbst kein Währungsformat (siehe
     tests/formats.mjs), und das vendorte SheetJS verliert Zellformate beim
     Schreiben — ein Rundgang über XLSX.write/XLSX.read liefert c.z ===
     undefined, geprüft von Hand beim Bau dieser Reihe. Eine Mappe mit
     echtem USD-Format lässt sich über parseArrayBuffer also nicht bauen.
     Geprüft wird deshalb der Übernahmepfad in app.js selbst:
     parseArrayBuffer wird umhüllt, ruft den echten Importer auf und
     behauptet danach `currency: 'USD'` — der reguläre Weg über den
     Dateidialog bekommt damit genau das Ergebnis, das der Importer bei
     einer wirklich USD-formatierten Mappe liefern würde. */
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
  ok(bk.querySelector('.card-x svg'),'Kreuz oben rechts');
  ok(bk.querySelector('.card-bar i').style.width===d.querySelector('.card[data-id="lean"] .card-front .card-bar i').style.width,
     'Fortschrittsbalken auf beiden Seiten gleich');
  ok(bk.querySelector('.card-back-foot .f-pct').textContent.includes('%'),'Prozent in der Fußzeile');
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
  /* Das Paar Ziel/Stand muss lesbar bleiben — die Deckung tritt hinzu, sie
     ersetzt das Zeitwort nicht. */
  ok(basis.every(b=>b.w==='Now '+b.q),'das Zeitwort führt: „'+basis[0].w+'"');
  ok([...bk.querySelectorAll('.card-facts dt')].map(n=>n.firstChild.textContent.trim()).join('/')==='Target/Now',
     'Ziel und Stand stehen als Paar: '+[...bk.querySelectorAll('.card-facts dt')].map(n=>n.textContent).join(' / '));
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
  /* Die Marke auf der Vorderseite: das Vielfache, das die Station definiert. */
  const ladder=[...d.querySelectorAll('.card .card-tag b')].map(n=>n.textContent);
  ok(ladder.join(' | ')==='3 months | 6 months | 1 year | 5 years | 10 years | 20 years | 25 years | 33 years',
     'Leiter der Vielfachen auf den Karten: '+ladder.join(' · '));
  ok([...d.querySelectorAll('.card .card-tag')].every(n=>/of expenses$/.test(n.textContent)),
     'jede Marke nennt die Einheit — „25 years" allein wäre eine Frist');
  ok(!d.querySelector('.card-slot')&&![...d.querySelectorAll('.card-tag')].some(n=>/img\//.test(n.textContent)),
     'kein Dateiname in der Marke');
  ok(d.querySelectorAll('.card .card-watermark').length===8,'jede Karte trägt ihr Wasserzeichen');
  /* Kein Datenexport — die Mappe ist die Quelle, nicht das Dashboard. */
  ok(!d.querySelector('#btnExport')&&d.querySelectorAll('.masthead .icon-btn').length===2,
     'kein Export-Knopf in der Kopfzeile, nur Import und Einstellungen');
  ok(![...d.querySelectorAll('button, a')].some(n=>/export/i.test(n.textContent||'')),
     'kein Export-Text auf irgendeinem Knopf');
  ok(!d.querySelector('.card-term'),'keine Fachbegriffe auf den Karten');
  ok(!bk.querySelector('.f-basis'),'keine eigene Zeile „Grundlage" — die Deckung steht als Beschriftung am Betrag');
  ok(w.NORDSTERN.calc.MILESTONES.every(m=>m.meaning.length<=60),
     'alle Bedeutungssätze passen in zwei Zeilen (max '+Math.max(...w.NORDSTERN.calc.MILESTONES.map(m=>m.meaning.length))+' Zeichen)');
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

  /* Das Lesefenster hängt über dem Punkt, den es beschreibt, und läuft mit
     der Linie mit. Am oberen Chartrand darf es nicht abgefangen werden — sonst
     läge es dort über der Linie, wo diese hoch steht. Es tritt also über den
     Rand hinaus, über Schalter und Kennzahlen, und bleibt im Chart, wo die
     Linie tief liegt. Beides wird geprüft: links unten drin, rechts oben
     draussen. */
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
     darüber. Aus einem negativen Vorjahreswert heraus rechnete der Chart
     lange sein eigenes Ergebnis: −100 → −50 stand als −150 % statt als
     +50 %, mit umgedrehtem Vorzeichen und roter Farbe. */
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

/* ---------- 5. Bewegung aus ---------- */
sec('Animationen abschaltbar & Systemvorgabe');
{ const {w,errors}=await boot({storage:{...store}});
  const d=w.document;
  ok(d.documentElement.getAttribute('data-motion')==='on','Standard: Bewegung an');  /* Drei Herzschläge auf einem Takt: Stern, Chartlinie, Reservering. */
  /* Die Fläche trägt die Aurora, die Linie bleibt die Zeitachse. */
  const fill=[...d.querySelectorAll('#nsFill stop')].map(n=>n.getAttribute('stop-color'));
  ok(fill[0]==='#9085e9'&&fill.includes('#2fbd8b')&&fill[fill.length-1]==='#3987e5',
     'Flächenverlauf violett → grün → blau: '+fill.join(' → '));
  const line=[...d.querySelectorAll('#nsLine stop')].map(n=>n.getAttribute('stop-color'));
  ok(line[line.length-1]==='#eaf2ff'&&!line.includes('#2fbd8b'),
     'Linie bleibt die Helligkeitsrampe zum Jetzt: '+line.join(' → '));
  ok(d.querySelector('.star-corona')&&d.querySelector('.chart-glow')&&d.querySelector('.chart-last-ping'),
     'Stern, Linienschein und Ping am letzten Datenpunkt sind da');
  ok(d.querySelectorAll('.chart-last-ping').length===1,'genau ein Ping, am aktuellen Stand');
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
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Art','Betrag']]),'Expenses');
  const res=w.NORDSTERN.importer.parseWorkbook(wb,'kaputt.xlsx');
  ok(!res.ok,'Import wird abgelehnt');
  ok(res.errors.length>=3,'nennt die fehlenden Zeilen ('+res.errors.length+')');
  console.log('    →', res.errors.slice(0,3).join(' / '));
  const wb2=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb2,XLSX.utils.aoa_to_sheet([['x']]),'Tabelle1');
  const res2=w.NORDSTERN.importer.parseWorkbook(wb2,'leer.xlsx');
  ok(!res2.ok && res2.errors.length===2,'fehlende Blätter werden benannt: '+res2.errors.join(' / '));

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

/* ---------- 6b. Löchrige Zeitreihe ---------- */
/* Eine Monatsspalte fehlt, eine steht doppelt. Beides sieht in der Mappe
   harmlos aus und macht aus „im Vormonat" und „vor einem Jahr" stillschweigend
   etwas anderes. Der Import sagt es, und die Berechnung vergleicht lieber
   nicht, als falsch zu vergleichen. */
sec('Lücken und Doppel in der Monatsreihe');
{ const {w,errors}=await boot();
  const XLSX=w.XLSX;
  /* Das Datum muss aus der Welt des Fensters kommen: SheetJS läuft dort und
     prüft `instanceof Date` gegen deren Konstruktor, nicht gegen den hiesigen. */
  const D=(y,m)=>new w.Date(y,m-1,1);
  /* Eine Mappe, klein aber vollständig: alle Anker, drei Sektionen leer. */
  const sheet=(months)=>XLSX.utils.aoa_to_sheet([
    ['Month',        ...months.map(([y,m])=>D(y,m))],
    ['Liquid'],
    ['  Cash',       ...months.map((_,i)=>100+i)],
    ['Total liquid', ...months.map((_,i)=>100+i)],
    ['Claims'],
    ['Total claims', ...months.map(()=>0)],
    ['Investments'],
    ['  Depot',      ...months.map((_,i)=>1000+100*i)],
    ['Total investments', ...months.map((_,i)=>1000+100*i)],
    ['Property'],
    ['Total property', ...months.map(()=>0)],
    ['Retirement'],
    ['Total retirement', ...months.map(()=>0)],
    ['Total assets', ...months.map((_,i)=>1100+100*i+i)],
    ['Liabilities'],
    ['  Loan',       ...months.map(()=>0)],
    ['Total liabilities', ...months.map(()=>0)],
    ['Total net worth', ...months.map((_,i)=>1100+100*i+i)]
  ],{cellDates:true});
  const expenses=XLSX.utils.aoa_to_sheet([
    ['Kind','Amount'],['Rent',1000],['Monthly fixed costs',1000],
    ['Insurance',1200],['Annual fixed costs',1200]
  ]);
  const read=(months)=>{
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,sheet(months),'Data Input');
    XLSX.utils.book_append_sheet(wb,expenses,'Expenses');
    return w.NORDSTERN.importer.parseWorkbook(wb,'reihe.xlsx');
  };

  /* Zum Vergleich: dieselbe Mappe ohne Loch. */
  const clean=read([[2026,1],[2026,2],[2026,3]]);
  ok(clean.ok&&clean.warnings.length===0,'die lückenlose Reihe kommt ohne Hinweis durch: '+clean.warnings.join(' | '));

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

  /* Und die Zahl daneben: über die Lücke hinweg wird nicht verglichen. */
  const set=w.NORDSTERN.store.loadSettings();
  ok(w.NORDSTERN.calc.derive(clean.model,set).mom!==null,'ohne Lücke steht der Vormonatsvergleich');
  ok(w.NORDSTERN.calc.derive(gap.model,set).mom===null,'über die Lücke hinweg nicht');

  /* Dasselbe eine Ebene höher: März fehlt, also gibt es zwölf Monate später
     keinen Vorjahreswert und kein Tempo. */
  const year=[]; for(let m=1;m<=13;m++) year.push(m<=12?[2025,m]:[2026,1]);
  const full=read(year);
  const holed=read(year.filter(([y,m])=>!(y===2025&&m===1)));
  const dFull=w.NORDSTERN.calc.derive(full.model,set);
  const dHoled=w.NORDSTERN.calc.derive(holed.model,set);
  ok(dFull.yoy!==null&&dFull.pace!==null,'zwölf volle Monate ergeben Vorjahr und Tempo');
  ok(dHoled.yoy===null&&dHoled.pace===null&&dHoled.etaMonths===null,
     'mit Loch in der Reihe steht dort nichts: yoy='+dHoled.yoy+' pace='+dHoled.pace);
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 6c. Zahlen, die als Text in der Zelle stehen ---------- */
/* Wer Beträge aus einem Kontoauszug in die Mappe kopiert, hat sie oft als
   Text darin: „1.234,56". Die alte Lesart tauschte nur das Komma und liess
   parseFloat den Rest machen — das hörte am zweiten Punkt auf und ergab
   1,234. Ein Faktor tausend, und die Gegenprobe gegen die Summenzeile schwieg
   dazu, weil die genauso falsch gelesen wurde. */
sec('Zahlen als Text');
{ const {w,errors}=await boot();
  const P=w.NORDSTERN.importer._parseNumber;
  const good=[['1.234,56',1234.56],['1,234.56',1234.56],['-1.234,56',-1234.56],
              ['−1.234,56',-1234.56],['+980',980],['0',0],['12,5',12.5],
              ['1 234,56',1234.56],['1.234,56 €',1234.56],
              ['1.234',1234],       // beides möglich, deutsch gewinnt
              ['1.2345',1.2345],    // als deutsche Gruppierung unmöglich
              ['1.234.567,89',1234567.89],['12,345',12.345]];
  good.forEach(([t,v])=>ok(P(t)===v,'„'+t+'" ist '+v+', gelesen: '+P(t)));
  const bad=['1.234.56','abc','12,34,56','1.23.456','','12 %','1.2.3','--5','1,2345.6'];
  bad.forEach(t=>ok(P(t)===null,'„'+t+'" ist keine Zahl, gelesen: '+P(t)));

  /* Und dasselbe in einer Mappe, in der Posten und Summenzeile beide Text
     sind — der Fall, den die Gegenprobe nicht sieht. */
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
    XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet([
      ['Kind','Amount'],['Rent',1000],['Monthly fixed costs',1000],
      ['Insurance',1200],['Annual fixed costs',1200]
    ]),'Expenses');
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

/* ---------- 6d. Die zwei Grenzen im Blatt „Expenses" ---------- */
/* Die Summenzeilen sind nicht der Summe wegen da, sondern als Grenze: über
   der ersten stehen die monatlichen Posten, zwischen beiden die jährlichen.
   Fehlt eine, ist nicht mehr zu sagen, welcher Posten welcher ist — und alle
   acht Zielbeträge hängen daran. Also abgelehnt, nicht geraten. */
sec('Die Ausgaben brauchen ihre zwei Grenzen');
{ const {w,errors}=await boot();
  const XLSX=w.XLSX;
  const D=(y,m)=>new w.Date(y,m-1,1);
  const data=XLSX.utils.aoa_to_sheet([
    ['Month',        D(2026,1), D(2026,2)],
    ['Liquid'],['  Cash',100,110],['Total liquid',100,110],
    ['Claims'],['Total claims',0,0],
    ['Investments'],['  Depot',1000,1100],['Total investments',1000,1100],
    ['Property'],['Total property',0,0],
    ['Retirement'],['Total retirement',0,0],
    ['Total assets',1100,1210],
    ['Liabilities'],['  Loan',0,0],['Total liabilities',0,0],
    ['Total net worth',1100,1210]
  ],{cellDates:true});
  const read=(rows)=>{
    const b=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(b,data,'Data Input');
    XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet(rows),'Expenses');
    return w.NORDSTERN.importer.parseWorkbook(b,'ausgaben.xlsx');
  };
  const both=read([['Kind','Amount'],['Rent',1000],['Monthly fixed costs',1000],
                   ['Insurance',1200],['Annual fixed costs',1200]]);
  ok(both.ok&&both.model.expenses.fixedMonthly===1100,
     'mit beiden Grenzen: 1000 + 1200/12 = '+both.model.expenses.fixedMonthly);

  const noMonthly=read([['Kind','Amount'],['Rent',1000],
                        ['Insurance',1200],['Annual fixed costs',1200]]);
  ok(!noMonthly.ok&&noMonthly.errors.some(t=>/"Monthly fixed costs" not found/.test(t)),
     'ohne die monatliche Grenze bricht es ab: '+noMonthly.errors.join(' | '));

  const noAnnual=read([['Kind','Amount'],['Rent',1000],['Monthly fixed costs',1000],
                       ['Insurance',1200]]);
  ok(!noAnnual.ok&&noAnnual.errors.some(t=>/"Annual fixed costs" not found/.test(t)),
     'ohne die jährliche ebenso: '+noAnnual.errors.join(' | '));

  const swapped=read([['Kind','Amount'],['Insurance',1200],['Annual fixed costs',1200],
                      ['Rent',1000],['Monthly fixed costs',1000]]);
  ok(!swapped.ok&&swapped.errors.some(t=>/stands above/.test(t)),
     'und vertauscht auch: '+swapped.errors.join(' | '));

  /* Eine leere Zelle in der Summenzeile bleibt erlaubt — die Grenze steht ja,
     also lassen sich die Posten darüber zusammenzählen. */
  const blank=read([['Kind','Amount'],['Rent',700],['Coffee',300],['Monthly fixed costs'],
                    ['Insurance',1200],['Annual fixed costs',1200]]);
  ok(blank.ok&&blank.model.expenses.monthlyFixed===1000,
     'leere Summenzelle: die Posten darüber ergeben '+blank.model.expenses.monthlyFixed);
  ok(blank.warnings.length===0,'und das ohne Hinweis: '+blank.warnings.join(' | '));
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 6e. Die Lücke im Verlauf ---------- */
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
     +50 %. Die alte Formel machte daraus −150 % und drehte damit das
     Vorzeichen der Nachricht um. */
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

  const bad=IDS.filter(id=>['pin','card'].some(v=>{
    const e=I.entry(id,v);
    return !e||e.box!=='0 -960 960 960'||!/^[Mm]/.test(e.d)||e.mode;
  }));
  ok(bad.length===0,'echte Material-Symbols-Pfade, gefüllt statt gestrichen ('+(bad.join(',')||'—')+')');

  /* Berg und Karte greifen bewusst auf verschiedene Fassungen zu. */
  const same=IDS.filter(id=>I.entry(id,'pin').d===I.entry(id,'card').d);
  ok(same.length===0,'16-px- und 48-px-Fassung sind nicht dieselbe Datei ('+(same.join(',')||'—')+')');

  const el=I.svg('fat',48,'x');
  ok(el.getAttribute('viewBox')==='0 -960 960 960','SVG übernimmt die viewBox der Datei');
  const path=el.querySelector('path');
  ok(path.getAttribute('fill')==='currentColor'&&!path.getAttribute('stroke'),
     'Karte zeichnet gefüllt in der Vordergrundfarbe');
  ok(path.getAttribute('d')===I.GLYPHS.fat.card.d,'Karte nimmt die 48-px-Fassung');
  ok(I.svg('fat',48,'x','pin').querySelector('path').getAttribute('d')===I.GLYPHS.fat.pin.d,
     'Berg nimmt die 16-px-Fassung');

  /* Zeichnung: mittig um (0,0), Kantenlänge wie verlangt. */
  const log=[]; const ctx={save(){},restore(){},scale(a,b){log.push(['scale',a,b]);},
    translate(a,b){log.push(['translate',a,b]);},fill(){log.push(['fill']);},stroke(){log.push(['stroke']);}};
  I.draw(ctx,'fat',24,'#fff');
  const sc=log.find(e=>e[0]==='scale'), tr=log.find(e=>e[0]==='translate');
  ok(Math.abs(sc[1]-24/960)<1e-9,'Maßstab folgt der viewBox-Kante ('+sc[1].toFixed(5)+')');
  ok(tr[1]===-480&&tr[2]===480,'Mittelpunkt der viewBox liegt im Ursprung ('+tr[1]+'/'+tr[2]+')');
  ok(log.some(e=>e[0]==='fill')&&!log.some(e=>e[0]==='stroke'),'Material Symbols werden gefüllt');
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 11. Lesbarkeit der Schrifttöne ---------- */
/* Die vier Schriftstufen sind eine Rampe, keine Sammlung: jede Stufe muss
   gegen den dunkelsten Grund lesbar bleiben und deutlich unter der vorigen
   liegen. Gerechnet wird nach WCAG, nicht nach Augenmaß — das lässt die
   unteren Stufen zuverlässig zu dunkel durchgehen. */
sec('Kontrast der Schrifttöne');
{ const tok=fs.readFileSync(new URL('../css/tokens.css',import.meta.url),'utf8');
  const hex=n=>{const m=new RegExp('--'+n+':\\s*#([0-9a-f]{6})','i').exec(tok); return m&&m[1];};
  const lin=c=>{c/=255; return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);};
  const lum=h=>0.2126*lin(parseInt(h.slice(0,2),16))+0.7152*lin(parseInt(h.slice(2,4),16))
              +0.0722*lin(parseInt(h.slice(4,6),16));
  const ratio=(a,b)=>{const x=lum(a),y=lum(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
  const bg=hex('bg-void');
  const ramp=['ink','ink-2','ink-3','ink-4'];
  const cr=ramp.map(n=>{const h=hex(n); return {n:n,h:h,c:h?ratio(h,bg):0};});
  console.log('    → '+cr.map(x=>x.n+' '+x.c.toFixed(1)+':1').join(' · '));
  ok(cr.every(x=>x.h),'alle vier Stufen sind gesetzt');
  /* 4,5:1 ist die Grenze für Fließtext — die matteste Stufe trägt hier die
     kleinen Versaletiketten und muss sie halten. */
  ok(cr[3].c>=4.5,'die matteste Schriftstufe bleibt lesbar: '+cr[3].c.toFixed(2)+':1');
  ok(cr[2].c>=7,'die dritte Stufe erreicht die strengere Schwelle: '+cr[2].c.toFixed(2)+':1');
  ok(cr.every((x,i)=>i===0||x.c<cr[i-1].c*0.92),
     'jede Stufe bleibt deutlich unter der vorigen: '+cr.map(x=>x.c.toFixed(1)).join(' > '));
  /* Der stille Ton ist kein Schriftton — er darf dunkel sein, aber nirgends
     als Schriftfarbe stehen. */
  const comp=fs.readFileSync(new URL('../css/components.css',import.meta.url),'utf8');
  ok(hex('ink-mute'),'der stille Ton ist eigens benannt');
  ok(!/color:\s*var\(--ink-mute\)/.test(comp),'und wird nirgends als Schriftfarbe benutzt');
  ok(!/--ink-[234]:\s*#(45536a|6a7c98|a3b4cf)\b/.test(tok),'und keiner dieser dunklen Werte steht in der Rampe');
}

/* ---------- 12. Mehr Schulden als Vermögen ---------- */
sec('Negativer Net Worth');
{ const {w,errors}=await boot({storage:{...store}});
  const d=w.document;
  const sweep=id=>{
    const n=d.querySelector('.orbit-arc[data-id="'+id+'"],.orbit-short[data-id="'+id+'"]');
    if(!n) return null;
    if(n.tagName==='circle') return Math.PI*2;
    const m=/M([-\d.]+) ([-\d.]+)A[\d.]+ [\d.]+ 0 (\d) (\d) ([-\d.]+) ([-\d.]+)/.exec(n.getAttribute('d'));
    if(!m) return null;
    const a=(x,y)=>Math.atan2(Number(x)-135,-(Number(y)-135));
    let s0=a(m[1],m[2]), s1=a(m[5],m[6]);
    let dl=s1-s0; if(m[4]==='0') dl=-Math.abs(dl); if(dl<0&&m[4]==='1') dl+=Math.PI*2;
    return Math.abs(dl)+(m[3]==='1'&&Math.abs(dl)<Math.PI?Math.PI*2-2*Math.abs(dl):0);
  };
  const total=()=>['liquid','receivables','investment','tangible','retirement']
    .map(sweep).filter(x=>x!=null).reduce((a,b)=>a+b,0);

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
  console.log('    → Vermögensring '+(fullRing/(Math.PI*2)*100).toFixed(1)+' % → '+(shortRing/(Math.PI*2)*100).toFixed(1)+' %, Fehlstrecke '+(sweep('shortfall')/(Math.PI*2)*100).toFixed(1)+' %');
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
   eingegebenen variablen Betrag weiter zeigt. Genau das prüft diese Reihe. */
sec('Delete local data lässt nichts stehen');
{ const store3={};
  const {w,errors}=await boot({storage:store3});
  const d=w.document;
  importFixture(w);
  /* Der variable Anteil ist die einzige Zahl, die nicht aus der Mappe kommt,
     sondern von Hand eingetippt wird — sie muss genauso verschwinden. */
  w.NORDSTERN.app.ui.settings.open('workbook');
  const varIn=d.querySelector('#setVar');
  varIn.value='640';
  varIn.dispatchEvent(new w.Event('input',{bubbles:true}));
  await tick(30);
  ok(Object.keys(store3).length===2,'vorher liegen Modell und Einstellungen im Speicher: '+Object.keys(store3).join(' · '));
  ok(/640/.test(store3['nordstern.settings.v1']||''),'und der variable Betrag steht drin');
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

  /* Das Blatt bleibt erreichbar — also muss auch dort ein Strich stehen. */
  ok([...d.querySelectorAll('#settingsZone .num')].every(n=>n.textContent==='—'),
     'die Ausgaben im Blatt sind Striche: '+[...d.querySelectorAll('#settingsZone .num')].map(n=>n.textContent).join(' · '));
  ok(d.querySelector('#settingsZone .src-name').textContent==='—','der Dateiname der Mappe ist fort');
  const DEF=w.NORDSTERN.store.DEFAULT_VARIABLE;
  ok(DEF>0,'die Vorgabe für den variablen Anteil ist keine Null: '+DEF);
  ok(varIn.value===String(DEF),'der variable Betrag steht wieder auf der Vorgabe: '+varIn.value);
  /* Der Hinweis unter dem Berg steht hier nicht — es gibt keinen Berg mehr,
     über den er etwas sagen könnte. Dass er mit der Vorgabe wiederkommt,
     sobald wieder eine Mappe da ist, prüft Abschnitt 3. */
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();

  /* Und nach einem Neustart darf nichts zurückkommen. */
  const again=await boot({storage:store3});
  ok(!again.w.document.getElementById('gate').hidden,'nach dem Neustart bleibt der Vorhang zu');
  ok(again.w.NORDSTERN.app.state.model===null,'kein Modell mehr im Zustand');
  ok(again.w.NORDSTERN.app.state.settings.variableMonthly===again.w.NORDSTERN.store.DEFAULT_VARIABLE,
     'und der variable Betrag ist wieder die Vorgabe: '+again.w.NORDSTERN.app.state.settings.variableMonthly);
  ok(again.w.NORDSTERN.app.state.settings.variableSet===false,'als Schätzung, nicht als bestätigter Wert');
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
  const off=secArcs.map(a=>Number(a.style.getPropertyValue('--off')));
  ok(off.every((x,i)=>i===0?x<0.02:x>off[i-1]),'jeder setzt an, wo der vorige aufhört: '+off.map(x=>x.toFixed(2)).join(' · '));
  const frac=secArcs.map(a=>Number(a.style.getPropertyValue('--frac')));
  const span=off[off.length-1]+frac[frac.length-1];
  ok(Math.abs(span-1)<0.03,'zusammen eine volle Umdrehung: '+span.toFixed(3));
  ok(secArcs.every(a=>Number(a.style.strokeDasharray)>0),'jeder kennt seine Bogenlänge');
  const liab=d.querySelector('.orbit-liab');
  ok(liab.classList.contains('is-drawing'),'der Gegenring zeichnet sich mit');
  /* Aufgedeckt wird vom Pfadanfang her. Der Pfad muss also an der Zwölf
     beginnen und gegen den Uhrzeigersinn laufen: erster Punkt oben in der
     Mitte, Ende links davon. Beginnt er am anderen Ende, baut sich der Ring
     verkehrt herum auf. */
  const lseg=/^M([\d.]+) ([\d.]+)A[\d.]+ [\d.]+ 0 \d (\d) ([\d.]+) ([\d.]+)/.exec(liab.getAttribute('d'));
  ok(!!lseg&&Math.abs(Number(lseg[1])-134)<0.6&&Number(lseg[2])<60,
     'er beginnt oben in der Mitte: '+liab.getAttribute('d').slice(0,24));
  ok(lseg[3]==='0','und läuft gegen den Uhrzeigersinn');
  ok(Number(lseg[4])<134,'sein Ende liegt links der Mitte: '+lseg[4]);
  ok(Number(liab.style.getPropertyValue('--off'))===0,'und startet mit dem äusseren zugleich');
  ok(Math.abs(Number(liab.style.getPropertyValue('--frac'))-0.49)<0.01,
     'er braucht nur seinen Anteil der Umdrehung: '+liab.style.getPropertyValue('--frac'));

  /* Ein Zug am Regler rendert alles neu — aufbauen darf sich nichts. */
  const varIn=d.getElementById('setVar');
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

/* Ob die Bewegung tatsächlich unterbleibt, entscheidet allein das Stylesheet —
   jsdom rechnet keine Animationen. Also wird das Stylesheet befragt: jede Regel,
   die einen Aufbau startet, muss hinter beiden Riegeln stehen. */
{ const css=fs.readFileSync(new URL('../css/components.css',import.meta.url),'utf8');
  const blocks=[...css.matchAll(/@media \(prefers-reduced-motion: no-preference\)\s*\{([\s\S]*?)\n\}/g)].map(m=>m[1]).join('\n');
  ['nsDraw','nsBarFill','nsArriveFade'].forEach(name=>{
    const rules=[...css.matchAll(new RegExp('([^{}]*)\\{[^{}]*animation:[^;]*'+name+'[^;]*;','g'))].map(m=>m[1]);
    ok(rules.length>0,'es gibt eine Regel für '+name);
    ok(rules.every(r=>/\[data-motion=/.test(r)),name+' hängt am Bewegungsschalter');
    ok(rules.every(r=>blocks.includes(r.trim().split('\n').pop().trim())),
       name+' steht hinter prefers-reduced-motion');
  });
}

/* ---------- 15b. Die Mappe heisst Mappe ---------- */
/* „Excel" ist eine Marke von Microsoft und nicht das Wort für Tabellendatei —
   und in dieser Anwendung wäre es zusätzlich falsch: gelesen werden auch .ods,
   .numbers und .xlsb. Der Name steht deshalb nur noch dort, wo er wirklich das
   Programm meint, aus dem eine Datei stammen kann. */
sec('Die Mappe heisst Mappe');
{ const {w,errors}=await boot();
  const d=w.document;
  const btn=d.getElementById('btnImport');
  ok(btn.getAttribute('title')==='Read workbook'&&btn.getAttribute('aria-label')==='Read workbook',
     'der Knopf oben rechts liest eine Mappe: '+btn.getAttribute('title'));
  ok(d.getElementById('gatePick').textContent==='Choose a workbook',
     'der Leerzustand auch: '+d.getElementById('gatePick').textContent);
  const reread=[...d.querySelectorAll('#settingsZone button')].find(b=>/Re-read/.test(b.textContent));
  ok(reread&&reread.textContent==='Re-read workbook','und das Blatt: '+(reread&&reread.textContent));
  ok([...d.querySelectorAll('#settingsZone dt')].some(n=>n.textContent==='Fixed costs from the workbook'),
     'die Ausgaben kommen aus der Mappe, nicht aus einem Produkt');
  /* Wo der Name doch steht, steht er als Herkunftsangabe neben den anderen. */
  const copy=d.getElementById('gateCopy').textContent;
  ok(/Excel/.test(copy)&&/Numbers/.test(copy)&&/LibreOffice/.test(copy)&&/Google Sheets/.test(copy),
     'im Leerzustand steht er nur in der Aufzählung: '+copy.trim().split('\n')[1]);
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 15c. Das Blatt „privacy" ---------- */
/* Die Zusage steht sonst im README, das niemand offen hat, während er seine
   Kontostände in die Seite zieht. Sie muss dort stehen, wo die Frage entsteht
   — und sie muss stimmen: was hier behauptet wird, prüft tests/build.mjs am
   ausgelieferten Bau nach. */
sec('Das Blatt „privacy"');
{ const {w,errors}=await boot();
  const d=w.document;
  const pane=d.querySelector('.sheet-sec[data-sec="privacy"]');
  ok(!!pane,'es gibt den Abschnitt');
  const terms=[...pane.querySelectorAll('.sheet-facts.is-wide dt')].map(n=>n.textContent);
  ok(terms.join(' · ')==='Read · Written · Sent · Stored · Account',
     'fünf Zeilen, die die Frage abdecken: '+terms.join(' · '));
  const txt=pane.textContent;
  ok(/no fetch/i.test(txt)&&/XMLHttpRequest/.test(txt)&&/WebSocket/.test(txt),
     'die Zusage nennt, was es nicht gibt');
  ok(/localStorage/.test(txt)&&/Delete local data/.test(txt),
     'und sagt, was gespeichert wird und wie man es loswird');
  ok(/Data Input/.test(txt)&&/Expenses/.test(txt),'sowie was gelesen wird');
  ok(/Content-Security-Policy/.test(txt),'und wodurch der Browser es durchsetzt');
  /* Ein Blatt, das über fehlende Verbindungen spricht, darf selbst keine
     aufmachen: die Links im About-Blatt sind die einzigen im ganzen Blatt. */
  ok(pane.querySelectorAll('a').length===0,'es selbst verweist nirgendwohin');
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* ---------- 16. Der Kopf des About-Blatts ---------- */
sec('About: Stern, Wortmarke, Fassung');
{ const {w,errors}=await boot({storage:{...store}});
  const d=w.document;
  const head=d.querySelector('.about-head');
  ok(!!head,'das Blatt hat einen Kopf');
  const st=head.querySelector('.star');
  ok(!!st&&st.querySelector('.star-corona')&&st.querySelector('.star-spikes')&&st.querySelector('.star-core'),
     'und trägt denselben gezeichneten Stern wie Kopfbereich und Leerzustand');
  ok(head.querySelector('.about-mark').textContent==='nordstern','darunter die Wortmarke');

  /* Die Fassung steht an einer Stelle im Quelltext und an einer in
     package.json — laufen sie auseinander, sagt eine von beiden die Unwahrheit,
     und man erfährt es erst, wenn jemand einen Fehler mit falscher Nummer meldet. */
  const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  ok(w.NORDSTERN.VERSION===pkg.version,'NORDSTERN.VERSION und package.json stimmen überein: '+w.NORDSTERN.VERSION+' / '+pkg.version);
  ok(head.querySelector('.about-ver').textContent==='Version '+pkg.version+' \u00b7 Apache-2.0',
     'und die Zeile darunter sagt es: '+head.querySelector('.about-ver').textContent);
  ok(head.compareDocumentPosition(d.querySelector('[data-sec="about"] .about-title'))&w.Node.DOCUMENT_POSITION_FOLLOWING,
     'der Kopf steht über dem ersten Kapitel');

  /* Drei Sterne stehen gleichzeitig im Dokument. Teilten sie sich die IDs
     ihrer Verläufe, zeigten alle drei auf denselben — und zwei davon fielen
     in sich zusammen, sobald der erste verschwände. */
  const ids=[...d.querySelectorAll('radialGradient')].map(n=>n.id);
  ok(ids.length>=9&&new Set(ids).size===ids.length,'jeder Stern hat eigene Verlaufs-IDs: '+ids.length+' Stück, '+new Set(ids).size+' verschieden');
  ok(errors.length===0,'keine Fehler: '+errors.join(' | '));
  w.close();
}

/* Die Leinwand kann keine Marke auflösen und trägt deshalb einen Rückfall im
   Quelltext. Läuft er der Marke davon, schreibt der Berg auf jedem Rechner
   ohne Avenir in einer anderen Schrift als die Oberfläche daneben. */
{ const tok=fs.readFileSync(new URL('../css/tokens.css',import.meta.url),'utf8');
  const mnt=fs.readFileSync(new URL('../js/ui/mountain.js',import.meta.url),'utf8');
  const stack=/--font-display:\s*([^;]+);/.exec(tok)[1].trim();
  const fall=/FONT = v \|\| '([^']+)'/.exec(mnt)[1].trim();
  const norm=x=>x.replace(/["']/g,'').replace(/\s+/g,' ');
  ok(norm(stack)===norm(fall),'der Rückfall des Bergs ist der Stapel aus tokens.css:\n     '+norm(fall)+'\n     '+norm(stack));
  ok(/URW Gothic/.test(stack),'und er fängt Linux ab');
}

/* Das Zahlenfeld trägt keine System-Pfeilchen: sie sind hell und gerundet und
   passen in diese Oberfläche nicht. Verloren geht nichts — getippt wird
   ohnehin, ↑/↓ wirken weiter, das Band darunter stellt grob ein. jsdom
   rechnet keine Stile aus dem Stylesheet, also wird das Stylesheet gelesen. */
{ const css=fs.readFileSync(new URL('../css/components.css',import.meta.url),'utf8');
  ok(/\.field-num\s*\{[^}]*appearance:\s*textfield/.test(css),'.field-num ist ein Textfeld, kein Zählwerk');
  ok(/inner-spin-button[^{]*\{[^}]*appearance:\s*none/.test(css),'und die Pfeilchen sind fort');
}

/* Das Lesefenster des Charts liegt über Schaltern und Kennzahlen. Wenn
   es dabei Zeigerereignisse abfinge, wäre der Schalter darunter nicht mehr zu
   treffen, solange es steht — jsdom rechnet keine Stile aus dem Stylesheet,
   also wird das Stylesheet gelesen. */
{ const css=fs.readFileSync(new URL('../css/components.css',import.meta.url),'utf8');
  const body=/\.chart-tip\s*\{([^}]*)\}/.exec(css)[1];
  ok(/pointer-events:\s*none/.test(body),'.chart-tip fängt keine Zeigerereignisse ab');
  ok(/position:\s*absolute/.test(body)&&/z-index:\s*[1-9]/.test(body),'und liegt über dem, was es überdeckt');
}

/* Zentrierte, gesperrte Schrift sitzt nicht mittig: hinter dem letzten
   Buchstaben steht noch einmal die volle Sperrung. Wer den Ausgleich wieder
   entfernt, verschiebt die Wortmarke unter dem Stern um die halbe Sperrung —
   sichtbar, aber leicht zu übersehen, wenn man nicht danach sucht. */
{ const css=fs.readFileSync(new URL('../css/components.css',import.meta.url),'utf8');
  [['about-mark',/\.about-mark\s*\{([^}]*)\}/],['about-ver',/\.about-ver\s*\{([^}]*)\}/]].forEach(([name,rx])=>{
    const body=rx.exec(css)[1];
    const ls=/letter-spacing:\s*([^;]+);/.exec(body);
    const pad=/padding-inline-start:\s*([^;]+);/.exec(body);
    ok(!!ls&&!!pad&&ls[1].trim()===pad[1].trim(),
       '.'+name+' gleicht seine Sperrung aus: '+(ls&&ls[1].trim())+' / '+(pad&&pad[1].trim()));
  });
}

console.log('\n'+pass+' bestanden, '+fail+' fehlgeschlagen');
process.exit(fail?1:0);
