'use strict';
const express = require('express');
const { pool } = require('../solver/workerPool');
const { insertSimulationRecord } = require('../db/database');

const router = express.Router();

function validateInputs(body) {
  const errors = [];
  const allowed = ['none', 'nico', 'nicoce', 'hydrotalcite'];
  if (body.catalyst && !allowed.includes(body.catalyst)) {
    errors.push(`catalyst debe ser uno de: ${allowed.join(', ')}`);
  }
  const numChecks = [
    ['T_in_C', 150, 1000],
    ['P_in_bar', 0.5, 10],
    ['O2_EtOH', 0, 2],
    ['S_E', 0.2, 12],
    ['W_F_EtOH', 0.001, 1000],
  ];
  for (const [key, min, max] of numChecks) {
    if (body[key] !== undefined) {
      const v = Number(body[key]);
      if (Number.isNaN(v)) errors.push(`${key} debe ser numerico`);
      else if (v < min || v > max) errors.push(`${key} fuera de rango [${min}, ${max}]`);
    }
  }
  return errors;
}

router.post('/simulate', async (req, res) => {
  const errors = validateInputs(req.body || {});
  if (errors.length) return res.status(400).json({ error: 'invalid_input', details: errors });

  try {
    const result = await pool.run('simulate', req.body || {});
    if (req.body && req.body.save !== false) {
      try {
        insertSimulationRecord({
          catalyst_key: result.inputs.catalyst,
          T_in_C: result.inputs.T_in_C,
          P_in_bar: result.inputs.P_in_bar,
          O2_EtOH: result.inputs.O2_EtOH,
          S_E: result.inputs.S_E,
          W_F_EtOH: result.inputs.W_F_EtOH,
          Y_H2_pct: result.kpis.Y_H2_pct,
          pctH2_dry: result.kpis.pctH2_dry,
          X_EtOH_pct: result.kpis.X_EtOH_pct,
          T_hotspot_C: result.kpis.T_hotspot_C,
          T_coldspot_C: result.kpis.T_coldspot_C,
          inputs_json: JSON.stringify(result.inputs),
          result_summary_json: JSON.stringify({ kpis: result.kpis, outlet: result.outlet }),
        });
      } catch (dbErr) {
        // eslint-disable-next-line no-console
        console.error('No se pudo guardar el historial de simulacion:', dbErr.message);
      }
    }
    return res.json(result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'simulation_failed', message: err.message });
  }
});

module.exports = router;
