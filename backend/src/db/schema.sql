-- Esquema SQLite para el catalogo cinetico y el historial de simulaciones
-- del reactor 2D ATR de bioetanol.

CREATE TABLE IF NOT EXISTS catalysts (
  key           TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  description   TEXT,
  homogeneous   INTEGER NOT NULL DEFAULT 0,
  epsilon_b     REAL NOT NULL,
  rho_b_kg_m3   REAL NOT NULL,
  dp_m          REAL NOT NULL,
  eta           REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS reactions (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  stoichiometry_json  TEXT NOT NULL,
  dH_J_mol            REAL NOT NULL,
  reversible          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kinetic_parameters (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  catalyst_key  TEXT NOT NULL REFERENCES catalysts(key) ON DELETE CASCADE,
  reaction_id   TEXT NOT NULL REFERENCES reactions(id),
  A             REAL NOT NULL,
  Ea_J_mol      REAL NOT NULL,
  order_hint    INTEGER,
  UNIQUE(catalyst_key, reaction_id)
);

CREATE TABLE IF NOT EXISTS adsorption_parameters (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  catalyst_key  TEXT NOT NULL REFERENCES catalysts(key) ON DELETE CASCADE,
  species       TEXT NOT NULL,
  K0_bar_inv    REAL NOT NULL,
  dHads_J_mol   REAL NOT NULL,
  UNIQUE(catalyst_key, species)
);

CREATE TABLE IF NOT EXISTS simulation_history (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  catalyst_key        TEXT NOT NULL,
  T_in_C              REAL,
  P_in_bar            REAL,
  O2_EtOH             REAL,
  S_E                 REAL,
  W_F_EtOH            REAL,
  Y_H2_pct            REAL,
  pctH2_dry           REAL,
  X_EtOH_pct          REAL,
  T_hotspot_C         REAL,
  T_coldspot_C        REAL,
  inputs_json         TEXT,
  result_summary_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_history_created_at ON simulation_history(created_at);
CREATE INDEX IF NOT EXISTS idx_history_catalyst ON simulation_history(catalyst_key);
