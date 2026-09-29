import React, { useEffect, useRef, useState } from 'react';
import ControlPanel from './components/ControlPanel';
import KPIPanel from './components/KPIPanel';
import AxialProfileChart from './components/AxialProfileChart';
import TemperatureProfileChart from './components/TemperatureProfileChart';
import SensitivityPanel from './components/SensitivityPanel';
import { fetchCatalysts, runSimulation, solveForYield } from './api/client';
import type {
  CatalystInfo, InverseYieldResult, SimulationInputs, SimulationResult,
} from './types';

const DEFAULT_INPUTS: SimulationInputs = {
  catalyst: 'nicoce',
  T_in_C: 600,
  P_in_bar: 1.5,
  O2_EtOH: 0.4,
  S_E: 3.5,
  W_F_EtOH: 30,
};

export default function App() {
  const [catalysts, setCatalysts] = useState<CatalystInfo[]>([]);
  const [inputs, setInputs] = useState<SimulationInputs>(DEFAULT_INPUTS);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modo objetivo de rendimiento (problema inverso): en vez de mover T a
  // mano, se fija el %H2 que se quiere producir y el backend busca la T que
  // lo logra, dejando las demas variables (P, O2/EtOH, S/E, W_F_EtOH,
  // catalizador) en lo que digan sus deslizadores.
  const [targetMode, setTargetMode] = useState(false);
  const [targetYH2, setTargetYH2] = useState(45);
  const [inverseInfo, setInverseInfo] = useState<InverseYieldResult | null>(null);

  useEffect(() => {
    fetchCatalysts().then((r) => setCatalysts(r.catalysts)).catch((e) => setError(e.message));
  }, []);

  // Modo directo: T (y las demas variables) se controlan a mano.
  useEffect(() => {
    if (targetMode) return undefined;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      setError(null);
      runSimulation(inputs)
        .then((r) => setResult(r))
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMode, inputs]);

  // Modo objetivo: T se resuelve por biseccion para alcanzar targetYH2;
  // deliberadamente NO depende de inputs.T_in_C (ese campo lo escribe este
  // mismo efecto al recibir la respuesta) para no disparar un ciclo.
  useEffect(() => {
    if (!targetMode) return undefined;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      setError(null);
      solveForYield({
        catalyst: inputs.catalyst,
        P_in_bar: inputs.P_in_bar,
        O2_EtOH: inputs.O2_EtOH,
        S_E: inputs.S_E,
        W_F_EtOH: inputs.W_F_EtOH,
        targetYH2Pct: targetYH2,
      })
        .then((r) => {
          setResult(r.result);
          setInverseInfo(r);
          setInputs((prev) => (prev.T_in_C === r.T_in_C ? prev : { ...prev, T_in_C: r.T_in_C }));
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMode, targetYH2, inputs.catalyst, inputs.P_in_bar, inputs.O2_EtOH, inputs.S_E, inputs.W_F_EtOH]);

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold text-slate-100">
            Reactor 2D Axisimetrico ATR - Produccion de H2 por Reformado Autotermico de Bioetanol
          </h1>
          <p className="text-xs text-slate-500">
            Modelo no isotermico en tiempo real &middot; cinetica LHHW &middot; Metodo de Lineas (MOL)
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-5 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
        <aside className="space-y-4">
          <ControlPanel
            catalysts={catalysts}
            inputs={inputs}
            onChange={setInputs}
            loading={loading}
            targetMode={targetMode}
            targetYH2={targetYH2}
            onTargetModeChange={setTargetMode}
            onTargetYH2Change={setTargetYH2}
            inverseInfo={inverseInfo}
          />
        </aside>

        <section className="space-y-4">
          {error && (
            <div className="bg-red-950 border border-red-800 text-red-200 text-sm rounded-lg px-4 py-2">
              Error: {error}
            </div>
          )}
          {result ? (
            <>
              <KPIPanel result={result} />
              <AxialProfileChart data={result.axialProfile} />
              <TemperatureProfileChart
                axial={result.axialProfile}
                radial={result.radialSnapshots}
                hotspotZ={result.kpis.z_hotspot_m}
                coldspotZ={result.kpis.z_coldspot_m}
              />
              <SensitivityPanel inputs={inputs} />
            </>
          ) : (
            <div className="text-slate-500 text-sm">Cargando simulacion inicial...</div>
          )}
        </section>
      </main>

      <footer className="max-w-7xl mx-auto px-4 py-6 text-[11px] text-slate-600">
        Modelo pseudo-homogeneo 2D axisimetrico (r,z): balance de materia LHHW, balance de energia con
        deteccion de hotspots/coldspots, y caida de presion via Ergun modificada. Backend Node.js/Express +
        SQLite; ver docs/formulacion_matematica_y_parametros para la formulacion completa y la tabla de
        parametros cineticos.
      </footer>
    </div>
  );
}
