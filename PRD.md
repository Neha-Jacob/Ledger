# Ledger

**A recurring cost tracker for bills, subscriptions and trials**

Version 1.1 · 25 August 2026 · Status: in build

Secondary purpose: a practice vehicle for agentic development workflows.

---

## Changelog

**v1.1 (25 Aug 2026)** — reconciled with the working prototype.

- Design system moved from Figma to `tokens.css`. Section 10 rewritten, NFR-07 updated to a machine-checked rule.
- Build order corrected: the UI layer is complete; stages 1 to 5 remain. Section 11.2 rewritten.
- Stack settled in section 11.3. No dependencies, `node:test`, plain CSS custom properties.
- DoD-03 now points at `fixture.js` rather than a prose example, so it stays true as the fixture grows.
- Worked example in 5.2 replaced with the real fixture and its real figures.
- **BR-19 and BR-20 added.** The billing anchor is now independent of phase boundaries. This resolves the open question about whether a price rise moves your billing date. It does not.
- `anchorDate` added to Commitment. `startDate` on Phase is now a boundary only, not an anchor.
- `cancelledDate` added to Commitment, which the fixture already used.

---

## 1. How to read this document

This document has two audiences and it serves both in one pass.

- **If you are here to build the product:** read sections 2 to 9. They describe what the app is, who it is for, how the data is shaped, and exactly what it must do.
- **If you are here for the practice value:** read sections 10 to 12 as well. They describe how the work is broken down for agent driven development and how the design system constrains the build.

Every requirement has an ID, for example FR-14. Use those IDs in tickets, commit messages and test names so that a change can always be traced back to the line that asked for it. The test suite in `engine.test.js` already follows this convention.

### 1.1 Glossary

Five terms carry most of the meaning in this document. Everything else follows from them.

| Term | Meaning |
|---|---|
| **Commitment** | Any recurring money obligation the user tracks. Rent, an insurance policy, a transit pass and a streaming subscription are all commitments. The app does not distinguish between bills and subscriptions structurally. |
| **Phase** | A period during which a commitment costs a single fixed amount on a single fixed cycle. A commitment is an ordered list of one or more phases. A free trial is simply a phase where the amount is zero. |
| **Cycle** | How often a charge repeats: weekly, monthly, quarterly, yearly, or one off. |
| **Anchor date** | The date the billing schedule is calculated from. It belongs to the commitment, not to a phase. All future charge dates derive from the anchor and the cycle. Charge dates are never stored. |
| **Phase boundary** | The date one phase ends and the next begins. A boundary changes the price, not the schedule. This distinction is the substance of BR-19. |

---

## 2. Objective

Build a local first application that gives a person a single truthful answer to the question: what am I actually committed to paying, and when?

Truthful is the operative word. Most people can list their subscriptions. Very few can state their real monthly outflow, because annual plans are mentally discounted, trials are forgotten until the charge lands, and price increases are absorbed without notice. The app exists to remove that gap.

### 2.1 Secondary objective

The project is deliberately chosen as a practice ground for agentic development. The core logic is date and money arithmetic, which is fully deterministic. Correctness can be asserted by an automated test suite rather than by human judgement, so an agent can be given a failing test and left to iterate until it passes. The test suite is the acceptance gate.

No machine learning, no natural language features, no model evaluation. Every output of this system is either right or wrong and can be checked against an expected value.

---

## 3. Problem statement

Recurring spend is invisible by design. Each individual commitment is small enough to ignore and the charges are spread across the month, so no single moment forces a reckoning. Four specific failures follow.

| Failure | What happens | Cost to the user |
|---|---|---|
| **Trial amnesia** | A free trial converts to a paid plan on a date the user has forgotten. | Pays for months of a service they decided not to keep. |
| **Annual blindness** | A yearly plan is remembered as a single past event, not as ongoing cost. | Understates true monthly spend, often by a wide margin. |
| **Silent increases** | Rent, insurance and tool pricing rise without the user restating their budget. | Baseline creeps upward with no decision point. |
| **No exit picture** | The user cannot tell which commitments they could cancel today and which are locked into a fixed term. | Cannot act on the information even when they have it. |

Existing tools solve the wrong half of this. Bank aggregators show what already happened. A spreadsheet shows what you remembered to type. Neither one projects forward from the structure of the commitment itself, which is where trials and price steps live.

---

## 4. Target user and scope

### 4.1 Primary user

An individual who manages their own recurring costs and holds somewhere between ten and forty commitments across housing, insurance, transport, utilities and digital services. They are willing to enter data once and keep it current, in exchange for a forward looking picture their bank cannot give them.

### 4.2 In scope for version 1

- Manual entry and editing of commitments, including multi phase pricing
- Trials and delayed billing start dates
- Fixed term contracts with an end date and a minimum commitment
- Forward projection of charges across any date range
- Monthly and annual normalised spend totals, overall and by category
- Upcoming charge alerts, with trial conversions treated as the highest priority signal
- Multi currency storage with a user maintained conversion rate
- Local persistence with no account and no server
- Full export and import of all data as JSON

### 4.3 Explicitly out of scope for version 1

Listing these matters as much as listing the features, because scope creep is what kills a practice project.

- Bank or open banking connections of any kind
- Accounts, login, sync or multi device support
- Push notifications or email reminders
- Shared or household budgets with multiple people
- Live currency exchange rate lookup
- Any machine learning, categorisation by model, or natural language input

---

## 5. Solution overview

The whole design rests on one modelling decision, and it is worth stating plainly before any requirement.

### 5.1 The central idea: a commitment is a timeline, not a price

The obvious model is to store a commitment with an amount and a billing cycle. That model breaks the moment a trial, an introductory offer or a price increase appears, and every workaround from that point onward is a patch.

Instead, a commitment stores an **ordered list of phases**. Each phase has a start date, an amount and a cycle. The amount may be zero. Three different real world situations then collapse into one mechanism:

- **A free trial** is a phase with an amount of zero, followed by a phase with the real price.
- **An introductory offer** is a phase at the discounted price, followed by a phase at the standard price.
- **A price increase** is the current phase given an end date, followed by a new phase at the new amount.

Because all three are the same structure, every calculation in the application becomes one pure function: given a list of phases and a date range, produce the charges that fall inside it. Trials are not a special case anywhere in the codebase. That is what makes the logic small enough to test exhaustively and clean enough to hand to an agent.

### 5.2 Worked example

The dataset in `fixture.js`, which doubles as the test fixture. Amounts shown in major units for readability; they are stored as integer minor units.

```
Rent                          housing        anchor 2024-03-01
  phase 1   2024-03-01 → 2026-06-30   EUR 820.00   monthly
  phase 2   2026-07-01 → open         EUR 865.00   monthly   (increase)

Health insurance              insurance      anchor 2023-01-03
  phase 1   2023-01-03 → open         EUR 143.00   monthly

Deutschlandticket             transport      anchor 2026-01-01
  phase 1   2026-01-01 → 2026-12-31   EUR  58.00   monthly   (fixed term, not cancellable)

Mobile plan                   utilities      anchor 2022-05-10
  phase 1   2022-05-10 → open         EUR  24.50   monthly   (estimate)

Spotify Premium               entertainment  anchor 2026-06-15
  phase 1   2026-06-15 → 2026-09-14   EUR   0.00   monthly   (trial)
  phase 2   2026-09-15 → open         EUR  10.99   monthly

Netflix                       entertainment  anchor 2025-02-28
  phase 1   2025-02-28 → open         EUR  17.99   monthly

Design tools                  tools          anchor 2024-09-12
  phase 1   2024-09-12 → 2026-08-31   EUR  51.00   monthly
  phase 2   2026-09-01 → open         EUR  56.00   monthly   (increase)

Domain renewal                tools          anchor 2025-03-04
  phase 1   2025-03-04 → open         EUR  18.00   yearly

Gym membership                health         cancelled 2026-08-01
  phase 1   2024-06-01 → open         EUR  29.00   monthly
```

With today set to 25 August 2026, the application must derive all of the following from that data alone:

| Figure | Value | Requirement |
|---|---|---|
| Normalised monthly total | €1,160.99 | FR-11 |
| Normalised annual total | €13,931.88 | FR-12 |
| Actual charges in August 2026 | €1,159.49 across 6 charges | FR-10 |
| Committed total for September 2026 | €1,176.98 | FR-14 |
| Residual obligation if cancelled today | €232.00 | FR-17 |
| Increases within 30 days | Design tools 1 Sep, Spotify 15 Sep | FR-16 |
| Next charge for Design tools | **12 Sep, not 1 Sep** | BR-19 |

That last row is the one worth staring at. The price rises on 1 September but the billing date stays the 12th, because a phase boundary changes what you pay and not when you pay it.

### 5.3 What the three axes of variation actually are

A commitment varies on three independent axes. They are independent, which is why they must not be modelled as three separate types of object.

| Axis | Values | Where it lives in the model |
|---|---|---|
| Amount stability | Fixed, or variable per cycle | Phase amount, plus an `isEstimate` flag |
| Billing start | Immediate, after a trial, or on a future date | Commitment `anchorDate`, plus the first non-zero phase |
| Termination | Open ended, or fixed term with an end date | End date of the final phase, plus a `cancellable` flag |

Rent is fixed, immediate and open ended. Spotify is fixed, delayed and open ended. A twelve month transit pass is fixed, immediate and fixed term. All three are the same object with different values.

---

## 6. Data model

### 6.1 Commitment

| Field | Type | Notes |
|---|---|---|
| `id` | string | Generated locally, stable for the life of the record |
| `name` | string | Required, 1 to 60 characters |
| `category` | enum | housing, insurance, transport, utilities, entertainment, tools, health, other |
| `provider` | string | Optional, free text |
| `status` | enum | active, cancelled, ended |
| `anchorDate` | date | **New in v1.1.** The billing schedule origin. Defaults to the first phase's start date. Not changed by adding a phase. See BR-19. |
| `cancellable` | boolean | False for fixed term contracts inside their minimum period |
| `cancelledDate` | date or null | **New in v1.1.** Set when status becomes cancelled. Charges after this date are excluded. |
| `notes` | string | Optional, free text |
| `phases` | Phase[] | Ordered, at least one, non overlapping, contiguous |
| `createdAt` | date | Set once |
| `updatedAt` | date | Set on every write |

### 6.2 Phase

| Field | Type | Notes |
|---|---|---|
| `id` | string | Generated locally |
| `startDate` | date | **Changed in v1.1.** A boundary, not an anchor. Marks where this price takes effect. |
| `endDate` | date or null | Null means open ended. Only the last phase may be null. |
| `amount` | integer | Minor units, never a float. Zero is valid and denotes a trial. |
| `currency` | string | ISO 4217 code, for example EUR |
| `cycle` | enum | weekly, monthly, quarterly, yearly, oneOff |
| `isEstimate` | boolean | True for variable amounts such as a metered utility |
| `label` | string | Optional, for example trial or increase. Display only, carries no logic. |

### 6.3 Three rules that must never be broken

**Money is stored as integers.** Amounts are held in minor units, so €10.99 is stored as `1099`. Floating point arithmetic on currency produces rounding errors that surface only in aggregate totals, which is exactly where this application does its work.

**Charge dates are derived, never stored.** There is no `nextChargeDate` field on any record. The next charge is always computed from the anchor date and the cycle at read time. Storing it invites stale data that hides bugs in the recurrence logic, and the recurrence logic is the part most worth getting right.

**Price and schedule are separate concerns.** The phase list answers "how much." The anchor date answers "when." Conflating them is the single most tempting simplification in this model and it is wrong. See BR-19.

---

## 7. Functional requirements

### 7.1 Managing commitments

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | The user can create a commitment with a name, category and one initial phase. | Must |
| FR-02 | The user can add a phase to an existing commitment, specifying its start date, amount, currency and cycle. | Must |
| FR-03 | When a phase is added, the previous phase automatically ends on the day before the new phase begins. The user never enters an end date manually for a superseded phase. | Must |
| FR-04 | The user can create a commitment with a trial by entering a zero amount first phase and a trial end date. The system creates the paying phase automatically at that date. | Must |
| FR-05 | The user can edit any field of any phase, including historical phases. | Must |
| FR-06 | The user can mark a commitment as cancelled, with an effective date. Charges after that date are excluded from all projections. | Must |
| FR-07 | The user can delete a commitment entirely, with a confirmation step. | Must |
| FR-08 | The user can mark a commitment as not cancellable and record the date its minimum term ends. | Should |
| FR-09 | The user can duplicate an existing commitment as the starting point for a new one. | Could |

### 7.2 Projection and calculation

| ID | Requirement | Priority |
|---|---|---|
| FR-10 | The system produces every charge falling within an arbitrary date range, across all active commitments, with the correct amount for the phase in force on each charge date. | Must |
| FR-11 | The system produces a normalised monthly figure, converting every cycle to its monthly equivalent. Yearly divides by twelve, weekly multiplies by fifty two and divides by twelve, quarterly divides by three. | Must |
| FR-12 | The system produces a normalised annual figure using the same conversion in reverse. | Must |
| FR-13 | Normalised figures exclude zero amount phases, so a commitment currently in trial contributes nothing until its paying phase begins. | Must |
| FR-14 | The system produces the committed total for any named future month, reflecting phase transitions that occur within it. | Must |
| FR-15 | The system produces a breakdown of normalised monthly spend by category. | Must |
| FR-16 | The system identifies every commitment whose amount increases within the next thirty days, which includes all trial conversions and all scheduled price rises. | Must |
| FR-17 | The system produces the residual obligation figure: the total the user would still be liable for if every cancellable commitment were cancelled today. | Should |
| FR-18 | Amounts in a currency other than the display currency are converted using a single user maintained rate per currency pair. The rate is stored, not fetched. | Should |

### 7.3 Presentation

*Status: complete. Implemented in `ui.js`.*

| ID | Requirement | Priority |
|---|---|---|
| FR-19 | A dashboard shows the normalised monthly total, the annual total, the residual obligation, and the category breakdown. | Must |
| FR-20 | A warning strip on the dashboard lists every upcoming amount increase from FR-16, ordered by date, and is visually distinct from the rest of the dashboard. | Must |
| FR-21 | A list view shows all commitments with name, category, current amount, cycle and next charge date, sorted by next charge by default, filterable by category and status. | Must |
| FR-22 | A commitment detail view shows the full phase timeline, past, present and future, with the current phase clearly marked. | Must |
| FR-23 | A calendar view shows projected charges across a selected month, with a month total in the header. | Should |
| FR-24 | Commitments currently in a zero amount phase are visually marked as in trial wherever they appear. | Must |

### 7.4 Data handling

| ID | Requirement | Priority |
|---|---|---|
| FR-25 | All data persists locally and survives a browser restart or an application relaunch. | Must |
| FR-26 | The user can export all data as a single JSON file. | Must |
| FR-27 | The user can import a previously exported JSON file, choosing to replace or to merge. | Should |
| FR-28 | Import validates the file against the schema and reports errors per record rather than failing the whole file silently. | Should |

---

## 8. Business rules and edge cases

This section is the real specification. Each rule has at least one test in `engine.test.js` named after its ID. Write the test first, then implement.

### 8.1 Recurrence arithmetic

| ID | Rule |
|---|---|
| BR-01 | A monthly cycle anchored on the 31st charges on the last day of any month with fewer than 31 days. The anchor does not drift: after charging on 28 February it returns to the 31st in March. |
| BR-02 | A yearly cycle anchored on 29 February charges on 28 February in non leap years, and returns to the 29th in the next leap year. |
| BR-03 | A weekly cycle charges on the same weekday as the anchor, with no month end adjustment. |
| BR-04 | A one off cycle produces exactly one charge, on the anchor date, and never appears in normalised monthly or annual totals. |
| BR-05 | All date arithmetic is performed on calendar dates. A charge date is a calendar date, not an instant, and must not shift when the timezone offset changes. |

### 8.2 Phase transitions

| ID | Rule |
|---|---|
| BR-06 | Phases within a commitment must be contiguous and must not overlap. The end of phase *n* is the day before the start of phase *n+1*. |
| BR-07 | Only the final phase may have a null end date. Any other null end date is a validation error. |
| BR-08 | When a charge date falls exactly on a phase boundary, the charge belongs to the phase that begins on that date, not the one that ends the day before. |
| BR-09 | A phase shorter than its own cycle produces no charge unless a scheduled charge date falls within it. A one month trial on a yearly cycle therefore produces zero charges. |
| BR-10 | Editing a phase start date must re validate contiguity with its neighbours and reject the edit if it would create a gap or an overlap. |
| **BR-19** | **A phase boundary changes the amount, not the schedule.** The billing schedule derives from the commitment's `anchorDate` and the cycle in force, never from a phase start date. Design tools has an anchor of the 12th and a phase beginning 1 September; its next charge after 25 August is 12 September at the new amount, not 1 September. |
| **BR-20** | **A cycle change resets the anchor.** If a new phase specifies a different cycle from the phase before it, the commitment's effective anchor becomes that phase's start date from that point forward. A monthly plan switching to yearly on 1 March bills annually on 1 March. |

### 8.3 Trials and delayed starts

| ID | Rule |
|---|---|
| BR-11 | A commitment in a zero amount phase counts as active but contributes zero to every spend total. |
| BR-12 | The trial conversion date is the start date of the first phase with a non zero amount. It is derived, never stored as its own field. |
| BR-13 | A commitment whose first phase begins in the future is active and pending, appears in the list view, and contributes to future month totals but not to the current month. |
| BR-14 | Cancelling a commitment during a trial sets its status to cancelled and produces no charges at all, historical or projected. |

### 8.4 Money

| ID | Rule |
|---|---|
| BR-15 | Normalisation rounds only at the point of display. Intermediate arithmetic retains full integer precision in minor units. |
| BR-16 | A category breakdown must sum to the overall normalised total exactly, with any rounding remainder assigned to the largest category rather than dropped. |
| BR-17 | Currency conversion applies the stored rate at display time. Stored amounts are never rewritten in a different currency. |
| BR-18 | An estimated amount is included in totals but flagged, so a total containing estimates is labelled as approximate. |

---

## 9. Non functional requirements

| ID | Requirement |
|---|---|
| NFR-01 | No network request is required for any core function. The application works fully offline. |
| NFR-02 | No personal data leaves the device. There is no telemetry and no analytics. |
| NFR-03 | Projecting twelve months of charges across two hundred commitments completes in under one hundred milliseconds. |
| NFR-04 | All calculation logic sits in a pure module with no dependency on the UI, storage layer or system clock. The current date is always passed in as a parameter. Enforced by a test that greps `engine.js` for clock access. |
| NFR-05 | Test coverage of `engine.js` is complete for every rule in section 8. Coverage of the UI layer is not required. |
| NFR-06 | The interface is usable at 360 pixels wide, respects `prefers-reduced-motion`, and meets WCAG AA contrast in both themes. |
| NFR-07 | **Revised in v1.1.** Every visual value in a component originates from a token in `tokens.css`. No raw colour or unapproved pixel value appears in `app.css`. Enforced by `npm run lint:tokens`, which fails the build. |

NFR-04 deserves emphasis. Passing the current date in as a parameter rather than reading the system clock is what makes the entire test suite deterministic, and a deterministic test suite is the precondition for handing work to an agent.

---

## 10. Design system

*Revised in v1.1. The original section specified a Figma file. The design system is now code.*

### 10.1 Source of truth

`tokens.css` holds every visual value as a CSS custom property, with a light theme on `:root` and a dark theme under `[data-theme="dark"]`. Nothing else may define a colour, a spacing value, a radius, or a type size.

Token groups: surfaces, text, roles (accent, warning, danger), categories, spacing, radius, layout widths, type, motion.

### 10.2 The contract

`lint-tokens.js` scans `app.css` and fails on any raw hex colour or any pixel value not on the approved exemption list. The exemptions are 1px hairlines, a few sub-token nudges, and the single media breakpoint, each of which is documented in the file.

This replaces the Figma token audit from v1.0 and is strictly stronger, because it runs in CI rather than depending on a designer noticing.

### 10.3 Components

Implemented as CSS classes with modifier classes standing in for Figma variants.

| Component | Variants |
|---|---|
| Button | primary, secondary, ghost, destructive, each with hover, active, focus |
| Input | default, focused, error (`aria-invalid`), disabled |
| Commitment row | normal, rising, cancelled, plus badge slots |
| Status badge | trial (hatched), pending (dotted), fixed term (bracket), cancelled (strikethrough) |
| Phase timeline segment | past, current, future, zero |
| Summary tile | with comparison figure, without |
| Warning strip | one item, several, hidden when empty |
| Empty state | no data, no filter results |

### 10.4 Visual rules the lint cannot catch

Keep these when extending the interface. They are what makes it read as a ledger rather than a budgeting app.

- Every amount and date uses `--font-data` with tabular figures. Money is monospaced.
- Never colour an amount red. Red is reserved for destructive actions and validation errors.
- Amber means exactly one thing: this is about to change price. It appears nowhere else.
- No state is encoded by colour alone. Every state carries a shape or texture as well.
- Dates within thirty days show relative and absolute together. Beyond thirty days, absolute only.
- Hairline borders, never card shadows.

---

## 11. Development workflow

*Revised in v1.1 to reflect actual project state.*

### 11.1 The loop

1. Run `npm test`. Take one failing test.
2. Read the rule it names in section 8.
3. Hand the agent the failing test, that rule, and the type signature. Nothing else.
4. The agent iterates until that test passes and the rest of the suite stays as it was.
5. Review the diff against the rule, not against how you would have written it.
6. Delete the matching entry from the `STUB` object in `engine.js`.

The value is in steps 3 and 5. Restricting context is what stops plausible-but-wrong code, and reviewing against the rule rather than the implementation is the habit that makes delegation scale.

### 11.2 Build order and current state

| Stage | Deliverable | Verified by | State |
|---|---|---|---|
| 0 | Design tokens and component CSS | `npm run lint:tokens` | **Done** |
| 0 | UI layer, all seven screens and their states | Manual walkthrough | **Done** |
| 0 | Test suite, one test per rule ID | Suite runs | **Done** |
| 1 | Types and schema from section 6 | Schema validation tests | Not started |
| 2 | Recurrence engine, BR-01 to BR-05, BR-19, BR-20 | Unit tests with fixed input dates | Not started |
| 3 | Phase resolution, BR-06 to BR-14 | Unit tests including invalid phase lists | Not started |
| 4 | Money and normalisation, BR-15 to BR-18 | Unit tests asserting exact integer results | Not started |
| 5 | Storage, export and import | Round trip test: export, wipe, import, deep equality | Not started |

Stage 2 first. Everything downstream depends on dates being right.

### 11.3 Stack

Settled, not suggested.

- **No dependencies.** Node 18+ for `node:test`, nothing else.
- **Plain CSS custom properties** for tokens. No preprocessor, no framework.
- **Vanilla JS** for the UI, so the calculation module has nothing to depend on and the whole thing ports cleanly to any framework later.
- **IndexedDB** for stage 5.

### 11.4 Known failure modes when delegating

Watch for these specifically. Each appears reliably.

- **It edits the test** to match its output. Never give write access to `engine.test.js`; diff it separately.
- **It hardcodes the fixture.** It reads an expected value from a test and returns it. Add one test with different inputs after each cycle.
- **It regresses a passing test** while making yours green. Always require the full suite.
- **It over-builds.** State explicitly what not to implement yet, and reject on scope even when the code is good.

---

## 12. Definition of done

Version 1 is complete when all of the following are true.

| ID | Criterion |
|---|---|
| DoD-01 | Every Must priority requirement in section 7 is implemented. |
| DoD-02 | Every rule in section 8 has at least one passing test named after its ID. |
| DoD-03 | **Revised in v1.1.** Loading `fixture.js` produces every figure in the table in section 5.2, computed rather than stubbed. |
| DoD-04 | The `STUB` object in `engine.js` is empty. |
| DoD-05 | A trial converting within thirty days appears in the dashboard warning strip without any manual action. |
| DoD-06 | Data survives an application restart, and a full export and import round trip produces identical data. |
| DoD-07 | `npm run check` passes: tokens clean, all tests green. |
| DoD-08 | `engine.js` contains no reference to the system clock. |

### 12.1 Remaining open questions

Two of the three from v1.0 are still open. The third became BR-19.

1. **Should a cancelled commitment preserve its phase history** for a spend retrospective, or be removed from all views? Preserving it is more useful and more complex.
2. **Do variable amount commitments store historical actuals**, or only the current estimate? Storing history enlarges the model but enables trend information later.

Each is a genuine design decision. Resolving one means writing it as a numbered rule in section 8 precisely enough to test, which is itself the most valuable exercise in this document.

### 12.2 Natural extensions after version 1

Each adds a new class of testable logic without adding ambiguity, so any of them extends the practice value rather than diluting it.

- **CSV import of bank statements**, matched against existing commitments. Parsing edge cases plus a matching algorithm with a correct answer.
- **Cost per use tracking.** A second data stream and a division that must handle zero.
- **Scenario mode**, toggling commitments off temporarily to see resulting totals without deleting anything.
- **Notice period tracking**, warning when the last date to cancel before automatic renewal approaches. The same date arithmetic in reverse, reusing the entire recurrence engine.