'use strict';
// Problema inverso: dado un %H2 objetivo (Y_H2), encuentra la temperatura
// de alimentacion T_in_C que lo produce, dejando fijas las demas variables
// de operacion (P, O2/EtOH, S/E, catalizador, W_F_EtOH/tau). Se apoya en la
// tendencia monotona creciente de Y_H2 con T verificada en el barrido de
// sensibilidad (mas temperatura -> mas conversion -> mas H2 generado, en el
// rango operativo 300-900 C) para hacer una busqueda por biseccion sobre
// corridas reales del solver 2D (no una aproximacion/interpolacion).
//
// IMPORTANTE: toda la busqueda usa resolucion COMPLETA (sin fastMode), no
// solo el punto final. fastMode relaja Nz (pasos axiales) para los
// barridos de sensibilidad, lo que desplaza Y_H2 varios puntos
// porcentuales frente a la resolucion completa - suficiente para que la T
// encontrada en fastMode ya no reproduzca el %H2 objetivo una vez se
// recalcula a resolucion completa. Buscar y mostrar deben usar la misma
// resolucion, así que cada evaluacion de la biseccion guarda su corrida
// completa y la ultima evaluada se reutiliza como resultado final (nunca
// se corre el solver "una vez de mas" solo para refinar).
const { runSimulation } = require('./pde2d');

const T_MIN_C = 300;
const T_MAX_C = 900;

function runAt(baseInputs, T_in_C) {
  return runSimulation({ ...baseInputs, T_in_C });
}

/**
 * @param {number} targetYH2Pct  Y_H2 (%) que se quiere alcanzar
 * @param {object} baseInputs    catalyst, P_in_bar, O2_EtOH, S_E, W_F_EtOH (sin T_in_C)
 */
function findTemperatureForTargetYield(targetYH2Pct, baseInputs, opts = {}) {
  const tol = opts.tol ?? 0.2; // C de tolerancia en la biseccion
  const maxIter = opts.maxIter ?? 16;

  const rLo = runAt(baseInputs, T_MIN_C);
  const rHi = runAt(baseInputs, T_MAX_C);
  const yLo = rLo.kpis.Y_H2_pct;
  const yHi = rHi.kpis.Y_H2_pct;

  let achieved = true;
  let lastRun;

  if (targetYH2Pct <= yLo) {
    lastRun = rLo;
    achieved = targetYH2Pct >= yLo - 1e-6;
  } else if (targetYH2Pct >= yHi) {
    lastRun = rHi;
    achieved = targetYH2Pct <= yHi + 1e-6;
  } else {
    let a = T_MIN_C;
    let b = T_MAX_C;
    let fa = yLo - targetYH2Pct;
    lastRun = yLo <= yHi ? rLo : rHi; // se reemplaza en la primera iteracion
    for (let i = 0; i < maxIter; i++) {
      const mid = (a + b) / 2;
      const rMid = runAt(baseInputs, mid);
      lastRun = rMid;
      const fm = rMid.kpis.Y_H2_pct - targetYH2Pct;
      if (Math.abs(fm) < tol || (b - a) < 0.2) break;
      if ((fa < 0 && fm < 0) || (fa > 0 && fm > 0)) {
        a = mid;
        fa = fm;
      } else {
        b = mid;
      }
    }
  }

  return {
    T_in_C: lastRun.inputs.T_in_C,
    achieved,
    targetYH2Pct,
    achievedYH2Pct: lastRun.kpis.Y_H2_pct,
    bounds: {
      T_min_C: T_MIN_C, T_max_C: T_MAX_C, Y_H2_at_Tmin: yLo, Y_H2_at_Tmax: yHi,
    },
    result: lastRun,
  };
}

module.exports = { findTemperatureForTargetYield, T_MIN_C, T_MAX_C };
