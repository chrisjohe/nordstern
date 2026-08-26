# Data contract and FIRE mathematics

What nordstern reads out of a workbook, how it finds it, and which assumptions
it makes on the way. All knowledge about the layout of the workbook lives in
`js/importer.js` — if your file is shaped differently, that is the only file
to touch.

The workbook is **read only**. There is no write path in the code, and nothing
leaves the machine.

---

## 1. Sheets that are read

**One**, chosen by name: `Data Input`, or one of the aliases `Data`, `Input`,
`Snapshots`, `Net Worth`, `Nordstern`, `Daten`, `Dateneingabe`, `Vermögen`,
`Bilanz` — in that order, the first name from the list that occurs in the
workbook wins. The comparison is case-insensitive and whitespace-normalised.
A workbook with exactly one sheet needs no matching name at all: that sheet
is used whatever it is called. Every other sheet is dropped as the workbook
is opened, whatever it is called, and never reaches the model. The example
workbook ships with a second sheet purely to demonstrate that.

If the workbook holds two or more sheets and none of them matches, the
import stops rather than guess: nordstern does not search sheet contents for
something that looks right, because that would mean decoding every sheet and
breaking the promise that only one is ever read. The error names the sheets
the workbook actually has, alongside the accepted names, so you can see why
none of them matched:

`No sheet named "Data Input" found (also accepted: Data, Input, Snapshots,
Net Worth, Nordstern, Daten, Dateneingabe, Vermögen, Bilanz). This workbook
has: "Mappe1", "Tabelle2". Rename the sheet, or keep a single sheet in the
file.`

Those sheet names appear only in that message, on screen — an error leaves
no model, so nothing about the workbook is stored.

## 2. `Data Input`

### Anchoring

Sections are found by their **label in column A**, never by row number.
Inserting or deleting accounts therefore does not shift the import. Labels are
compared lower-cased, with whitespace collapsed and a trailing `:` or `•`
stripped.

| Anchor (column A) | Meaning |
|---|---|
| `Month` | the header row holding the month dates |
| `Liquid` … `Total liquid` | liquid assets |
| `Claims` … `Total claims` | money owed to you |
| `Investments` … `Total investments` | invested assets |
| `Property` … `Total property` | tangible assets |
| `Retirement` … `Total retirement` | retirement assets |
| `Total assets` | all five sections together |
| `Liabilities` … `Total liabilities` | what you owe |
| `Total net worth` | assets minus liabilities |

The **accounts of a section** are every labelled row between its head row and
its total row. `Liabilities` is matched **exactly**, not as a substring, so a
helper row such as `Liabilities *(-1)` below the total is left alone.

Exactly one spelling per anchor, the same one the interface shows. Two valid
names for the same row would only help for as long as somebody remembers the
second one.

### Month columns

Every column to the right of A whose header cell contains a date is a month.
The month key is `YYYY-MM` taken from the **local** date — workbooks carry
end-of-month dates, and a UTC conversion would shift the month by a day.

The columns must run **in ascending order**. A month that stands after a later
one **stops the import**: "now" is the column furthest right, so a series
reading January, March, February would take February as the current state, and
every figure on the page follows from that. Sorting the columns would mean
repairing a broken file by guessing which order was meant.

The date in the header names the **month**; the day is not read. A series
dated the 15th behaves exactly like one dated the last day of the month — the
15th and the 31st of the same month are the same column. This has a
consequence for anyone entering data on a fixed schedule: a column headed 1
April holds *April's* snapshot, not March's. Whoever means the state of the
books at the close of March writes 31 March in the header, not the first of
the following month. The same date decides whether a column counts as the
future, below: a column headed 1 September, entered on 26 August, is not the
current state until September arrives.

A **gap** and a **repeated month** are different: both are carried. Every
comparison looks for the nearest snapshot at the distance it wants, rather
than counting cells: "vs. last month" is the previous distinct snapshot,
however far back that is; "vs. last year" is whichever snapshot sits 11 to 13
months back, the one closest to 12; if both 11 and 13 exist, the nearer one. Each comparison carries its
actual distance, and the label says so once that distance stops being 1 or
12 — "vs. 3 months ago" rather than a silently wrong "vs. last month". A
quarterly or half-yearly series compares cleanly this way; a yearly series
produces one point per year, and a month with no snapshot 11 to 13 months
behind it shows no year-ago comparison rather than a wrong one. The chart
draws a gap as a gap, and *Settings → notes while reading* names both a gap
and a repeated month.

### Numbers stored as text

An amount pasted from a bank statement often sits in the cell as text.
`1.234,56` is read as one thousand two hundred, not as 1,234 — the reader
accepts only what matches one of a fixed set of notations completely: German
(`.` groups, `,` separates the decimals), English (the other way round), or
Swiss (`'` groups, `.` separates the decimals — `1'234.56`), each optionally
carrying a leading currency code (`CHF 1'234.56`). Anything else is **not
read at all** rather than read in part; the cell then counts as empty. Where
more than one notation fits — `1.234` — the German reading applies.

Both cases are named in *Settings → notes while reading*, with the count and
the first cell address.

### Which column is "now"

Some workbooks carry **projected** columns to the right of the last real
snapshot: a car depreciating on schedule, a loan amortising into next year.
Those are not snapshots and must not be read as the current state.

The rule is the calendar: **"now" is the last column whose month is not in the
future and which has a value in at least one account row.** The date settles
the projections; the "has any value" part settles the empty columns people
create in advance for the rest of the year.

Anything to the right is ignored, and *Settings → data source* says how much:
"Ignored — 10 columns from September 2026". Nothing is dropped silently.

Two other rules do not hold:

* **"the last column with liquid or invested assets above zero"** — it breaks
  twice over: liquid assets may be negative, if you keep overdrafts among them
  rather than under liabilities, and investments may legitimately be zero.
  Either way a real month falls out of the series.
* **fill ratio** — "a real column fills more rows than a projection". A
  projection fills almost as many account rows as a genuine month, and a few
  percentage points will not carry a threshold.

### Cross-checks while reading

For **every** month:

* sum of the account rows = the section's total row (tolerance 0.02 €)
* sum of the five sections = `Total assets`
* `Total assets − Total liabilities` = `Total net worth`

Differences are collected and shown in the settings as warnings — they do not
stop the import. A missing **anchor** does; then the error state appears with
the list of rows that could not be found.

The example workbook produces zero warnings, which is the point of it: if your
own file warns, the difference is in your file, not in the reader.

## 3. Assumptions

1. **The monthly expenses do not come from the workbook.** There is nothing to
   parse — the amount is one number, typed once in the settings and stored
   locally. It **defaults to a placeholder** (`DEFAULT_EXPENSES` in
   `js/store.js`, 2 500 € a month), because at zero all eight targets would
   silently sit at zero too. The placeholder is nobody's real figure, and the
   dashboard keeps calling it an estimate until someone touches the field.
2. **Liquid share and invested share are fractions of `Total assets`**, not of
   net worth. Measured against net worth they can exceed 100 %, which is a
   usable figure but not a drawable proportion — and the dial beside them
   draws exactly these proportions. What net worth *is* good for is leverage,
   which has its own figure (see section 4).
3. **Contingency counts against `Total liquid`.** Claims, property and
   retirement assets are not available at short notice and stay out of it.
4. **The seven investment stations count against `Total investments`.**
   Property does not contribute to financial independence, and neither does
   money somebody still owes you.
5. **A month with no year-ago value** (no snapshot 11 to 13 months back) shows
   "no year-ago value" rather than a 0.
6. **Empty cells count as 0**, not as missing — which is how a spreadsheet
   adds them up too. A cell that is *present* and zero is what marks a column
   as a real snapshot, though, so an empty column is not the same as a column
   of zeros.
7. **A negative balance inside a section is real money.** If you keep an
   overdraft among your liquid assets rather than under liabilities, it lowers
   that section, appears in the drill-down with its true figure in the
   liabilities colour, and counts as a negative share. It gets no arc on the
   dial — a negative length does not exist — so the positive items close the
   circle between them while the centre shows the true section total. Zero
   rows stay out: a closed account is not a line item.

## 4. Targets

With `M` = monthly expenses, from the settings:

| Card | Term of art | Target | Counts against |
|---|---|---|---|
| Contingency | Emergency fund | 3 × M | liquid |
| First Light | Snowball | 6 × M | invested |
| Velocity | F-You Money | 12 × M | invested |
| Stable Course | Coast FI | 60 × M | invested |
| Aurora | Barista FI | 120 × M | invested |
| Passage | Semi FI | 240 × M | invested |
| Polaris | Lean FI | 300 × M | invested |
| Apex | Fat FI | 396 × M | invested |

The established terms of art appear **only here**; the cards show the
nordstern names. See [CUSTOMISE.md](CUSTOMISE.md) for changing any of this.

Status per station: **reached** when the balance covers the target;
**current** is exactly the first station not reached; everything beyond it is
**ahead**.

The position on the mountain route is interpolated linearly between the two
surrounding stations and mapped onto the path by **height**, so the markers
spread evenly across the flank and the route never descends between two
milestones.

**Portfolio pace** is the change in invested assets since the year-ago
snapshot — the one 11 to 13 months back, closest to 12 — divided by that
snapshot's actual distance in months, not always twelve. If it is zero or
negative, no time-to-next-milestone is estimated — an honest blank rather
than an infinity.

**Leverage** is `Total assets / Net worth`, the equity multiplier: 1,00× is
debt-free, 2,00× means half the balance sheet is borrowed. Its subline carries
`Liabilities / Total assets`, the same ratio the dial's legend shows. With net
worth at or below zero there is no meaningful factor and a dash is shown; the
debt ratio survives and simply exceeds 100 %.

It is deliberately *not* `Investments / Net worth`, which looks like a leverage
figure and is not one: that ratio rises when equity grows as readily as when
debt does. Across the example series it reads 26 % at a sixfold multiplier and
77 % at a twofold one — the wrong way round.

## 5. What is stored

`localStorage`, under `nordstern.model.v1` (the normalised model, tens of
kilobytes depending on how many months and accounts you have) and
`nordstern.settings.v1` (which holds the monthly expenses — the one number
you type rather than import).

*Delete local data* removes every key that starts with `nordstern.` and resets
the running page to its first-visit state. Anything stored under a different
prefix is not ours and is left alone.

If storage is unavailable — under `file://` some browsers use an opaque origin
— the application keeps working and asks for the file again each time it is
opened. Nothing else changes.

## 6. Numbers and dates

The interface is English; number and date formats follow the chosen
**currency** — *Settings → data source*, EUR by default. EUR formats as
`de-DE` (`450.239,15 €`, `31.08.2026`); USD as `en-US`; GBP as `en-GB`; CHF as
`de-CH`, with an apostrophe for grouping (`CHF 1'234.56`). Percentages,
multiples (`1,96×`), the compact axis labels and the import timestamp all
follow the same locale, and the clock is 24-hour in every one of them.
Language and locale are two different things: the interface stays English no
matter which currency is chosen, only the shape of the numbers changes. The
mapping from currency to locale is the table `CURRENCIES` in `js/util.js`;
every formatter in that file goes through `setCurrency()`, which is why a
fifth currency is one row away — see
[CUSTOMISE.md](CUSTOMISE.md#adding-a-currency).

## 7. Currency

nordstern assumes the **whole workbook is in one currency**. Nothing is
converted, ever — the currency setting only changes how a figure is written,
not what it is. Switching it does not touch the parsed model, so it needs no
re-import, and it does not touch the monthly expenses amount either: it stays
whatever number was typed in, now printed with a different symbol and
grouping.

On import, the reader looks at the **Excel number format** behind the amount
cells on the sheet that was read — not their content, the format string
Excel stores alongside each cell. If every format that carries a currency
symbol carries the *same* one (`€`, `$`, `£`, `CHF`, the codes
`EUR`/`USD`/`GBP`/`CHF`, or an Excel tag such as `[$CHF-807]`), the currency
setting switches to match and the import toast names it. If no format
carries a symbol, the setting is left as it is — an unformatted workbook
says nothing about currency, so nordstern does not guess. If the formats carry **more than one** currency, that is
almost always a workbook nordstern's one-currency assumption does not fit;
the setting is left as it is and a note is added: "Amounts are formatted in
more than one currency …".
