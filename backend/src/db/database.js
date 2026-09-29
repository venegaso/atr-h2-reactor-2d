'use strict';
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { CATALYSTS } = require('../kinetics/catalysts');
const { REACTIONS } = require('../kinetics/reactions');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = process.env.SQLITE_PATH || path.join(DATA_DIR, 'atr_reactor.sqlite3');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

function seedIfEmpty() {
  const countCat = db.prepare('SELECT COUNT(*) AS n FROM catalysts').get().n;
  const tx = db.transaction(() => {
    const upsertReaction = db.prepare(`
      INSERT INTO reactions (id, name, stoichiometry_json, dH_J_mol, reversible)
      VALUES (@id, @name, @stoichiometry_json, @dH_J_mol, @reversible)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, stoichiometry_json=excluded.stoichiometry_json,
        dH_J_mol=excluded.dH_J_mol, reversible=excluded.reversible
    `);
    for (const r of REACTIONS) {
      upsertReaction.run({
        id: r.id,
        name: r.name,
        stoichiometry_json: JSON.stringify(r.nu),
        dH_J_mol: r.dH,
        reversible: r.reversible ? 1 : 0,
      });
    }

    const upsertCatalyst = db.prepare(`
      INSERT INTO catalysts (key, label, description, homogeneous, epsilon_b, rho_b_kg_m3, dp_m, eta)
      VALUES (@key, @label, @description, @homogeneous, @epsilon_b, @rho_b_kg_m3, @dp_m, @eta)
      ON CONFLICT(key) DO UPDATE SET
        label=excluded.label, description=excluded.description, homogeneous=excluded.homogeneous,
        epsilon_b=excluded.epsilon_b, rho_b_kg_m3=excluded.rho_b_kg_m3, dp_m=excluded.dp_m, eta=excluded.eta
    `);
    const upsertKinetic = db.prepare(`
      INSERT INTO kinetic_parameters (catalyst_key, reaction_id, A, Ea_J_mol, order_hint)
      VALUES (@catalyst_key, @reaction_id, @A, @Ea_J_mol, @order_hint)
      ON CONFLICT(catalyst_key, reaction_id) DO UPDATE SET
        A=excluded.A, Ea_J_mol=excluded.Ea_J_mol, order_hint=excluded.order_hint
    `);
    const upsertAdsorption = db.prepare(`
      INSERT INTO adsorption_parameters (catalyst_key, species, K0_bar_inv, dHads_J_mol)
      VALUES (@catalyst_key, @species, @K0_bar_inv, @dHads_J_mol)
      ON CONFLICT(catalyst_key, species) DO UPDATE SET
        K0_bar_inv=excluded.K0_bar_inv, dHads_J_mol=excluded.dHads_J_mol
    `);

    for (const c of Object.values(CATALYSTS)) {
      upsertCatalyst.run({
        key: c.key,
        label: c.label,
        description: c.description,
        homogeneous: c.homogeneous ? 1 : 0,
        epsilon_b: c.bed.epsilon_b,
        rho_b_kg_m3: c.bed.rho_b,
        dp_m: c.bed.dp,
        eta: c.eta,
      });
      for (const [reactionId, k] of Object.entries(c.kinetics)) {
        upsertKinetic.run({
          catalyst_key: c.key, reaction_id: reactionId, A: k.A, Ea_J_mol: k.Ea, order_hint: k.order ?? null,
        });
      }
      for (const [species, a] of Object.entries(c.adsorption)) {
        upsertAdsorption.run({
          catalyst_key: c.key, species, K0_bar_inv: a.K0, dHads_J_mol: a.dHads,
        });
      }
    }
  });
  tx();
  return countCat;
}

seedIfEmpty();

function insertSimulationRecord(rec) {
  const stmt = db.prepare(`
    INSERT INTO simulation_history
      (catalyst_key, T_in_C, P_in_bar, O2_EtOH, S_E, W_F_EtOH,
       Y_H2_pct, pctH2_dry, X_EtOH_pct, T_hotspot_C, T_coldspot_C,
       inputs_json, result_summary_json)
    VALUES (@catalyst_key, @T_in_C, @P_in_bar, @O2_EtOH, @S_E, @W_F_EtOH,
       @Y_H2_pct, @pctH2_dry, @X_EtOH_pct, @T_hotspot_C, @T_coldspot_C,
       @inputs_json, @result_summary_json)
  `);
  const info = stmt.run(rec);
  return info.lastInsertRowid;
}

function listHistory(limit = 50) {
  return db.prepare(`
    SELECT id, created_at, catalyst_key, T_in_C, P_in_bar, O2_EtOH, S_E, W_F_EtOH,
           Y_H2_pct, pctH2_dry, X_EtOH_pct, T_hotspot_C, T_coldspot_C
    FROM simulation_history
    ORDER BY id DESC
    LIMIT ?
  `).all(limit);
}

function getHistoryRecord(id) {
  const row = db.prepare('SELECT * FROM simulation_history WHERE id = ?').get(id);
  if (!row) return null;
  return {
    ...row,
    inputs: row.inputs_json ? JSON.parse(row.inputs_json) : null,
    result_summary: row.result_summary_json ? JSON.parse(row.result_summary_json) : null,
  };
}

function clearHistory() {
  db.prepare('DELETE FROM simulation_history').run();
}

function getCatalystCatalog() {
  const cats = db.prepare('SELECT * FROM catalysts').all();
  const kin = db.prepare('SELECT * FROM kinetic_parameters').all();
  const ads = db.prepare('SELECT * FROM adsorption_parameters').all();
  return cats.map((c) => ({
    ...c,
    kinetics: kin.filter((k) => k.catalyst_key === c.key),
    adsorption: ads.filter((a) => a.catalyst_key === c.key),
  }));
}

function getReactionCatalog() {
  return db.prepare('SELECT * FROM reactions').all().map((r) => ({
    ...r,
    stoichiometry: JSON.parse(r.stoichiometry_json),
  }));
}

module.exports = {
  db,
  seedIfEmpty,
  insertSimulationRecord,
  listHistory,
  getHistoryRecord,
  clearHistory,
  getCatalystCatalog,
  getReactionCatalog,
};
