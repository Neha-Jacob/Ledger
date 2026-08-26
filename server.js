const express = require("express");
const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");
const crypto = require("node:crypto");
const Engine = require("./engine.js");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "ledger.db");
const PORT = process.env.PORT || 3000;

const db = new DatabaseSync(DB_PATH);

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS commitments (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    category      TEXT NOT NULL CHECK(category IN ('housing','insurance','transport','utilities','entertainment','tools','health','other')),
    provider      TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')),
    anchorDate    TEXT,
    cancellable   INTEGER NOT NULL DEFAULT 1,
    cancelledDate TEXT,
    notes         TEXT NOT NULL DEFAULT '',
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
  )
`);

const commitmentColumns = db.prepare("PRAGMA table_info(commitments)").all();
if (!commitmentColumns.some(column => column.name === "anchorDate")) {
  db.exec("ALTER TABLE commitments ADD COLUMN anchorDate TEXT");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS phases (
    id            TEXT NOT NULL,
    commitmentId  TEXT NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
    startDate     TEXT NOT NULL,
    endDate       TEXT,
    amount        INTEGER NOT NULL,
    currency      TEXT NOT NULL DEFAULT 'EUR',
    cycle         TEXT NOT NULL CHECK(cycle IN ('weekly','monthly','quarterly','yearly','oneOff')),
    isEstimate    INTEGER NOT NULL DEFAULT 0,
    label         TEXT NOT NULL DEFAULT '',
    sortOrder     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (commitmentId, id)
  )
`);

if (!commitmentColumns.some(column => column.name === "anchorDate")) {
  db.exec(`
    UPDATE commitments
    SET anchorDate = (
      SELECT startDate FROM phases
      WHERE phases.commitmentId = commitments.id
      ORDER BY sortOrder LIMIT 1
    )
    WHERE anchorDate IS NULL
  `);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

const defaultSettings = [
  ["displayCurrency", "EUR"],
  ["rates", JSON.stringify({ USD: 0.92, GBP: 1.17 })],
];
const upsertSetting = db.prepare(
  "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)"
);
for (const [k, v] of defaultSettings) upsertSetting.run(k, v);

function todayISO() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function genId(prefix) {
  return prefix + crypto.randomUUID().slice(0, 8);
}

function getSettings() {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return {
    displayCurrency: out.displayCurrency || "EUR",
    rates: JSON.parse(out.rates || "{}"),
  };
}

function rowToCommitment(row) {
  const phases = db
    .prepare(
      "SELECT * FROM phases WHERE commitmentId = ? ORDER BY sortOrder"
    )
    .all(row.id)
    .map((p) => ({
      id: p.id,
      startDate: p.startDate,
      endDate: p.endDate || null,
      amount: p.amount,
      currency: p.currency,
      cycle: p.cycle,
      isEstimate: !!p.isEstimate,
      label: p.label,
    }));
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    provider: row.provider,
    status: row.status,
    anchorDate: row.anchorDate || null,
    cancellable: !!row.cancellable,
    cancelledDate: row.cancelledDate || null,
    notes: row.notes,
    phases,
  };
}

function getAllCommitments() {
  return db
    .prepare("SELECT * FROM commitments ORDER BY name")
    .all()
    .map(rowToCommitment);
}

function insertCommitment(c) {
  const now = todayISO();
  const id = c.id || genId("c_");
  db.prepare(
    `INSERT INTO commitments (id, name, category, provider, status, anchorDate, cancellable, cancelledDate, notes, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    c.name,
    c.category,
    c.provider || "",
    c.status || "active",
    c.anchorDate || c.phases?.[0]?.startDate || null,
    c.cancellable === false ? 0 : 1,
    c.cancelledDate || null,
    c.notes || "",
    c.createdAt || now,
    c.updatedAt || now
  );
  if (c.phases) {
    const ins = db.prepare(
      `INSERT INTO phases (id, commitmentId, startDate, endDate, amount, currency, cycle, isEstimate, label, sortOrder)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    c.phases.forEach((p, i) => {
      ins.run(
        p.id || `p${i + 1}`,
        id,
        p.startDate,
        p.endDate || null,
        p.amount,
        p.currency || "EUR",
        p.cycle,
        p.isEstimate ? 1 : 0,
        p.label || "",
        i
      );
    });
  }
  return id;
}

function validateCommitmentWrite(anchorDate, phases) {
  const phaseValidation = Engine.validatePhases(phases);
  const anchorValidation = Engine.validateAnchorDate(anchorDate, phases);
  return [...phaseValidation.errors, ...anchorValidation.errors];
}

function importData(data) {
  db.exec("DELETE FROM phases");
  db.exec("DELETE FROM commitments");
  if (data.displayCurrency) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
      "displayCurrency",
      data.displayCurrency
    );
  }
  if (data.rates) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
      "rates",
      JSON.stringify(data.rates)
    );
  }
  for (const c of data.commitments || []) {
    insertCommitment(c);
  }
}

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname)));

app.get("/api/today", (_req, res) => {
  res.json({ today: todayISO() });
});

app.get("/api/commitments", (_req, res) => {
  const s = getSettings();
  res.json({
    today: todayISO(),
    displayCurrency: s.displayCurrency,
    rates: s.rates,
    commitments: getAllCommitments(),
  });
});

app.get("/api/commitments/:id", (req, res) => {
  const row = db
    .prepare("SELECT * FROM commitments WHERE id = ?")
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ commitment: rowToCommitment(row) });
});

app.post("/api/commitments", (req, res) => {
  const c = req.body;
  if (!c.name || !c.name.trim()) {
    return res.status(400).json({ error: "Name is required", field: "name" });
  }
  if (!c.phases || !c.phases.length) {
    return res.status(400).json({ error: "At least one phase is required" });
  }
  const errors = validateCommitmentWrite(
    c.anchorDate || c.phases[0].startDate,
    c.phases
  );
  if (errors.length) {
    return res.status(400).json({ errors });
  }
  const id = insertCommitment(c);
  const row = db.prepare("SELECT * FROM commitments WHERE id = ?").get(id);
  res.status(201).json({ commitment: rowToCommitment(row) });
});

app.put("/api/commitments/:id", (req, res) => {
  const existing = db
    .prepare("SELECT * FROM commitments WHERE id = ?")
    .get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const c = req.body;
  if (!c.name || !c.name.trim()) {
    return res.status(400).json({ error: "Name is required", field: "name" });
  }
  if (c.phases) {
    const errors = validateCommitmentWrite(
      c.anchorDate ?? existing.anchorDate ?? c.phases[0].startDate,
      c.phases
    );
    if (errors.length) {
      return res.status(400).json({ errors });
    }
  } else {
    const phases = rowToCommitment(existing).phases;
    const errors = validateCommitmentWrite(
      c.anchorDate ?? existing.anchorDate ?? phases[0].startDate,
      phases
    );
    if (errors.length) return res.status(400).json({ errors });
  }

  const now = todayISO();
  db.prepare(
    `UPDATE commitments SET name=?, category=?, provider=?, status=?, anchorDate=?, cancellable=?, cancelledDate=?, notes=?, updatedAt=?
     WHERE id=?`
  ).run(
    c.name,
    c.category || existing.category,
    c.provider ?? existing.provider,
    c.status || existing.status,
    c.anchorDate ?? existing.anchorDate,
    c.cancellable === false ? 0 : 1,
    c.cancelledDate || null,
    c.notes ?? existing.notes,
    now,
    req.params.id
  );

  if (c.phases) {
    db.prepare("DELETE FROM phases WHERE commitmentId = ?").run(req.params.id);
    const ins = db.prepare(
      `INSERT INTO phases (id, commitmentId, startDate, endDate, amount, currency, cycle, isEstimate, label, sortOrder)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    c.phases.forEach((p, i) => {
      ins.run(
        p.id || `p${i + 1}`,
        req.params.id,
        p.startDate,
        p.endDate || null,
        p.amount,
        p.currency || "EUR",
        p.cycle,
        p.isEstimate ? 1 : 0,
        p.label || "",
        i
      );
    });
  }

  const row = db
    .prepare("SELECT * FROM commitments WHERE id = ?")
    .get(req.params.id);
  res.json({ commitment: rowToCommitment(row) });
});

app.delete("/api/commitments/:id", (req, res) => {
  const result = db
    .prepare("DELETE FROM commitments WHERE id = ?")
    .run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

app.patch("/api/commitments/:id/cancel", (req, res) => {
  const existing = db
    .prepare("SELECT * FROM commitments WHERE id = ?")
    .get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const cancelledDate = req.body.cancelledDate || todayISO();
  db.prepare(
    "UPDATE commitments SET status='cancelled', cancelledDate=?, updatedAt=? WHERE id=?"
  ).run(cancelledDate, todayISO(), req.params.id);

  const row = db
    .prepare("SELECT * FROM commitments WHERE id = ?")
    .get(req.params.id);
  res.json({ commitment: rowToCommitment(row) });
});

app.get("/api/settings", (_req, res) => {
  res.json(getSettings());
});

app.put("/api/settings", (req, res) => {
  const upsert = db.prepare(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)"
  );
  if (req.body.displayCurrency) {
    upsert.run("displayCurrency", req.body.displayCurrency);
  }
  if (req.body.rates) {
    upsert.run("rates", JSON.stringify(req.body.rates));
  }
  res.json(getSettings());
});

app.get("/api/export", (_req, res) => {
  const s = getSettings();
  const data = {
    displayCurrency: s.displayCurrency,
    rates: s.rates,
    commitments: getAllCommitments(),
  };
  res.setHeader("Content-Disposition", "attachment; filename=ledger-export.json");
  res.json(data);
});

app.post("/api/import", (req, res) => {
  const data = req.body;
  if (!data.commitments || !Array.isArray(data.commitments)) {
    return res.status(400).json({ error: "Invalid format: commitments array required" });
  }
  const phaseErrors = data.commitments.flatMap((c) => {
    if (!c.phases || !c.phases.length) return [];
    return validateCommitmentWrite(
      c.anchorDate || c.phases[0].startDate,
      c.phases
    );
  });
  if (phaseErrors.length) {
    return res.status(400).json({ errors: phaseErrors });
  }
  importData(data);
  res.json({ ok: true, imported: data.commitments.length });
});

app.delete("/api/data", (req, res) => {
  db.exec("DELETE FROM phases");
  db.exec("DELETE FROM commitments");
  res.json({ ok: true });
});

const server = app.listen(PORT, () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : PORT;
  console.log(`Ledger running at http://localhost:${port}`);
});
