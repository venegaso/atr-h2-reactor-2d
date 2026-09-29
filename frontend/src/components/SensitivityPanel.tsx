import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { fetchSensitivity } from '../api/client';
import type { SimulationInputs, SensitivityResult } from '../types';
import { COLORS } from '../theme';

const PARAM_OPTIONS: { key: string; label: string }[] = [
  { key: 'T_in_C', label: 'Temperatura (T)' },
  { key: 'P_in_bar', label: 'Presion (P)' },
  { key: 'O2_EtOH', label: 'O2 / Etanol' },
  { key: 'S_E', label: 'H2O / Etanol (S/E)' },
];

export default function SensitivityPanel({ inputs }: { inputs: SimulationInputs }) {
  const [param, setParam] = useState('T_in_C');
  const [data, setData] = useState<SensitivityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSensitivity({
      param,
      catalyst: inputs.catalyst,
      T_in_C: inputs.T_in_C,
      P_in_bar: inputs.P_in_bar,
      O2_EtOH: inputs.O2_EtOH,
      S_E: inputs.S_E,
      W_F_EtOH: inputs.W_F_EtOH,
      points: 12,
    }).then((res) => {
      if (!cancelled) setData(res);
    }).catch((e) => {
      if (!cancelled) setError(e.message);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param, inputs.catalyst, inputs.T_in_C, inputs.P_in_bar, inputs.O2_EtOH, inputs.S_E, inputs.W_F_EtOH]);

  const plot = data?.results.map((r) => ({
    value: r.value, Y_H2_pct: r.Y_H2_pct, X_EtOH_pct: r.X_EtOH_pct,
  })) ?? [];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-slate-200">
          Sensibilidad parametrica: Y_H2 vs {data?.label ?? '...'}
        </h3>
        <div className="flex gap-1">
          {PARAM_OPTIONS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setParam(p.key)}
              className={`text-xs px-2.5 py-1 rounded-full border ${
                param === p.key
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-slate-500 mb-3">
        Barre el parametro seleccionado manteniendo las demas condiciones actuales fijas
        {loading && <span className="text-blue-400 ml-1">(calculando...)</span>}
      </p>
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={plot} margin={{
          top: 5, right: 20, left: 0, bottom: 5,
        }}
        >
          <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="value"
            stroke={COLORS.textMuted}
            tick={{ fill: COLORS.textMuted, fontSize: 11 }}
            tickFormatter={(v: number) => v.toFixed(v < 5 ? 2 : 0)}
          />
          <YAxis
            stroke={COLORS.textMuted}
            tick={{ fill: COLORS.textMuted, fontSize: 11 }}
            domain={[0, 100]}
            label={{
              value: '%', angle: -90, position: 'insideLeft', fill: COLORS.textMuted, fontSize: 11,
            }}
          />
          <Tooltip
            contentStyle={{
              background: COLORS.surface, border: `1px solid ${COLORS.axis}`, fontSize: 12,
            }}
            formatter={(v: number) => `${v.toFixed(2)} %`}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: COLORS.textSecondary }} />
          <Line
            type="monotone"
            dataKey="Y_H2_pct"
            name="Y_H2 (%)"
            stroke={COLORS.slot1_blue}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="X_EtOH_pct"
            name="Conversion EtOH (%)"
            stroke={COLORS.slot6_green}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
