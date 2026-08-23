# Contributing

Thanks for looking. A few things worth knowing before you spend time.

## What this project is

A personal finance dashboard built for one person, published because it might
be useful to others. Feature requests that make it more general are welcome
as discussion; they may well be declined, and that is not a judgement on the
idea. Bug reports and correctness fixes are always welcome.

## Ground rules

**No build step, ever.** Plain `<script>` tags, ES5-flavoured JavaScript,
everything hanging off `window.NORDSTERN`. No modules, no bundler, no
TypeScript, no framework. `index.html` must keep working when opened by
double-click from `file://`. If a change needs a toolchain to run, it is the
wrong change.

**One dependency.** SheetJS, vendored in `js/vendor/`. `npm install` pulls
jsdom for the tests and nothing else ever reaches the browser. Pull requests
adding a runtime dependency will be declined.

**Never phone home.** No `fetch`, no `XMLHttpRequest`, no web fonts, no CDN,
no analytics, no error reporting. `tests/build.mjs` enforces this and will
fail your PR if you slip.

**Never write to the user's spreadsheet.** The importer reads. That is the
whole contract.

**No real financial data anywhere.** Not in code, not in tests, not in docs,
not in screenshots. Use `examples/nordstern-example.xlsx` or extend
`tools/make-example.mjs`. `tests/privacy.mjs` scans everything a commit would
carry against a real workbook, if one is present on the machine.

**Do not write about people.** No "the author's real net worth", no first
names in comments about someone's finances. That is not a figure, so the
needle scan cannot see it; a second rule refuses the author's name and phrases
like "the author's" outside the copyright, trademark and attribution lines.

**Images are the exception, and they are handled explicitly.** The guard reads
text, not pixels — a screenshot of the running application can hold every
number it looks for. So every image in the repository needs a line in
`tests/privacy-images.txt`: its SHA-256, its path, and behind the `#` how it
was checked. No line, or a checksum that no longer matches, and the commit is
refused. That check runs without a workbook, so it works in CI and on your
machine too.

## Getting set up

```
git clone https://github.com/chrisjohe/nordstern
cd nordstern
npm install          # jsdom, for the tests
npm test             # ~500 assertions, all headless
npm run build        # → export/nordstern.html
open index.html      # or just double-click it
```

There is no dev server and nothing to watch. Edit a file, reload the page.

## Tests

`npm test` runs seven suites and they must all be green:

| Suite | What it holds down |
|---|---|
| `tests/smoke.mjs` | the whole page against a DOM, with a real import |
| `tests/behaviour.mjs` | empty state, import, persistence, every control |
| `tests/geometry.mjs` | the mountain: contours, route, framing, marker spacing |
| `tests/formats.mjs` | every format the file dialog offers actually parses |
| `tests/example.mjs` | the shipped example workbook says what the docs say it does |
| `tests/build.mjs` | the single-file build is self-contained and data-free |
| `tests/hook.mjs` | the pre-commit hook bites — both of its locks |

`tests/privacy.mjs` runs separately (`npm run privacy`) because it needs a
real workbook to be useful. It skips cleanly when there isn't one.

Turn the commit hook on once, and it will run that guard for you:

```
git config core.hooksPath .githooks
```

Add assertions with your change. The suites are plain scripts with an `ok()`
helper — no framework, same rule as the app.

## Style

Match the file you are editing. Two-space indent, single quotes, semicolons.

Comments in the source are in German and explain **why**, not what. That is a
quirk of how this was written, and translating them is a standing offer
rather than a requirement — if you are adding code, English comments are
fine and nobody will make you write German. Documentation and the interface
are English.

Prose in this project tries to be specific rather than decorative. If a
comment could be deleted without losing anything, delete it.

## Pull requests

One concern per pull request. Say what changes for the person using it, not
only what changed in the code. If it touches layout, say what it looks like
at 1280×800 — the design target is a desktop window with no scrolling.

If you are using an AI assistant, point it at [AGENTS.md](AGENTS.md) first.
