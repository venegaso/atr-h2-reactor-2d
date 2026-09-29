'use strict';
const express = require('express');
const { pool } = require('../solver/workerPool');

const router = express.Router();

const PARAM_RANGES = {
  T_in_C: { min: 300, max: 900, label: 'Temperatura de alimentacion (C)' },
  P_in_bar: { min: 0.8, max: 6, label: 'Presion del reactor (bar)' },
  O2_EtOH: { min: 0, max: 1.0, label: 'Relacion O2/EtOH (mol/mol)' },
  S_E: { min: 0.5, max: 8, label: 'Relacion H2O/EtOH, S/E (mol/mol)' },
  W_F_EtOH: { min: 1, max: 120, label: 'W/F_EtOH (kg cat s/mol)' },
};

router.post('/sensitivity', async (req, res) => {
  const body = req.body || {};
  const param = body.param;
  if (!PARAM_RANGES[param]) {
    return res.status(400).json({
      error: 'invalid_param',
      allowed: Object.keys(PARAM_RANGES),
    });
  }
  const range = PARAM_RANGES[param];
  try {
    // El barrido completo (varias corridas del solver) se delega ENTERO a
    // un worker_thread: asi el hilo principal de Express sigue libre para
    // atender /api/simulate mientras el barrido de sensibilidad corre en
    // paralelo, en vez de bloquear todas las demas peticiones.
    const { results, base } = await pool.run('sensitivity', {
      ...body, min: body.min ?? range.min, max: body.max ?? range.max,
    }, 30000);
    return res.json({
      param, label: range.label, base, results,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'sensitivity_failed', message: err.message });
  }
});

module.exports = router;
