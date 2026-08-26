# Security

## The short version

nordstern has no server, no account, no network code. It reads a spreadsheet
you choose, in your browser, and keeps the result in that browser's
`localStorage`. Nothing is uploaded, because there is nothing to upload it
with — there is no `fetch`, no `XMLHttpRequest`, no WebSocket, no form target
and no analytics anywhere in the source.

You do not have to take that on faith:

* The single-file build in `export/nordstern.html` carries a
  Content-Security-Policy of `default-src 'none'; connect-src 'none';
  form-action 'none'; base-uri 'none'`. The **browser** enforces it. Open the
  network tab and watch nothing happen.
* `npm test` includes `tests/build.mjs`, which fails the build if any loading
  path, font host, `@import` or `data:` URI appears in the output.

## Your spreadsheet is never written

The importer opens the file read-only and parses it in memory. There is no
write path in the code — `XLSX.write` is never called by the application,
only by the developer tools that generate the example workbook. Your file is
not moved, renamed, re-saved or "helpfully" repaired.

Only one sheet is read: **`Data Input`**, or one of a short list of aliases
(`Data`, `Input`, `Snapshots`, `Net Worth`, `Nordstern`, `Daten`,
`Dateneingabe`, `Vermögen`, `Bilanz`), matched in that order; a workbook with
exactly one sheet needs no matching name at all. The parser is handed the one
matching name, so in `.xlsx`, `.xlsm` and `.xlsb` no other sheet is decoded
at all. SheetJS ignores that filter for `.ods` and `.numbers`; there every
sheet is decoded into memory, and everything but the matching sheet is
dropped the moment the workbook is open, before a single cell is read out of
it. Either way, no other sheet and no sheet name reaches the model or your
`localStorage` — the example workbook ships with a second sheet purely to
demonstrate this. If none of the names match and the workbook holds more
than one sheet, the import stops with an error that names the sheets it
found — on screen only, never stored, since an error leaves no model to
store anything in.

## Where your data actually sits

| What | Where | How to remove it |
|---|---|---|
| The parsed model | `localStorage`, key `nordstern.model.v1` | *Settings → data source → Delete local data*, or clear site data |
| Your settings, including the monthly expenses you typed | `localStorage`, key `nordstern.settings.v1` | the same button — it removes every `nordstern.*` key, not just the model |
| Your spreadsheet | Wherever you keep it | nordstern never touches it |

*Delete local data* also wipes the screen: history, dial, cards and the
expenses in the settings sheet are cleared, not just hidden behind the empty
state. What you see afterwards is what a first visit looks like.

If you open nordstern from `file://`, some browsers refuse `localStorage`
entirely. nordstern handles that: it runs without memory and asks for the
file again next time.

If you use a hosted copy (for example GitHub Pages), the page is static. The
host sees that you requested an HTML file. It does not see your spreadsheet,
because the file never leaves the browser tab. If that is still too much
trust, download `export/nordstern.html` and open it from your own disk — it
is one self-contained file and behaves identically.

## Reporting a vulnerability

Please report privately, not as a public issue:

* GitHub → **Security** → **Report a vulnerability** (private advisory), or
* email the address on the commits in this repository.

Please include what you did, what happened, and what you expected. A proof of
concept helps. I will confirm within a week.

Especially welcome: anything that would cause data to leave the browser, any
way to make the importer write to the source file, and any way to get
attacker-controlled content out of a spreadsheet and into the DOM as markup.

This is a personal project maintained by one person. There is no bounty and
no SLA. There is, however, a genuine interest in getting this right — the
whole point of nordstern is that you can keep your finances to yourself.

## Scope

In scope: this repository and anything published from it.

Out of scope: SheetJS itself (report to
[SheetJS](https://git.sheetjs.com/sheetjs/sheetjs)), your browser, and the
security of the spreadsheet file on your own machine.
