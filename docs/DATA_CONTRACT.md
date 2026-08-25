# Data contract and FIRE mathematics

What nordstern reads out of a workbook, how it finds it, and which assumptions
it makes on the way. All knowledge about the layout of the workbook lives in
`js/importer.js` — if your file is shaped differently, that is the only file
to touch.

The workbook is **read only**. There is no write path in the code, and nothing
leaves the machine.

---

## 1. Sheets that are read

Only **`Data Input`** and **`Expenses`**. Every other sheet in your file is
dropped as the workbook is opened, whatever it is called, and never reaches
the model. The example workbook ships with a third sheet purely to
demonstrate that.

Sheet names are matched case-insensitively and with whitespace normalised. If
either of the two is missing, the import stops with a named error.

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

A **gap** and a **repeated month** are different: both are carried. Comparisons
work from the distance in months and stay blank where none fits, the chart
draws a gap as a gap, and *Settings → notes while reading* names both.

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

## 3. `Expenses`

| Row | Use |
|---|---|
| A first row labelled `Kind` | header, skipped |
| items above `Monthly fixed costs` | monthly line items |
| `Monthly fixed costs` | monthly total |
| items between the two totals | annual line items |
| `Annual fixed costs` | annual total |

A third column is read as a due date if it is there, and ignored if it is not.

**Both total rows are required.** They are not there for their sums but as
the boundaries: above the first stand the monthly items, between the two the
annual ones. Without them there is no way to tell which item is which — a
missing monthly row would count every annual item as a monthly load as well, a
missing annual row would drop it altogether, and all eight FIRE targets follow
from that figure. A missing row therefore stops the import, exactly as in
`Data Input`.

Their **amounts** may be left blank; then the line items above them are added
up instead. The monthly load is **always computed**: `monthly + annual ÷ 12`.
If the line items and the total row disagree by more than 0.02 €, both are
kept and a warning is shown — the total row wins, because that is the number
you look at in your own spreadsheet.

## 4. Assumptions

1. **The variable share of spending does not come from the workbook.** Fixed
   costs are fixed costs: no food, no leisure, no holidays. That share is set
   in the settings and stored locally. It **defaults to a placeholder**
   (`DEFAULT_VARIABLE` in `js/store.js`, 600 € a month — 20 € a day), because
   at zero all eight targets would silently count fixed costs only and sit too
   low. The placeholder is nobody's real figure, and the dashboard keeps
   calling it an estimate until someone touches the field.
2. **Liquid share and invested share are fractions of `Total assets`**, not of
   net worth. Measured against net worth they can exceed 100 %, which is a
   usable figure but not a drawable proportion — and the dial beside them
   draws exactly these proportions. What net worth *is* good for is leverage,
   which has its own figure (see section 5).
3. **Contingency counts against `Total liquid`.** Claims, property and
   retirement assets are not available at short notice and stay out of it.
4. **The seven investment stations count against `Total investments`.**
   Property does not contribute to financial independence, and neither does
   money somebody still owes you.
5. **A month with no year-ago value** (fewer than 13 months of history) shows
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

## 5. Targets

With `M` = total monthly expenses = fixed costs (from the workbook) + the
variable share (from the settings):

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

**Portfolio pace** is the change in invested assets over the last twelve
months divided by twelve. If it is zero or negative, no time-to-next-milestone
is estimated — an honest blank rather than an infinity.

**Leverage** is `Total assets / Net worth`, the equity multiplier: 1,00× is
debt-free, 2,00× means half the balance sheet is borrowed. Its subline carries
`Liabilities / Total assets`, the same ratio the dial's legend shows. With net
worth at or below zero there is no meaningful factor and a dash is shown; the
debt ratio survives and simply exceeds 100 %.

It is deliberately *not* `Investments / Net worth`, which looks like a leverage
figure and is not one: that ratio rises when equity grows as readily as when
debt does. Across the example series it reads 26 % at a sixfold multiplier and
77 % at a twofold one — the wrong way round.

## 6. What is stored

`localStorage`, under `nordstern.model.v1` (the normalised model, tens of
kilobytes depending on how many months and accounts you have) and
`nordstern.settings.v1` (which holds the variable monthly amount — the one
number you type rather than import).

*Delete local data* removes every key that starts with `nordstern.` and resets
the running page to its first-visit state. Anything stored under a different
prefix is not ours and is left alone.

If storage is unavailable — under `file://` some browsers use an opaque origin
— the application keeps working and asks for the file again each time it is
opened. Nothing else changes.

## 7. Numbers and dates

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

## 8. Currency

nordstern assumes the **whole workbook is in one currency**. Nothing is
converted, ever — the currency setting only changes how a figure is written,
not what it is. Switching it does not touch the parsed model, so it needs no
re-import, and it does not touch the variable monthly amount either: it stays
whatever number was typed in, now printed with a different symbol and
grouping.

On import, the reader looks at the **Excel number format** behind the amount
cells on both sheets, `Data Input` and `Expenses` — not their content, the
format string Excel stores alongside each cell. If every format that carries a currency symbol carries
the *same* one (`€`, `$`, `£`, `CHF`, the codes `EUR`/`USD`/`GBP`/`CHF`, or an
Excel tag such as `[$CHF-807]`), the currency setting switches to match and
the import toast names it. If no format carries a symbol, the setting is left
as it is — an unformatted workbook says nothing about currency, so nordstern
does not guess. If the formats carry **more than one** currency, that is
almost always a workbook nordstern's one-currency assumption does not fit;
the setting is left as it is and a note is added: "Amounts are formatted in
more than one currency …".
