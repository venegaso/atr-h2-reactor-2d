'use strict';
/**
 * Red de reacciones para el reformado autotermico (ATR) de bioetanol.
 *
 * Especies: EtOH (C2H5OH), H2O, O2, H2, CO, CO2, CH4  (base seca + agua)
 *
 * Las 5 reacciones y sus entalpias estandar de reaccion (298 K, fase gas)
 * se derivaron de forma AUTOCONSISTENTE a partir de entalpias estandar de
 * formacion (Smith, Van Ness & Abbott, "Introduction to Chemical Engineering
 * Thermodynamics"; NIST WebBook) para que el balance de energia del reactor
 * sea termodinamicamente cerrado:
 *
 *   DHf (kJ/mol, gas ideal, 298 K):
 *     C2H5OH(g) = -235.1   H2O(g) = -241.8   CO = -110.5
 *     CO2 = -393.5         CH4 = -74.8       H2 = 0        O2 = 0
 *
 * R1 (ESR global / reformado con vapor "completo" a CO2):
 *     C2H5OH + 3 H2O -> 2 CO2 + 6 H2         DH1 = +173.7 kJ/mol
 *     (Esta es la reaccion global cuya constante de equilibrio aparece
 *      explicitamente en la formula LHHW del documento de metodologia:
 *      Keq = P_CO2^2 * P_H2^6 / (P_EtOH * P_H2O^3))
 *
 * R2 (descomposicion catalitica del etanol):
 *     C2H5OH -> CH4 + CO + H2                DH2 = +49.8 kJ/mol
 *
 * R3 (reformado de metano con vapor, MSR):
 *     CH4 + H2O <-> CO + 3 H2                DH3 = +206.1 kJ/mol
 *
 * R4 (water-gas shift, WGS):
 *     CO + H2O <-> CO2 + H2                  DH4 = -41.2 kJ/mol
 *
 * R5 (oxidacion/combustion total del etanol - aporta la autoneutralidad
 *     termica del ATR):
 *     C2H5OH + 3 O2 -> 2 CO2 + 3 H2O         DH5 = -1277.3 kJ/mol
 *
 * Orden de especies usado en todo el backend (indices 0..6):
 */
const SPECIES = ['EtOH', 'H2O', 'O2', 'H2', 'CO', 'CO2', 'CH4'];
const SPECIES_INDEX = Object.fromEntries(SPECIES.map((s, i) => [s, i]));

const MOLAR_MASS = { // kg/mol
  EtOH: 0.04607,
  H2O: 0.018015,
  O2: 0.032,
  H2: 0.002016,
  CO: 0.028010,
  CO2: 0.044010,
  CH4: 0.016043,
};

// Entalpia estandar de formacion, J/mol (298 K, gas ideal)
const DHF = {
  EtOH: -235100,
  H2O: -241800,
  O2: 0,
  H2: 0,
  CO: -110500,
  CO2: -393500,
  CH4: -74800,
};

// Entropia molar estandar, J/mol/K (298 K, gas ideal) - usada para estimar
// Keq(T) de las reacciones reversibles via DG = DH - T*DS (aproximacion de
// DCp despreciable, estandar en modelos de reactores de reformado).
const S0 = {
  EtOH: 282.7,
  H2O: 188.8,
  O2: 205.2,
  H2: 130.7,
  CO: 197.7,
  CO2: 213.8,
  CH4: 186.3,
};

// Coeficientes de capacidad calorifica de gas ideal (Smith, Van Ness &
// Abbott, Tabla C.1): Cp_ig/R = A + B*T + C*T^2 + D/T^2   (T en K)
const CP_COEFF = {
  EtOH: { A: 3.518, B: 20.001e-3, C: -6.002e-6, D: 0 },
  H2O: { A: 3.470, B: 1.450e-3, C: 0, D: 0.121e5 },
  O2: { A: 3.639, B: 0.506e-3, C: 0, D: -0.227e5 },
  H2: { A: 3.249, B: 0.422e-3, C: 0, D: 0.083e5 },
  CO: { A: 3.376, B: 0.557e-3, C: 0, D: -0.031e5 },
  CO2: { A: 5.457, B: 1.045e-3, C: 0, D: -1.157e5 },
  CH4: { A: 1.702, B: 9.081e-3, C: -2.164e-6, D: 0 },
};

const R_GAS = 8.314462618; // J/mol/K

// Matriz estequiometrica: filas = reacciones R1..R5, columnas = SPECIES
// (coeficiente negativo = reactivo, positivo = producto)
const REACTIONS = [
  {
    id: 'R1_ESR',
    name: 'Reformado con vapor global (a CO2)',
    nu: { EtOH: -1, H2O: -3, O2: 0, H2: 6, CO: 0, CO2: 2, CH4: 0 },
    dH: 173700, // J/mol
    reversible: true,
  },
  {
    id: 'R2_DECOMP',
    name: 'Descomposicion catalitica del etanol',
    nu: { EtOH: -1, H2O: 0, O2: 0, H2: 1, CO: 1, CO2: 0, CH4: 1 },
    dH: 49800,
    reversible: false,
  },
  {
    id: 'R3_MSR',
    name: 'Reformado de metano con vapor',
    nu: { EtOH: 0, H2O: -1, O2: 0, H2: 3, CO: 1, CO2: 0, CH4: -1 },
    dH: 206100,
    reversible: true,
  },
  {
    id: 'R4_WGS',
    name: 'Water-Gas Shift',
    nu: { EtOH: 0, H2O: -1, O2: 0, H2: 1, CO: -1, CO2: 1, CH4: 0 },
    dH: -41200,
    reversible: true,
  },
  {
    id: 'R5_COMB',
    name: 'Oxidacion/combustion total del etanol',
    nu: { EtOH: -1, H2O: 3, O2: -3, H2: 0, CO: 0, CO2: 2, CH4: 0 },
    dH: -1277300,
    reversible: false,
  },
];

function cpMolar(species, T) { // J/mol/K, T en K
  const c = CP_COEFF[species];
  return R_GAS * (c.A + c.B * T + c.C * T * T + (c.D !== 0 ? c.D / (T * T) : 0));
}

module.exports = {
  SPECIES, SPECIES_INDEX, MOLAR_MASS, DHF, S0, CP_COEFF, R_GAS, REACTIONS, cpMolar,
};
