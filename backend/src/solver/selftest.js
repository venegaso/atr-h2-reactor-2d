'use strict';
const { runSimulation } = require('./pde2d');

function run(label, inputs) {
  const t0 = Date.now();
  const res = runSimulation(inputs);
  const dt = Date.now() - t0;
  console.log(`\n=== ${label} (${dt} ms) ===`);
  console.log('inputs:', JSON.stringify(res.inputs));
  console.log('feed F_EtOH_in (mol/s):', res.feed.F_EtOH_in_mol_s.toFixed(6), ' uz_in:', res.feed.uz_in_m_s.toFixed(3));
  console.log('KPIs:', JSON.stringify(res.kpis, null, 0));
  console.log('outlet molar (mol/s):', JSON.stringify(res.outlet.molar_mol_s));
  console.log('dry mole % :', JSON.stringify(res.outlet.dryMoleFraction_pct));
  // check mass balance closure (atoms of C, H, O)
  const inFlows = { EtOH: res.feed.F_EtOH_in_mol_s, H2O: res.feed.F_H2O_in_mol_s, O2: res.feed.F_O2_in_mol_s };
  const atomsIn = { C: 2 * inFlows.EtOH, H: 6 * inFlows.EtOH + 2 * inFlows.H2O, O: 1 * inFlows.EtOH + 1 * inFlows.H2O + 2 * inFlows.O2 };
  const o = res.outlet.molar_mol_s;
  const atomsOut = {
    C: 2 * o.EtOH + o.CO + o.CO2 + o.CH4,
    H: 6 * o.EtOH + 2 * o.H2O + 2 * o.H2 + 4 * o.CH4,
    O: o.EtOH + o.H2O + o.CO + 2 * o.CO2 + 2 * o.O2,
  };
  console.log('Atom balance IN :', atomsIn);
  console.log('Atom balance OUT:', atomsOut);
  for (const k of ['C', 'H', 'O']) {
    const err = (atomsOut[k] - atomsIn[k]) / (atomsIn[k] || 1);
    console.log(`  ${k} relative error: ${(err * 100).toFixed(3)}%`);
  }
  // axial profile sample
  const ap = res.axialProfile;
  console.log('axial samples:', ap.length, ' first:', ap[0], ' mid:', ap[Math.floor(ap.length / 2)], ' last:', ap[ap.length - 1]);
  return res;
}

run('Ni-Co baseline', {
  catalyst: 'nico', T_in_C: 550, P_in_bar: 1.5, O2_EtOH: 0.4, S_E: 3.0, W_F_EtOH: 15,
});

run('Ni-Co-CeO2', {
  catalyst: 'nicoce', T_in_C: 550, P_in_bar: 1.5, O2_EtOH: 0.4, S_E: 3.0, W_F_EtOH: 15,
});

run('Hidrotalcita', {
  catalyst: 'hydrotalcite', T_in_C: 550, P_in_bar: 1.5, O2_EtOH: 0.4, S_E: 3.0, W_F_EtOH: 15,
});

run('Sin catalizador', {
  catalyst: 'none', T_in_C: 650, P_in_bar: 1.5, O2_EtOH: 0.4, S_E: 3.0, W_F_EtOH: 0.3,
});

run('Ni-Co high T', {
  catalyst: 'nico', T_in_C: 700, P_in_bar: 2.0, O2_EtOH: 0.35, S_E: 4.0, W_F_EtOH: 25,
});
