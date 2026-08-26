/* ============================================================
   Sample dataset. Doubles as the fixture for engine.test.js.
   All amounts are integers in minor units (cents). See BR-15.
   All dates are calendar dates as YYYY-MM-DD strings, never
   instants. See BR-05.
   ============================================================ */

const TODAY = "2026-08-25";

const FIXTURE = {
  displayCurrency: "EUR",
  rates: { USD: 0.92, GBP: 1.17 },
  commitments: [
    {
      id: "c_rent", name: "Rent", category: "housing", provider: "",
      status: "active", cancellable: true, notes: "",
      phases: [
        { id: "p1", startDate: "2024-03-01", endDate: "2026-06-30", amount: 82000, currency: "EUR", cycle: "monthly", isEstimate: false, label: "" },
        { id: "p2", startDate: "2026-07-01", endDate: null,         amount: 86500, currency: "EUR", cycle: "monthly", isEstimate: false, label: "increase" }
      ]
    },
    {
      id: "c_health", name: "Health insurance", category: "insurance", provider: "TK",
      status: "active", cancellable: true, notes: "",
      phases: [
        { id: "p1", startDate: "2023-01-03", endDate: null, amount: 14300, currency: "EUR", cycle: "monthly", isEstimate: false, label: "" }
      ]
    },
    {
      id: "c_transit", name: "Deutschlandticket", category: "transport", provider: "",
      status: "active", cancellable: false, notes: "Minimum term ends 31 Dec 2026",
      phases: [
        { id: "p1", startDate: "2026-01-01", endDate: "2026-12-31", amount: 5800, currency: "EUR", cycle: "monthly", isEstimate: false, label: "fixed term" }
      ]
    },
    {
      id: "c_mobile", name: "Mobile plan", category: "utilities", provider: "",
      status: "active", cancellable: true, notes: "Varies with data use",
      phases: [
        { id: "p1", startDate: "2022-05-10", endDate: null, amount: 2450, currency: "EUR", cycle: "monthly", isEstimate: true, label: "" }
      ]
    },
    {
      id: "c_spotify", name: "Spotify Premium", category: "entertainment", provider: "",
      status: "active", cancellable: true, notes: "",
      phases: [
        { id: "p1", startDate: "2026-06-15", endDate: "2026-09-14", amount: 0,    currency: "EUR", cycle: "monthly", isEstimate: false, label: "trial" },
        { id: "p2", startDate: "2026-09-15", endDate: null,         amount: 1099, currency: "EUR", cycle: "monthly", isEstimate: false, label: "" }
      ]
    },
    {
      id: "c_netflix", name: "Netflix", category: "entertainment", provider: "",
      status: "active", cancellable: true, notes: "",
      phases: [
        { id: "p1", startDate: "2025-02-28", endDate: null, amount: 1799, currency: "EUR", cycle: "monthly", isEstimate: false, label: "" }
      ]
    },
    {
      id: "c_tools", name: "Design tools", category: "tools", provider: "",
      status: "active", cancellable: true, notes: "Price rise announced",
      phases: [
        { id: "p1", startDate: "2024-09-12", endDate: "2026-08-31", amount: 5100, currency: "EUR", cycle: "monthly", isEstimate: false, label: "" },
        { id: "p2", startDate: "2026-09-01", endDate: null,         amount: 5600, currency: "EUR", cycle: "monthly", isEstimate: false, label: "increase" }
      ]
    },
    {
      id: "c_domain", name: "Domain renewal", category: "tools", provider: "",
      status: "active", cancellable: true, notes: "",
      phases: [
        { id: "p1", startDate: "2025-03-04", endDate: null, amount: 1800, currency: "EUR", cycle: "yearly", isEstimate: false, label: "" }
      ]
    },
    {
      id: "c_gym", name: "Gym membership", category: "health", provider: "",
      status: "cancelled", cancellable: true, cancelledDate: "2026-08-01", notes: "",
      phases: [
        { id: "p1", startDate: "2024-06-01", endDate: null, amount: 2900, currency: "EUR", cycle: "monthly", isEstimate: false, label: "" }
      ]
    }
  ]
};

/* --- edge case fixtures, for the tests in engine.test.js --- */
const EDGE = {
  anchor31:  { startDate: "2026-01-31", endDate: null, amount: 1000, currency: "EUR", cycle: "monthly", isEstimate: false, label: "" },
  leapDay:   { startDate: "2024-02-29", endDate: null, amount: 5000, currency: "EUR", cycle: "yearly",  isEstimate: false, label: "" },
  weekly:    { startDate: "2026-08-03", endDate: null, amount: 400,  currency: "EUR", cycle: "weekly",  isEstimate: false, label: "" },
  oneOff:    { startDate: "2026-09-09", endDate: null, amount: 9900, currency: "EUR", cycle: "oneOff",  isEstimate: false, label: "" },
  shortYear: { startDate: "2026-03-01", endDate: "2026-03-31", amount: 12000, currency: "EUR", cycle: "yearly", isEstimate: false, label: "" },
  overlap: [
    { id: "a", startDate: "2026-01-01", endDate: "2026-06-30", amount: 100, currency: "EUR", cycle: "monthly", isEstimate: false, label: "" },
    { id: "b", startDate: "2026-06-15", endDate: null,         amount: 200, currency: "EUR", cycle: "monthly", isEstimate: false, label: "" }
  ],
  gap: [
    { id: "a", startDate: "2026-01-01", endDate: "2026-03-31", amount: 100, currency: "EUR", cycle: "monthly", isEstimate: false, label: "" },
    { id: "b", startDate: "2026-05-01", endDate: null,         amount: 200, currency: "EUR", cycle: "monthly", isEstimate: false, label: "" }
  ],
  midNull: [
    { id: "a", startDate: "2026-01-01", endDate: null, amount: 100, currency: "EUR", cycle: "monthly", isEstimate: false, label: "" },
    { id: "b", startDate: "2026-05-01", endDate: null, amount: 200, currency: "EUR", cycle: "monthly", isEstimate: false, label: "" }
  ]
};

if (typeof module !== "undefined") module.exports = { FIXTURE, EDGE, TODAY };
if (typeof window !== "undefined") { window.FIXTURE = FIXTURE; window.TODAY = TODAY; }
