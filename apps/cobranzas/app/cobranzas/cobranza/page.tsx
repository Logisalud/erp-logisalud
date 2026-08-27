'use client';

import { useEffect, useState, useCallback } from 'react';

interface VendedorRank {
  vendedor_id: string; nombre: string; codigo: string | null;
  total: number; vencido: number; alDia: number; nCobros: number;
}
interface DiaRow { fecha: string; total: number; vencido: number; }
interface Data {
  desde: string; hasta: string;
  totalCobrado: number; totalVencido: number; totalAlDia: number; pctVencido: number; nCobros: number;
  ranking: VendedorRank[]; dias: DiaRow[];
}

const fmt = (n: number) => 'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtFecha = (s: string) => { const [y, m, d] = s.split('-'); return `${d}/${m}`; };

function hoyISO(): string { return new Date().toLocaleDateString('en-CA'); }
function isoMenos(dias: number): string {
  const d = new Date(); d.setDate(d.getDate() - dias);
  return d.toLocaleDateString('en-CA');
}
function diasDesdeLunes(): number { return (new Date().getDay() + 6) % 7; } // lunes=0
function inicioSemana(): string { return isoMenos(diasDesdeLunes()); }
function lunesPasado(): string { return isoMenos(diasDesdeLunes() + 7); }
function domingoPasado(): string { return isoMenos(diasDesdeLunes() + 1); }
function inicioMes(): string {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

type Orden = 'total' | 'vencido';

export default function CobranzaPage() {
  const [desde, setDesde] = useState(inicioMes());
  const [hasta, setHasta] = useState(hoyISO());
  const [data, setData]   = useState<Data | null>(null);
  const [cargando, setCargando] = useState(false);
  const [orden, setOrden] = useState<Orden>('total');

  const cargar = useCallback(async (d: string, h: string) => {
    setCargando(true);
    try {
      const res = await fetch(`/api/cobranza?desde=${d}&hasta=${h}`, { cache: 'no-store' });
      setData(await res.json());
    } finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(desde, hasta); }, [desde, hasta, cargar]);

  const preset = (d: string, h: string) => { setDesde(d); setHasta(h); };

  const ranking = data ? [...data.ranking].sort((a, b) => orden === 'total' ? b.total - a.total : b.vencido - a.vencido) : [];
  const maxDia = data && data.dias.length ? Math.max(...data.dias.map(d => d.total)) : 0;

  return (
    <div>
      <header className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-oswald tracking-wide">LOGISALUD</h1>
            <p className="text-white/70 text-sm">Cobranza del período</p>
          </div>
          <a href="/cobranzas" className="text-white/80 hover:text-white text-sm">&larr; Menú</a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto mt-6 px-4 pb-16">
        {/* Rango */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Desde</label>
              <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Hasta</label>
              <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {([
                ['Hoy', hoyISO(), hoyISO()],
                ['Esta semana', inicioSemana(), hoyISO()],
                ['Semana pasada', lunesPasado(), domingoPasado()],
                ['Este mes', inicioMes(), hoyISO()],
              ] as [string, string, string][]).map(([label, d, h]) => (
                <button key={label} onClick={() => preset(d, h)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition ${desde === d && hasta === h ? 'text-white border-transparent' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                  style={desde === d && hasta === h ? { background: '#4ABCC2' } : undefined}>
                  {label}
                </button>
              ))}
            </div>
            <a href={`/api/cobranza/exportar?desde=${desde}&hasta=${hasta}`}
              className="ml-auto px-3 py-2 text-xs font-medium rounded-lg text-white transition" style={{ background: '#4BB168' }}>
              ⬇ Exportar a Excel
            </a>
          </div>
        </div>

        {cargando || !data ? (
          <div className="text-center py-16 text-gray-400 text-sm">Cargando…</div>
        ) : (
          <>
            {/* Números grandes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">Cobranza total</p>
                <p className="font-oswald text-2xl mt-0.5 text-gray-800">{fmt(data.totalCobrado)}</p>
                <p className="text-[11px] text-gray-400">{data.nCobros} cobro{data.nCobros !== 1 ? 's' : ''}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">De lo vencido</p>
                <p className="font-oswald text-2xl mt-0.5" style={{ color: '#4BB168' }}>{fmt(data.totalVencido)}</p>
                <p className="text-[11px] text-gray-400">recuperación de cartera difícil</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">% vencido del total</p>
                <p className="font-oswald text-2xl mt-0.5" style={{ color: '#4ABCC2' }}>{data.pctVencido}%</p>
                <p className="text-[11px] text-gray-400">al día: {fmt(data.totalAlDia)}</p>
              </div>
            </div>

            {/* Evolución diaria */}
            {data.dias.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Cobranza por día</p>
                <div className="flex items-end gap-1 h-32 overflow-x-auto">
                  {data.dias.map(d => (
                    <div key={d.fecha} className="flex flex-col items-center gap-1 min-w-[26px]" title={`${fmtFecha(d.fecha)} · total ${fmt(d.total)} · vencido ${fmt(d.vencido)}`}>
                      <div className="w-5 flex flex-col justify-end rounded-t overflow-hidden" style={{ height: maxDia ? `${Math.max(4, d.total / maxDia * 100)}px` : '4px' }}>
                        <div style={{ height: d.total ? `${d.vencido / d.total * 100}%` : '0%', background: '#4BB168' }} />
                        <div className="flex-1" style={{ background: '#cbe9ea' }} />
                      </div>
                      <span className="text-[9px] text-gray-400 -rotate-45 origin-center whitespace-nowrap">{fmtFecha(d.fecha)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-4 mt-2 text-[11px] text-gray-400">
                  <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: '#4BB168' }} /> Vencido</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: '#cbe9ea' }} /> Al día</span>
                </div>
              </div>
            )}

            {/* Ranking por vendedor */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-oswald text-sm text-gray-600 tracking-wide uppercase">Ranking por vendedor</h3>
                <div className="flex gap-1 text-xs">
                  <span className="text-gray-400 self-center mr-1">ordenar por:</span>
                  {(['total', 'vencido'] as Orden[]).map(o => (
                    <button key={o} onClick={() => setOrden(o)}
                      className={`px-2 py-1 rounded-md ${orden === o ? 'text-white' : 'bg-gray-50 text-gray-500'}`}
                      style={orden === o ? { background: '#4ABCC2' } : undefined}>
                      {o === 'total' ? 'Total' : 'Vencido'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-2.5 text-left">#</th>
                      <th className="px-4 py-2.5 text-left">Vendedor</th>
                      <th className="px-4 py-2.5 text-right">Cobranza total</th>
                      <th className="px-4 py-2.5 text-right" style={{ color: '#4BB168' }}>De lo vencido</th>
                      <th className="px-4 py-2.5 text-right">Al día</th>
                      <th className="px-4 py-2.5 text-right">Cobros</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ranking.map((v, i) => (
                      <tr key={v.vendedor_id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-400">{i + 1}</td>
                        <td className="px-4 py-2.5">
                          <span className="font-semibold text-gray-800">{v.nombre}</span>
                          {v.codigo && <span className="text-gray-400 text-xs ml-1">({v.codigo})</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-800">{fmt(v.total)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold" style={{ color: '#4BB168' }}>{fmt(v.vencido)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{fmt(v.alDia)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{v.nCobros}</td>
                      </tr>
                    ))}
                    {ranking.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">Sin cobros en el período.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
