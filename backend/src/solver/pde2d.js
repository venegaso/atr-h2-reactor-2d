'use strict';
/**
 * Resolvedor numerico del modelo 2D axisimetrico no isotermico del reactor
 * de lecho empacado ATR de bioetanol, via el Metodo de Lineas (MOL):
 *   - Direccion radial (r): diferencias finitas centradas de 2do orden
 *     sobre Nr+1 nodos (las "lineas" del MOL).
 *   - Direccion axial (z): marcha de z=0 a z=L=0.40 m en estado
 *     ESTACIONARIO (se omiten los terminos transitorios d/dt: el objetivo
 *     de la interfaz es el perfil convergido para cada condicion de
 *     operacion, recalculado "instantaneamente" ante cada cambio de los
 *     deslizadores). Cada paso axial usa un esquema IMEX por split de
 *     operadores (Godunov): conveccion+reaccion quimica se integra
 *     EXPLICITAMENTE con Runge-Kutta 4, y la difusion radial se integra
 *     de forma IMPLICITA (Euler hacia atras, sistema tridiagonal via el
 *     algoritmo de Thomas) para evitar la restriccion de estabilidad tan
 *     severa que un esquema explicito exigiria cuando u_z es pequena.
 *
 * Simplificacion documentada: la velocidad axial u_z se trata como
 * radialmente uniforme (perfil plano), mientras que C_i(r,z) y T(r,z) se
 * resuelven con resolucion radial completa. u_z(z) se actualiza a cada
 * paso a partir del balance molar total (expansion/contraccion por
 * reaccion), preservando el acoplamiento fisico clave del ATR (fuerte
 * expansion molar por el reformado). Esta es una practica estandar en
 * modelos pseudo-2D de reactores de lecho empacado (Froment & Bischoff,
 * 1990; Zhu et al., 2022).
 */
const { SPECIES, SPECIES_INDEX, MOLAR_MASS, R_GAS } = require('../kinetics/reactions');
const { netRates } = require('../kinetics/rates');
const {
  mixtureViscosity, mixtureLambdaGas, fluidVolumetricCp, mixtureMolarMass,
  fluidDensity, effectiveRadialTransport, ergunDPDz,
} = require('./properties');
const { CATALYSTS } = require('../kinetics/catalysts');

const NS = SPECIES.length;
const UZ_MIN = 1e-4; // m/s, piso numerico para evitar division por 0

function linspace(a, b, n) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = a + ((b - a) * i) / (n - 1);
  return out;
}

function areaAverage(fArr, rGrid) {
  const N = rGrid.length - 1;
  let num = 0;
  for (let j = 0; j < N; j++) {
    const r0 = rGrid[j]; const r1 = rGrid[j + 1];
    num += 0.5 * (fArr[j] * r0 + fArr[j + 1] * r1) * (r1 - r0);
  }
  const Rt = rGrid[N];
  return (2 * num) / (Rt * Rt);
}

// --- Solucion IMPLICITA (Euler hacia atras) de la difusion radial ---
// La conveccion+reaccion (rigidas pero de derivada acotada tras evitar
// exponentes fraccionarios en las cineticas) se integra explicitamente
// con RK4 (ver reactConvDeriv). La difusion radial, en cambio, puede
// volverse muy rigida cuando u_z es pequena (D_er/u_z grande), lo que
// forzaria pasos axiales dz absurdamente pequenos con un esquema
// explicito. Por eso la difusion se resuelve de forma IMPLICITA
// (incondicionalmente estable) via un sistema tridiagonal (algoritmo de
// Thomas) en cada paso axial - un split de operadores tipo
// reaccion-conveccion/difusion (Godunov), practica estandar para EDPs
// parabolicas rigidas (Schiesser & Griffiths, 2009, tambien citado en el
// documento de metodologia del usuario).
function thomasSolve(sub, diag, sup, rhs) {
  const n = diag.length;
  const cp = new Array(n);
  const dpp = new Array(n);
  cp[0] = sup[0] / diag[0];
  dpp[0] = rhs[0] / diag[0];
  for (let i = 1; i < n; i++) {
    const m = diag[i] - sub[i] * cp[i - 1];
    cp[i] = sup[i] / m;
    dpp[i] = (rhs[i] - sub[i] * dpp[i - 1]) / m;
  }
  const x = new Array(n);
  x[n - 1] = dpp[n - 1];
  for (let i = n - 2; i >= 0; i--) x[i] = dpp[i] - cp[i] * x[i + 1];
  return x;
}

// Coeficientes del operador Laplaciano axisimetrico (d2f/dr2 + (1/r)df/dr)
// discretizado por diferencias finitas centradas de 2do orden, como
// combinacion lineal (Lap f)_j = a_j f_{j-1} + b_j f_j + c_j f_{j+1}.
// El nodo central (j=0) usa el limite estandar 2*f''(0) con nodo fantasma
// simetrico f_{-1}=f_1. El nodo de pared (j=N) se completa aparte segun
// la condicion de frontera (Neumann cero para especies; Robin para T).
function laplacianRowCoeffs(rGrid, dr, N) {
  const a = new Array(N + 1).fill(0);
  const b = new Array(N + 1).fill(0);
  const c = new Array(N + 1).fill(0);
  b[0] = -4 / (dr * dr);
  c[0] = 4 / (dr * dr);
  for (let j = 1; j < N; j++) {
    const r = rGrid[j];
    a[j] = 1 / (dr * dr) - 1 / (2 * dr * r);
    b[j] = -2 / (dr * dr);
    c[j] = 1 / (dr * dr) + 1 / (2 * dr * r);
  }
  return { a, b, c };
}

/**
 * Resuelve (I - dz*diag(alpha)*L) f_new = f_star  para el campo radial f
 * (una especie C_i(r) o T(r)), con L el Laplaciano axisimetrico y alpha(r)
 * el coeficiente de difusion efectivo local (D_er/u_z o lambda_er/(rho*Cpf*u_z)).
 * wallBC = {type:'neumannZero'} o {type:'robin', U, lambda, Tenv}.
 */
function implicitDiffusionSolve(fStar, rGrid, dr, alphaArr, dz, wallBC) {
  const N = rGrid.length - 1;
  const { a, b, c } = laplacianRowCoeffs(rGrid, dr, N);
  let constN = 0;
  if (wallBC.type === 'neumannZero') {
    a[N] = 2 / (dr * dr); b[N] = -2 / (dr * dr); c[N] = 0;
  } else {
    const {
      U, lambda, Tenv,
    } = wallBC;
    const rN = rGrid[N];
    a[N] = 2 / (dr * dr);
    b[N] = -(2 / (dr * dr) + (2 * U) / (lambda * dr)) - U / (lambda * rN);
    c[N] = 0;
    constN = (2 * U * Tenv) / (lambda * dr) + (U * Tenv) / (lambda * rN);
  }
  const sub = new Array(N + 1);
  const diag = new Array(N + 1);
  const sup = new Array(N + 1);
  const rhs = new Array(N + 1);
  for (let j = 0; j <= N; j++) {
    const alpha = alphaArr[j];
    sub[j] = -dz * alpha * a[j];
    diag[j] = 1 - dz * alpha * b[j];
    sup[j] = -dz * alpha * c[j];
    rhs[j] = fStar[j] + (j === N ? dz * alpha * constN : 0);
  }
  return thomasSolve(sub, diag, sup, rhs);
}

function cloneState(s) {
  return {
    C: s.C.map((row) => row.slice()),
    T: s.T.slice(),
    F: s.F.slice(),
    P: s.P,
  };
}

function addScaled(base, deriv, h, out) {
  for (let i = 0; i < NS; i++) {
    for (let j = 0; j < base.C[i].length; j++) {
      out.C[i][j] = base.C[i][j] + h * deriv.C[i][j];
    }
  }
  for (let j = 0; j < base.T.length; j++) out.T[j] = base.T[j] + h * deriv.T[j];
  for (let i = 0; i < NS; i++) out.F[i] = base.F[i] + h * deriv.F[i];
  out.P = base.P + h * deriv.P;
  return out;
}

// Clampa SOLO la temperatura (para evitar overflow de Arrhenius / NaN en
// pasos intermedios de RK4). Las concentraciones NO se recortan en los
// sub-pasos intermedios: las leyes de velocidad (rates.js) ya tratan
// cualquier concentracion negativa transitoria como cero via clampPos()
// al evaluar presiones parciales, por lo que la dinamica del ODE ya es
// segura sin necesidad de truncar el estado. Truncar C a cero en los
// sub-pasos de RK4 introduce un sesgo sistematico (no suave) que rompe
// muy ligeramente el cierre de balance de atomos; se evita para que la
// conservacion de masa sea exacta a la tolerancia numerica del esquema.
function clampTemperature(s, Tmin, Tmax) {
  for (let j = 0; j < s.T.length; j++) {
    if (!(s.T[j] >= Tmin)) s.T[j] = Tmin;
    if (s.T[j] > Tmax) s.T[j] = Tmax;
  }
  return s;
}

// Clamp completo (T, C>=0, F>=0, P>0), aplicado UNA sola vez al final de
// cada paso axial aceptado (no en los sub-pasos de RK4), como salvaguarda
// numerica de despliegue/estabilidad a largo plazo.
function clampState(s, Tmin, Tmax) {
  for (let i = 0; i < NS; i++) {
    for (let j = 0; j < s.C[i].length; j++) {
      if (!(s.C[i][j] >= 0)) s.C[i][j] = 0;
    }
  }
  clampTemperature(s, Tmin, Tmax);
  for (let i = 0; i < NS; i++) if (!(s.F[i] >= 0)) s.F[i] = 0;
  if (!(s.P > 0)) s.P = 1000;
  return s;
}

function makeSolverFns(catalyst, geom, wallOpts) {
  const { rGrid, dr, A_cross } = geom;
  const { epsilon_b, rho_b, dp } = catalyst.bed;
  const solidFactor = catalyst.homogeneous ? 1 : rho_b * (1 - epsilon_b);

  // Cinetica, fuentes y propiedades de transporte locales, compartidas por
  // el sub-paso de reaccion+conveccion (explicito) y el de difusion
  // (implicito).
  function computeLocal(state) {
    const {
      C, T, F, P,
    } = state;
    const Nr1 = T.length;

    const Ftot = F.reduce((a, b) => a + b, 0);
    const CavgBySpecies = new Array(NS);
    for (let i = 0; i < NS; i++) CavgBySpecies[i] = areaAverage(C[i], rGrid);
    const Ctot_avg = CavgBySpecies.reduce((a, b) => a + b, 0) || 1e-9;
    const uz = Math.max(Ftot / (A_cross * Ctot_avg), UZ_MIN);

    const source = Array.from({ length: NS }, () => new Array(Nr1).fill(0));
    const heatGen = new Array(Nr1).fill(0);
    const rhoFCpf = new Array(Nr1).fill(0);
    const lambdaGasArr = new Array(Nr1).fill(0);
    for (let j = 0; j < Nr1; j++) {
      const Cj = SPECIES.map((_, i) => C[i][j]);
      const Tj = T[j];
      const { Ri, heatGenPerKgCat } = netRates(catalyst, Tj, Cj);
      for (let i = 0; i < NS; i++) source[i][j] = solidFactor * Ri[SPECIES[i]];
      heatGen[j] = solidFactor * heatGenPerKgCat;
      rhoFCpf[j] = fluidVolumetricCp(Cj, Tj);
      lambdaGasArr[j] = mixtureLambdaGas(Cj, Tj);
    }

    const Tavg = areaAverage(T, rGrid);
    const muMixAvg = mixtureViscosity(CavgBySpecies, Tavg);
    const rhoFAvg = fluidDensity(P, CavgBySpecies, Tavg);

    const Der = new Array(Nr1);
    const lambdaEr = new Array(Nr1);
    const Pbar = P / 1e5;
    for (let j = 0; j < Nr1; j++) {
      const t = effectiveRadialTransport({
        uz, dp, epsilon_b, lambdaGas: lambdaGasArr[j], rhoFCpf: rhoFCpf[j], muMix: muMixAvg, T: T[j], P_bar: Pbar,
      });
      Der[j] = t.D_er;
      lambdaEr[j] = t.lambda_er;
    }

    return {
      uz, source, heatGen, rhoFCpf, Der, lambdaEr, muMixAvg, rhoFAvg, Tavg,
    };
  }

  // Sub-paso EXPLICITO: solo conveccion axial + reaccion quimica + Ergun +
  // balance molar total (sin el termino de difusion radial). Se integra
  // con RK4 en el bucle principal.
  function reactConvDeriv(state) {
    const loc = computeLocal(state);
    const Nr1 = state.T.length;
    const dC = Array.from({ length: NS }, () => new Array(Nr1).fill(0));
    for (let i = 0; i < NS; i++) {
      for (let j = 0; j < Nr1; j++) dC[i][j] = loc.source[i][j] / loc.uz;
    }
    const dT = new Array(Nr1);
    for (let j = 0; j < Nr1; j++) dT[j] = loc.heatGen[j] / (loc.rhoFCpf[j] * loc.uz);
    const dF = new Array(NS);
    for (let i = 0; i < NS; i++) dF[i] = A_cross * areaAverage(loc.source[i], rGrid);
    const dP = ergunDPDz({
      uz: loc.uz, muMix: loc.muMixAvg, rhoF: loc.rhoFAvg, dp, epsilon_b,
    });
    return {
      C: dC, T: dT, F: dF, P: dP, _diag: { uz: loc.uz, Tavg: loc.Tavg },
    };
  }

  // Sub-paso IMPLICITO: difusion radial pura (Euler hacia atras,
  // incondicionalmente estable independientemente de cuan pequena sea
  // u_z). Las propiedades de transporte se evaluan en el estado
  // intermedio post-reaccion (esquema IMEX de primer orden / Godunov).
  function diffuseStep(state, dz) {
    const loc = computeLocal(state);
    const alphaC = loc.Der.map((d) => d / loc.uz);
    const alphaT = loc.lambdaEr.map((l, j) => l / (loc.rhoFCpf[j] * loc.uz));
    const newC = state.C.map((Ci) => implicitDiffusionSolve(
      Ci, rGrid, dr, alphaC, dz, { type: 'neumannZero' },
    ));
    const wallBC = wallOpts.adiabatic
      ? { type: 'neumannZero' }
      : {
        type: 'robin', U: wallOpts.U_t, lambda: loc.lambdaEr[loc.lambdaEr.length - 1], Tenv: wallOpts.T_wall,
      };
    const newT = implicitDiffusionSolve(state.T, rGrid, dr, alphaT, dz, wallBC);
    return {
      C: newC, T: newT, F: state.F, P: state.P,
    };
  }

  return { reactConvDeriv, diffuseStep };
}

/**
 * Ejecuta la simulacion completa del reactor 2D para un conjunto de
 * condiciones de operacion.
 *
 * inputs = {
 *   catalyst: 'none'|'nico'|'nicoce'|'hydrotalcite',
 *   T_in_C, P_in_bar, O2_EtOH, S_E, W_F_EtOH (kg*s/mol),
 *   Rt_m (opcional, default 0.015), Nr (opcional), Nz (opcional),
 *   wall: { adiabatic: true } | { adiabatic:false, U_t, T_wall_C }
 * }
 */
function runSimulation(inputs) {
  const catalyst = CATALYSTS[inputs.catalyst] || CATALYSTS.nico;
  const L = 0.40; // m, longitud fija
  const Rt = inputs.Rt_m || 0.015; // m, radio del tubo (parametro geometrico fijo del diseno piloto)
  const Nr = Math.max(6, Math.min(24, inputs.Nr || 12));

  const T_in = (inputs.T_in_C ?? 550) + 273.15;
  const P_in = (inputs.P_in_bar ?? 1.5) * 1e5; // Pa
  const O2_EtOH = Math.max(0, inputs.O2_EtOH ?? 0.4);
  const S_E = Math.max(0.1, inputs.S_E ?? 3.0);
  const W_F = Math.max(1e-3, inputs.W_F_EtOH ?? 15); // kg*s/mol

  const A_cross = Math.PI * Rt * Rt;
  const V_bed = A_cross * L;
  const { epsilon_b, rho_b } = catalyst.bed;
  const solidFactor = catalyst.homogeneous ? 0 : rho_b * (1 - epsilon_b);
  const W_cat = solidFactor * V_bed; // kg catalizador total en el reactor

  const C_tot_in = P_in / (R_GAS * T_in); // mol/m3

  // El deslizador #6 ("Tiempo de reaccion / Tiempo de residencia (tau) /
  // W_F_EtOH") tiene DOS lecturas fisicas segun el catalizador elegido:
  //  - Con catalizador: espacio-tiempo W/F_EtOH (kg_cat*s/mol) -> junto con
  //    la masa de catalizador FIJA por la geometria (rho_b,(1-eps_b),V_bed)
  //    determina el flujo molar de alimentacion.
  //  - Sin catalizador (reactor vacio, via homogenea): W/F pierde sentido
  //    fisico (no hay masa catalitica); el mismo control se reinterpreta
  //    como tiempo de residencia del gas tau=V_bed*eps_b/Q_in (s).
  let F_EtOH_in;
  let F_total_in;
  if (catalyst.homogeneous) {
    const tau_s = Math.max(1e-3, W_F); // reinterpretado como tau (s)
    const Q_in = (V_bed * epsilon_b) / tau_s; // m3/s
    F_total_in = Q_in * C_tot_in;
    F_EtOH_in = F_total_in / (1 + S_E + O2_EtOH);
  } else {
    const W_ref = Math.max(W_cat, 1e-9);
    F_EtOH_in = W_ref / W_F; // mol/s
  }
  const F_O2_in = O2_EtOH * F_EtOH_in;
  const F_H2O_in = S_E * F_EtOH_in;
  const F_in = { EtOH: F_EtOH_in, H2O: F_H2O_in, O2: F_O2_in, H2: 0, CO: 0, CO2: 0, CH4: 0 };
  F_total_in = SPECIES.reduce((a, s) => a + F_in[s], 0);

  const y_in = SPECIES.map((s) => F_in[s] / F_total_in);
  const C_in = y_in.map((y) => y * C_tot_in);
  const Q_in = F_total_in / C_tot_in; // m3/s
  const uz_in = Q_in / A_cross; // m/s

  // Numero de pasos axiales: el sub-paso de reaccion+conveccion es
  // EXPLICITO (RK4), por lo que necesita resolver el TIEMPO DE RESIDENCIA
  // POR PASO (dz/u_z), no solo dz en metros - a menor u_z (mayor W/F o
  // tau, flujos muy diluidos), el mismo dz representa mas tiempo de
  // contacto y la cinetica se vuelve mas rigida en la variable z. Se
  // adapta Nz para mantener dt_paso = dz/u_z por debajo de un umbral
  // seguro, ademas del minimo solicitado por el usuario.
  const residenceTimeEst = L / Math.max(uz_in, 1e-3);
  // fastMode (usado por barridos de sensibilidad con muchas corridas):
  // umbral de resolucion mas relajado a cambio de velocidad - es una
  // tendencia parametrica, no el perfil detallado de los graficos
  // principales.
  const DT_TARGET_S = inputs.fastMode ? 6e-4 : 1e-4;
  const NZ_CAP = inputs.fastMode ? 1500 : 4000;
  const NZ_BASE = inputs.fastMode ? 300 : 800;
  const Nz_kinetics = Math.ceil(residenceTimeEst / DT_TARGET_S);
  const Nz = Math.max(80, Math.min(NZ_CAP, Math.max(inputs.Nz || NZ_BASE, Nz_kinetics)));

  const rGrid = linspace(0, Rt, Nr + 1);
  const dr = Rt / Nr;
  const dz = L / Nz;

  const wallOpts = inputs.wall && inputs.wall.adiabatic === false
    ? { adiabatic: false, U_t: inputs.wall.U_t ?? 25, T_wall: (inputs.wall.T_wall_C ?? 500) + 273.15 }
    : { adiabatic: true };

  let state = {
    C: SPECIES.map((_, i) => new Array(Nr + 1).fill(C_in[i])),
    T: new Array(Nr + 1).fill(T_in),
    F: SPECIES.map((s) => F_in[s]),
    P: P_in,
  };

  const { reactConvDeriv, diffuseStep } = makeSolverFns(catalyst, { rGrid, dr, A_cross }, wallOpts);

  const axialProfile = [];
  const radialSnapshots = [];
  const snapshotZFractions = [0, 0.1, 0.25, 0.5, 0.75, 1.0];
  let nextSnapIdx = 0;

  const Tmin = 200 + 273.15;
  const Tmax = 1400 + 273.15;

  const recordAxial = (z, s, diag) => {
    const Tc = s.T[0] - 273.15;
    const Tw = s.T[Nr] - 273.15;
    const Tavg = areaAverage(s.T, rGrid) - 273.15;
    const F_EtOH = s.F[SPECIES_INDEX.EtOH];
    const X_EtOH = 1 - F_EtOH / F_EtOH_in;
    const F_H2 = s.F[SPECIES_INDEX.H2];
    const Y_H2 = (F_H2 / (6 * F_EtOH_in)) * 100;
    axialProfile.push({
      z, T_center: Tc, T_wall: Tw, T_avg: Tavg, P_bar: s.P / 1e5, X_EtOH: X_EtOH * 100, Y_H2,
      uz: diag ? diag.uz : null,
    });
  };

  const recordRadialSnapshot = (zFrac, z, s) => {
    radialSnapshots.push({
      z, zFrac,
      r: rGrid.slice(),
      T: s.T.map((t) => t - 273.15),
      C: {
        H2: s.C[SPECIES_INDEX.H2].slice(),
        EtOH: s.C[SPECIES_INDEX.EtOH].slice(),
      },
    });
  };

  // z = 0
  {
    const d0 = reactConvDeriv(state);
    recordAxial(0, state, d0._diag);
    recordRadialSnapshot(0, 0, state);
    nextSnapIdx = 1;
  }

  const axialSampleEvery = Math.max(1, Math.floor(Nz / 150));

  for (let n = 0; n < Nz; n++) {
    // --- Sub-paso 1: conveccion + reaccion quimica, EXPLICITO (RK4) ---
    const k1 = reactConvDeriv(state);
    const s2 = clampTemperature(addScaled(state, k1, dz / 2, cloneState(state)), Tmin, Tmax);
    const k2 = reactConvDeriv(s2);
    const s3 = clampTemperature(addScaled(state, k2, dz / 2, cloneState(state)), Tmin, Tmax);
    const k3 = reactConvDeriv(s3);
    const s4 = clampTemperature(addScaled(state, k3, dz, cloneState(state)), Tmin, Tmax);
    const k4 = reactConvDeriv(s4);

    const star = cloneState(state);
    for (let i = 0; i < NS; i++) {
      for (let j = 0; j <= Nr; j++) {
        star.C[i][j] = state.C[i][j] + (dz / 6) * (k1.C[i][j] + 2 * k2.C[i][j] + 2 * k3.C[i][j] + k4.C[i][j]);
      }
    }
    for (let j = 0; j <= Nr; j++) {
      star.T[j] = state.T[j] + (dz / 6) * (k1.T[j] + 2 * k2.T[j] + 2 * k3.T[j] + k4.T[j]);
    }
    for (let i = 0; i < NS; i++) {
      star.F[i] = state.F[i] + (dz / 6) * (k1.F[i] + 2 * k2.F[i] + 2 * k3.F[i] + k4.F[i]);
    }
    star.P = state.P + (dz / 6) * (k1.P + 2 * k2.P + 2 * k3.P + k4.P);
    clampState(star, Tmin, Tmax);

    // --- Sub-paso 2: difusion radial pura, IMPLICITO (incondicionalmente
    // estable; F y P no dependen de la difusion y quedan intactos) ---
    const diffused = diffuseStep(star, dz);
    const next = {
      C: diffused.C, T: diffused.T, F: star.F, P: star.P,
    };
    clampState(next, Tmin, Tmax);
    state = next;
    const z1 = (n + 1) * dz;

    if ((n + 1) % axialSampleEvery === 0 || n === Nz - 1) {
      const dEnd = reactConvDeriv(state);
      recordAxial(z1, state, dEnd._diag);
    }
    while (nextSnapIdx < snapshotZFractions.length && z1 >= snapshotZFractions[nextSnapIdx] * L - 1e-9) {
      recordRadialSnapshot(snapshotZFractions[nextSnapIdx], z1, state);
      nextSnapIdx += 1;
    }
  }

  const F_out = SPECIES.map((_, i) => state.F[i]);
  const outMolar = Object.fromEntries(SPECIES.map((s, i) => [s, F_out[i]])); // mol/s
  const outMass = Object.fromEntries(SPECIES.map((s, i) => [s, F_out[i] * MOLAR_MASS[s]])); // kg/s
  const F_H2_out = outMolar.H2;
  const F_EtOH_out = outMolar.EtOH;
  const X_EtOH_final = 1 - F_EtOH_out / F_EtOH_in;
  const Y_H2 = (F_H2_out / (6 * F_EtOH_in)) * 100;
  const F_dryTotal = SPECIES.reduce((a, s) => a + (s === 'H2O' ? 0 : outMolar[s]), 0);
  const pctH2Dry = (F_H2_out / F_dryTotal) * 100;
  const dryComposition = Object.fromEntries(
    SPECIES.filter((s) => s !== 'H2O').map((s) => [s, (outMolar[s] / F_dryTotal) * 100]),
  );

  let Thot = -Infinity; let ThotZ = 0; let Tcold = Infinity; let TcoldZ = 0;
  for (const p of axialProfile) {
    if (p.T_center > Thot) { Thot = p.T_center; ThotZ = p.z; }
    if (p.T_center < Tcold) { Tcold = p.T_center; TcoldZ = p.z; }
  }

  return {
    inputs: {
      catalyst: catalyst.key, catalystLabel: catalyst.label,
      T_in_C: inputs.T_in_C ?? 550, P_in_bar: inputs.P_in_bar ?? 1.5,
      O2_EtOH, S_E, W_F_EtOH: W_F, Rt_m: Rt, L_m: L, Nr, Nz,
    },
    geometry: {
      Rt_m: Rt, L_m: L, A_cross_m2: A_cross, V_bed_m3: V_bed, W_cat_kg: W_cat,
      epsilon_b, rho_b_kg_m3: rho_b, dp_m: catalyst.bed.dp,
    },
    feed: {
      F_EtOH_in_mol_s: F_EtOH_in, F_H2O_in_mol_s: F_H2O_in, F_O2_in_mol_s: F_O2_in,
      F_total_in_mol_s: F_total_in, uz_in_m_s: uz_in, C_tot_in_mol_m3: C_tot_in,
    },
    kpis: {
      Y_H2_pct: Y_H2,
      pctH2_dry: pctH2Dry,
      X_EtOH_pct: X_EtOH_final * 100,
      T_hotspot_C: Thot,
      z_hotspot_m: ThotZ,
      T_coldspot_C: Tcold,
      z_coldspot_m: TcoldZ,
      P_out_bar: state.P / 1e5,
      deltaP_bar: (P_in - state.P) / 1e5,
    },
    outlet: {
      molar_mol_s: outMolar,
      mass_kg_s: outMass,
      mass_g_s: Object.fromEntries(SPECIES.map((s) => [s, outMass[s] * 1000])),
      dryMoleFraction_pct: dryComposition,
    },
    axialProfile,
    radialSnapshots,
  };
}

module.exports = { runSimulation, SPECIES };
