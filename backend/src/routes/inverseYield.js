'use strict';
const express = require('express');
const { pool } = require('../solver/workerPool');

const router = express.Router();

const allowedCatalysts = ['none', 'nico', 'nicoce', 'hydrotalcite'];

function validate(body) {
  const errors = [];
  const target = Number(body.targetYH2Pct);
  if (Number.isNaN(target) || target <= 0 || target >= 100) {
    errors.push('targetYH2Pct debe ser numerico y estar entre 0 y 100');
  }
  if (body.catalyst && !allowedCatalysts.includes(body.catalyst)) {
    errors.push(`catalyst debe ser uno de: ${allowedCatalysts.join(', ')}`);
  }
  const numChecks = [
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

// Problema inverso: dado un %H2 objetivo, busca la temperatura de
// alimentacion (T_in_C) que lo produce dejando fijas las demas variables
// (catalizador, P, O2/EtOH, S/E, W_F_EtOH). El resultado devuelve tanto la
// T encontrada como la corrida completa del solver en esa T, para que el
// frontend pueda mostrar KPIs y perfiles exactamente igual que con
// /api/simulate.
router.post('/inverse-yield', async (req, res) => {
  const body = req.body || {};
  const errors = validate(body);
  if (errors.length) return res.status(400).json({ error: 'invalid_input', details: errors });

  try {
    const out = await pool.run('inverseYield', {
      ...body,
      targetYH2Pct: Number(body.targetYH2Pct),
    }, 25000);
    return res.json(out);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'inverse_solve_failed', message: err.message });
  }
});

module.exports = router;
