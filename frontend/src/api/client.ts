import type {
  CatalystInfo,
  SimulationInputs,
  SimulationResult,
  SensitivityResult,
  InverseYieldResult,
} from "../types";

const BASE = "https://atr-h2-reactor-2d.onrender.com/api";

async function jsonFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function fetchCatalysts(): Promise<{ catalysts: CatalystInfo[] }> {
  return jsonFetch(`${BASE}/catalysts`);
}

export function runSimulation(
  inputs: SimulationInputs,
): Promise<SimulationResult> {
  return jsonFetch(`${BASE}/simulate`, {
    method: "POST",
    body: JSON.stringify(inputs),
  });
}

export function fetchSensitivity(params: {
  param: string;
  catalyst: string;
  T_in_C: number;
  P_in_bar: number;
  O2_EtOH: number;
  S_E: number;
  W_F_EtOH: number;
  points?: number;
}): Promise<SensitivityResult> {
  return jsonFetch(`${BASE}/sensitivity`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function fetchHistory(limit = 20) {
  return jsonFetch(`${BASE}/history?limit=${limit}`);
}

// Problema inverso: dado un %H2 objetivo, el backend busca la temperatura
// de alimentacion que lo produce (dejando fijas las demas variables) y
// devuelve la corrida completa del solver en esa temperatura.
export function solveForYield(params: {
  catalyst: string;
  P_in_bar: number;
  O2_EtOH: number;
  S_E: number;
  W_F_EtOH: number;
  targetYH2Pct: number;
}): Promise<InverseYieldResult> {
  return jsonFetch(`${BASE}/inverse-yield`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}
