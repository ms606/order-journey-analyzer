# Order Journey Analyzer

A single-page app for reviewing a WooCommerce order export together on a screen share, and agreeing the rules for
loading it into a MySQL reporting database later.

It is for analysis only. It does not connect to a database, website or API. The finished app is **one file**,
`dist/index.html`, which you open straight from disk.

**Hosted copy:** https://ms606.github.io/order-journey-analyzer/ is rebuilt from `main` on every push by
`.github/workflows/deploy.yml`. It is the same single file with the same Content Security Policy, so a CSV you open there
is read in your browser and never uploaded. For now the hosted copy leaves out the **Sources and devices** and
**Decisions** tabs (so it has no downloads); the workflow sets `VITE_HIDDEN_TABS=sources,decisions`, and removing that
line brings them back. Local builds always have every tab.

## Privacy

The order export contains real customer data, so the app is built around these rules:

| Rule | How it is enforced |
| --- | --- |
| Nothing leaves the computer | No network code is used. The production file carries a Content Security Policy with `connect-src 'none'` and `default-src 'none'`. The smoke test fails on any `http`/`https` request. |
| One self-contained file | `vite-plugin-singlefile` inlines all JS and CSS. System fonts only: no web fonts, CDN or analytics. |
| Nothing is stored | No localStorage, sessionStorage, IndexedDB, cookies or service workers. Data lives in memory and disappears on reload or tab close. **Clear data** removes it immediately. |
| No personal data on screen or in exports | Emails, cities, states and user agent strings are never displayed, logged or exported. While the file is read, each email is turned into an opaque key used only to group orders; the city, state and user agent text is dropped. Only aggregate figures are shown. |
| URLs as paths only | Entry pages are reduced to their path. Query strings and fragments are removed. |
| Exports hold rules, decisions and totals | Email addresses typed into the notes are replaced with `[email removed]` in the download. |
| Real CSVs stay out of git | `.gitignore` ignores `*.csv` but allows `fixtures/*.csv`. |

The CSP is added to the production build only, so the Vite dev server still works:

```
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'
```

## Requirements

- Node.js 20.19+ or 22.12+ (needed by Vite 8)
- On Apple Silicon Macs, use the arm64 build of Node. An x86_64 Node runs under Rosetta, and any installed Chrome it
  launches for tests runs translated and very slowly.

## Run, build and test

```bash
npm install

npm run dev          # development server (no CSP) at http://localhost:5173
npm run build        # typecheck, then build dist/index.html
npm test             # unit tests (Vitest)

npx playwright install chromium firefox webkit   # first time only: test browsers
npm run test:smoke   # build, then the Playwright smoke test against dist/index.html via file://
npm run test:all     # unit tests and smoke test

npm run fixture      # regenerate the synthetic fixtures
```

To use the app, open `dist/index.html` by double-clicking it, or drag it into Chrome, Edge, Firefox or Safari. No
server is needed.

## Using the app

1. Drag the order export CSV onto the page, or choose it with the button. The file is read in the browser.
2. **Data check** always uses the whole file. Choose which order statuses count. Failed and cancelled are left out by
   default. Review blanks, repeated values and unusual rows. Optionally add an order items file and map its columns.
3. **Overview**, **Entry points**, **New vs repeat** and **Sources and devices** respond to the filters at the top: date
   range, source type, device type, device, entry group and customer type.
4. On **Entry points**, edit the entry page rules. Every chart updates immediately. Move common pages out of "Articles or
   other" with one click.
5. On **Decisions**, record what was agreed, then download `journey-decisions.json` and `entry_page_rules.csv`.
   Decisions are not saved, so download them before closing the page.

An optional **Currency label** at the top (for example `EUR`) is added after amounts. Without it, amounts have no symbol.

## Input file

The export must contain these exact column headers. Extra columns are ignored.

`Order Date`, `Order ID`, `Order Status`, `Billing Email Address`, `Billing City`, `Billing State`, `Shipping City`,
`Shipping State`, `Order Total`, `Refund Total`, `_wc_order_attribution_source_type`,
`_wc_order_attribution_referrer`, `_wc_order_attribution_utm_source`, `_wc_order_attribution_session_entry`,
`_wc_order_attribution_session_start_time`, `_wc_order_attribution_session_pages`,
`_wc_order_attribution_session_count`, `_wc_order_attribution_user_agent`, `_wc_order_attribution_device_type`,
`_wc_order_attribution_utm_medium`, `_wc_order_attribution_utm_content`

If any are missing, the app lists them. Values are kept as text while parsing. A byte order mark, quoted fields and
blank trailing lines are handled. There is no size limit in the code.

## Rules implemented

All calculations are pure functions in `src/lib`, separate from the UI, and covered by unit tests.

**Reading values**

- `Order Date` is strict `M/D/YY H:MM` (24-hour), with YY read as 20YY. It is parsed with a regular expression, not
  `new Date(string)`, and no time zone is applied. Impossible dates (for example 2/30) count as failed parses.
- Session start accepts `M/D/YY H:MM` or `YYYY-MM-DD HH:MM:SS`.
- In attribution cells holding repeated values joined by `|`, the first part is used. Blank values are allowed.
- Money is parsed into whole cents and summed as integers. A blank refund counts as 0. Unreadable totals count as 0 in
  sums, are left out of medians, and are counted on Data check.
- `typein` is shown as "Direct". `utm_source` values are matched exactly: `chatgpt.com` and `ChatGPT.com` stay separate.
- Device name comes from the user agent, checked in this order: iPhone, iPad, Android, Macintosh (shown as Mac),
  Windows, otherwise Other (including blank).
- Unknown order statuses are shown and counted by default.

**Calculations**

- Counted orders: every status except `wc-failed` and `wc-cancelled`, changeable on Data check.
- Net sales: sum of Order Total minus sum of Refund Total for the counted orders.
- Customer: the trimmed, lowercased email. An order without an email is treated as its own customer and counted on Data
  check.
- Order sequence: for each customer, counted orders are sorted by Order Date, then numeric Order ID. The earliest is
  "First order in file"; the rest are "Repeat order". This runs before any filter, so filters never change it. Orders
  with an unreadable date sort last.
- "Customers with 2+ orders" counts customers in the current view who have two or more counted orders anywhere in the
  file, on the same basis as the order sequence.
- Medians: with an even count, the two middle values are averaged. Blanks are excluded. Page counts use medians, never
  averages.
- Percentages use the counted, filtered orders as their base, unless a chart says otherwise. The first and repeat charts
  use each customer type's own total.
- Session gap: Order Date minus session start, in minutes. Data check only counts orders above 1,440 minutes, labelled
  "time zone not confirmed". There is no time-to-purchase metric.
- `session_count` is not used to find repeat customers. Data check reports how many repeat orders show a session count
  of 1.

**Entry pages**

- `session_entry` is read with `new URL()`; relative paths are resolved against a placeholder base. The first path
  segment is used, ignoring case, query strings, fragments and trailing slashes. Anything that looks like an email in a
  path is replaced.
- Default groups: blank → No entry page; no path → Homepage; `product` → Product page; `shop`, `stones`, `chakra`,
  `crystal-type`, `category` → Shop; `cart`, `checkout`, `my-account` → Cart, checkout, or account; anything else →
  Articles or other.
- Rules can be edited, added, removed and reset, and new group names can be created. When two rules cover the same
  segment, the first one wins and the duplicate is flagged.
- Entry points also counts orders whose entry path ends in `-meaning`.

**Optional order items file**

- Load a second CSV on Data check. Its columns are unknown, so you map order number, email, date (with its layout),
  order total, and product name or slug from dropdowns. Column contents are never displayed.
- Matching, for each counted order:
  1. the exact order number, if that column is mapped;
  2. otherwise, including when a mapped number is not found: the same normalized email, calendar date and total in cents.
- If more than one candidate could match, in either direction, the order is "ambiguous" and nothing is matched.
- For matched orders that started on `/product/<slug>/`, the slug is compared with the purchased product names or slugs.
  Both are lowercased, stripped of accents and punctuation, and hyphenated. The result shows on Entry points as "Landed
  on a product they bought", "Landed on a different product" or "Couldn't check", labelled "Based on product name
  matching".

## Exports

- `journey-decisions.json`: counted statuses, report filters, repeat-customer definition, the cart/checkout/account
  label, Order Detail fields, notes, the effective entry rules, the data rules above, and aggregate figures (row count,
  date range, orders by status, net sales, customers, first and repeat counts, orders by entry group, Data check counts).
  Filters do not affect it.
- `entry_page_rules.csv`: columns `segment,entry_group`. Besides one row per rule, three marker rows describe the fixed
  rules: `(blank entry page)`, `(no path)` and `(anything else)`.

## Tests

- **Unit tests** (`src/lib/*.test.ts`, Vitest): small hand-built datasets with hand-calculated answers for every parsing,
  calculation, entry-page, matching and export rule, including edge cases. `fixture.test.ts` checks that the synthetic
  fixture contains every required edge case.
- **Smoke test** (`e2e/smoke.spec.ts`, Playwright): opens `dist/index.html` via `file://`, checks the missing-column
  error, uploads the fixture and the items fixture, maps the items columns, and visits every tab, opening every
  expandable note. It checks keyboard tab navigation, filters, a rule edit, both downloads, and that there is no
  horizontal scrolling at 768 px. It asserts no `http`/`https` requests, no console errors, no email address or other
  fixture personal data in the page text, empty localStorage, sessionStorage and cookies, and no fixture data in the
  build.

### Browsers

- Chromium and Firefox always run.
- **WebKit (Safari's engine)** is skipped automatically on macOS 14 and older. On those systems Playwright ships only a
  frozen WebKit build that current Playwright versions cannot drive. On macOS 15+ and Linux it runs. Set
  `SMOKE_WEBKIT=1` to force it.
- Installed branded browsers can be added: `SMOKE_BRANDED=chrome,msedge npm run test:smoke`.

## Fixtures

`scripts/make-fixture.ts` writes `fixtures/synthetic-orders.csv` (500 invented orders: example.com emails, made-up
places) and `fixtures/synthetic-order-items.csv` (an items file with invented column names). The orders fixture
includes all five statuses plus one unknown status; two- and three-part repeated values; differing repeated page counts;
ISO session times in repeated cells; a fully blank attribution row; a row with a source but no entry page; emails that
differ only by case or spaces; two same-minute orders from one customer whose IDs sort differently as text and as
numbers; full and partial refunds; an order over 200 pages; and a session gap over one day. It also includes one
unreadable date and one duplicated Order ID, so those Data check counts are not always zero. The output is
deterministic, using a seeded random generator.

## Project layout

```
config/csp.ts            production Content Security Policy
index.html               page shell
src/lib/                 pure calculation modules and their unit tests
src/components/          upload, tabs, filters, charts, shared UI
src/screens/             one file per tab, plus the items-file panel
src/App.tsx              state, derived data, layout
scripts/make-fixture.ts  synthetic fixture generator
fixtures/                synthetic CSVs (the only CSVs git will accept)
e2e/smoke.spec.ts        Playwright smoke test
```
