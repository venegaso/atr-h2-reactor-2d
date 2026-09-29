import React from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import type { AxialProfilePoint } from '../types';
import { COLORS } from '../theme';

export default function AxialProfileChart({ data }: { data: AxialProfilePoint[] }) {
  const plot = data.map((p) => ({ z_cm: p.z * 100, X_EtOH: p.X_EtOH, Y_H2: p.Y_H2 }));
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-200 mb-1">
        Perfil axial (0 - 40 cm): conversion de bioetanol y rendimiento de H2
      </h3>
      <p className="text-[11px] text-slate-500 mb-3">Un solo eje: ambas curvas estan en % (misma escala)</p>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={plot} margin={{
          top: 5, right: 20, left: 0, bottom: 5,
        }}
        >
          <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="z_cm"
            type="number"
            domain={[0, 40]}
            ticks={[0, 5, 10, 15, 20, 25, 30, 35, 40]}
            stroke={COLORS.textMuted}
            tick={{ fill: COLORS.textMuted, fontSize: 11 }}
            tickFormatter={(v: number) => v.toFixed(0)}
            label={{
              value: 'z (cm)', position: 'insideBottom', offset: -3, fill: COLORS.textMuted, fontSize: 11,
            }}
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
            labelStyle={{ color: COLORS.textSecondary }}
            formatter={(v: number) => `${v.toFixed(2)} %`}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: COLORS.textSecondary }} />
          <Line
            type="monotone"
            dataKey="X_EtOH"
            name="Conversion EtOH (X)"
            stroke={COLORS.slot6_green}
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="Y_H2"
            name="Rendimiento H2 (Y_H2)"
            stroke={COLORS.slot1_blue}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
