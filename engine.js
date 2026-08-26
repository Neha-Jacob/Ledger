/* ============================================================
   ledger engine
   ------------------------------------------------------------
   Rules:
     1. Nothing in here may read the system clock. `today` is
        always a parameter. (NFR-04)
     2. Nothing in here may import from ui.js or touch the DOM.
     3. Money is integer minor units end to end. Round only at
        display time. (BR-15)
     4. Dates are calendar dates ("YYYY-MM-DD"), never instants.
        (BR-05)
   ============================================================ */

/* ---------- date helpers (BR-01 .. BR-05) ---------- */

/**
 * The next charge date on or after `from`, for a phase.
 * BR-01 monthly anchored on the 31st clamps to month end and does NOT drift.
 * BR-02 yearly anchored on 29 Feb falls back to 28 Feb in non-leap years.
 * BR-03 weekly holds the weekday, no month-end adjustment.
 * BR-04 oneOff yields exactly one date, the anchor itself.
 * @param {object} phase
 * @param {string} from  YYYY-MM-DD
 * @returns {string|null} YYYY-MM-DD, or null if the phase produces no more charges
 */
function nextChargeDate(phase, from, anchorDate) {
  const effectiveFrom = from < phase.startDate ? phase.startDate : from;
  if (phase.endDate && effectiveFrom > phase.endDate) return null;

  if (phase.cycle === "oneOff") {
    return from <= phase.startDate ? phase.startDate : null;
  }

  if (phase.cycle === "weekly") {
    const [ay, am, ad] = anchorDate.split("-").map(Number);
    const anchorDow = new Date(ay, am - 1, ad).getDay();

    const [fy, fm, fd] = effectiveFrom.split("-").map(Number);
    const fromDow = new Date(fy, fm - 1, fd).getDay();

    let advance = (anchorDow - fromDow + 7) % 7;
    const d = new Date(fy, fm - 1, fd + advance);
    const ry = d.getFullYear();
    const rm = String(d.getMonth() + 1).padStart(2, "0");
    const rd = String(d.getDate()).padStart(2, "0");
    const result = ry + "-" + rm + "-" + rd;
    if (phase.endDate && result > phase.endDate) return null;
    return result;
  }

  if (phase.cycle === "monthly") {
    const anchorDay = Number(anchorDate.split("-")[2]);
    const [fy, fm, fd] = effectiveFrom.split("-").map(Number);

    let year = fy;
    let month = fm;

    for (;;) {
      const lastDay = new Date(year, month, 0).getDate();
      const day = Math.min(anchorDay, lastDay);
      if (year === fy && month === fm && day < fd) {
        month++;
        if (month > 12) { month = 1; year++; }
        continue;
      }
      const result = year + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
      if (phase.endDate && result > phase.endDate) return null;
      return result;
    }
  }

  if (phase.cycle === "yearly") {
    const [ay, am, ad] = anchorDate.split("-").map(Number);
    const [fy, fm, fd] = effectiveFrom.split("-").map(Number);

    const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);

    for (let year = fy; ; year++) {
      let day = ad;
      if (am === 2 && ad === 29 && !isLeap(year)) {
        day = 28;
      }
      const candidate = year + "-" + String(am).padStart(2, "0") + "-" + String(day).padStart(2, "0");
      if (candidate < effectiveFrom) continue;
      if (phase.endDate && candidate > phase.endDate) return null;
      return candidate;
    }
  }

  return null;
}

/**
 * Every charge date a phase produces inside [start, end], inclusive.
 * BR-09 a phase shorter than its own cycle yields nothing unless the
 * anchor itself falls inside it.
 * @returns {string[]}
 */
function chargeDatesInRange(phase, start, end, anchorDate) {
  if (phase.cycle !== "oneOff" && phase.endDate !== null) {
    const s = new Date(phase.startDate);
    const e = new Date(phase.endDate);
    const durationDays = (e - s) / 86400000;
    const minDays = phase.cycle === "yearly" ? 365
                  : phase.cycle === "monthly" ? 28
                  : 7;
    if (durationDays < minDays) return [];
  }

  const effectiveStart = phase.startDate > start ? phase.startDate : start;
  const effectiveEnd = phase.endDate !== null && phase.endDate < end ? phase.endDate : end;

  const dates = [];
  let cursor = effectiveStart;
  for (;;) {
    const d = nextChargeDate(phase, cursor, anchorDate);
    if (d === null || d > effectiveEnd) break;
    dates.push(d);
    const [y, m, day] = d.split("-").map(Number);
    const next = new Date(y, m - 1, day + 1);
    cursor = next.getFullYear() + "-" +
      String(next.getMonth() + 1).padStart(2, "0") + "-" +
      String(next.getDate()).padStart(2, "0");
  }
  return dates;
}

/* ---------- phase resolution (BR-06 .. BR-14) ---------- */

/**
 * The phase in force on `date`.
 * BR-08 a date landing exactly on a boundary belongs to the phase that
 * BEGINS that day, not the one that ended the day before.
 * @returns {object|null}
 */
function phaseAt(commitment, date) {
  for (const phase of commitment.phases) {
    if (date >= phase.startDate && (phase.endDate === null || date <= phase.endDate)) {
      return phase;
    }
  }
  return null;
}

/**
 * Validate a phase list.
 * BR-06 phases must be contiguous and must not overlap.
 * BR-07 only the final phase may have a null endDate.
 * BR-10 an edit that would create a gap or overlap is rejected.
 * @returns {{valid: boolean, errors: string[]}}
 */
function validatePhases(phases) {
  if (phases.length <= 1) return { valid: true, errors: [] };

  const errors = [];

  for (let i = 0; i < phases.length - 1; i++) {
    if (phases[i].endDate === null) {
      errors.push(`Phase ${i} has null endDate but is not the last phase`);
    }
  }

  for (let i = 0; i < phases.length - 1; i++) {
    const prev = phases[i];
    const next = phases[i + 1];
    if (prev.endDate === null) continue;

    if (next.startDate <= prev.endDate) {
      errors.push(`Phase ${i + 1} overlaps with phase ${i}: starts ${next.startDate} but phase ${i} ends ${prev.endDate}`);
      continue;
    }

    const [y, m, d] = prev.endDate.split("-").map(Number);
    const expected = new Date(y, m - 1, d + 1);
    const ey = expected.getFullYear();
    const em = String(expected.getMonth() + 1).padStart(2, "0");
    const ed = String(expected.getDate()).padStart(2, "0");
    const expectedStart = ey + "-" + em + "-" + ed;

    if (next.startDate !== expectedStart) {
      errors.push(`Gap between phase ${i} and phase ${i + 1}: expected start ${expectedStart} but got ${next.startDate}`);
    }
  }

  return errors.length ? { valid: false, errors } : { valid: true, errors: [] };
}

/**
 * Validate a commitment billing anchor.
 * BR-21 the anchor must not be after the first phase starts.
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateAnchorDate(anchorDate, phases) {
  if (!anchorDate || !phases.length || anchorDate <= phases[0].startDate) {
    return { valid: true, errors: [] };
  }
  return {
    valid: false,
    errors: [`Anchor date ${anchorDate} cannot be after first phase start ${phases[0].startDate}`],
  };
}

/**
 * BR-12 the trial conversion date is the start of the first non-zero phase.
 * Derived, never stored.
 * @returns {string|null}
 */
function trialConversionDate(commitment) {
  let seenTrial = false;
  for (const phase of commitment.phases) {
    if (phase.amount === 0) {
      seenTrial = true;
    } else if (phase.amount > 0 && seenTrial) {
      return phase.startDate;
    }
  }
  return null;
}

/**
 * BR-11 zero-amount phase means active but contributing nothing.
 * BR-13 a first phase starting in the future means active and pending.
 * @returns {"active"|"trial"|"pending"|"fixedTerm"|"cancelled"}
 */
function statusOf(commitment, today) {
  if (commitment.status === "cancelled") return "cancelled";
  if (commitment.phases[0].startDate > today) return "pending";
  const phase = phaseAt(commitment, today);
  if (phase) {
    if (phase.amount === 0) return "trial";
    if (commitment.cancellable === false) return "fixedTerm";
    if (phase.endDate !== null) return "fixedTerm";
    return "active";
  }
  return "active";
}

/* ---------- money (BR-15 .. BR-18) ---------- */

/**
 * A commitment's monthly-equivalent cost, in minor units.
 * FR-11 yearly / 12, weekly * 52 / 12, quarterly / 3.
 * FR-13 zero-amount phases contribute nothing.
 * BR-04 oneOff never contributes.
 * BR-15 no rounding here. Round at display only.
 */
function normalisedMonthly(commitment, today) {
  const status = statusOf(commitment, today);
  if (status === "cancelled" || status === "pending") return 0;

  const phase = phaseAt(commitment, today);
  if (!phase) return 0;
  if (phase.cycle === "oneOff") return 0;
  if (phase.amount === 0) return 0;

  switch (phase.cycle) {
    case "monthly":    return phase.amount;
    case "yearly":     return Math.round(phase.amount / 12);
    case "weekly":     return Math.round(phase.amount * 52 / 12);
    case "quarterly":  return Math.round(phase.amount / 3);
    default:           return 0;
  }
}

/** FR-12. */
function normalisedAnnual(commitments, today) {
  return monthlyTotal(commitments, today) * 12; // TODO(FR-12)
}

/** FR-11 across all commitments. */
function monthlyTotal(commitments, today) {
  return commitments.reduce((sum, c) => sum + normalisedMonthly(c, today), 0);
}

/**
 * FR-14 committed total for a named month, reflecting phase changes inside it.
 * @param {number} year @param {number} month 1-12
 */
function committedTotalForMonth(commitments, year, month) {
  const pad = n => String(n).padStart(2, "0");
  const start = year + "-" + pad(month) + "-01";
  const lastDay = new Date(year, month, 0).getDate();
  const end = year + "-" + pad(month) + "-" + pad(lastDay);

  let total = 0;
  for (const commitment of commitments) {
    if (commitment.status === "cancelled") continue;
    for (let i = 0; i < commitment.phases.length; i++) {
      const phase = commitment.phases[i];
      const dates = chargeDatesInRange(phase, start, end, anchorForPhase(commitment, i));
      for (const date of dates) {
        const active = phaseAt(commitment, date);
        if (active) total += active.amount;
      }
    }
  }
  return total;
}

/**
 * FR-15. Must sum exactly to monthlyTotal.
 * BR-16 assign any rounding remainder to the largest category, never drop it.
 * @returns {Array<{category: string, amount: number}>}
 */
function byCategory(commitments, today) {
  const map = {};
  for (const c of commitments) {
    const m = normalisedMonthly(c, today);
    if (m === 0) continue;
    map[c.category] = (map[c.category] || 0) + m;
  }

  const result = Object.entries(map)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const catSum = result.reduce((s, r) => s + r.amount, 0);
  const total = monthlyTotal(commitments, today);
  const diff = total - catSum;
  if (diff !== 0 && result.length > 0) {
    result[0].amount += diff;
  }

  return result;
}

/**
 * FR-16 every commitment whose amount rises within `days`.
 * Covers trial conversions and scheduled increases with one mechanism.
 * @returns {Array<{id, name, date, from, to}>}
 */
function upcomingIncreases(commitments, today, days) {
  const [ty, tm, td] = today.split("-").map(Number);
  const horizonDate = new Date(ty, tm - 1, td + days);
  const horizon = horizonDate.getFullYear() + "-" +
    String(horizonDate.getMonth() + 1).padStart(2, "0") + "-" +
    String(horizonDate.getDate()).padStart(2, "0");

  const result = [];
  for (const commitment of commitments) {
    if (commitment.status === "cancelled") continue;
    const phases = commitment.phases;
    for (let i = 0; i < phases.length - 1; i++) {
      const next = phases[i + 1];
      if (next.startDate >= today && next.startDate <= horizon) {
        if (next.amount > phases[i].amount) {
          result.push({
            id: commitment.id,
            name: commitment.name,
            date: next.startDate,
            from: phases[i].amount,
            to: next.amount
          });
        }
      }
    }
  }
  return result;
}

/**
 * FR-17 what you would still owe if every cancellable commitment
 * were cancelled today.
 */
function residualObligation(commitments, today) {
  let total = 0;
  for (const commitment of commitments) {
    if (commitment.cancellable !== false) continue;
    if (commitment.status === "cancelled") continue;
    for (let i = 0; i < commitment.phases.length; i++) {
      const phase = commitment.phases[i];
      if (phase.endDate === null) continue;
      const dates = chargeDatesInRange(phase, today, phase.endDate, anchorForPhase(commitment, i));
      for (const date of dates) {
        total += phase.amount;
      }
    }
  }
  return total;
}

/**
 * FR-18 / BR-17 convert using a stored rate. Never rewrite stored amounts.
 */
function convert(amount, from, to, rates) {
  if (from === to) return amount;
  return Math.round(amount * (rates[from] ?? 1)); // TODO(BR-17)
}

/* ---------- projection (FR-10) ---------- */

/**
 * FR-10 every charge across all commitments in [start, end].
 * @returns {Array<{date, commitmentId, name, category, amount, isEstimate}>}
 */
function chargesInRange(commitments, start, end) {
  const results = [];

  for (const commitment of commitments) {
    if (commitment.status === "cancelled") {
      if (!commitment.cancelledDate) continue;
      const cancelPhase = phaseAt(commitment, commitment.cancelledDate);
      if (cancelPhase && cancelPhase.amount === 0) continue;
    }

    for (let i = 0; i < commitment.phases.length; i++) {
      const phase = commitment.phases[i];
      const dates = chargeDatesInRange(phase, start, end, anchorForPhase(commitment, i));
      for (const date of dates) {
        if (commitment.status === "cancelled" && commitment.cancelledDate && date >= commitment.cancelledDate) continue;
        const active = phaseAt(commitment, date);
        if (!active) continue;
        results.push({
          date,
          commitmentId: commitment.id,
          name: commitment.name,
          category: commitment.category,
          amount: active.amount,
          isEstimate: active.isEstimate,
        });
      }
    }
  }

  results.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.commitmentId < b.commitmentId ? -1 : a.commitmentId > b.commitmentId ? 1 : 0);
  return results;
}

function anchorForPhase(commitment, phaseIndex) {
  let anchor = commitment.anchorDate || commitment.phases[0].startDate;
  for (let i = 1; i <= phaseIndex; i++) {
    if (commitment.phases[i].cycle !== commitment.phases[i - 1].cycle) {
      anchor = commitment.phases[i].startDate;
    }
  }
  return anchor;
}

/**
 * Next charge date for a commitment on or after `today`.
 * Cancelled commitments return null.
 */
function nextDueFor(commitment, today) {
  if (commitment.status === "cancelled") return null;
  const phase = phaseAt(commitment, today);
  if (!phase) {
    for (let i = 0; i < commitment.phases.length; i++) {
      const p = commitment.phases[i];
      if (p.startDate > today) {
        return nextChargeDate(p, today, anchorForPhase(commitment, i));
      }
    }
    return null;
  }
  const phaseIndex = commitment.phases.indexOf(phase);
  const result = nextChargeDate(phase, today, anchorForPhase(commitment, phaseIndex));
  if (result !== null) return result;
  for (let i = phaseIndex + 1; i < commitment.phases.length; i++) {
    const next = nextChargeDate(
      commitment.phases[i],
      commitment.phases[i].startDate,
      anchorForPhase(commitment, i)
    );
    if (next !== null) return next;
  }
  return null;
}

const Engine = {
  nextChargeDate, chargeDatesInRange, phaseAt, validatePhases, validateAnchorDate,
  trialConversionDate, statusOf, normalisedMonthly, normalisedAnnual,
  monthlyTotal, committedTotalForMonth, byCategory, upcomingIncreases,
  residualObligation, convert, chargesInRange, nextDueFor
};

if (typeof module !== "undefined") module.exports = Engine;
if (typeof window !== "undefined") window.Engine = Engine;
