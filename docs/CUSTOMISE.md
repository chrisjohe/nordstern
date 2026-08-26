# Making the milestones yours

The eight stations that ship with nordstern are one opinion about what
financial independence looks like. Yours will differ. This page says exactly
where to reach in, in order of how much you have to know.

Everything below is plain JavaScript in files you can open in any editor.
There is no build step: change a file, reload the page.

---

## The one table that matters

**`js/calc.js`**, near the top, the array `MILESTONES`. One object per
station, in order, from nearest to furthest:

```js
{ id: 'coast', name: 'Stable Course', term: 'Coast FI', months: 60,
  basis: 'investment', t: 13 / 34,
  meaning: 'Five years of expenses. A break of years, not months.',
  basisLabel: '5 × annual expenses, covered by investments' },
```

| Field | What it does | Safe to change? |
|---|---|---|
| `id` | internal key. Ties this station to its icon, its card gradient and its CSS | only if you change it everywhere (see [Renaming an id](#renaming-an-id)) |
| `name` | what the card and the mountain marker say | **yes, freely** |
| `term` | the established term of art. Shown nowhere in the interface; it exists so the code says what it means | **yes, freely** |
| `months` | the multiple of **total monthly expenses** that defines the target | **yes** — this is the number most people want |
| `basis` | `'liquid'` or `'investment'` — which pot is counted against the target | **yes**, see below |
| `t` | position along the mountain route, 0…1. Omit it entirely for a station that is not on the route | **only together with the route**, see [Adding or removing a station](#adding-or-removing-a-station) |
| `meaning` | the sentence on the back of the card | **yes, freely** |
| `basisLabel` | the long form, used as a tooltip and read out by screen readers | **yes** — keep it truthful, it is the accessible version of the card |

`Contingency` is the only station without a `t`: it is not on the mountain
path, it is the ring in the compass base. Give it a `t` and it will also
appear as a marker on the route — probably not what you want, but nothing
breaks.

## The changes most people want

### Different amounts

Edit `months`. It is a multiple of **total monthly expenses**, so `months: 300`
means "300 × what I spend in a month", which is the 4 % rule (25 years).

```
 3   three months        60   five years        300   25 years (4 %)
 6   six months         120   ten years         396   33 years (3 %)
12   one year           240   twenty years      480   40 years (2.5 %)
```

If you want a **3.5 % withdrawal rate** instead of 4 %: `1 / 0.035 ≈ 28.6`
years, so `months: 343`. Update `basisLabel` in the same breath — an
out-of-date label is worse than none, because it is read aloud to people who
cannot see the number.

### Different names

`name`, `meaning` and `basisLabel` are free text. Nothing parses them.

### Counting against a different pot

`basis: 'liquid'` counts against `Total liquid` in your workbook;
`basis: 'investment'` counts against `Total investments`. Those are the only
two values the code understands.

If you want a station measured against something else — say, invested plus
retirement — that is a change in `js/calc.js` where the two pots are picked
out of the model, not in this table. Look for where `liquid` and `investment`
are read off the current month; the model also carries `receivables`,
`tangible`, `retirement`, `totalAssets` and `netWorth`, all of them already
parsed and summed per month.

### The monthly expenses

Nothing about spending is in the workbook, so nordstern asks for one figure
directly: what your household costs in a month, fixed costs and living
included. This one figure moves all eight targets at once.

**Once:** *Settings → expenses*. It is stored in your browser and survives
reloads — but not *Delete local data*, and not a different browser.

**Permanently:** `js/store.js`, the constant `DEFAULT_EXPENSES`:

```js
var DEFAULT_EXPENSES = 2500;       // a placeholder, not anyone's real figure
```

That is what a fresh browser starts with, and what *Delete local data* falls
back to. It is deliberately not zero: at zero every target would sit at zero
too, which is a worse error than a rough guess. It is equally deliberately
not anyone's real spending — change it to whatever your household actually
costs, and the dashboard stops calling it an estimate as soon as anyone
touches the field.

If you fork this for someone else, this constant and the `MILESTONES` table
are the two places to visit before handing it over.

## Icons and card colours

**`js/ui/icons.js`**, the table `GLYPHS`, keyed by the station `id`:

```js
coast: {
  pin:  { box: '0 -960 960 960', d: '…' },   // 16 px cut, marker on the mountain
  card: { box: '0 -960 960 960', d: '…' }    // 48 px cut, watermark on the card
}
```

Two entries per station because Material Symbols draws a different optical
size for small and large — the same shape, simplified for the small one. If
`card` is missing, the card falls back to `pin`.

To swap one: download the SVG you want (any source, any icon set), open it in
a text editor, and copy the `viewBox` into `box` and the `d` attribute of the
path into `d`. The glyph is filled with `currentColor`, so ignore any colour
in the file. Multi-path icons need to be merged into one `d` first — most
editors will do that under "combine paths".

**`js/ui/cards.js`**, the table `WASH`, also keyed by `id`: three hex colours
per station, from which the card's gradient is built (deep base, mid, and a
highlight in the top-left corner). Any three colours work. Keep them dark —
white text sits on top.

## Adding a currency

**`js/util.js`**, the table `CURRENCIES`, keyed by currency code:

```js
var CURRENCIES = {
  EUR: { locale: 'de-DE' },
  USD: { locale: 'en-US' },
  GBP: { locale: 'en-GB' },
  CHF: { locale: 'de-CH' }
};
```

Add a row and the settings dropdown picks it up — it reads this table, not a
hard-coded list. The `locale` is what decides grouping, decimal separator and
symbol placement; pick whichever `Intl`-supported locale writes the currency
the way you expect (an unknown locale silently falls back to the browser's
default, an invalid currency code makes `Intl.NumberFormat` throw — so try
the pair in a console first). Nothing else in the app needs to know a
currency exists: every formatter goes through `setCurrency()` in the same
file.

If you also want **auto-detection on import** — the importer switching the
setting when a workbook's cell formats say which currency it is — add the
symbol or code to the mapping the importer uses to recognise it. That is
optional: without it, the new currency still works, it just has to be picked
by hand in *Settings → data source*.

## Adding or removing a station

This is the one change with real coupling. Three places must agree, and a
test will tell you if they do not.

**1. `js/calc.js` — `MILESTONES`.** Add or remove the object.

**2. `js/ui/mountain.js` — `ROUTE_ANCHORS`.** The route is not a formula, it
is a list of anchors with an angle, a height and a number of intermediate
points:

```js
var ROUTE_ANCHORS = [
  { a: -135, z: 0.012 },                                 // start, no station
  { a:  -95, z: 0.105, seg: 3, st: true },               // First Light
  { a:  -30, z: 0.245, seg: 5, st: true },               // Velocity
  …
  { a:  495, r: 0.047, seg: 8, st: true }                // Apex — the summit
];
```

`st: true` marks an anchor as a station. `seg` is how many intermediate points
lead up to it. A station's position along the route is therefore

```
t = (sum of seg up to and including this anchor) / (sum of all seg)
```

With the shipped anchors that sum is 3+5+5+5+3+5+8 = **34**, which is why the
`t` values in `calc.js` are written as `3/34`, `8/34`, `13/34`, `18/34`,
`21/34`, `26/34`, `34/34`. Written as fractions on purpose: when you add an
anchor, the denominator changes and every fraction has to be rewritten. A
decimal would hide that.

**3. `js/calc.js` — the `t` fractions.** Recompute all of them.

Then run `npm test`. `tests/geometry.mjs` asserts that the stations in
`calc.js` and the control points of the route are the same set, to within
1e-6, and it will name the mismatch. It also re-checks that the route never
descends between two stations and that no marker is clipped at any camera
angle — both of which a badly placed anchor can break.

### If you change the *number* of cards

The card rail is a fixed grid. In **`css/layout.css`**:

```css
.rail { grid-template-columns: repeat(4, minmax(0, 1fr));
        grid-template-rows: repeat(2, var(--card-h)); }
```

and a stacked fallback further down for narrow windows:

```css
.rail { grid-template-columns: repeat(2, minmax(0, 1fr));
        grid-template-rows: repeat(4, var(--card-h)); }
```

Short but wide windows are a separate case: the two columns stay side by
side and the page scrolls instead, so the rail keeps its four-wide grid there.

Six cards want `repeat(3, …)` × 2. Ten want `repeat(5, …)` × 2 and will be
narrow. The design target is a desktop window with **no scrolling**, and the
rail is the part that gives first.

Four assertions count eight cards and will fail loudly:
`tests/behaviour.mjs` lines with `.rail .card`, `.card-wash` and
`.card-watermark`, and `tests/build.mjs` with `.card`. Change the number
there too — they are looking for "all of them", not for eight specifically.

### Renaming an id

An `id` appears in five places: `MILESTONES` in `js/calc.js`, `GLYPHS` in
`js/ui/icons.js`, `WASH` in `js/ui/cards.js`, and as `data-id` in the tests.
It is never written to storage, so renaming one costs nothing but a careful
find-and-replace. There is no reason to rename an id except tidiness — the
name shown to people is `name`, not `id`.

## What is *not* coupled

Worth knowing, so you do not go looking:

* **The workbook.** Milestones are computed from your monthly expenses and
  your balances. Nothing about them is read from the spreadsheet, and adding a
  station does not require a new row anywhere.
* **Stored data.** Milestones are recomputed on every render from the saved
  model. Change the table and reload — the figures follow immediately, no
  re-import, no cache to clear.
* **The order of the cards.** It comes from the order of the array. Sorting is
  not done anywhere; if you put them out of order, they will render out of
  order and the "current" station logic will misbehave, because it takes the
  first station not yet reached.
* **The reserve ring.** It is driven by whichever station has
  `basis: 'liquid'`. If you give a second station `basis: 'liquid'`, the ring
  follows the first one.
* **The history chart.** On *Invested*, it draws a threshold line for every
  station with `basis: 'investment'` whose target falls inside the currently
  visible range. Add a station and it shows up there too, with no wiring of
  its own.

## Checklist

```
0. what does living cost?     → js/store.js  DEFAULT_EXPENSES
1. edit js/calc.js            → MILESTONES
2. matching icon?             → js/ui/icons.js  GLYPHS
3. matching gradient?         → js/ui/cards.js  WASH
4. changed the count?         → js/ui/mountain.js ROUTE_ANCHORS + t fractions
                              → css/layout.css .rail
                              → the card counts in tests/
5. npm test                   → geometry will catch a route mismatch
6. reload index.html          → no build, no cache
```

## For AI assistants

If you are pointing an assistant at this repository, point it at
[AGENTS.md](../AGENTS.md) first. It carries the same map plus the constraints
that are easy to violate by accident — no build step, no dependencies, no
network calls, no real financial data in code or tests.
