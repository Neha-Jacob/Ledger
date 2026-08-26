/* ============================================================
   ledger UI
   Reads from Engine only. Contains no financial arithmetic and
   no date arithmetic beyond calendar grid layout.
   ============================================================ */

let DATA = { commitments: [], displayCurrency: "EUR", rates: {} };
let TODAY = "";

const S = {
  screen: "dashboard",
  detailId: null,
  panel: null,
  modal: null,
  filter: "active",
  category: "all",
  calMonth: "",
  trialOn: false,
  termOn: false,
  formErr: null,
  empty: false
};

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- display formatting (rounding happens ONLY here, BR-15) ---------- */

const money = (minor, opts = {}) => {
  const v = (minor / 100).toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (opts.est ? "~" : "") + "\u20AC" + v;
};
const moneyShort = minor => "\u20AC" + Math.round(minor / 100).toLocaleString("en-IE");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = iso => {
  if (!iso) return "\u2014";
  const [y, m, d] = iso.split("-");
  return `${+d} ${MONTHS[+m - 1]} ${y}`;
};
const fmtShort = iso => {
  if (!iso) return "\u2014";
  const [, m, d] = iso.split("-");
  return `${String(+d).padStart(2, "0")} ${MONTHS[+m - 1]}`;
};
const daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);

/** Within 30 days: relative and absolute. Beyond: absolute only. */
const fmtDue = iso => {
  if (!iso) return "\u2014";
  const n = daysBetween(TODAY, iso);
  if (n < 0) return fmtShort(iso);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n <= 30) return `in ${n} days`;
  return fmtShort(iso) + (iso.slice(0, 4) !== TODAY.slice(0, 4) ? " " + iso.slice(0, 4) : "");
};

const catVar = c => `var(--cat-${c})`;
const catName = c => c.charAt(0).toUpperCase() + c.slice(1);
const dot = c => `<span class="dot" style="background:${catVar(c)}"></span>`;

const active = () => DATA.commitments.filter(c => c.status !== "cancelled");

/* ---------- shell ---------- */

const NAV = [
  ["dashboard", "Overview", '<path d="M3 12h4l3 7 4-16 3 9h4"/>'],
  ["list", "List", '<path d="M4 6h16M4 12h16M4 18h16"/>'],
  ["calendar", "Dates", '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'],
  ["settings", "Setup", '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>']
];

function renderShell() {
  const rail = NAV.map(([id, label, path]) => `
    <button onclick="go('${id}')" ${S.screen === id || (id === "list" && S.screen === "detail") ? 'aria-current="page"' : ""} aria-label="${label}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">${path}</svg>
      ${label}
    </button>`).join("");

  $("#app").innerHTML = `
    <div class="shell">
      <nav class="rail">
        <div class="mark" aria-hidden="true"></div>
        ${rail}
        <div class="spacer"></div>
        <button onclick="toggleTheme()" aria-label="Toggle theme">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>
        </button>
      </nav>
      <main id="main"></main>
    </div>
    ${S.panel ? renderPanel() : ""}
    ${S.modal ? renderModal() : ""}`;

  $("#main").innerHTML = S.empty && S.screen !== "settings" ? firstRun() : ({
    dashboard, list, detail, calendar, settings
  })[S.screen]();

  if (S.panel) initDatePickers();
}

/* ---------- 1. first run ---------- */

function firstRun() {
  return `
  <div class="screen-head"><h1>Overview</h1></div>
  <div class="empty">
    <div class="t">Track your first commitment</div>
    <div class="b">Rent, insurance, a transit pass, a streaming plan. Anything that charges you more than once.</div>
    <div class="actions">
      <button class="btn primary" onclick="openPanel()">Add a commitment</button>
      <button class="btn" onclick="importJson()">Import a file</button>
      <button class="btn" onclick="loadSeedData()">Load sample data</button>
    </div>
    <div class="stub" style="border:0;margin-top:var(--space-24)">Everything stays on this device. No account needed.</div>
  </div>`;
}

/* ---------- 2. dashboard ---------- */

function dashboard() {
  const cs = DATA.commitments;
  const now = Engine.monthlyTotal(cs, TODAY);
  const annual = Engine.normalisedAnnual(cs, TODAY);
  const residual = Engine.residualObligation(cs, TODAY);
  const ups = Engine.upcomingIncreases(cs, TODAY, 30);
  const next = Engine.committedTotalForMonth(cs, 2026, 9);
  const cats = Engine.byCategory(cs, TODAY);
  const total = cats.reduce((a, c) => a + c.amount, 0) || 1;

  const warn = ups.length ? `
    <div class="warn">
      <div class="hd">${ups.length} charge${ups.length > 1 ? "s" : ""} increasing soon</div>
      ${ups.map(u => `<div class="ln"><span>${esc(u.name)}</span>
        <span class="num">${fmtShort(u.date)} \u00B7 ${money(u.from)} \u2192 ${money(u.to)}</span></div>`).join("")}
    </div>` : "";

  return `
  <div class="screen-head"><h1>Overview</h1><span class="stamp num">${fmtDate(TODAY)}</span></div>
  ${warn}
  <div class="grid-3" style="margin-bottom:var(--space-24)">
    <div class="tile"><div class="k">Per month now</div>
      <div class="v num">${money(now)}</div>
      <div class="sub rising num">${money(next)} from Sep</div></div>
    <div class="tile"><div class="k">Per year</div>
      <div class="v num">${money(annual)}</div>
      <div class="sub">normalised</div></div>
    <div class="tile"><div class="k">Locked in</div>
      <div class="v num">${money(residual)}</div>
      <div class="sub">if cancelled today</div></div>
  </div>
  <div class="card">
    <h2>By category</h2>
    <div class="bar">${cats.map(c => `<div style="width:${(c.amount / total * 100).toFixed(2)}%;background:${catVar(c.category)}"></div>`).join("")}</div>
    ${cats.map(c => `<div class="legend">
      <span>${dot(c.category)} ${catName(c.category)}</span>
      <span class="num" style="color:var(--text-secondary)">${money(c.amount)}</span></div>`).join("")}
  </div>`;
}

/* ---------- 3. commitments list ---------- */

function list() {
  const ups = Engine.upcomingIncreases(DATA.commitments, TODAY, 30).map(u => u.id);
  let rows = DATA.commitments.filter(c => {
    const st = Engine.statusOf(c, TODAY);
    if (S.filter === "active") return c.status !== "cancelled";
    if (S.filter === "trial") return st === "trial";
    return c.status === "cancelled";
  });
  if (S.category !== "all") rows = rows.filter(c => c.category === S.category);
  rows.sort((a, b) => (Engine.nextDueFor(a, TODAY) || "9999") .localeCompare(Engine.nextDueFor(b, TODAY) || "9999"));

  const cats = ["all", ...new Set(DATA.commitments.map(c => c.category))];

  const body = rows.length ? rows.map(c => {
    const st = Engine.statusOf(c, TODAY);
    const ph = Engine.phaseAt(c, TODAY);
    const gone = c.status === "cancelled";
    const badge = st === "trial" ? `<span class="badge trial">in trial</span>`
      : st === "pending" ? `<span class="badge pending">pending</span>`
      : st === "fixedTerm" ? `<span class="badge term">fixed term to Dec</span>` : "";
    return `<button class="row ${ups.includes(c.id) ? "rising" : ""} ${gone ? "gone" : ""}" onclick="openDetail('${c.id}')">
      <span class="nm">${dot(c.category)}<span>${esc(c.name)}</span>${badge}</span>
      <span class="amt num">${money(ph.amount, { est: ph.isEstimate })}<span class="cyc"> /${ph.cycle === "yearly" ? "yr" : "mo"}</span></span>
      <span class="due num">${gone ? "cancelled" : fmtDue(Engine.nextDueFor(c, TODAY))}</span>
    </button>`;
  }).join("") : `<div class="empty" style="margin-top:var(--space-16)">
      <div class="t">Nothing matches</div>
      <div class="b">No commitments in this filter. Try a different category or status.</div>
      <div class="actions"><button class="btn" onclick="S.category='all';S.filter='active';renderShell()">Clear filters</button></div>
    </div>`;

  return `
  <div class="screen-head"><h1>Commitments</h1>
    <button class="btn primary" onclick="openPanel()">Add</button></div>
  <div class="seg-ctl">
    ${["active", "trial", "cancelled"].map(f => `<button aria-pressed="${S.filter === f}" onclick="S.filter='${f}';renderShell()">${f === "trial" ? "In trial" : catName(f)}</button>`).join("")}
  </div>
  <div class="chips">
    ${cats.map(c => `<button aria-pressed="${S.category === c}" onclick="S.category='${c}';renderShell()">${c === "all" ? "All" : catName(c)}</button>`).join("")}
  </div>
  <div class="rowhead"><span class="nm">Name</span><span class="amt">Amount</span><span class="due">Next charge</span></div>
  <div class="rows">${body}</div>`;
}

/* ---------- 4. commitment detail ---------- */

function detail() {
  const c = DATA.commitments.find(x => x.id === S.detailId);
  if (!c) return firstRun();
  const st = Engine.statusOf(c, TODAY);
  const cur = Engine.phaseAt(c, TODAY);
  const conv = Engine.trialConversionDate(c);

  const span = (a, b) => daysBetween(a, b || "2027-08-25");
  const totalSpan = span(c.phases[0].startDate, null) || 1;

  const segs = c.phases.map(p => {
    const w = Math.max(8, span(p.startDate, p.endDate) / totalSpan * 100);
    const kind = p.amount === 0 ? "zero" : (p.endDate && p.endDate < TODAY) ? "past"
      : (p.startDate > TODAY) ? "future" : "current";
    const bg = p.amount === 0 ? "" : `background:${catVar(c.category)};opacity:${kind === "future" ? 0.45 : 0.3}`;
    return { w, kind, bg, p };
  });

  const todayPct = Math.min(98, Math.max(2, span(c.phases[0].startDate, TODAY) / totalSpan * 100));

  const banner = (st === "trial" && conv) ? `
    <div class="warn"><div class="ln" style="padding:0">
      <span>Becomes <span class="num">${money(c.phases.find(p => p.amount > 0).amount)}</span> per month in ${daysBetween(TODAY, conv)} days, on ${fmtDate(conv)}</span>
    </div></div>` : "";

  return `
  <div class="screen-head">
    <div>
      <h1>${dot(c.category)} ${esc(c.name)}
        ${st === "trial" ? '<span class="badge trial">in trial</span>' : ""}
        ${st === "fixedTerm" ? '<span class="badge term">fixed term</span>' : ""}</h1>
      <div class="stamp" style="margin-top:var(--space-4)">${catName(c.category)}${c.notes ? " \u00B7 " + esc(c.notes) : ""}</div>
    </div>
    <div style="text-align:right">
      <div class="num" style="font-size:var(--size-display);font-weight:var(--weight-medium)">${money(cur.amount, { est: cur.isEstimate })}</div>
      <div class="stamp">per ${cur.cycle === "yearly" ? "year" : "month"}, now</div>
    </div>
  </div>
  ${banner}
  <div style="margin-bottom:var(--space-24)">
    <div class="tl">
      ${segs.map(s => `<div class="seg ${s.kind}" style="flex:0 0 ${s.w}%;${s.bg}">${s.p.amount === 0 ? money(0) : money(s.p.amount)}</div>`).join("")}
    </div>
    <div class="tl-axis">${segs.map(s => `<div style="flex:0 0 ${s.w}%">${fmtShort(s.p.startDate)}</div>`).join("")}</div>
    <div class="tl-today"><span style="left:${todayPct}%">\u25B2 today</span></div>
  </div>
  <div class="card" style="margin-bottom:var(--space-16)">
    <h2>Phases</h2>
    ${c.phases.map(p => `<div class="legend">
      <span>${p.label ? esc(p.label.charAt(0).toUpperCase() + p.label.slice(1)) : "Standard"}
        ${p === cur ? '<span style="color:var(--accent);font-size:var(--size-caption)"> \u00B7 current</span>' : ""}</span>
      <span class="num" style="color:var(--text-secondary)">${fmtShort(p.startDate)} \u2192 ${p.endDate ? fmtShort(p.endDate) : "open"} \u00B7 ${money(p.amount)}</span>
    </div>`).join("")}
    <div class="divider" style="margin-bottom:0">
      <button class="btn ghost" onclick="openPanel('${c.id}')">+ Add phase</button>
    </div>
  </div>
  <div class="actions" style="justify-content:flex-start">
    <button class="btn" onclick="openPanel('${c.id}')">Edit</button>
    <button class="btn" onclick="cancelCommitment('${c.id}')" ${c.cancellable ? "" : "disabled title='Fixed term, cannot cancel yet'"}>Cancel commitment</button>
    <button class="btn destructive" onclick="S.modal='${c.id}';renderShell()">Delete</button>
  </div>`;
}

/* ---------- 5. calendar ---------- */

function calendar() {
  const [y, m] = S.calMonth.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;

  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const end = `${y}-${String(m).padStart(2, "0")}-${String(daysIn).padStart(2, "0")}`;
  const charges = Engine.chargesInRange(DATA.commitments, start, end);
  const byDay = {};
  charges.forEach(ch => (byDay[ch.date] ??= []).push(ch));
  const total = charges.reduce((a, c) => a + c.amount, 0);

  let cells = Array(lead).fill('<div class="day blank"></div>');
  for (let d = 1; d <= daysIn; d++) {
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const cs = byDay[iso] || [];
    const sum = cs.reduce((a, c) => a + c.amount, 0);
    const est = cs.some(c => c.isEstimate);
    cells.push(`<div class="day ${cs.length ? "has" : ""} ${iso === TODAY ? "today" : ""}">
      <div class="n num">${d}</div>
      ${cs.length ? `<div class="dots">${cs.map(c => `<i class="${c.amount === 0 ? "zero" : ""}" style="${c.amount === 0 ? "" : "background:" + catVar(c.category)}"></i>`).join("")}</div>
      <div class="tot num ${est ? "est" : ""}">${sum === 0 ? money(0) : moneyShort(sum)}</div>` : ""}
    </div>`);
  }

  return `
  <div class="screen-head">
    <div style="display:flex;align-items:center;gap:var(--space-12)">
      <button class="btn ghost" onclick="shiftMonth(-1)">\u2039</button>
      <h1>${MONTHS[m - 1]} ${y}</h1>
      <button class="btn ghost" onclick="shiftMonth(1)">\u203A</button>
    </div>
    <div style="text-align:right">
      <div class="num" style="font-size:var(--size-title);font-weight:var(--weight-medium)">${money(total)}</div>
      <div class="stamp">${charges.length} charge${charges.length === 1 ? "" : "s"}</div>
    </div>
  </div>
  <div class="cal">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => `<div class="dow">${d}</div>`).join("")}</div>
  <div class="cal" style="margin-top:var(--space-4)">${cells.join("")}</div>`;
}

/* ---------- 6. settings ---------- */

function settings() {
  return `
  <div class="screen-head"><h1>Settings</h1></div>
  <div style="max-width:520px">
    <h2>Currency</h2>
    <div class="card" style="margin-bottom:var(--space-24)">
      <div class="tog"><span>Display currency</span><select style="width:110px"><option>EUR</option><option>USD</option><option>GBP</option></select></div>
      <div class="divider">
        <h2>Rates you maintain</h2>
        ${Object.entries(DATA.rates).map(([k, v]) => `<div class="tog">
          <span class="num">1 ${k} =</span>
          <input type="text" data-num value="${v}" style="width:100px">
        </div>`).join("")}
        <div class="stub" style="border:0;margin-top:var(--space-8)">Rates are never fetched. Update them when you want to.</div>
      </div>
    </div>

    <h2>Data</h2>
    <div class="card" style="margin-bottom:var(--space-32)">
      <div class="tog" style="border-bottom:1px solid var(--border-hairline);padding-bottom:var(--space-12)">
        <div><div>Export</div><div class="stamp num">${DATA.commitments.length} commitments, ${DATA.commitments.reduce((a, c) => a + c.phases.length, 0)} phases</div></div>
        <button class="btn" onclick="exportJson()">Download</button>
      </div>
      <div class="tog"><div><div>Import</div><div class="stamp">Replace or merge with existing</div></div>
        <button class="btn" onclick="importJson()">Choose file</button></div>
    </div>

    <h2>Prototype</h2>
    <div class="card" style="margin-bottom:var(--space-32)">
      <div class="tog"><div><div>Show first run state</div><div class="stamp">Preview the empty screen</div></div>
        <button class="btn" onclick="S.empty=!S.empty;S.screen='dashboard';renderShell()">${S.empty ? "Show data" : "Show empty"}</button></div>
    </div>

    <div class="divider">
      <div class="tog"><div><div>Delete all data</div><div class="stamp">Cannot be undone. Export first.</div></div>
        <button class="btn destructive" onclick="S.modal='all';renderShell()">Delete everything</button></div>
    </div>
  </div>`;
}

/* ---------- overlays ---------- */

function renderPanel() {
  const c = S.panel === true ? null : DATA.commitments.find(x => x.id === S.panel);
  const p = c ? Engine.phaseAt(c, TODAY) : null;
  return `
  <div class="scrim" onclick="if(event.target===this){S.panel=null;S.formErr=null;renderShell()}">
    <div class="panel" role="dialog" aria-label="${c ? "Edit" : "Add"} commitment">
      <div class="panel-head">
        <span class="t">${c ? "Edit commitment" : "Add commitment"}</span>
        <button class="btn ghost" onclick="S.panel=null;S.formErr=null;renderShell()" aria-label="Close">\u2715</button>
      </div>
      <div class="field"><label class="f">Name</label>
        <input type="text" id="f-name" value="${c ? esc(c.name) : ""}" placeholder="Spotify Premium"
          aria-invalid="${S.formErr === "name"}"></div>
      ${S.formErr === "name" ? '<div class="err">Enter a name</div>' : ""}
      <div class="field"><label class="f">Category</label>
        <select id="f-category">${["housing", "insurance", "transport", "utilities", "entertainment", "tools", "health", "other"]
          .map(k => `<option ${c && c.category === k ? "selected" : ""}>${catName(k)}</option>`).join("")}</select></div>
      <div class="field field-row">
        <div><label class="f">Amount</label><input type="text" data-num id="f-amt" value="${p ? (p.amount / 100).toFixed(2) : ""}" placeholder="10.99"></div>
        <div style="flex:0 0 96px"><label class="f">Currency</label><select id="f-currency"><option>EUR</option><option>USD</option><option>GBP</option></select></div>
      </div>
      <div class="field field-row">
        <div><label class="f">Cycle</label><select id="f-cycle">${["Monthly", "Weekly", "Quarterly", "Yearly", "One off"].map(k => `<option>${k}</option>`).join("")}</select></div>
        <div><label class="f">Starts</label><input type="text" class="dp" id="f-starts" value="${p ? fmtDate(p.startDate) : ""}" data-iso="${p ? p.startDate : ""}" readonly></div>
      </div>

      <div class="divider">
        <div class="tog"><span>Starts with a trial or intro price</span>
          <button class="sw" role="switch" aria-checked="${S.trialOn}" onclick="S.trialOn=!S.trialOn;renderShell()"></button></div>
        ${S.trialOn ? `
        <div class="tile" style="margin:var(--space-8) 0">
          <div class="field-row">
            <div><label class="f">Trial price</label><input type="text" data-num value="0.00"></div>
            <div><label class="f">Until</label><input type="text" class="dp" id="f-until" value="" readonly></div>
          </div>
          <div class="stub" style="border:0;margin:var(--space-8) 0 0">Full price starts the day the trial ends.</div>
        </div>` : ""}
        <div class="tog"><span>Has a fixed term</span>
          <button class="sw" role="switch" aria-checked="${S.termOn}" onclick="S.termOn=!S.termOn;renderShell()"></button></div>
        ${S.termOn ? `
        <div class="tile" style="margin:var(--space-8) 0">
          <div class="field"><label class="f">Minimum term ends</label><input type="text" class="dp" id="f-term-end" value="" readonly></div>
        </div>` : ""}
      </div>

      <div class="divider">
        <h2>Preview</h2>
        <div class="tl" style="height:var(--space-24)">
          ${S.trialOn ? '<div class="seg zero" style="flex:0 0 25%"></div>' : ""}
          <div class="seg current" style="flex:1;background:var(--cat-entertainment);opacity:0.3"></div>
        </div>
      </div>

      <div class="actions" style="justify-content:flex-start;margin-top:var(--space-16)">
        <button class="btn" onclick="S.panel=null;S.formErr=null;renderShell()">Cancel</button>
        <button class="btn primary" onclick="saveForm()">Save</button>
      </div>
    </div>
  </div>`;
}

function renderModal() {
  const all = S.modal === "all";
  const c = all ? null : DATA.commitments.find(x => x.id === S.modal);
  return `
  <div class="modal-wrap" onclick="if(event.target===this){S.modal=null;renderShell()}">
    <div class="modal" role="alertdialog">
      <div style="font-size:var(--size-title);font-weight:var(--weight-medium);margin-bottom:var(--space-8)">
        ${all ? "Delete everything?" : `Delete ${esc(c.name)}?`}</div>
      <div style="color:var(--text-secondary);margin-bottom:var(--space-24)">
        ${all ? "All commitments and phases will be removed. Export first if you want a copy." : "Its full phase history goes with it. This cannot be undone."}</div>
      <div class="actions" style="justify-content:flex-end">
        <button class="btn" onclick="S.modal=null;renderShell()">Keep it</button>
        <button class="btn destructive" onclick="confirmDelete()">Delete</button>
      </div>
    </div>
  </div>`;
}

/* ---------- actions ---------- */

function go(s) { S.screen = s; S.panel = null; renderShell(); }
function openDetail(id) { S.detailId = id; S.screen = "detail"; renderShell(); }
function openPanel(id) { S.panel = id || true; S.trialOn = false; S.termOn = false; S.formErr = null; renderShell(); }
function shiftMonth(d) {
  let [y, m] = S.calMonth.split("-").map(Number);
  m += d; if (m > 12) { m = 1; y++; } if (m < 1) { m = 12; y--; }
  S.calMonth = `${y}-${String(m).padStart(2, "0")}`; renderShell();
}
function saveForm() {
  const name = $("#f-name")?.value.trim();
  if (!name) { S.formErr = "name"; renderShell(); return; }

  const category = ($("#f-category")?.value || "other").toLowerCase();
  const amountStr = $("#f-amt")?.value.trim() || "0";
  const amount = Math.round(parseFloat(amountStr) * 100);
  const currency = $("#f-currency")?.value || "EUR";
  const cycleRaw = $("#f-cycle")?.value || "Monthly";
  const cycleMap = { "monthly": "monthly", "weekly": "weekly", "quarterly": "quarterly", "yearly": "yearly", "one off": "oneOff" };
  const cycle = cycleMap[cycleRaw.toLowerCase()] || "monthly";
  const startDate = $("#f-starts")?.dataset.iso || TODAY;

  const phases = [];
  if (S.trialOn) {
    const trialEnd = $("#f-until")?.dataset.iso || startDate;
    const nextDay = ((d) => {
      const dt = new Date(d + "T00:00:00Z");
      dt.setUTCDate(dt.getUTCDate() + 1);
      return dt.toISOString().slice(0, 10);
    })(trialEnd);
    phases.push({ startDate, endDate: trialEnd, amount: 0, currency, cycle, isEstimate: false, label: "trial" });
    phases.push({ startDate: nextDay, endDate: null, amount, currency, cycle, isEstimate: false, label: "" });
  } else {
    phases.push({ startDate, endDate: S.termOn && $("#f-term-end")?.dataset.iso ? $("#f-term-end").dataset.iso : null, amount, currency, cycle, isEstimate: false, label: "" });
  }

  const commitment = { name, category, provider: "", notes: "", cancellable: !S.termOn, phases };

  const isEdit = S.panel !== true;
  const url = isEdit ? `/api/commitments/${S.panel}` : "/api/commitments";
  const method = isEdit ? "PUT" : "POST";

  fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(commitment) })
    .then(r => { if (!r.ok) return r.json().then(e => Promise.reject(e)); return r.json(); })
    .then(() => { S.formErr = null; S.panel = null; load(); })
    .catch(e => { S.formErr = e.field || "name"; renderShell(); });
}

async function confirmDelete() {
  const isAll = S.modal === "all";
  if (isAll) {
    await fetch("/api/data", { method: "DELETE" });
  } else {
    await fetch(`/api/commitments/${S.modal}`, { method: "DELETE" });
  }
  S.modal = null;
  S.screen = isAll ? "settings" : "list";
  await load();
}

async function cancelCommitment(id) {
  await fetch(`/api/commitments/${id}/cancel`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cancelledDate: TODAY })
  });
  await load();
}

async function importJson() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    const text = await file.text();
    const data = JSON.parse(text);
    await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    await load();
  };
  input.click();
}

async function loadSeedData() {
  const seed = await (await fetch("/seed.json")).json();
  await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(seed) });
  await load();
}
function toggleTheme() {
  const el = document.documentElement;
  el.dataset.theme = el.dataset.theme === "dark" ? "light" : "dark";
}
function exportJson() {
  const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "ledger-export.json"; a.click();
}

function initDatePickers() {
  document.querySelectorAll(".dp").forEach(el => {
    if (el._flatpickr) return;
    flatpickr(el, {
      dateFormat: "j M Y",
      allowInput: false,
      defaultDate: el.dataset.iso || null,
      onChange(dates, str, fp) { el.dataset.iso = fp.formatDate(dates[0], "Y-m-d"); }
    });
  });
}

async function load() {
  const res = await fetch("/api/commitments");
  const json = await res.json();
  DATA = json;
  TODAY = json.today;
  S.empty = DATA.commitments.length === 0;
  if (!S.calMonth) S.calMonth = TODAY.slice(0, 7);
  renderShell();
}

load();
