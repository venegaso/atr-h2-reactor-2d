export type CatalystKey = 'none' | 'nico' | 'nicoce' | 'hydrotalcite';

export interface CatalystInfo {
  key: CatalystKey;
  label: string;
  description: string;
}

export interface SimulationInputs {
  catalyst: CatalystKey;
  T_in_C: number;
  P_in_bar: number;
  O2_EtOH: number;
  S_E: number;
  W_F_EtOH: number;
  save?: boolean;
}

export interface AxialProfilePoint {
  z: number;
  T_center: number;
  T_wall: number;
  T_avg: number;
  P_bar: number;
  X_EtOH: number;
  Y_H2: number;
  uz: number | null;
}

export interface RadialSnapshot {
  z: number;
  zFrac: number;
  r: number[];
  T: number[];
  C: { H2: number[]; EtOH: number[] };
}

export interface SimulationResult {
  inputs: {
    catalyst: CatalystKey;
    catalystLabel: string;
    T_in_C: number;
    P_in_bar: number;
    O2_EtOH: number;
    S_E: number;
    W_F_EtOH: number;
    Rt_m: number;
    L_m: number;
    Nr: number;
    Nz: number;
  };
  geometry: {
    Rt_m: number; L_m: number; A_cross_m2: number; V_bed_m3: number; W_cat_kg: number;
    epsilon_b: number; rho_b_kg_m3: number; dp_m: number;
  };
  feed: {
    F_EtOH_in_mol_s: number; F_H2O_in_mol_s: number; F_O2_in_mol_s: number;
    F_total_in_mol_s: number; uz_in_m_s: number; C_tot_in_mol_m3: number;
  };
  kpis: {
    Y_H2_pct: number;
    pctH2_dry: number;
    X_EtOH_pct: number;
    T_hotspot_C: number;
    z_hotspot_m: number;
    T_coldspot_C: number;
    z_coldspot_m: number;
    P_out_bar: number;
    deltaP_bar: number;
  };
  outlet: {
    molar_mol_s: Record<string, number>;
    mass_kg_s: Record<string, number>;
    mass_g_s: Record<string, number>;
    dryMoleFraction_pct: Record<string, number>;
  };
  axialProfile: AxialProfilePoint[];
  radialSnapshots: RadialSnapshot[];
}

export interface SensitivityPoint {
  value: number;
  Y_H2_pct: number;
  pctH2_dry: number;
  X_EtOH_pct: number;
  T_hotspot_C: number;
  deltaP_bar: number;
}

export interface SensitivityResult {
  param: string;
  label: string;
  results: SensitivityPoint[];
}

export interface InverseYieldResult {
  T_in_C: number;
  achieved: boolean;
  targetYH2Pct: number;
  achievedYH2Pct: number;
  bounds: {
    T_min_C: number;
    T_max_C: number;
    Y_H2_at_Tmin: number;
    Y_H2_at_Tmax: number;
  };
  result: SimulationResult;
}
