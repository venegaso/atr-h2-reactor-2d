'use strict';
const { SPECIES, R_GAS, REACTIONS, DHF, S0 } = require('./reactions');
const { CATALYSTS } = require('./catalysts');

function arrhenius(A, Ea, T) {
  return A * Math.exp(-Ea / (R_GAS * T));
}

function vantHoff(K0, dHads, T) {
  // K0 evaluado como valor de referencia a 573 K (~300 C, punto medio
  // tipico de operacion ATR) para que los K_i queden en un rango fisico
  // (~0.05 - 5 bar^-1) dentro de la ventana de operacion del deslizador.
  const T_REF = 573.15;
  return K0 * Math.exp((-dHads / R_GAS) * (1 / T - 1 / T_REF));
}

// Constante de equilibrio del WGS (correlacion de Moe, 1962; T en K),
// ampliamente usada en modelos de reformado - adimensional.
function keqWGS(T) {
  return Math.exp(4577.8 / T - 4.33);
}

// Para R1 (ESR global) y R3 (MSR) se estima Keq(T) via DG = DH - T*DS
// (DH, DS de 298 K asumidos ~constantes en el rango de operacion, practica
// habitual en modelos de reactor de primer nivel). Keq queda expresado en
// las mismas unidades de presion (bar) usadas para P_i en todo el modulo.
function reactionThermo(nu) {
  let dH = 0;
  let dS = 0;
  for (const sp of SPECIES) {
    const n = nu[sp] || 0;
    dH += n * DHF[sp];
    dS += n * S0[sp];
  }
  return { dH, dS };
}

const R1 = REACTIONS.find((r) => r.id === 'R1_ESR');
const R3 = REACTIONS.find((r) => r.id === 'R3_MSR');
const THERMO_R1 = reactionThermo(R1.nu);
const THERMO_R3 = reactionThermo(R3.nu);

function keqFromThermo(thermo, T) {
  const dG = thermo.dH - T * thermo.dS;
  return Math.exp(-dG / (R_GAS * T));
}

function clampPos(x) { return x > 0 ? x : 0; }

/**
 * Convierte concentraciones molares locales (mol/m3) a presiones parciales
 * (bar) usando la ley de gases ideales: P_i = C_i * R * T (Pa) / 1e5.
 */
function partialPressuresBar(C, T) {
  const P = {};
  for (let i = 0; i < SPECIES.length; i++) {
    P[SPECIES[i]] = clampPos(C[i]) * R_GAS * T / 1e5;
  }
  return P;
}

/**
 * Calcula el denominador de adsorcion competitiva LHHW, Omega:
 *   Omega = 1 + K_EtOH P_EtOH + K_H2O P_H2O + K_CO P_CO + K_CO2 P_CO2
 *             + K_H2^0.5 P_H2^0.5 + K_CH4 P_CH4
 */
function omegaLHHW(P, T, adsorption) {
  const K = {};
  for (const sp of Object.keys(adsorption)) {
    K[sp] = vantHoff(adsorption[sp].K0, adsorption[sp].dHads, T);
  }
  const term = 1
    + K.EtOH * P.EtOH
    + K.H2O * P.H2O
    + K.CO * P.CO
    + K.CO2 * P.CO2
    + K.H2 * Math.sqrt(clampPos(P.H2))
    + K.CH4 * P.CH4;
  return { omega: term, K };
}

/**
 * Devuelve las velocidades de reaccion r_j (mol / kg_cat / s, o mol/m3/s en
 * el caso homogeneo "none") para las 5 reacciones de la red, dado un
 * catalizador (objeto de catalysts.js), temperatura (K) y concentraciones
 * (mol/m3).
 */
function reactionRates(catalyst, T, C) {
  const P = partialPressuresBar(C, T);
  const { omega, K } = omegaLHHW(P, T, catalyst.adsorption);
  const kin = catalyst.kinetics;

  const k1 = arrhenius(kin.R1_ESR.A, kin.R1_ESR.Ea, T);
  const k2 = arrhenius(kin.R2_DECOMP.A, kin.R2_DECOMP.Ea, T);
  const k3 = arrhenius(kin.R3_MSR.A, kin.R3_MSR.Ea, T);
  const k4 = arrhenius(kin.R4_WGS.A, kin.R4_WGS.Ea, T);
  const k5 = arrhenius(kin.R5_COMB.A, kin.R5_COMB.Ea, T);

  const Keq1 = keqFromThermo(THERMO_R1, T);
  const Keq3 = keqFromThermo(THERMO_R3, T);
  const Keq4 = keqWGS(T);

  // R1: ESR global (reversible, dual-site -> Omega^2)
  const drive1 = P.EtOH > 0 && P.H2O > 0
    ? 1 - (Math.pow(P.CO2, 2) * Math.pow(clampPos(P.H2), 6))
        / (Keq1 * Math.max(P.EtOH * Math.pow(P.H2O, 3), 1e-30))
    : 1;
  const r1 = k1 * K.EtOH * K.H2O * P.EtOH * P.H2O * drive1 / Math.pow(omega, 2);

  // R2: descomposicion del etanol (irreversible, single-site)
  const r2 = k2 * K.EtOH * P.EtOH / omega;

  // R3: reformado de metano con vapor (reversible, single-site)
  const drive3 = P.CH4 > 0 && P.H2O > 0
    ? 1 - (P.CO * Math.pow(clampPos(P.H2), 3))
        / (Keq3 * Math.max(P.CH4 * P.H2O, 1e-30))
    : 1;
  const r3 = k3 * K.CH4 * P.CH4 * P.H2O * drive3 / omega;

  // R4: water-gas shift (reversible, single-site)
  const drive4 = P.CO > 0 && P.H2O > 0
    ? 1 - (P.CO2 * P.H2) / (Keq4 * Math.max(P.CO * P.H2O, 1e-30))
    : 1;
  const r4 = k4 * K.CO * P.CO * P.H2O * drive4 / omega;

  // R5: oxidacion/combustion total (irreversible, ley de potencia de
  // primer orden en cada reactivo - orden global 2, forma bimolecular
  // clasica de combustion; se evita deliberadamente cualquier exponente
  // fraccionario tipo raiz cuadrada porque su derivada diverge cuando el
  // reactivo limitante (O2) se agota, lo que degrada la convergencia del
  // integrador RK4 cerca del frente de combustion y deja un pequeno
  // sesgo residual en el cierre del balance de atomos de oxigeno. Con
  // cinetica de orden entero la derivada es acotada en todo el dominio
  // y el balance de masa cierra a la precision de maquina.
  // NO limitada por Omega: se asume via mecanismo homogeneo/asistido que
  // no compite por los mismos sitios de adsorcion metal-soporte.
  const r5 = k5 * clampPos(P.EtOH) * clampPos(P.O2);

  return {
    r: { R1_ESR: r1, R2_DECOMP: r2, R3_MSR: r3, R4_WGS: r4, R5_COMB: r5 },
    P, omega, Keq: { Keq1, Keq3, Keq4 },
  };
}

/**
 * Velocidad neta de produccion/consumo de cada especie R_i (mol/kg_cat/s,
 * o mol/m3/s si el catalizador es homogeneo), y el calor de reaccion total
 * generado localmente: Q = sum_j (-dH_j) * eta_j * r_j  (W/m3_lecho, tras
 * aplicar rho_b*(1-eps_b) en el solver)
 */
function netRates(catalyst, T, C) {
  const { r, P, omega, Keq } = reactionRates(catalyst, T, C);
  const eta = catalyst.eta;
  const Ri = Object.fromEntries(SPECIES.map((s) => [s, 0]));
  let heatGenPerKgCat = 0; // J/(kg_cat*s) [o J/(m3*s) en caso homogeneo]
  for (const rxn of REACTIONS) {
    const rj = r[rxn.id] * eta;
    for (const sp of SPECIES) {
      const nu = rxn.nu[sp] || 0;
      if (nu !== 0) Ri[sp] += nu * rj;
    }
    heatGenPerKgCat += -rxn.dH * rj; // dH>0 endo => resta calor; dH<0 exo => aporta calor
  }
  return { Ri, heatGenPerKgCat, r, P, omega, Keq, eta };
}

module.exports = {
  arrhenius, vantHoff, keqWGS, keqFromThermo, partialPressuresBar, omegaLHHW,
  reactionRates, netRates,
};
