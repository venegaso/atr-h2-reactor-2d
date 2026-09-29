'use strict';
// Worker de calculo (worker_threads): ejecuta runSimulation() FUERA del
// event loop principal de Express. Sin esto, una corrida pesada (o un
// barrido de sensibilidad de 10-25 corridas) bloquea el hilo unico de
// Node y hace que TODAS las demas peticiones (incluida la simulacion
// principal que el usuario esta viendo) se queden esperando en fila -
// justo lo contrario de "tiempo real". Cada worker es un proceso liviano
// con su propia copia del solver; el pool (workerPool.js) reparte tareas
// entre varios para aprovechar los nucleos disponibles.
const { parentPort } = require('worker_threads');
const { runSimulation } = require('./pde2d');
const { findTemperatureForTargetYield } = require('./inverseSolve');

function runSensitivitySweep(body) {
  const PARAM_RANGES = {
    T_in_C: { min: 300, max: 900 },
    P_in_bar: { min: 0.8, max: 6 },
    O2_EtOH: { min: 0, max: 1.0 },
    S_E: { min: 0.5, max: 8 },
    W_F_EtOH: { min: 1, max: 120 },
  };
  const range = PARAM_RANGES[body.param];
  const min = body.min ?? range.min;
  const max = body.max ?? range.max;
  const points = Math.max(3, Math.min(25, Number(body.points) || 10));
  const base = {
    catalyst: body.catalyst || 'nico',
    T_in_C: body.T_in_C ?? 550,
    P_in_bar: body.P_in_bar ?? 1.5,
    O2_EtOH: body.O2_EtOH ?? 0.4,
    S_E: body.S_E ?? 3.0,
    W_F_EtOH: body.W_F_EtOH ?? 15,
    Nr: 8,
    // Barrido rapido: umbral de resolucion axial mas relajado que la
    // simulacion principal (es una tendencia, no el perfil detallado que
    // se muestra en los graficos axiales/radiales).
    fastMode: true,
  };
  const values = [];
  for (let i = 0; i < points; i++) values.push(points <= 1 ? min : min + ((max - min) * i) / (points - 1));
  const results = values.map((v) => {
    const r = runSimulation({ ...base, [body.param]: v });
    return {
      value: v,
      Y_H2_pct: r.kpis.Y_H2_pct,
      pctH2_dry: r.kpis.pctH2_dry,
      X_EtOH_pct: r.kpis.X_EtOH_pct,
      T_hotspot_C: r.kpis.T_hotspot_C,
      deltaP_bar: r.kpis.deltaP_bar,
    };
  });
  return { param: body.param, base, results };
}

parentPort.on('message', (msg) => {
  const { id, type, payload } = msg;
  try {
    let result;
    if (type === 'simulate') result = runSimulation(payload);
    else if (type === 'sensitivity') result = runSensitivitySweep(payload);
    else if (type === 'inverseYield') {
      const { targetYH2Pct, ...baseInputs } = payload;
      result = findTemperatureForTargetYield(targetYH2Pct, baseInputs);
    } else throw new Error(`tipo de tarea desconocido: ${type}`);
    parentPort.postMessage({ id, ok: true, result });
  } catch (err) {
    parentPort.postMessage({ id, ok: false, error: err.message });
  }
});
