'use strict';
/**
 * Catalogo de catalizadores. Cada entrada define:
 *  - propiedades de lecho: epsilon_b (porosidad), rho_b (kg_cat/m3_lecho,
 *    densidad global de empaque), dp (m, diametro equivalente de particula)
 *  - homogeneous: true => reactor vacio (sin lecho catalitico), las
 *    reacciones proceden por via termica/homogenea con cineticas mucho
 *    mas lentas (Ea mas altas) y SIN el factor rho_b*(1-eps_b)
 *  - kinetics: { [reactionId]: { A, Ea (J/mol), order } } parametros de
 *    Arrhenius para cada reaccion de la red (reactions.js)
 *  - adsorption: { [especie]: { K0 (bar^-1), dHads (J/mol, <0) } } para el
 *    termino de Langmuir-Hinshelwood-Hougen-Watson (formalismo Van't Hoff)
 *  - eta: factor de efectividad global (modulo de Thiele) 0 < eta <= 1
 *
 * Los valores numericos son ESTIMACIONES REPRESENTATIVAS construidas a
 * partir de los ordenes de magnitud reportados en la literatura citada en
 * el documento de metodologia del usuario y en estudios cineticos afines
 * de reformado de etanol sobre catalizadores de Ni/Co soportados:
 *   - da Silva et al. (2011) Ni-Co/CeO2 - ruptura C-C/C-H, resistencia a
 *     coque
 *   - Mosayebi & Eghbal Ahmadi (2026) modelado cinetico ATR biogas
 *     Ni-Cu/CeO2-ZrO2-MgO (formalismo LHHW, ordenes de Ea)
 *   - Wu (2014) "Simplified kinetic model for SR of ethanol on Ni/Al2O3"
 *   - "Kinetic modeling of SR of ethanol for H2 production over Co/Al2O3"
 *     (rango de Ea ~ 60-120 kJ/mol para las rutas de reformado)
 * Estos parametros deben calibrarse/regresarse contra datos experimentales
 * propios antes de su uso definitivo en el articulo Q1; el modelo se dejo
 * preparado (tabla centralizada + endpoint de simulacion) para que ese
 * ajuste solo requiera editar este archivo o los registros de la tabla
 * `kinetic_parameters` en SQLite.
 */

const BASE_KINETICS_NICO = {
  R1_ESR: { A: 4.8e5, Ea: 92000, order: 2 },
  R2_DECOMP: { A: 2.2e5, Ea: 88000, order: 1 },
  R3_MSR: { A: 1.3e8, Ea: 118000, order: 1 },
  R4_WGS: { A: 5.5e4, Ea: 75000, order: 1 },
  // R5 (combustion catalitica): pre-exponencial calibrado para que la
  // zona de combustion cerca de la entrada ocupe una fraccion finita y
  // fisicamente razonable del lecho (no una liberacion instantanea tipo
  // delta de Dirac) - ver docs/formulacion para el detalle de calibracion.
  R5_COMB: { A: 2.8e4, Ea: 60000, order: 2 },
};

const BASE_ADSORPTION = {
  EtOH: { K0: 0.42, dHads: -38000 },
  H2O: { K0: 0.18, dHads: -25000 },
  CO: { K0: 0.9, dHads: -70000 },
  CO2: { K0: 0.32, dHads: -32000 },
  H2: { K0: 0.6, dHads: -50000 }, // usado como K_H2^0.5 en Omega
  CH4: { K0: 0.15, dHads: -20000 },
};

function scaleKinetics(base, activityFactor, deaEa = {}) {
  const out = {};
  for (const [rid, p] of Object.entries(base)) {
    out[rid] = {
      A: p.A * (activityFactor[rid] ?? activityFactor.default ?? 1),
      Ea: p.Ea + (deaEa[rid] ?? 0),
      order: p.order,
    };
  }
  return out;
}

function scaleAdsorption(base, k0Factor = {}, dEads = {}) {
  const out = {};
  for (const [sp, p] of Object.entries(base)) {
    out[sp] = {
      K0: p.K0 * (k0Factor[sp] ?? k0Factor.default ?? 1),
      dHads: p.dHads + (dEads[sp] ?? 0),
    };
  }
  return out;
}

const CATALYSTS = {
  none: {
    key: 'none',
    label: 'Sin catalizador (termico/homogeneo)',
    description: 'Reactor vacio: reaccion homogenea de descomposicion y '
      + 'combustion en fase gas, sin superficie catalitica. Cineticas '
      + 'mucho mas lentas (Ea elevadas) y sin limitacion difusional interna.',
    homogeneous: true,
    // rho_b = densidad de particula solida (kg/m3_solido); con
    // epsilon_b=0.985 el termino rho_b*(1-eps_b) ~ 3 kg_solido/m3_reactor
    // (solo empaque inerte residual/soporte estructural del tubo)
    bed: { epsilon_b: 0.985, rho_b: 200, dp: 0.004 },
    eta: 1.0,
    kinetics: {
      R1_ESR: { A: 2.0e3, Ea: 148000, order: 2 },
      R2_DECOMP: { A: 1.5e6, Ea: 165000, order: 1 },
      R3_MSR: { A: 4.0e5, Ea: 172000, order: 1 },
      R4_WGS: { A: 30, Ea: 105000, order: 1 },
      R5_COMB: { A: 1.4e5, Ea: 118000, order: 2 }, // combustion homogenea, Ea alta tipo radicalaria
    },
    adsorption: scaleAdsorption(BASE_ADSORPTION, { default: 0.02 }), // adsorcion casi nula sin superficie
  },

  nico: {
    key: 'nico',
    label: 'Niquel-Cobalto (Ni-Co)',
    description: 'Bimetalico Ni-Co: Ni rompe enlaces C-C/C-H con alta '
      + 'actividad; Co inhibe la ruta acida hacia etileno (precursor de '
      + 'coque) y favorece WGS.',
    homogeneous: false,
    bed: { epsilon_b: 0.42, rho_b: 1450, dp: 0.0035 }, // rho_b: densidad de particula (kg/m3_solido)
    eta: 0.72,
    kinetics: scaleKinetics(BASE_KINETICS_NICO, { default: 1.0 }),
    adsorption: scaleAdsorption(BASE_ADSORPTION, { default: 1.0 }),
  },

  nicoce: {
    key: 'nicoce',
    label: 'Niquel-Cobalto-Cerio (Ni-Co/CeO2)',
    description: 'Ni-Co promovido con CeO2: la capacidad de '
      + 'almacenamiento/liberacion de oxigeno (OSC) del Ce y el ciclo '
      + 'Ce4+/Ce3+ gasifican in situ precursores de coque (*C+*O->CO), '
      + 'incrementando el factor de efectividad y acelerando WGS.',
    homogeneous: false,
    bed: { epsilon_b: 0.40, rho_b: 1650, dp: 0.0035 }, // mas denso: soporte impregnado con CeO2
    eta: 0.86,
    kinetics: scaleKinetics(BASE_KINETICS_NICO,
      { R1_ESR: 1.25, R2_DECOMP: 1.1, R3_MSR: 1.15, R4_WGS: 1.9, R5_COMB: 1.05 },
      { R4_WGS: -6000 }), // Ce reduce la barrera efectiva del WGS (asistencia redox)
    adsorption: scaleAdsorption(BASE_ADSORPTION,
      { CO: 1.15, CO2: 1.2, default: 1.05 }),
  },

  hydrotalcite: {
    key: 'hydrotalcite',
    label: 'Hidrotalcita (LDH modificada)',
    description: 'Matriz tipo hidrotalcita (Layered Double Hydroxide) con '
      + 'sitios basicos: menor actividad metalica para ruptura C-C que '
      + 'Ni-Co, pero fuerte quimisorcion de CO2 que desplaza el equilibrio '
      + 'WGS y reduce la re-adsorcion de CO.',
    homogeneous: false,
    bed: { epsilon_b: 0.45, rho_b: 1100, dp: 0.004 }, // matriz laminar, menos densa
    eta: 0.55,
    kinetics: scaleKinetics(BASE_KINETICS_NICO,
      { R1_ESR: 0.55, R2_DECOMP: 0.5, R3_MSR: 0.45, R4_WGS: 1.35, R5_COMB: 0.9 },
      { R1_ESR: 9000, R2_DECOMP: 8000 }),
    adsorption: scaleAdsorption(BASE_ADSORPTION,
      { CO2: 1.8, H2O: 1.3, CO: 0.8, default: 1.0 }),
  },
};

const CATALYST_LIST = Object.values(CATALYSTS).map((c) => ({
  key: c.key, label: c.label, description: c.description,
}));

module.exports = { CATALYSTS, CATALYST_LIST };
