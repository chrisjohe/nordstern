# nordstern

A dashboard for personal net worth, spending and FIRE progress. It reads one
spreadsheet, draws a mountain, and never talks to anyone.

No server. No build step. No account. No network code — not "we don't collect
data", but *there is no code in here that could send any*. Open `index.html`
by double-clicking it and it works, from `file://`, offline, forever.

![The dashboard, showing the example workbook: net worth, history, structure,
the route to the next milestone and the reserve ring.](docs/screenshot.png)

---

## Try it

**Hosted:** <https://chrisjohe.github.io/nordstern> — one self-contained HTML
file. Your spreadsheet never leaves the tab; the page has a
Content-Security-Policy that forbids the browser to make any outbound request
at all.

**Local:** clone the repository and double-click `index.html`. Or run
`npm run build` and take `export/nordstern.html` anywhere — a USB stick, an
air-gapped laptop, an email to yourself.

Either way, start with **`examples/nordstern-example.xlsx`** — drag it onto
the window. Seven years, all of it invented: a flat bought on day one and
fully financed, a securities loan drawn in a single month.
`tools/make-example.mjs` wrote it, and every figure is in that script in
plain text, monthly market returns included; the file itself was then
formatted by hand, so that opening it shows how it is put together. The
generator refuses to overwrite it without `--force`, and `tests/example.mjs`
keeps the two honest — it regenerates the workbook to a throwaway path and
compares both models figure by figure.

## What you get

Five things, on one screen, without scrolling:

* **Net worth** — the current figure, what changed this month, this year, and
  since you started keeping records.
* **History** — one line, read three ways: *Net* (what is left), *Total* (what
  is there), *Invested* (what is working), against a dashed year-ago trace. On
  *Invested*, the stations that fall within the visible range appear as pale
  threshold lines, so you see when each one was crossed.
* **Structure** — a radial instrument that opens: click a section to see the
  accounts inside it. Both rings share one scale, so if you owe more than you
  own the asset ring no longer closes and the gap is the shortfall.
* **Route** — a contoured mountain with your eight FIRE milestones placed
  along a climbing path, and a reserve ring in the compass base.
* **Eight cards** — one per milestone, flipping to show target, current value
  and progress.

## Privacy, in a form you can check

This is a finance app. "Trust me" is not good enough, so here is what you can
verify yourself in about two minutes:

| Claim | How to check it |
|---|---|
| Nothing is uploaded | Open the network tab. Import your file. Watch nothing happen. |
| Nothing *can* be uploaded | `grep -r "fetch\|XMLHttpRequest\|WebSocket" js/` — only the vendored SheetJS matches, and only in dead branches |
| The browser enforces it | `export/nordstern.html` carries `connect-src 'none'; form-action 'none'` |
| Your spreadsheet is not modified | There is no write path. `XLSX.write` is never called by the app |
| Only one sheet is read | The example workbook ships with a second sheet; neither its name nor its content appears in the app or in `localStorage` |
| No web fonts, no CDN, no analytics | `npm test` fails the build if any of those appear |

The parsed result is kept in your browser's `localStorage` and nowhere else,
together with your settings. *Settings → data source → Delete local data*
removes both and clears the screen. Over `file://` some
browsers refuse `localStorage` entirely; nordstern then simply runs without
memory and asks for the file again next time.

See [SECURITY.md](SECURITY.md) for the longer version.

## Your workbook

nordstern reads **one sheet** and ignores everything else in the file. It
looks for a sheet named `Data Input`, or one of a handful of aliases such as
`Data` or `Daten`; a workbook with only one sheet needs no matching name at
all — that sheet is used whatever it is called.

**`Data Input`** — one column per month, one row per account. Rows are found
by their **label in column A**, never by row number, so you can insert
accounts wherever you like.

| Column A | Column B, C, D … |
|---|---|
| **Month** | 31.01.2026 |
| Liquid | |
| *Checking account* | *2.400,00* |
| *Savings* | *5.100,00* |
| Total liquid | 7.500,00 |
| Claims | |
| Total claims | 0,00 |
| Investments | |
| *SPY* | *38.000,00* |
| *QQQ* | *22.000,00* |
| Total investments | 60.000,00 |
| Property | |
| Total property | 12.000,00 |
| Retirement | |
| Total retirement | 8.500,00 |
| Liabilities | |
| Total liabilities | 20.000,00 |
| **Total assets** | 88.000,00 |
| **Total net worth** | 68.000,00 |

Rows in *italics* are your own — name them anything. The others are the
anchors and must read exactly as shown. `Liabilities` is matched exactly, so a
helper row such as `Liabilities *(-1)` is left alone.

The date in the **Month** row names the month; the day is not read, so the
15th works as well as the last day. Snapshots do not need to be monthly —
quarterly or half-yearly works too, a yearly series gives one point per year,
and a comparison like "vs. last year" finds the nearest snapshot at that
distance instead of assuming one exists.

The same table is inside the app under *Settings → workbook*, so you can
compare it against your own file without leaving the page. The full contract
— tolerances, what happens when sums disagree, the FIRE mathematics — is in
[docs/DATA_CONTRACT.md](docs/DATA_CONTRACT.md).

### Which spreadsheet programs work

| Program | What to do |
|---|---|
| **Excel** | Save as `.xlsx` or `.xlsm`. Nothing special. |
| **LibreOffice / OpenOffice** | `.ods` works directly. So does `.xlsx`. |
| **Google Sheets** | It has no file format of its own. *File → Download → Microsoft Excel (.xlsx)*. |
| **Apple Numbers** | `.numbers` is read directly — but Numbers must save it as a single file, not a package (*Settings → General → uncheck "Save as package"*). |

`tests/formats.mjs` writes the example workbook to `.xlsx`, `.xlsm`, `.xlsb`
and `.ods` and reads each back through the real importer, checking that all
four produce identical figures. `.numbers` is not in that test because SheetJS
cannot *write* the format to test against — the reader is present and should
work, but it is the one path verified by hand rather than by machine.

## The eight milestones

The ladder is a multiple of your **total monthly expenses**, set once in
*Settings → expenses*. Seven stations count against invested assets; the
reserve counts against liquid assets — the only difference between them, and
the reason your reserve can sit half empty while your portfolio is full.

| # | Name | Term of art | Multiple | Counts against |
|---|---|---|---|---|
| 1 | Contingency | Emergency fund | 3 months | liquid |
| 2 | First Light | Snowball | 6 months | invested |
| 3 | Velocity | F-You Money | 1 year | invested |
| 4 | Stable Course | Coast FI | 5 years | invested |
| 5 | Aurora | Barista FI | 10 years | invested |
| 6 | Passage | Semi FI | 20 years | invested |
| 7 | Polaris | Lean FI | 25 years (4 % rule) | invested |
| 8 | Apex | Fat FI | 33 years (3 % rule) | invested |

Every card back names its target and where the money would come from:

```
Target        390.600 €          Target          9.765 €
Now invested  345.198 €          Now liquid     32.899 €
```

**Making them yours** — renaming a station, moving a threshold, using a
different withdrawal rate, or changing how many there are: all of that lives
in one table in one file. **[docs/CUSTOMISE.md](docs/CUSTOMISE.md)** walks
through it, including the parts that are coupled to the mountain route and
what breaks if you ignore them. If you are handing this to an AI assistant,
point it at [AGENTS.md](AGENTS.md) first.

## How it is built

```
index.html              one page, classic script tags, works over file://
css/tokens.css          colour, type, grid, motion timing
css/layout.css          the panorama frame — desktop, no scrolling
css/components.css      the parts
js/util.js              de-DE formatting, DOM helpers, event bus
js/importer.js          ALL knowledge about workbook layout lives here
js/calc.js              derived figures and the FIRE ladder
js/store.js             localStorage, defensive about opaque origins
js/ui/icons.js          milestone glyphs (Material Symbols, swappable)
js/ui/header.js         wordmark, the star, data age
js/ui/position.js       net worth, changes, secondary figures
js/ui/chart.js          history chart with crosshair and year-ago trace
js/ui/orbit.js          the radial structure instrument
js/ui/mountain.js       height field, contours, route, reserve ring, camera
js/ui/cards.js          the eight milestone cards
js/ui/settings.js       the settings sheet
js/app.js               wiring and states
js/vendor/              SheetJS 0.20.3, vendored — the only dependency
favicon.svg/.png        tab and home-screen icon; the build inlines the SVG, the PNG stays a file
examples/               the example workbook (generated, invented figures)
tools/build.mjs         folds everything into one file
tools/make-example.mjs  writes examples/nordstern-example.xlsx
docs/                   the data contract and the customising guide
tests/                  headless checks
```

Everything hangs off `window.NORDSTERN`. No modules, no bundler, no
transpiler. The comments in the source are in German and explain *why*; the
interface and the documentation are English. (See
[CONTRIBUTING.md](CONTRIBUTING.md) — English comments in new code are fine.)

## Rendering

* The mountain is Canvas 2D — no three.js. A deterministic height field, cut
  into contours by marching squares, projected through a hand-rolled rotation
  matrix. Drag to rotate, double-click to reset, arrow keys when focused.
* The star, the card backgrounds and the fill under the chart are CSS and SVG
  gradients. No images anywhere; `sprites/` holds the Material Symbols paths.
* The chart switches the series in place rather than overlaying a second one.
  The dashed year-ago trace follows the switch.

## Settings

Gear icon, top right. The sheet has one level of navigation: five names on the
left, exactly one panel on the right.

```
expenses · data source · workbook · motion · privacy · about
```

A `tablist` with a single tab stop: ↑/↓ move, Home/End jump to the ends,
Escape closes the sheet.

* **expenses** — your monthly total, which moves all eight targets
  immediately.
* **data source** — currency (EUR, USD, GBP, CHF), then import status as a
  square plus a word, then file, time and data age; warnings from the import,
  then *Re-read workbook* and *Delete local data*.
* **workbook** — the two tables above, inside the app, so you can compare them
  against your own file line by line.
* **privacy** — what is read, written, sent, stored and required to sign in,
  each in one line, plus how to check it without taking anyone's word for it.
* **motion** — two switches with the state spelled out.
  `prefers-reduced-motion` is respected; without motion the mountain stands
  still and is still rotatable, and nothing builds itself up on arrival.
* **about** — the star, the wordmark and the version, then three chapters:
  nordstern itself, SheetJS, Material Symbols, all three Apache 2.0, each with
  holder and source. No fonts are listed there because none are shipped — the
  stylesheet only names families and asks the reader's machine for them.

There is no data export: the workbook is the source, the dashboard only the
display. The sheet is reachable before any file is loaded, and a failed import
puts a button to **workbook** next to the reason it failed.

**Currency** is a display setting, not a conversion — EUR by default, or USD,
GBP, CHF. The workbook is assumed to be entirely in one currency; switching
the setting reformats every number and axis label (1.234,56 € becomes
$1,234.56 or CHF 1'234.56) without changing a single figure, including the
monthly expenses amount. The interface itself stays English throughout —
language and locale are separate things. Importing a workbook helps: if the
Excel number format behind the amount cells carries exactly one currency
symbol, the setting switches to match and the import toast says so; a
workbook whose formats mix currencies leaves the setting as it is and adds a
warning instead.

## The build

```
npm run build   # → export/nordstern.html
```

One file: the three stylesheets and the fourteen scripts as `<style>` and
`<script>`, in the order `index.html` loads them, plus `favicon.svg` as a
`data:` address on its `<link>` tag. No bundler, no minifier — the source is
copied character for character, each block carrying its origin path in
`data-src`.

`favicon.png` stays a file next to the page rather than a `data:` address,
because Safari shows no `data:` favicons. On Pages it is served beside the
page; offline, Chromium and Firefox use the inlined SVG, Safari shows no
icon unless `favicon.png` sits next to the built file.

The build reads only files that `index.html` itself links, and only from
`css/` and `js/`; any other path aborts it. Nothing is loaded from outside
the page's own origin at runtime: no external font, no `@import`, no foreign
host. The browser enforces that — the built file carries

```
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
img-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'
```

`img-src 'self'` is only for `favicon.png` — the page's own origin, nothing
else — the rest still forbids any outbound request.

The SheetJS licence sits as a comment above the folded-in script, because
handing on the build redistributes SheetJS rather than merely using it.

`localStorage` is the one thing that differs from a hosted copy: over
`file://` some browsers refuse it, and nordstern then runs without memory.

## Tests

```
npm install     # jsdom, for the tests only
npm test
```

| Suite | What it holds down |
|---|---|
| `tests/smoke.mjs` | the whole page against a DOM, with a real import |
| `tests/behaviour.mjs` | empty state, import, persistence, monthly expenses, series switch, card ↔ mountain, motion, the arrival animation and what must *not* retrigger it, a broken workbook and the way back, edge cases, the contrast ramp, and that deleting local data leaves nothing behind |
| `tests/geometry.mjs` | height field, contours, route, mountain proportion, framing across 576 views, marker spacing across 360 |
| `tests/formats.mjs` | every format the file dialog offers parses to identical figures |
| `tests/example.mjs` | the shipped example workbook still says exactly what `tools/make-example.mjs` says, and the generator will not overwrite its hand formatting |
| `tests/build.mjs` | the single-file build: self-contained, byte-identical to its sources, boots, and reads the same workbook to the same numbers |
| `tests/hook.mjs` | the pre-commit hook actually blocks a stray spreadsheet, a leaked figure and an unchecked image, and lets a clean commit through |

```
npm run privacy
```

`tests/privacy.mjs` takes a real workbook — yours, if there is one in
`excel/` — pulls out every account name, expense line, sheet name and amount,
and searches every file a commit would carry. It skips cleanly when there is
no real workbook. `.gitignore` protects the file; it does not protect numbers
someone typed out of it.

Images it cannot read, so it insists someone else did: every image in the
repository needs a line in `tests/privacy-images.txt` with its SHA-256 and a
note on how it was checked. Change the image and the checksum stops matching,
which puts the question back on the table.

It also looks for people, not just figures. A sentence naming the author and
saying something about their situation contains no account name and no amount,
so the first rule would wave it through. The author's name from
`package.json`, its parts, the genitive forms and phrases like "the author's"
are refused outside the lines the licence needs them in — copyright, trademark
and attribution. Both of these run without a workbook, so they work in CI and
on any machine.

Turn on the commit hook and it runs before every commit:

```
git config core.hooksPath .githooks
```

The application itself needs none of this.

## Licence

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE). Use it,
modify it, sell it, fork it. "nordstern" and the nordstern star are trademarks
of Christian J. Heinze and are not licensed with the code; please give your
fork its own name.

Third-party: [SheetJS](https://git.sheetjs.com/sheetjs/sheetjs) Community
Edition (Apache 2.0), [Material
Symbols](https://github.com/google/material-design-icons) (Apache 2.0).
