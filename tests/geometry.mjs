/* Prüft die Berg-Geometrie ohne Browser: Höhenfeld, Höhenlinien, Route,
   Bildaufteilung über alle Fenstergrößen und Blickwinkel, Marker-Abstände. */
import fs from 'fs'; import path from 'path'; import vm from 'vm';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const g = globalThis; g.window = g;
for (const f of ['js/util.js', 'js/ui/icons.js', 'js/ui/mountain.js', 'js/calc.js'])
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

const G = NORDSTERN.mountain._geom, C = G.C;
let t = Date.now(); const field = G.buildField(); const tField = Date.now() - t;
t = Date.now(); const levels = G.buildContours(field); const tCont = Date.now() - t;
const route = G.buildRoute(field);
const MS = NORDSTERN.calc.MILESTONES.filter(m => m.t != null);
const stations = MS.map(m => G.routeAt(route, m.t));
const poles = G.polesFor(stations.map(q => q.z));
const SIL = G.buildSilhouette(levels, stations, poles);

/* ---------------------------------------------------------------- Gelände */
const points = levels.reduce((a, l) => a + l.loops.reduce((x, y) => x + y.n, 0), 0);
console.log(`Höhenfeld ${tField} ms · Höhenlinien ${tCont} ms · ${levels.length} Ebenen · ${points} Punkte`);
ok(tField + tCont < 400, 'Aufbau unter 400 ms');
ok(levels.length >= 20, 'genug Höhenlinien');
ok(points < 12000, 'Punktzahl bleibt zeichenbar (' + points + ')');
ok(levels.every(l => l.loops.every(lp => lp.n > 8)), 'keine entarteten Ringe');

const radii = levels.map(l => {
  const lp = l.loops[0]; let r = 0;
  for (let i = 0; i < lp.n; i++) r += Math.hypot(lp.xs[i], lp.ys[i]);
  return r / lp.n;
});
ok(radii.every((r, i) => i === 0 || r <= radii[i - 1] + 0.02), 'Ringe schachteln sich nach innen');

/* ----------------------------------------------------------------- Route */
let prev = -1, mono = true;
stations.forEach(q => { if (q.z < prev - 1e-4) mono = false; prev = q.z; });
ok(mono, 'Route steigt zwischen allen Stationen an');
ok(stations[0].z < stations[6].z * 0.3, 'erste Station deutlich unter der letzten');
ok(Math.hypot(stations[6].x, stations[6].y) < 0.08, 'Apex steht auf dem Gipfel, nicht daneben');
ok(stations[6].z > C.Z_MAX * 0.985, 'Apex auf voller Gipfelhöhe (' + (stations[6].z / C.Z_MAX * 100).toFixed(0) + ' %)');

/* Die Stationsparameter in calc.js und die Anker der Route müssen dasselbe
   meinen — sonst stünden die Marker neben ihren Ankerpunkten. */
ok(MS.length === route.stationT.length &&
   MS.every((m, i) => Math.abs(m.t - route.stationT[i]) < 1e-6),
   'calc.js und Route meinen dieselben Stationen (' + [...route.stationT].map(t => t.toFixed(3)).join(' ') + ')');

/* Anlauf: der Weg vor der ersten Station darf die Route nicht dominieren. */
const arc = (i0, i1) => { let L = 0; for (let i = i0; i < i1; i++)
  L += Math.hypot(route.xs[i+1] - route.xs[i], route.ys[i+1] - route.ys[i], route.zs[i+1] - route.zs[i]); return L; };
const lead = arc(0, Math.round(MS[0].t * (route.n - 1))) / arc(0, route.n - 1);
ok(lead < 0.21, 'Anlauf vor der ersten Station bleibt kurz (' + (lead * 100).toFixed(0) + ' % der Route)');

/* Der Weg selbst darf zwischen den Stationen nicht absacken. Erlaubt ist genau
   der Grat hinter dem Nebengipfel — dort verliert der Kamm etwas Höhe. */
let worst = 0, worstT = 0, run = 0;
for (let i = 1; i < route.n; i++) {
  const dz = route.zs[i] - route.zs[i - 1];
  run = dz < 0 ? run - dz : 0;
  if (run > worst) { worst = run; worstT = i / (route.n - 1); }
}
ok(worst < 0.04, 'kein Absacken auf dem Weg (größter Abstieg ' + worst.toFixed(3) +
   ' bei t=' + worstT.toFixed(2) + ')');

/* Aurora steht auf dem Nebengipfel, Polaris auf der abgewandten Seite. */
const H = (x, y) => G.sampleH(field, x, y) * C.Z_MAX;
const aur = stations[3];
let higherAround = 0;
for (let k = 0; k < 16; k++) {
  const a = k / 16 * Math.PI * 2;
  if (H(aur.x + Math.sin(a) * 0.06, aur.y + Math.cos(a) * 0.06) > aur.z) higherAround++;
}
ok(higherAround === 0, 'Aurora sitzt auf der Kuppe, nicht an der Flanke (' + higherAround + ' Nachbarn höher)');
const ang = q => Math.atan2(q.x, q.y);
let dPol = Math.abs(ang(stations[5]) - ang(stations[4])) * 180 / Math.PI;
if (dPol > 180) dPol = 360 - dPol;
ok(dPol > 140, 'Polaris liegt der Passage gegenüber (' + dPol.toFixed(0) + '° Azimut)');

/* Die Himmelsrichtungen drehen sich mit dem Teller, dürfen dabei aber nie
   gespiegelt erscheinen: die Determinante ihrer Bildmatrix muss positiv
   bleiben. Sie ist der Spiegel-Test — negativ hieße seitenverkehrte Schrift. */
let mirrored = 0, letters = 0;
for (let k = 0; k < 72; k++) for (const pitch of [C.PITCH_MIN, C.PITCH_DEF, C.PITCH_MAX]) {
  const yaw = k / 72 * Math.PI * 2;
  const ca = Math.cos(yaw), sa = Math.sin(yaw), se = Math.sin(pitch);
  for (const a of G.CARDINAL_A) {
    const tx = Math.cos(a), ty = -Math.sin(a), rx = Math.sin(a), ry = Math.cos(a);
    const tsx = -(tx * ca - ty * sa), tsy = -(tx * sa + ty * ca) * se;
    const osx = -(rx * ca - ry * sa), osy = -(rx * sa + ry * ca) * se;
    letters++; if (tsx * osy - tsy * osx <= 0) mirrored++;
  }
}
ok(mirrored === 0, 'keine Himmelsrichtung steht spiegelverkehrt (' + mirrored + ' von ' + letters + ')');

/* Der Reservering ist eine Fortschrittsanzeige und muss sich rechtsherum
   füllen — in jeder Drehung und Neigung. Gemessen wird die Bildschirmrichtung
   zwischen aufeinanderfolgenden Schritten der Laufbahn; bei y nach unten heißt
   im Uhrzeigersinn: das Kreuzprodukt bleibt positiv (die gespiegelte Achse
   dreht den Sinn gegenüber der Schulmathematik um). */
let ccw = 0, steps = 0;
for (let k = 0; k < 72; k++) for (const pitch of [C.PITCH_MIN, C.PITCH_DEF, C.PITCH_MAX]) {
  const cam = G.makeCam(k / 72 * Math.PI * 2, pitch, 0, 0, 1);
  const at = i => { const t = -i / 144 * Math.PI * 2;
    const q = G.projectPt(cam, Math.sin(t) * C.RING_R, Math.cos(t) * C.RING_R, 0.004);
    return [q.x, q.y]; };
  for (let i = 0; i < 144; i++) {
    const a = at(i), b = at(i + 1), c = at(i + 2 > 144 ? 1 : i + 2);
    const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
    steps++; if (ux * vy - uy * vx < -1e-9) ccw++;
  }
}
ok(ccw === 0, 'Reservering füllt sich im Uhrzeigersinn (' + ccw + ' von ' + steps + ' Schritten verkehrt)');

/* Und er startet im Norden — dort steht die Zielmarke bei 100 %. */
{
  const cam = G.makeCam(C.YAW_DEF != null ? C.YAW_DEF : -0.35, C.PITCH_DEF, 0, 0, 1);
  const start = G.projectPt(cam, Math.sin(0) * C.RING_R, Math.cos(0) * C.RING_R, 0.004);
  const north = G.projectPt(cam, 0, C.RING_R, 0.004);
  ok(Math.hypot(start.x - north.x, start.y - north.y) < 1e-9, 'Ringanfang und Zielmarke liegen im Norden');
}

/* Apex muss in jeder Ansicht der oberste Marker sein. */
let apexTop = 0, views = 0;
for (let k = 0; k < 72; k++) for (const pitch of [C.PITCH_MIN, C.PITCH_DEF, C.PITCH_MAX]) {
  const f = G.frame(785, 806, pitch, SIL);
  const cam = G.makeCam(k / 72 * Math.PI * 2, pitch, f.cx, f.cy, f.R);
  let top = 1e9, topI = -1;
  stations.forEach((q, i) => {
    const y = G.projectPt(cam, q.x, q.y, q.z + poles[i]).y;
    if (y < top) { top = y; topI = i; }
  });
  views++; if (topI === 6) apexTop++;
}
ok(apexTop === views, 'Apex ist in allen ' + views + ' Ansichten der oberste Marker (' + apexTop + ')');

/* ------------------------------------------------------------ Proportion */
const f0 = G.frame(785, 806, C.PITCH_DEF, SIL);
const cam0 = G.makeCam(-0.35, C.PITCH_DEF, f0.cx, f0.cy, f0.R);
const peakY = G.projectPt(cam0, 0.04, -0.03, C.Z_MAX).y;
const baseY = G.projectPt(cam0, 0.04, -0.03, 0).y;
const plateW = G.projectPt(cam0, C.PLATE_R, 0, 0).x - G.projectPt(cam0, -C.PLATE_R, 0, 0).x;
const ratio = (baseY - peakY) / plateW;
console.log('Berghöhe zu Tellerbreite: ' + ratio.toFixed(2));
ok(ratio > 0.42 && ratio < 0.58, 'Berg beherrscht den Teller, statt darin zu versinken (' + ratio.toFixed(2) + ')');
ok(G.LETTER_R + G.LETTER_H * 0.5 <= C.PLATE_R * 1.02,
   'Himmelsrichtungen liegen in der Teilung, nicht außerhalb');
console.log('Maßstab bei 785×806: R = ' + f0.R.toFixed(0) + ' px pro Modelleinheit');
ok(f0.R > 320, 'Berg nutzt die Breite aus (R = ' + f0.R.toFixed(0) + ')');

/* ------------------------------------------- Bildaufteilung und Abstände */
/* Canvasgrößen, wie sie das 50/50-Layout bei gängigen Fenstern erzeugt. */
const SIZES = [[785, 806], [652, 501], [591, 405], [892, 628], [460, 360], [1000, 700]];
const PIN = 13, SHIFT = 56;   // muss SHIFT_MAX in mountain.js entsprechen

function bbox(cam) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  const add = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  for (let i = 0; i <= 144; i++) {
    const a = i / 144 * Math.PI * 2, r = C.PLATE_R;
    const p = G.projectPt(cam, Math.sin(a) * r, Math.cos(a) * r, 0);
    add(p.x, p.y);                                          // Teilung des Tellers
  }
  /* Die mitgedrehten Himmelsrichtungen: alle vier Eckpunkte des Schriftfelds */
  const halfW = G.LETTER_H * 0.42, halfH = G.LETTER_H * 0.5;
  for (const a of G.CARDINAL_A) {
    const tx = Math.cos(a), ty = -Math.sin(a), ox = Math.sin(a), oy = Math.cos(a);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const mx = ox * G.LETTER_R + tx * halfW * sx + ox * halfH * sy;
      const my = oy * G.LETTER_R + ty * halfW * sx + oy * halfH * sy;
      const p = G.projectPt(cam, mx, my, 0);
      add(p.x, p.y);
    }
  }
  for (const lv of levels) for (const lp of lv.loops) for (let i = 0; i < lp.n; i += 4) {
    const p = G.projectPt(cam, lp.xs[i], lp.ys[i], lv.level * C.Z_MAX); add(p.x, p.y);
  }
  stations.forEach((q, i) => {
    const p = G.projectPt(cam, q.x, q.y, q.z + poles[i]);
    add(p.x - PIN - 2, p.y); add(p.x + PIN + 2, p.y);
    add(p.x, p.y - PIN - SHIFT - 3); add(p.x, p.y + PIN + 2);
  });
  return { x0, x1, y0, y1 };
}

let worstMargin = 1e9, worstAt = '';
for (const [w, h] of SIZES) {
  for (let k = 0; k < 24; k++) {
    const yaw = k / 24 * Math.PI * 2;
    for (const pitch of [C.PITCH_MIN, C.PITCH_DEF, (C.PITCH_MIN + C.PITCH_MAX) / 2, C.PITCH_MAX]) {
      const f = G.frame(w, h, pitch, SIL);
      const b = bbox(G.makeCam(yaw, pitch, f.cx, f.cy, f.R));
      const m = Math.min(b.x0, b.y0, w - b.x1, h - b.y1);
      if (m < worstMargin) { worstMargin = m; worstAt = w + '×' + h + ' yaw ' + yaw.toFixed(2) + ' pitch ' + pitch.toFixed(2); }
    }
  }
}
console.log('kleinster Rand über ' + (SIZES.length * 24 * 4) + ' Ansichten: ' + worstMargin.toFixed(0) + ' px (' + worstAt + ')');
ok(worstMargin >= 0, 'nichts wird jemals angeschnitten');

let minGap = 1e9;
for (let k = 0; k < 72; k++) for (const pitch of [C.PITCH_MIN, 0.42, C.PITCH_DEF, 0.62, C.PITCH_MAX]) {
  const yaw = k / 72 * Math.PI * 2;
  const f = G.frame(785, 806, pitch, SIL);
  const cam = G.makeCam(yaw, pitch, f.cx, f.cy, f.R);
  const L = stations.map((q, i) => {
    const p = G.projectPt(cam, q.x, q.y, q.z + poles[i]);
    return { hx: p.x, hy: p.y - PIN, r: PIN };
  });
  const byY = L.slice().sort((a, b) => b.hy - a.hy);
  for (let i = 1; i < byY.length; i++) for (let j = 0; j < i; j++) {
    const a = byY[i], b = byY[j];
    if (Math.abs(a.hx - b.hx) > a.r + b.r + 3) continue;
    const need = b.hy - (a.r + b.r + 4);
    if (a.hy > need) a.hy = Math.min(a.hy, need);
  }
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    if (Math.abs(L[i].hx - L[j].hx) > L[i].r + L[j].r + 3) continue;
    minGap = Math.min(minGap, Math.abs(L[i].hy - L[j].hy));
  }
}
console.log('kleinster Marker-Abstand über 360 Ansichten: ' + minGap.toFixed(0) + ' px');
ok(minGap >= 26, 'Marker überlappen in keiner Ansicht');

console.log('\n' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
