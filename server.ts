import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database("vlan_tracker.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS networks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    network_id TEXT,
    report_date TEXT,
    raw_data TEXT,
    parsed_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(network_id, report_date),
    FOREIGN KEY(network_id) REFERENCES networks(id)
  );

  CREATE TABLE IF NOT EXISTS vlan_names (
    network_id TEXT,
    vlan_number INTEGER,
    name TEXT,
    PRIMARY KEY(network_id, vlan_number)
  );
`);

// Seed default networks if empty
const networkCount = db.prepare("SELECT COUNT(*) as count FROM networks").get() as { count: number };
if (networkCount.count === 0) {
  db.prepare("INSERT INTO networks (id, name) VALUES (?, ?)").run("network_1", "R1");
  db.prepare("INSERT INTO networks (id, name) VALUES (?, ?)").run("network_2", "R2");
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // API Routes
  app.get("/api/networks", (req, res) => {
    const networks = db.prepare("SELECT * FROM networks").all();
    res.json(networks);
  });

  app.get("/api/reports/:networkId", (req, res) => {
    const reports = db.prepare("SELECT * FROM reports WHERE network_id = ? ORDER BY report_date DESC").all(req.params.networkId);
    res.json(reports);
  });

  app.post("/api/reports", (req, res) => {
    const { networkId, reportDate, rawData, parsedJson, vlanNames } = req.body;
    
    const transaction = db.transaction(() => {
      // Save report
      db.prepare(`
        INSERT OR REPLACE INTO reports (network_id, report_date, raw_data, parsed_json)
        VALUES (?, ?, ?, ?)
      `).run(networkId, reportDate, rawData, JSON.stringify(parsedJson));

      // Update VLAN names
      const updateName = db.prepare(`
        INSERT OR REPLACE INTO vlan_names (network_id, vlan_number, name)
        VALUES (?, ?, ?)
      `);
      
      for (const [num, name] of Object.entries(vlanNames)) {
        updateName.run(networkId, num, name);
      }
    });

    transaction();
    res.json({ success: true });
  });

  app.get("/api/vlan-names/:networkId", (req, res) => {
    const names = db.prepare("SELECT vlan_number, name FROM vlan_names WHERE network_id = ?").all(req.params.networkId);
    const nameMap = names.reduce((acc: any, curr: any) => {
      acc[curr.vlan_number] = curr.name;
      return acc;
    }, {});
    res.json(nameMap);
  });

  app.delete("/api/reports/:networkId/:date", (req, res) => {
    db.prepare("DELETE FROM reports WHERE network_id = ? AND report_date = ?").run(req.params.networkId, req.params.date);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
