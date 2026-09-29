// Paleta categorica validada (colorblind-safe, orden fijo, variante oscura -
// ver skill de visualizacion de datos). No reordenar ni ciclar los slots.
export const COLORS = {
  surface: '#1a1a19',
  page: '#0d0d0d',
  textPrimary: '#ffffff',
  textSecondary: '#c3c2b7',
  textMuted: '#898781',
  grid: '#2c2c2a',
  axis: '#383835',
  slot1_blue: '#3987e5', // H2 (KPI principal)
  slot2_orange: '#d95926', // CO
  slot3_aqua: '#199e70', // T_wall / WGS
  slot4_yellow: '#c98500', // CO2
  slot5_magenta: '#d55181', // CH4
  slot6_green: '#22c55e', // X_EtOH (conversion)
  slot7_violet: '#9085e9', // T_wall
  slot8_red: '#e66767', // T_center / hotspot
  statusGood: '#0ca30c',
  statusWarning: '#fab219',
  statusCritical: '#d03b3b',
};

export const SPECIES_COLOR: Record<string, string> = {
  H2: COLORS.slot1_blue,
  CO: COLORS.slot2_orange,
  CO2: COLORS.slot4_yellow,
  CH4: COLORS.slot5_magenta,
  EtOH: COLORS.slot6_green,
  H2O: COLORS.slot3_aqua,
  O2: COLORS.slot7_violet,
};
