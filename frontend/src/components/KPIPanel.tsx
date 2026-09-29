import React from 'react';
import type { SimulationResult } from '../types';
import { SPECIES_COLOR } from '../theme';

function StatTile({
  label, value, unit, accent, big,
}: { label: string; value: string; unit?: string; accent?: string; big?: boolean }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">{label}</div>
      <div className="flex items-baseline gap-1">
        <span
          className={big ? 'text-4xl font-bold tabular-nums' : 'text-2xl font-semibold tabular-nums'}
          style={{ color: accent || '#fff' }}
        >
          {value}
        </span>
        {unit && <span className="text-sm text-slate-400">{unit}</span>}
      </div>
    </div>
  );
}

const SPECIES_LABEL: Record<string, string> = {
  H2: 'H2', CO: 'CO', CO2: 'CO2', CH4: 'CH4', EtOH: 'EtOH', H2O: 'H2O', O2: 'O2',
};

export default function KPIPanel({ result }: { result: SimulationResult }) {
  const { kpis, outlet, feed } = result;
  const dry = outlet.dryMoleFraction_pct;
  const order = ['H2', 'CO', 'CO2', 'CH4', 'EtOH', 'O2'];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          label="Rendimiento de H2 (Y_H2)"
          value={kpis.Y_H2_pct.toFixed(1)}
          unit="%"
          accent={SPECIES_COLOR.H2}
          big
        />
        <StatTile
          label="%H2 base seca"
          value={kpis.pctH2_dry.toFixed(1)}
          unit="%"
          accent={SPECIES_COLOR.H2}
        />
        <StatTile
          label="Conversion de EtOH"
          value={kpis.X_EtOH_pct.toFixed(1)}
          unit="%"
          accent={SPECIES_COLOR.EtOH}
        />
        <StatTile
          label="Caida de presion"
          value={kpis.deltaP_bar.toFixed(3)}
          unit="bar"
          accent="#9ca3af"
        />
        <StatTile
          label="Hotspot (frente de combustion)"
          value={kpis.T_hotspot_C.toFixed(0)}
          unit={`C @ z=${(kpis.z_hotspot_m * 100).toFixed(1)} cm`}
          accent="#e66767"
        />
        <StatTile
          label="Coldspot (frente de reformado)"
          value={kpis.T_coldspot_C.toFixed(0)}
          unit={`C @ z=${(kpis.z_coldspot_m * 100).toFixed(1)} cm`}
          accent="#199e70"
        />
        <StatTile
          label="Flujo molar H2 salida"
          value={(outlet.molar_mol_s.H2 * 1000).toFixed(3)}
          unit="mmol/s"
          accent={SPECIES_COLOR.H2}
        />
        <StatTile
          label="Flujo masico H2 salida"
          value={(outlet.mass_g_s.H2).toFixed(4)}
          unit="g/s"
          accent={SPECIES_COLOR.H2}
        />
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">
          Composicion de salida (base seca) y flujos por especie
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 text-xs uppercase">
                <th className="py-1 pr-4">Especie</th>
                <th className="py-1 pr-4 text-right">% molar (seco)</th>
                <th className="py-1 pr-4 text-right">Flujo molar (mol/s)</th>
                <th className="py-1 pr-4 text-right">Flujo masico (g/s)</th>
              </tr>
            </thead>
            <tbody>
              {order.map((sp) => (
                <tr key={sp} className="border-t border-slate-800">
                  <td className="py-1.5 pr-4 flex items-center gap-2">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: SPECIES_COLOR[sp] }}
                    />
                    {SPECIES_LABEL[sp]}
                  </td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{(dry[sp] ?? 0).toFixed(2)}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">
                    {(outlet.molar_mol_s[sp] ?? 0).toExponential(3)}
                  </td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">
                    {(outlet.mass_g_s[sp] ?? 0).toFixed(4)}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-slate-800">
                <td className="py-1.5 pr-4 text-slate-500">H2O (humedo)</td>
                <td className="py-1.5 pr-4 text-right text-slate-500">-</td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-slate-400">
                  {(outlet.molar_mol_s.H2O ?? 0).toExponential(3)}
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-slate-400">
                  {(outlet.mass_g_s.H2O ?? 0).toFixed(4)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          Alimentacion: F_EtOH,in = {(feed.F_EtOH_in_mol_s * 1000).toFixed(3)} mmol/s &middot;
          {' '}u_z,in = {feed.uz_in_m_s.toFixed(2)} m/s
        </p>
      </div>
    </div>
  );
}
