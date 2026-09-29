'use strict';
const { SPECIES, MOLAR_MASS, R_GAS, cpMolar } = require('../kinetics/reactions');

// Parametros de viscosidad (Sutherland simplificado) y conductividad
// termica del gas puro a condiciones de referencia, usados en las reglas
// de mezcla. Valores tipicos de tablas de propiedades de gases (Perry's
// Chemical Engineers' Handbook; Reid, Prausnitz & Poling, "The Properties
// of Gases and Liquids").
const MU_REF = { // Pa*s a 300 K, y exponente de la ley de potencia mu ~ T^n
  EtOH: { mu300: 0.86e-5, n: 0.9 },
  H2O: { mu300: 0.98e-5, n: 1.1 },
  O2: { mu300: 2.07e-5, n: 0.7 },
  H2: { mu300: 0.90e-5, n: 0.68 },
  CO: { mu300: 1.78e-5, n: 0.71 },
  CO2: { mu300: 1.50e-5, n: 0.79 },
  CH4: { mu300: 1.12e-5, n: 0.87 },
};

const LAMBDA_REF = { // W/m/K a 300 K, ley de potencia lambda ~ T^m
  EtOH: { l300: 0.0146, m: 1.0 },
  H2O: { l300: 0.0196, m: 1.05 },
  O2: { l300: 0.0266, m: 0.83 },
  H2: { l300: 0.186, m: 0.79 },
  CO: { l300: 0.0250, m: 0.83 },
  CO2: { l300: 0.0166, m: 1.1 },
  CH4: { l300: 0.0343, m: 1.0 },
};

function moleFractions(C) {
  const Ctot = C.reduce((a, b) => a + Math.max(b, 0), 0) || 1e-12;
  return SPECIES.map((_, i) => Math.max(C[i], 0) / Ctot);
}

function pureViscosity(sp, T) {
  const { mu300, n } = MU_REF[sp];
  return mu300 * Math.pow(T / 300, n);
}

function pureLambda(sp, T) {
  const { l300, m } = LAMBDA_REF[sp];
  return l300 * Math.pow(T / 300, m);
}

// Regla de mezcla de Wilke (1950) para viscosidad de mezclas gaseosas -
// referencia estandar (Reid, Prausnitz & Poling; Bird, Stewart & Lightfoot,
// "Transport Phenomena").
function wilkePhi(muI, muJ, MI, MJ) {
  const t = 1 + Math.sqrt(muI / muJ) * Math.pow(MJ / MI, 0.25);
  return (t * t) / Math.sqrt(8 * (1 + MI / MJ));
}

function mixtureViscosity(C, T) {
  const y = moleFractions(C);
  const mu = SPECIES.map((sp) => pureViscosity(sp, T));
  const M = SPECIES.map((sp) => MOLAR_MASS[sp]);
  let muMix = 0;
  for (let i = 0; i < SPECIES.length; i++) {
    if (y[i] <= 0) continue;
    let denom = 0;
    for (let j = 0; j < SPECIES.length; j++) {
      if (y[j] <= 0) continue;
      const phi = i === j ? 1 : wilkePhi(mu[i], mu[j], M[i], M[j]);
      denom += y[j] * phi;
    }
    muMix += (y[i] * mu[i]) / denom;
  }
  return muMix; // Pa*s
}

// Regla de mezcla simple (lineal en fraccion molar) para la conductividad
// termica del gas puro; suficientemente precisa para la contribucion
// "estatica" del lecho frente al termino convectivo dominante.
function mixtureLambdaGas(C, T) {
  const y = moleFractions(C);
  let lam = 0;
  for (let i = 0; i < SPECIES.length; i++) lam += y[i] * pureLambda(SPECIES[i], T);
  return lam; // W/m/K
}

// Capacidad calorifica volumetrica del fluido: rho_f*Cpf = sum(C_i * Cp_i(T))
// [J/m3/K], calculo directo (no requiere pasar por base masica).
function fluidVolumetricCp(C, T) {
  let s = 0;
  for (let i = 0; i < SPECIES.length; i++) s += Math.max(C[i], 0) * cpMolar(SPECIES[i], T);
  return s;
}

function mixtureMolarMass(C) {
  const y = moleFractions(C);
  let M = 0;
  for (let i = 0; i < SPECIES.length; i++) M += y[i] * MOLAR_MASS[SPECIES[i]];
  return M; // kg/mol
}

// Densidad del fluido via ley de gases ideales: rho_f = P*M / (R*T)
function fluidDensity(P_Pa, C, T) {
  const M = mixtureMolarMass(C);
  return (P_Pa * M) / (R_GAS * T); // kg/m3
}

/**
 * Coeficientes de dispersion/conduccion radial efectiva, via numeros de
 * Peclet radiales asintoticos tipicos de lechos empacados a Re alto
 * (Froment & Bischoff, "Chemical Reactor Analysis and Design", 2a ed.,
 * 1990; Bauer & Schlunder, 1978):
 *   Pe_r,masa(inf) ~ 10  ;  Pe_r,calor(inf) ~ 8
 * D_er = u_z * dp / Pe_r,masa   ;   lambda_er,din = u_z*dp*rho_f*Cpf / Pe_r,calor
 * Se suma una contribucion "estatica" (conduccion solido+fluido en reposo).
 */
function effectiveRadialTransport({
  uz, dp, epsilon_b, lambdaGas, rhoFCpf, muMix, T, P_bar,
}) {
  const PE_R_MASS = 10.0;
  const PE_R_HEAT = 8.0;
  // Difusividad molecular binaria efectiva de referencia (m2/s), escalada
  // con T^1.75/P (correlacion tipo Fuller-Schettler-Giddings), valor de
  // referencia ~2.0e-5 m2/s a 800 K, 1 bar (orden tipico H2/vapor)
  const Dmol_eff = 2.0e-5 * Math.pow(Math.max(T, 200) / 800, 1.75) / Math.max(P_bar, 0.1);
  const D_er = Math.max(Dmol_eff * epsilon_b, (Math.abs(uz) * dp) / PE_R_MASS);

  const lambda_static = lambdaGas * (epsilon_b + 0.85 * (1 - epsilon_b) * 6.0);
  const lambda_dynamic = (Math.abs(uz) * dp * rhoFCpf) / PE_R_HEAT;
  const lambda_er = lambda_static + lambda_dynamic;

  return { D_er, lambda_er };
}

/**
 * Caida de presion axial local, ecuacion de Ergun modificada (dP/dz < 0):
 *  -dP/dz = 150*mu*(1-eb)^2/(dp^2*eb^3)*uz + 1.75*rhof*(1-eb)/(dp*eb^3)*uz^2
 * Devuelve dP/dz en Pa/m (negativo).
 */
function ergunDPDz({
  uz, muMix, rhoF, dp, epsilon_b,
}) {
  const eb = epsilon_b;
  const viscTerm = 150 * muMix * Math.pow(1 - eb, 2) * uz / (dp * dp * Math.pow(eb, 3));
  const inertTerm = 1.75 * rhoF * (1 - eb) * uz * Math.abs(uz) / (dp * Math.pow(eb, 3));
  return -(viscTerm + inertTerm); // Pa/m
}

module.exports = {
  moleFractions,
  mixtureViscosity,
  mixtureLambdaGas,
  fluidVolumetricCp,
  mixtureMolarMass,
  fluidDensity,
  effectiveRadialTransport,
  ergunDPDz,
};
