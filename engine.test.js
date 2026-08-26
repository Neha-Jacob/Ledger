/* ============================================================
   Run with:  node --test
   Every test is named after a rule ID from the PRD. They all
   fail right now. That is the point.
   ============================================================ */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const E = require("./engine.js");
const { FIXTURE, EDGE, TODAY } = require("./fixture.js");

const eur = n => (n / 100).toFixed(2);

/* ---------- BR-01..05  recurrence arithmetic ---------- */

test("BR-01 monthly anchored on the 31st clamps to month end", () => {
  assert.equal(E.nextChargeDate(EDGE.anchor31, "2026-02-01"), "2026-02-28");
});

test("BR-01 the 31st anchor does not drift after a short month", () => {
  assert.equal(E.nextChargeDate(EDGE.anchor31, "2026-03-01"), "2026-03-31");
  assert.equal(E.nextChargeDate(EDGE.anchor31, "2026-04-01"), "2026-04-30");
  assert.equal(E.nextChargeDate(EDGE.anchor31, "2026-05-01"), "2026-05-31");
});

test("BR-02 yearly anchored on 29 Feb falls back to the 28th", () => {
  assert.equal(E.nextChargeDate(EDGE.leapDay, "2027-01-01"), "2027-02-28");
});

test("BR-02 yearly 29 Feb anchor returns to the 29th in a leap year", () => {
  assert.equal(E.nextChargeDate(EDGE.leapDay, "2028-01-01"), "2028-02-29");
});

test("BR-03 weekly holds the weekday with no month end adjustment", () => {
  const d = E.chargeDatesInRange(EDGE.weekly, "2026-08-01", "2026-08-31");
  assert.deepEqual(d, ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31"]);
});

test("BR-04 a oneOff cycle produces exactly one charge", () => {
  const d = E.chargeDatesInRange(EDGE.oneOff, "2026-01-01", "2027-12-31");
  assert.deepEqual(d, ["2026-09-09"]);
});

test("BR-04 a oneOff cycle never contributes to the monthly total", () => {
  const c = { id: "x", status: "active", phases: [EDGE.oneOff] };
  assert.equal(E.normalisedMonthly(c, TODAY), 0);
});

test("BR-05 a charge date is a calendar date, unaffected by timezone", () => {
  const d = E.nextChargeDate(EDGE.anchor31, "2026-02-01");
  assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(d.length, 10);
});

/* ---------- BR-06..10  phase transitions ---------- */

test("BR-06 overlapping phases are rejected", () => {
  assert.equal(E.validatePhases(EDGE.overlap).valid, false);
});

test("BR-06 a gap between phases is rejected", () => {
  assert.equal(E.validatePhases(EDGE.gap).valid, false);
});

test("BR-07 only the final phase may have a null end date", () => {
  assert.equal(E.validatePhases(EDGE.midNull).valid, false);
});

test("BR-08 a boundary date belongs to the phase that begins that day", () => {
  const spotify = FIXTURE.commitments.find(c => c.id === "c_spotify");
  assert.equal(E.phaseAt(spotify, "2026-09-15").amount, 1099);
  assert.equal(E.phaseAt(spotify, "2026-09-14").amount, 0);
});

test("BR-09 a phase shorter than its own cycle produces no charge", () => {
  assert.deepEqual(E.chargeDatesInRange(EDGE.shortYear, "2026-01-01", "2026-12-31"), []);
});

test("BR-10 an edit that creates a gap is rejected", () => {
  const edited = JSON.parse(JSON.stringify(EDGE.gap));
  edited[1].startDate = "2026-06-01";
  assert.equal(E.validatePhases(edited).valid, false);
});

/* ---------- BR-11..14  trials and delayed starts ---------- */

test("BR-11 a commitment in a zero phase contributes nothing", () => {
  const spotify = FIXTURE.commitments.find(c => c.id === "c_spotify");
  assert.equal(E.normalisedMonthly(spotify, "2026-08-25"), 0);
  assert.equal(E.normalisedMonthly(spotify, "2026-10-01"), 1099);
});

test("BR-12 the trial conversion date is derived from the first paying phase", () => {
  const spotify = FIXTURE.commitments.find(c => c.id === "c_spotify");
  assert.equal(E.trialConversionDate(spotify), "2026-09-15");
  assert.equal(spotify.trialEndDate, undefined, "must not be a stored field");
});

test("BR-13 a commitment starting in the future is pending, not active", () => {
  const future = {
    id: "c_future", status: "active", cancellable: true, category: "tools",
    phases: [{ id: "p1", startDate: "2026-12-01", endDate: null, amount: 999, currency: "EUR", cycle: "monthly", isEstimate: false, label: "" }]
  };
  assert.equal(E.statusOf(future, TODAY), "pending");
  assert.equal(E.normalisedMonthly(future, TODAY), 0);
});

test("BR-14 cancelling during a trial produces no charges at all", () => {
  const c = JSON.parse(JSON.stringify(FIXTURE.commitments.find(x => x.id === "c_spotify")));
  c.status = "cancelled"; c.cancelledDate = "2026-08-20";
  assert.deepEqual(E.chargesInRange([c], "2026-01-01", "2027-12-31"), []);
});

/* ---------- BR-15..18  money ---------- */

test("BR-15 intermediate arithmetic keeps full integer precision", () => {
  const domain = FIXTURE.commitments.find(c => c.id === "c_domain");
  const m = E.normalisedMonthly(domain, TODAY);
  assert.equal(Number.isInteger(m), true, "must be integer minor units");
  assert.equal(m * 12, 1800, "twelve months must reconstruct the yearly amount exactly");
});

test("BR-16 the category breakdown sums exactly to the monthly total", () => {
  const cats = E.byCategory(FIXTURE.commitments, TODAY);
  const sum = cats.reduce((a, c) => a + c.amount, 0);
  assert.equal(sum, E.monthlyTotal(FIXTURE.commitments, TODAY));
});

test("BR-17 conversion never rewrites the stored amount", () => {
  const before = JSON.parse(JSON.stringify(FIXTURE.commitments[0]));
  E.convert(10000, "USD", "EUR", FIXTURE.rates);
  assert.deepEqual(FIXTURE.commitments[0], before);
});

test("BR-18 an estimated amount is flagged in the projection", () => {
  const rows = E.chargesInRange(FIXTURE.commitments, "2026-08-01", "2026-08-31");
  const mobile = rows.find(r => r.commitmentId === "c_mobile");
  assert.equal(mobile.isEstimate, true);
});

/* ---------- FR level ---------- */

test("FR-10 projection reflects the phase in force on each charge date", () => {
  const rows = E.chargesInRange(FIXTURE.commitments, "2026-06-01", "2026-08-31");
  const rent = rows.filter(r => r.commitmentId === "c_rent");
  assert.equal(rent.find(r => r.date === "2026-06-01").amount, 82000);
  assert.equal(rent.find(r => r.date === "2026-07-01").amount, 86500);
});

test("FR-11 the monthly total normalises every cycle correctly", () => {
  assert.equal(eur(E.monthlyTotal(FIXTURE.commitments, TODAY)), "1160.99");
});

test("FR-14 a future month reflects transitions that occur inside it", () => {
  const sep = E.committedTotalForMonth(FIXTURE.commitments, 2026, 9);
  const aug = E.committedTotalForMonth(FIXTURE.commitments, 2026, 8);
  assert.ok(sep > aug, "September must exceed August once the trial converts");
});

test("FR-16 upcoming increases catch trials and price rises with one mechanism", () => {
  const ups = E.upcomingIncreases(FIXTURE.commitments, TODAY, 30);
  const ids = ups.map(u => u.id).sort();
  assert.deepEqual(ids, ["c_spotify", "c_tools"]);
});

test("FR-17 residual obligation counts only what cannot be cancelled", () => {
  assert.equal(eur(E.residualObligation(FIXTURE.commitments, TODAY)), "232.00");
});

test("NFR-04 the engine never reads the system clock", () => {
  const src = require("fs").readFileSync(__dirname + "/engine.js", "utf8");
  assert.equal(/Date\.now|new Date\(\s*\)/.test(src), false,
    "engine.js must take `today` as a parameter, never read the clock");
});
