# Ledger

Recurring cost tracker. All amounts are integer minor units (cents). All dates are calendar strings (`YYYY-MM-DD`), never instants.

## Commands

- `npm run check` — the single gate: runs token lint then the test suite. Must pass before any change is considered done.
- `npm test` — `node --test` (Node built-in test runner).
- `npm run test:watch` — same, with file watching.
- `npm run lint:tokens` — checks `app.css` for raw colours and unapproved pixel values.
- `npm start` — Express server (`server.js`).
- `npm run start:static` — static file server on port 8080.

## Architecture

```
engine.js        Pure calculation engine. No DOM, no system clock, no imports from ui.js.
engine.test.js   Tests named after PRD rule IDs (BR-01, FR-10, NFR-04, etc.).
fixture.js       Sample dataset. Also the test fixture. Exports FIXTURE, EDGE, TODAY.
ui.js            DOM layer. Reads from Engine and FIXTURE/TODAY on window.
tokens.css       Design tokens (colours, spacing, radii, type scale).
app.css          Component styles. Must use tokens only — no raw colours or px outside the allowlist.
lint-tokens.js   Enforces the token contract on app.css.
index.html       Entry point. Loads engine, fixture, tokens, app.css, ui.js.
server.js        Express server.
```

## Engine rules

1. **No system clock.** `today` is always a parameter. `Date.now()` and `new Date()` with no args are banned. `new Date(year, monthIndex, day)` is fine for deterministic arithmetic. (NFR-04)
2. **No DOM.** Engine must never import from `ui.js` or touch the DOM.
3. **Integer minor units.** Money is cents end-to-end. Round only at display time. (BR-15)
4. **Calendar dates.** Dates are `YYYY-MM-DD` strings, never Date objects or timestamps. (BR-05)

## Key domain concepts

- **Commitment**: a recurring charge (rent, subscription, insurance).
- **Phase**: a time-bounded segment of a commitment with its own amount, cycle, and dates. Commitments have one or more contiguous, non-overlapping phases.
- **Cycle types**: `monthly`, `yearly`, `weekly`, `oneOff`, `quarterly`.
- **Anchor**: the day-of-month (monthly) or month+day (yearly) from a phase's `startDate`. Monthly anchors clamp to month-end but never drift. Yearly Feb 29 anchors clamp to Feb 28 in non-leap years.
- **Status**: derived from phase data + today, never stored independently. One of `active`, `trial`, `pending`, `fixedTerm`, `cancelled`.

## Workflow

Pick one failing test, implement until it passes, keep the rest of the suite green, move on. Run `npm run check` after every change.

## Style

- Token lint enforces that `app.css` uses only design tokens from `tokens.css`. Allowed raw px values are in the allowlist in `lint-tokens.js`.
- No colours in component CSS — use `var(--token-name)` from `tokens.css`.
