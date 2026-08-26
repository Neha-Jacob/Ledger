/* ============================================================
   Integration tests for engine.js
   Run with:  node --test
   Each test exercises a full use-case lifecycle across multiple
   engine functions to verify they agree with each other.
   ============================================================ */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const E = require("./engine.js");

/* ---------- 1. Trial → conversion → active ---------- */

test("integration: trial converts to active and all functions reflect it", () => {
  const c = {
    id: "c_trial", name: "Streaming", category: "entertainment",
    provider: "", status: "active", cancellable: true, notes: "",
    phases: [
      { id: "p1", startDate: "2026-06-01", endDate: "2026-08-31", amount: 0, currency: "EUR", cycle: "monthly", isEstimate: false, label: "trial" },
      { id: "p2", startDate: "2026-09-01", endDate: null, amount: 1099, currency: "EUR", cycle: "monthly", isEstimate: false, label: "" },
    ],
  };

  // During trial
  assert.equal(E.statusOf(c, "2026-07-15"), "trial");
  assert.equal(E.normalisedMonthly(c, "2026-07-15"), 0);
  assert.equal(E.trialConversionDate(c), "2026-09-01");
  const trialCharges = E.chargesInRange([c], "2026-06-01", "2026-08-31");
  assert.ok(trialCharges.every(ch => ch.amount === 0));

  // After conversion
  assert.equal(E.statusOf(c, "2026-10-01"), "active");
  assert.equal(E.normalisedMonthly(c, "2026-10-01"), 1099);
  const paidCharges = E.chargesInRange([c], "2026-09-01", "2026-11-30");
  assert.ok(paidCharges.every(ch => ch.amount === 1099));

  // Upcoming increase detected before conversion
  const ups = E.upcomingIncreases([c], "2026-08-01", 60);
  assert.equal(ups.length, 1);
  assert.equal(ups[0].from, 0);
  assert.equal(ups[0].to, 1099);
});

/* ---------- 2. Cancel during trial ---------- */

test("integration: cancelling during trial produces zero everywhere", () => {
  const c = {
    id: "c_cancel_trial", name: "Cancelled Trial", category: "entertainment",
    provider: "", status: "cancelled", cancellable: true, cancelledDate: "2026-07-15", notes: "",
    phases: [
      { id: "p1", startDate: "2026-06-01", endDate: "2026-08-31", amount: 0, currency: "EUR", cycle: "monthly", isEstimate: false, label: "trial" },
      { id: "p2", startDate: "2026-09-01", endDate: null, amount: 1099, currency: "EUR", cycle: "monthly", isEstimate: false, label: "" },
    ],
  };

  assert.equal(E.statusOf(c, "2026-07-20"), "cancelled");
  assert.equal(E.normalisedMonthly(c, "2026-07-20"), 0);
  assert.deepEqual(E.chargesInRange([c], "2026-01-01", "2027-12-31"), []);
  assert.equal(E.upcomingIncreases([c], "2026-07-20", 60).length, 0);
  assert.equal(E.nextDueFor(c, "2026-07-20"), null);
});

/* ---------- 3. Price increase across phase boundary ---------- */

test("integration: price increase changes amounts but all functions stay consistent", () => {
  const c = {
    id: "c_rise", name: "Design Tools", category: "tools",
    provider: "", status: "active", cancellable: true, notes: "",
    phases: [
      { id: "p1", startDate: "2025-01-01", endDate: "2026-09-30", amount: 5100, currency: "EUR", cycle: "monthly", isEstimate: false, label: "" },
      { id: "p2", startDate: "2026-10-01", endDate: null, amount: 5600, currency: "EUR", cycle: "monthly", isEstimate: false, label: "increase" },
    ],
  };

  // Before increase
  assert.equal(E.normalisedMonthly(c, "2026-09-15"), 5100);
  assert.equal(E.phaseAt(c, "2026-09-30").amount, 5100);

  // After increase
  assert.equal(E.normalisedMonthly(c, "2026-10-15"), 5600);
  assert.equal(E.phaseAt(c, "2026-10-01").amount, 5600);

  // Projection shows correct amounts on each side
  const charges = E.chargesInRange([c], "2026-09-01", "2026-10-31");
  const sep = charges.find(ch => ch.date.startsWith("2026-09"));
  const oct = charges.find(ch => ch.date.startsWith("2026-10"));
  assert.equal(sep.amount, 5100);
  assert.equal(oct.amount, 5600);

  // Upcoming increase detected
  const ups = E.upcomingIncreases([c], "2026-09-15", 30);
  assert.equal(ups.length, 1);
  assert.equal(ups[0].from, 5100);
  assert.equal(ups[0].to, 5600);
});

/* ---------- 4. Fixed-term contract ---------- */

test("integration: fixed-term contract has correct status and residual obligation", () => {
  const c = {
    id: "c_fixed", name: "Transit Pass", category: "transport",
    provider: "", status: "active", cancellable: false, notes: "",
    phases: [
      { id: "p1", startDate: "2026-01-01", endDate: "2026-12-31", amount: 5800, currency: "EUR", cycle: "monthly", isEstimate: false, label: "fixed term" },
    ],
  };

  assert.equal(E.statusOf(c, "2026-06-15"), "fixedTerm");
  assert.equal(E.normalisedMonthly(c, "2026-06-15"), 5800);

  // Residual obligation = remaining charges × amount
  const residual = E.residualObligation([c], "2026-06-01");
  const remainingDates = E.chargeDatesInRange(c.phases[0], "2026-06-01", "2026-12-31");
  assert.equal(residual, remainingDates.length * 5800);
  assert.ok(residual > 0);

  // Cannot cancel
  assert.equal(c.cancellable, false);
});

/* ---------- 5. Cancelled mid-life ---------- */

test("integration: mid-life cancellation excludes future charges only", () => {
  const c = {
    id: "c_mid_cancel", name: "Gym", category: "health",
    provider: "", status: "cancelled", cancellable: true, cancelledDate: "2026-06-15", notes: "",
    phases: [
      { id: "p1", startDate: "2025-01-01", endDate: null, amount: 2900, currency: "EUR", cycle: "monthly", isEstimate: false, label: "" },
    ],
  };

  assert.equal(E.statusOf(c, "2026-08-01"), "cancelled");
  assert.equal(E.normalisedMonthly(c, "2026-08-01"), 0);
  assert.equal(E.nextDueFor(c, "2026-08-01"), null);

  // Charges exist before cancellation, none on or after
  const charges = E.chargesInRange([c], "2025-01-01", "2026-12-31");
  assert.ok(charges.length > 0);
  assert.ok(charges.every(ch => ch.date < "2026-06-15"));
});
