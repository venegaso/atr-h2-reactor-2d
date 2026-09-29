import React from 'react';
import type {
  CatalystInfo, CatalystKey, InverseYieldResult, SimulationInputs,
} from '../types';

interface Props {
  catalysts: CatalystInfo[];
  inputs: SimulationInputs;
  onChange: (next: SimulationInputs) => void;
  loading: boolean;
  targetMode: boolean;
  targetYH2: number;
  onTargetModeChange: (v: boolean) => void;
  onTargetYH2Change: (v: number) => void;
  inverseInfo: InverseYieldResult | null;
}

function Slider({
  label, unit, value, min, max, step, onChange, hint,
}: {
  label: string; unit: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; hint?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between mb-1">
        <label className="text-sm font-medium text-slate-200">{label}</label>
        <span className="text-sm tabular-nums text-blue-400 font-semibold">
          {value.toLocaleString('es-CO', { maximumFractionDigits: 2 })} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-blue-500"
      />
      <div className="flex justify-between text-[11px] text-slate-500">
        <span>{min}</span>
        <span>{max}</span>
      </div>
      {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
    </div>
  );
}

export default function ControlPanel({
  catalysts, inputs, onChange, loading,
  targetMode, targetYH2, onTargetModeChange, onTargetYH2Change, inverseInfo,
}: Props) {
  const catalyst = catalysts.find((c) => c.key === inputs.catalyst);
  const isHomogeneous = inputs.catalyst === 'none';

  const set = <K extends keyof SimulationInputs>(key: K, value: SimulationInputs[K]) => {
    onChange({ ...inputs, [key]: value });
  };

  return (
    <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
      <h2 className="text-base font-semibold text-slate-100 mb-3">Condiciones de operacion</h2>

      <div className="mb-4 pb-4 border-b border-slate-800">
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-slate-200">Modo objetivo de rendimiento</label>
          <button
            type="button"
            onClick={() => onTargetModeChange(!targetMode)}
            className={`text-xs px-2 py-1 rounded-full border transition-colors ${
              targetMode
                ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            {targetMode ? 'Activado' : 'Desactivado'}
          </button>
        </div>
        <p className="text-[11px] text-slate-500 leading-snug">
          Fija el %H2 que quieres producir; el modelo resuelve el problema inverso y ajusta la
          temperatura de alimentacion (T) para lograrlo, manteniendo las demas variables en los
          valores de los deslizadores de abajo.
        </p>
        {targetMode && (
          <>
            <div className="mt-3">
              <Slider
                label="Rendimiento H2 objetivo (Y_H2)"
                unit="%"
                value={targetYH2}
                min={2}
                max={90}
                step={0.5}
                onChange={onTargetYH2Change}
              />
            </div>
            {inverseInfo && !inverseInfo.achieved && (
              <p className="text-[11px] text-amber-400 leading-snug -mt-2">
                Objetivo fuera del rango alcanzable con las demas variables actuales (entre T=
                {inverseInfo.bounds.T_min_C} C y T={inverseInfo.bounds.T_max_C} C se obtiene entre
                {' '}{inverseInfo.bounds.Y_H2_at_Tmin.toFixed(1)}% y {inverseInfo.bounds.Y_H2_at_Tmax.toFixed(1)}%
                de H2). Mostrando el valor mas cercano posible:
                {' '}{inverseInfo.achievedYH2Pct.toFixed(1)}%.
              </p>
            )}
          </>
        )}
      </div>

      <div className="mb-4">
        <label className="text-sm font-medium text-slate-200 block mb-1">Catalizador</label>
        <select
          value={inputs.catalyst}
          onChange={(e) => {
            const nextKey = e.target.value as CatalystKey;
            const wasHomogeneous = inputs.catalyst === 'none';
            const nowHomogeneous = nextKey === 'none';
            if (wasHomogeneous !== nowHomogeneous) {
              onChange({
                ...inputs, catalyst: nextKey, W_F_EtOH: nowHomogeneous ? 0.3 : 30,
              });
            } else {
              onChange({ ...inputs, catalyst: nextKey });
            }
          }}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
        >
          {catalysts.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
        {catalyst && <p className="text-[11px] text-slate-500 mt-1 leading-snug">{catalyst.description}</p>}
      </div>

      {targetMode ? (
        <div className="mb-4">
          <div className="flex items-baseline justify-between mb-1">
            <label className="text-sm font-medium text-slate-200">Temperatura de alimentacion (T)</label>
            <span className="text-sm tabular-nums text-emerald-400 font-semibold">
              {inputs.T_in_C.toLocaleString('es-CO', { maximumFractionDigits: 1 })} C
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-emerald-500/70"
              style={{ width: `${Math.min(100, Math.max(0, ((inputs.T_in_C - 300) / (900 - 300)) * 100))}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-slate-500">
            <span>300</span>
            <span>900</span>
          </div>
          <p className="text-[11px] text-emerald-500/80 mt-0.5">
            Calculada automaticamente para alcanzar el Y_H2 objetivo (biseccion sobre el solver 2D)
          </p>
        </div>
      ) : (
        <Slider
          label="Temperatura de alimentacion (T)"
          unit="C"
          value={inputs.T_in_C}
          min={300}
          max={900}
          step={5}
          onChange={(v) => set('T_in_C', v)}
        />
      )}
      <Slider
        label="Presion del reactor (P)"
        unit="bar"
        value={inputs.P_in_bar}
        min={0.8}
        max={6}
        step={0.1}
        onChange={(v) => set('P_in_bar', v)}
      />
      <Slider
        label="Relacion O2 / Etanol"
        unit="mol/mol"
        value={inputs.O2_EtOH}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => set('O2_EtOH', v)}
        hint="Controla la oxidacion parcial exotermica (autoneutralidad termica, dH~0)"
      />
      <Slider
        label="Relacion H2O / Etanol (S/E)"
        unit="mol/mol"
        value={inputs.S_E}
        min={0.5}
        max={8}
        step={0.1}
        onChange={(v) => set('S_E', v)}
        hint="Desplaza el equilibrio de water-gas shift y previene coque"
      />
      <Slider
        label={isHomogeneous ? 'Tiempo de residencia (tau)' : 'Espacio-tiempo (W/F EtOH)'}
        unit={isHomogeneous ? 's' : 'kg cat s/mol'}
        value={inputs.W_F_EtOH}
        min={isHomogeneous ? 0.02 : 1}
        max={isHomogeneous ? 3 : 120}
        step={isHomogeneous ? 0.01 : 1}
        onChange={(v) => set('W_F_EtOH', v)}
        hint={isHomogeneous
          ? 'Sin catalizador: reinterpretado como tiempo de residencia del gas en el reactor vacio'
          : 'Masa de catalizador / flujo molar de etanol alimentado'}
      />

      <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-800">
        Longitud fija L = 0.40 m &middot; radio de tubo R = 1.5 cm &middot; pared adiabatica
        (autotermico) {loading && <span className="text-blue-400 ml-1">recalculando...</span>}
      </div>
    </div>
  );
}
