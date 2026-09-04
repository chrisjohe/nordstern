# AGENTS.md

Notes for an AI assistant working in this repository. Written to be read
before the first edit.

## What this is

`nordstern` is a personal-finance dashboard: one HTML page that reads a
spreadsheet in the browser and draws net worth, spending and FIRE progress.
It runs from `file://` with no server and no build step.

## Hard constraints — violating any of these breaks the project

1. **No build step.** Classic `<script src>` tags, ES5-flavoured JavaScript,
   everything on `window.NORDSTERN`. No `import`/`export` in `js/`, no
   modules, no JSX, no TypeScript, no bundler, no transpiler, no CSS
   preprocessor. `index.html` must keep working when double-clicked.
   (`tools/` and `tests/` are ESM Node scripts — that is fine, they never
   reach the browser.)
2. **No runtime dependencies.** SheetJS, vendored in `js/vendor/`, is the only
   one and will stay the only one. Do not add a package to make something
   easier.
3. **No network calls, ever.** No `fetch`, no `XMLHttpRequest`, no
   `WebSocket`, no `new Image()`, no web fonts, no CDN, no analytics, no error
   reporting, no `<link>` to anything remote. `tests/build.mjs` fails the
   build if any appear. This is the product, not a preference.
4. **Never write to the user's spreadsheet.** The importer reads. `XLSX.write`
   is for `tools/make-example.mjs` only — and even that one refuses to
   overwrite the shipped example without `--force`, because the file carries
   hand formatting the generator cannot reproduce. To compare, write elsewhere:
   `node tools/make-example.mjs --out /tmp/x.xlsx`.
5. **No real financial data anywhere, and nothing about the person behind it**
   — not in code, comments, tests, docs, commit messages or example values. A
   comment naming the maintainer and describing their situation carries no
   figure and is still a leak; `tests/privacy.mjs` refuses it. Use
   `examples/nordstern-example.xlsx` or extend `tools/make-example.mjs`.
   `npm run privacy` scans everything a commit would carry against a real
   workbook when one is present.
6. **Do not read the user's workbook** beyond the one sheet the importer
   chooses (see `SHEET_NAMES` in `js/importer.js`), and do not print its
   contents. If you must inspect it, print labels from column A, never
   amounts.

## Where things live

| I want to change… | Go to |
|---|---|
| how the spreadsheet is read | `js/importer.js` — **all** workbook knowledge is here, and nowhere else |
| the eight milestones | `js/calc.js` → `MILESTONES`. Read `docs/CUSTOMISE.md` first |
| what living costs by default | `js/store.js` → `DEFAULT_EXPENSES` (2 500 € a month, a placeholder for the whole monthly spending — the targets are multiples of it) |
| derived figures, FIRE ladder | `js/calc.js` |
| the mountain | `js/ui/mountain.js`. Route control points are coupled to `t` in `calc.js`; `tests/geometry.mjs` enforces it |
| the history chart | `js/ui/chart.js` → the `SERIES` table |
| the radial structure instrument | `js/ui/orbit.js` |
| the cards | `js/ui/cards.js` (`WASH` = gradients) |
| milestone glyphs | `js/ui/icons.js` → `GLYPHS` |
| the settings sheet | `js/ui/settings.js` |
| colours, type, spacing, motion | `css/tokens.css` |
| the frame (no-scroll desktop grid) | `css/layout.css` |
| everything else visual | `css/components.css` |
| wiring, states, the empty state | `js/app.js` |
| localStorage | `js/store.js` |
| the version number | `js/util.js` → `NS.VERSION`, and `package.json` — `tests/behaviour.mjs` holds the two together |
| the single-file build | `tools/build.mjs` |

## Conventions

* Comments in `js/` and `css/` are **in German** and explain *why*, not what.
  You may write new comments in English; do not translate existing ones as a
  side effect of another change.
* Two-space indent, single quotes, semicolons. Match the file you are in.
* The interface is English. Numbers and dates are currency-aware, not fixed
  to one locale: `NS.util.setCurrency(code)` in `js/util.js` switches every
  formatter to the chosen currency's locale (EUR/`de-DE` by default).
  `app.js` calls it from the settings before the first render and again after
  every settings change. Anything that formats money must go through the
  `U.eur*` helpers in `js/util.js` — never a hand-built `Intl.NumberFormat` or
  raw `toLocaleString` at the call site.
* Commit messages are English, like the interface and the docs. German lives
  in the comments inside `js/` and `css/`, and stays there.
* Prose — in the interface, the docs and the comments — is specific rather
  than decorative. If a sentence could be deleted without loss, delete it.

## Before you say you are done

```
npm test          # behaviour, geometry, formats, example, build, hook — all must pass
npm run build     # regenerates export/nordstern.html
npm run privacy   # only meaningful where a real workbook exists
npm run smoke     # prints a masked walk-through; NORDSTERN_WORKBOOK=… for a real workbook
```

Add assertions for what you changed. The suites are plain scripts with an
`ok(condition, message)` helper; the message is printed only on failure, so
put the actual value in it.

**Do not take screenshots of the running application or open it in a browser
to look at it.** The maintainer does the visual testing — a rendered page can
contain real financial data.

For the same reason, an image you did not verify may not be committed:
`tests/privacy.mjs` refuses any image without a line in
`tests/privacy-images.txt` giving its SHA-256 and how it was checked. If you
are asked to add one, say what you can and cannot establish about its
contents — the guard proves nobody skipped the question, not that the picture
is harmless.

If a change is visual, describe what changed in words and let a human look.
