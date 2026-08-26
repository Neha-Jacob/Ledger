# Ledger

A local-first recurring cost tracker for bills, subscriptions and trials, with a
persistent SQLite backend, a REST API, and a dependency-free vanilla JS frontend.

Full requirements and rationale live in [PRD.md](./PRD.md). This document is the map:
what the app does, how it is built, and where everything lives.

---

## Quick start

**Prerequisites:** Node 22.5+ (needed for `node:sqlite`).

```bash
npm install
npm start
```

Open `http://localhost:3000`. A fresh database starts empty. Use the
“Load sample data” action on the empty state if you want to explore the app
with example commitments.

Prefer containers?

```bash
docker compose up
```

See [§9 Running it](#9-running-it) below for the static, no-backend mode and
the full command reference.

---

## 1. What it does

Ledger answers one question truthfully: **what am I actually committed to
paying, and when?**

You enter every recurring commitment once, rent, insurance, a transit pass,
a streaming subscription, a free trial, and the app projects charges
forward, normalises every billing cycle to a common monthly/annual figure,
and surfaces upcoming price changes before they hit you.

## 2. The problem

Recurring spend is invisible by design: each charge is small enough to
ignore individually, and they land on different days throughout the month.
Four specific failures follow:

| Failure | What happens | Cost to the user |
|---|---|---|
| **Trial amnesia** | A free trial converts to paid on a forgotten date. | Pays for months of a service they didn't mean to keep. |
| **Annual blindness** | A yearly plan is remembered as a one-off, not ongoing cost. | Understates true monthly spend, often significantly. |
| **Silent increases** | Rent, insurance and tool pricing rise without notice. | Baseline creeps up with no decision point. |
| **No exit picture** | Unclear which commitments can be cancelled today vs. are locked into a fixed term. | Can't act on the information even when they have it. |

Bank aggregators show what already happened. A spreadsheet shows what you
remembered to type. Neither projects forward from the *structure* of a
commitment, which is where trials and price steps actually live.

## 3. How it solves each problem

The whole design rests on one modelling decision: **a commitment is a
timeline of phases, not a single price.**

| Problem | Mechanism |
|---|---|
| Trial amnesia | A trial is a phase with amount `0`, followed automatically by the paying phase. The conversion date is derived, never a field you can forget to set. |
| Annual blindness | Every cycle (weekly/monthly/quarterly/yearly) is normalised to a monthly and annual equivalent, so a €216/year renewal and a €18/month subscription are directly comparable. |
| Silent increases | A price rise is just a new phase. `upcomingIncreases` scans every commitment for a phase transition within N days and surfaces it as a dashboard warning; trials and price rises are the same mechanism. |
| No exit picture | `residualObligation` sums what you'd still owe across every *non-cancellable* fixed-term commitment if you cancelled everything cancellable today. |

Because trials, discounts and price rises are all "just another phase,"
there is exactly one calculation path (`Engine.chargesInRange` and friends)
instead of special-cased logic per scenario. See [PRD.md §5](./PRD.md) for the full
worked example and the three independent axes of variation (amount
stability, billing start, termination).

## 4. Use cases

| # | Use case | Requirement(s) |
|---|---|---|
| UC1 | Add a commitment with a name, category and first phase | FR-01 |
| UC2 | Add a phase to record a price increase or plan change | FR-02, FR-03 |
| UC3 | Create a commitment that starts as a free trial | FR-04 |
| UC4 | Cancel a commitment, excluding future charges | FR-06 |
| UC5 | View the dashboard: monthly/annual total, category breakdown, upcoming increases | FR-19, FR-20 |
| UC6 | Browse all commitments, filtered by category/status | FR-21 |
| UC7 | Inspect one commitment's full phase timeline | FR-22 |
| UC8 | View a calendar of projected charges for a month | FR-23 |
| UC9 | See the residual obligation if everything cancellable were cancelled today | FR-17 |
| UC10 | Export all data to JSON, and re-import it elsewhere | FR-26, FR-27 |

## 5. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Calculation engine | Vanilla JS, zero dependencies | Pure functions over dates/money must be deterministic and framework-agnostic. |
| Frontend | Vanilla JS + plain CSS custom properties (no framework, no preprocessor) | Keeps the UI a thin, disposable consumer of `Engine`. |
| Backend | [Express](https://expressjs.com/) | Minimal REST layer over the engine and storage. |
| Persistence | `node:sqlite` (Node's built-in `DatabaseSync`) | Zero external DB dependency; requires **Node 22.5+**. |
| Testing | `node:test` (built-in test runner) | No test framework dependency; `npm test` is all you need. |
| Styling contract | `lint-tokens.js` | Fails the build on any raw colour/pixel value outside `tokens.css`. |
| Containerisation | Docker + Docker Compose | `Dockerfile` + `docker-compose.yml`, SQLite file on a named volume. |

No frontend build step, no bundler, no ORM. `npm install` only pulls in
Express and its transitive dependencies.

## 6. Flow of each use case

**UC1/UC2/UC3, creating and evolving a commitment**
`ui.js` form calls `POST /api/commitments` (or `PUT .../:id` to add a phase),
`server.js` validates name/phases and writes `commitments` + `phases` rows,
the next dashboard load re-reads via `GET /api/commitments` and `Engine`
recomputes everything from the raw phase list. Nothing about "is this a
trial" is stored; it falls out of `Engine.statusOf` and
`Engine.trialConversionDate` at read time.

**UC4, cancelling**
`PATCH /api/commitments/:id/cancel` sets `status='cancelled'` and
`cancelledDate`. `Engine.chargesInRange` and `Engine.normalisedMonthly`
both check `cancelledDate` so no charge after that date is ever projected
again, without deleting history.

**UC5/UC6/UC7/UC8, reading data**
On load, `ui.js` calls `GET /api/commitments` once (today's date, settings
and all commitments together), then renders every screen (dashboard, list,
detail, calendar, settings) entirely client-side by calling pure `Engine`
functions against that same snapshot. No per-screen API calls.

**UC9, residual obligation**
Computed client-side by `Engine.residualObligation` over the same snapshot:
for every commitment where `cancellable === false` and not already
cancelled, sum the remaining charges up to its fixed-term end date.

**UC10, export/import**
`GET /api/export` streams the full dataset as JSON (same shape as
`seed.json`). `POST /api/import` replaces all `commitments`/`phases` rows
and re-applies `settings` in one delete-then-insert sequence.

## 7. Architecture

### 7.1 High-level design

```
┌─────────────┐   HTTP/JSON    ┌──────────────┐   node:sqlite   ┌─────────────┐
│   ui.js     │ ─────────────► │  server.js   │ ───────────────►│ ledger.db   │
│ (browser)   │ ◄───────────── │  (Express)   │ ◄─────────────  │ (SQLite)    │
└──────┬──────┘   commitments  └──────┬───────┘                 └─────────────┘
       │          + settings          │
       ▼                              ▼
┌─────────────┐               (no business logic,
│  engine.js  │                pure passthrough/CRUD)
│(pure funcs, │
│ runs in the │
│ browser too)│
└─────────────┘
```

Key decision: **the calculation engine runs client-side.** `server.js` is a
thin persistence layer (CRUD + JSON export/import); it stores raw
commitments and phases and does no date/money arithmetic. `engine.js` is
loaded by both the browser (`window.Engine`) and the test suite
(`module.exports`), so the one file is the single source of business logic
and is fully unit-tested in isolation from Express and SQLite.

### 7.2 Low-level design

- **Data model**: `Commitment` (identity, status, `anchorDate`,
  `cancellable`/`cancelledDate`) has an ordered, non-overlapping,
  contiguous list of `Phase` (start/end date, integer minor-unit amount,
  currency, cycle, `isEstimate`). See [PRD.md §6](./PRD.md) for full field tables.
- **Three invariants enforced throughout:** money is always an integer
  (minor units, rounded only at display), charge dates are always derived
  (never stored), and price (`phases`) is strictly separate from schedule
  (`anchorDate`), so a price rise never moves your billing date (BR-19).
- **`engine.js` public surface** (`Engine` object): `nextChargeDate`,
  `chargeDatesInRange`, `phaseAt`, `validatePhases`, `trialConversionDate`,
  `statusOf`, `normalisedMonthly`, `normalisedAnnual`, `monthlyTotal`,
  `committedTotalForMonth`, `byCategory`, `upcomingIncreases`,
  `residualObligation`, `convert`, `chargesInRange`, `nextDueFor`. Every
  function is pure: no system clock access, no DOM, `today` always passed
  in (NFR-04).
- **`server.js` REST surface:**

  | Method | Path | Purpose |
  |---|---|---|
  | GET | `/api/today` | Server's current date (ISO). |
  | GET | `/api/commitments` | All commitments + settings + today, in one payload. |
  | GET | `/api/commitments/:id` | One commitment. |
  | POST | `/api/commitments` | Create. |
  | PUT | `/api/commitments/:id` | Update (fields + full phase replace). |
  | DELETE | `/api/commitments/:id` | Delete. |
  | PATCH | `/api/commitments/:id/cancel` | Cancel with an effective date. |
  | GET / PUT | `/api/settings` | Display currency + conversion rates. |
  | GET | `/api/export` | Full dataset as downloadable JSON. |
  | POST | `/api/import` | Replace all data from an uploaded JSON file. |
  | DELETE | `/api/data` | Wipe all commitments/phases. |
- **Storage schema**: three tables, `commitments`, `phases` (FK to
  `commitments`, `ON DELETE CASCADE`), `settings` (key/value). New databases
  start with no commitments; sample data can be loaded explicitly from the UI.

## 8. Codebase tree

```
Ledger/
├── server.js           REST API + SQLite persistence (Express, node:sqlite)
├── engine.js            Pure calculation engine: dates, phases, money, projections
├── engine.test.js        Unit tests, one per business rule (BR-xx/FR-xx) in the PRD
├── integration.test.js   End-to-end scenarios across multiple Engine functions at once
├── ui.js                 Frontend: renders all screens, calls Engine, talks to the API
├── index.html            App shell / entry point
├── app.css               Component styles, every value must come from tokens.css
├── tokens.css            Design tokens (colour, spacing, type) for light + dark themes
├── lint-tokens.js        Fails the build if app.css uses a raw colour/pixel value
├── fixture.js            Realistic sample dataset also used as a test fixture
├── seed.json             Optional sample data loaded explicitly from the UI
├── package.json          Scripts and the single runtime dependency (Express)
├── Dockerfile            Container image definition (Node 22 slim + Express)
├── docker-compose.yml    Runs the container with a persistent SQLite volume
├── PRD.md                Full product/engineering spec, the source of truth for rules
└── README.md             This file
```

## 9. Running it

```bash
npm install
npm start              # http://localhost:3000, SQLite-backed
npm run start:static   # static file server, no backend (open index.html works too)

npm test               # node:test, engine + integration tests
npm run lint:tokens    # fails on any raw colour/pixel value in app.css
npm run check          # both of the above

# or, containerised:
docker compose up
```

Requires **Node 22.5+** (for `node:sqlite`) to run the server; the static
frontend and test suite work on any Node 18+.

## 10. Current status

| Check | Command | Status |
|---|---|---|
| Engine + integration tests | `npm test` | Passing, 33/33 |
| Token lint | `npm run lint:tokens` | Currently failing. `app.css` has crept away from `tokens.css` (a `box-shadow`, a couple of raw pixel widths, and one raw `#fff` colour). Needs a token added or the value replaced before `npm run check` is clean. |

The recurrence engine, phase resolution, money normalisation, and
REST/SQLite persistence layer described above are implemented, not
stubbed. The remaining outstanding work is bringing `app.css` back into
compliance with the token contract in [PRD.md §10](./PRD.md).

## 11. What is not covered / restrictions

Deliberately out of scope for this version (see [PRD.md §4.3](./PRD.md) for the full
list and rationale):

- No bank or open-banking connections of any kind. Entry is manual only.
- No accounts, login, sync, or multi-device support. Single SQLite file, single user.
- No push notifications or email reminders. Increases only surface in-app.
- No shared/household budgets with multiple people.
- No live currency exchange rate lookup. Conversion rates are user-entered and static.
- No machine learning, model-based categorisation, or natural language input.

Known incompleteness / open design questions (see [PRD.md §12.1](./PRD.md)):

- Whether a cancelled commitment should retain its phase history for a
  spend retrospective, or be excluded from all views, is still undecided.
- Whether variable/estimated amounts should store historical actuals or
  only the current estimate is still undecided.
- Import validation is best-effort (FR-28, "Should" priority). A malformed
  file can currently fail without a per-record error report.
- No automated schema/contiguity validation is enforced at the API layer
  beyond what `server.js` checks inline; `server.js` never imports
  `engine.js`, so `Engine.validatePhases` exists but is not called on any
  write path. The API will store an invalid phase list if asked to.
