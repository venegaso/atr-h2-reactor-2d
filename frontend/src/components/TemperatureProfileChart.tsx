import React, { useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import type { AxialProfilePoint, RadialSnapshot } from '../types';
import { COLORS } from '../theme';

export default function TemperatureProfileChart({
  axial, radial, hotspotZ, coldspotZ,
}: {
  axial: AxialProfilePoint[]; radial: RadialSnapshot[]; hotspotZ: number; coldspotZ: number;
}) {
  const plot = axial.map((p) => ({ z_cm: p.z * 100, T_center: p.T_center, T_wall: p.T_wall }));
  const [snapIdx, setSnapIdx] = useState(Math.min(2, radial.length - 1));
  const snap = radial[snapIdx];
  // Con pared adiabatica y alimentacion uniforme el perfil radial es
  // fisicamente plano; las diferencias entre nodos son ruido de punto
  // flotante (~1e-8 C) del solver implicito. Se redondea para no graficar
  // ese ruido como si fuera una variacion real, y se fija un dominio del
  // eje Y con un margen minimo para que Recharts no "haga zoom" sobre el
  // ruido y produzca una escala sin sentido.
  const radialPlot = snap ? snap.r.map((r, i) => ({ r_mm: r * 1000, T: Math.round(snap.T[i] * 100) / 100 })) : [];
  const tValues = radialPlot.map((p) => p.T);
  const tMin = tValues.length ? Math.min(...tValues) : 0;
  const tMax = tValues.length ? Math.max(...tValues) : 1;
  const pad = Math.max(2, (tMax - tMin) * 0.15);
  const yDomain: [number, number] = [Math.floor(tMin - pad), Math.ceil(tMax + pad)];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-1">
          Perfil axial de temperatura (centro y pared)
        </h3>
        <p className="text-[11px] text-slate-500 mb-3">
          Hotspot (combustion) ~ {(hotspotZ * 100).toFixed(1)} cm &middot; Coldspot (reformado) ~ {(coldspotZ * 100).toFixed(1)} cm
        </p>
        <ResponsiveContainer width="100%" height={260}>
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
              tickFormatter={(v: number) => v.toFixed(0)}
              label={{
                value: 'T (C)', angle: -90, position: 'insideLeft', fill: COLORS.textMuted, fontSize: 11,
              }}
            />
            <Tooltip
              contentStyle={{
                background: COLORS.surface, border: `1px solid ${COLORS.axis}`, fontSize: 12,
              }}
              formatter={(v: number) => `${v.toFixed(1)} C`}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: COLORS.textSecondary }} />
            <ReferenceLine x={hotspotZ * 100} stroke={COLORS.slot8_red} strokeDasharray="4 2" />
            <ReferenceLine x={coldspotZ * 100} stroke={COLORS.slot3_aqua} strokeDasharray="4 2" />
            <Line type="monotone" dataKey="T_center" name="T centro (r=0)" stroke={COLORS.slot8_red} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="T_wall" name="T pared (r=Rt)" stroke={COLORS.slot7_violet} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-slate-200">Perfil radial de temperatura</h3>
          <select
            value={snapIdx}
            onChange={(e) => setSnapIdx(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
          >
            {radial.map((s, i) => (
              <option key={i} value={i}>z = {(s.z * 100).toFixed(1)} cm</option>
            ))}
          </select>
        </div>
        <p className="text-[11px] text-slate-500 mb-3">
          Con pared adiabatica el perfil radial es plano (sin perdidas de calor); actívalo con pared no adiabatica via la API para ver gradientes radiales.
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={radialPlot} margin={{
            top: 5, right: 20, left: 0, bottom: 5,
          }}
          >
            <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="r_mm"
              type="number"
              domain={[0, 'dataMax']}
              stroke={COLORS.textMuted}
              tick={{ fill: COLORS.textMuted, fontSize: 11 }}
              tickFormatter={(v: number) => v.toFixed(1)}
              label={{
                value: 'r (mm)', position: 'insideBottom', offset: -3, fill: COLORS.textMuted, fontSize: 11,
              }}
            />
            <YAxis
              stroke={COLORS.textMuted}
              tick={{ fill: COLORS.textMuted, fontSize: 11 }}
              domain={yDomain}
              allowDecimals={false}
              label={{
                value: 'T (C)', angle: -90, position: 'insideLeft', fill: COLORS.textMuted, fontSize: 11,
              }}
            />
            <Tooltip
              contentStyle={{
                background: COLORS.surface, border: `1px solid ${COLORS.axis}`, fontSize: 12,
              }}
              formatter={(v: number) => `${v.toFixed(2)} C`}
            />
            <Line type="monotone" dataKey="T" name="T(r)" stroke={COLORS.slot1_blue} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
