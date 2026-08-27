'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

interface ClienteConcentracion {
  cliente_ruc: string;
  razon_social: string;
  vendedor_id: string | null;
  vendedor_codigo: string | null;
  vendedor_nombre: string | null;
  zona_nombre: string | null;
  monto_vencido: number;
  n_facturas_vencidas: number;
  dias_retraso_max: number;
}

type SortKey = 'razon_social' | 'vendedor_nombre' | 'monto_vencido' | 'n_facturas_vencidas' | 'dias_retraso_max';

const fmt = (n: number) =>
  'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export default function ConcentracionCarteraPage() {
  const [clientes, setClientes]   = useState<ClienteConcentracion[]>([]);
  const [cargando, setCargando]   = useState(true);
  const [busqueda, setBusqueda]   = useState('');
  const [vendedorSel, setVendedorSel] = useState('');
  const [soloReincidentes, setSoloReincidentes] = useState(false);
  const [sortKey, setSortKey]     = useState<SortKey>('monto_vencido');
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('desc');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch('/api/concentracion-cartera', { cache: 'no-store' });
      const d = await res.json();
      setClientes(d.clientes ?? []);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const vendedores = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clientes) {
      const key = c.vendedor_id ?? '__sin__';
      const label = c.vendedor_nombre ? `${c.vendedor_nombre}${c.vendedor_codigo ? ` (${c.vendedor_codigo})` : ''}` : 'Sin asignar';
      if (!map.has(key)) map.set(key, label);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [clientes]);

  const totalVencido   = useMemo(() => clientes.reduce((s, c) => s + c.monto_vencido, 0), [clientes]);
  const nClientes      = clientes.length;
  const pctTop15       = useMemo(() => {
    if (totalVencido <= 0) return 0;
    const top15 = [...clientes].sort((a, b) => b.monto_vencido - a.monto_vencido).slice(0, 15);
    const sumaTop15 = top15.reduce((s, c) => s + c.monto_vencido, 0);
    return (sumaTop15 / totalVencido) * 100;
  }, [clientes, totalVencido]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    let rows = clientes;
    if (q) {
      rows = rows.filter(c =>
        c.razon_social.toLowerCase().includes(q) || c.cliente_ruc.includes(q)
      );
    }
    if (vendedorSel) {
      rows = rows.filter(c => (c.vendedor_id ?? '__sin__') === vendedorSel);
    }
    if (soloReincidentes) {
      rows = rows.filter(c => c.n_facturas_vencidas >= 3);
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir;
      return (Number(av) - Number(bv)) * dir;
    });
  }, [clientes, busqueda, vendedorSel, soloReincidentes, sortKey, sortDir]);

  const ordenarPor = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'razon_social' || key === 'vendedor_nombre' ? 'asc' : 'desc');
    }
  };

  const flecha = (key: SortKey) => sortKey !== key ? '' : (sortDir === 'asc' ? ' ↑' : ' ↓');

  return (
    <div className="min-h-screen bg-gray-50 font-poppins">
      <header className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-oswald tracking-wide">LOGISALUD</h1>
            <p className="text-white/70 text-sm">Concentración de cartera vencida</p>
          </div>
          <a href="/cobranzas" className="text-white/80 hover:text-white text-sm">&larr; Menú</a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto mt-6 px-4 pb-16">
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs uppercase tracking-wider text-gray-400">Total vencido</p>
            <p className="font-oswald text-2xl text-red-600">{fmt(totalVencido)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs uppercase tracking-wider text-gray-400">Clientes con algo vencido</p>
            <p className="font-oswald text-2xl text-gray-800">{nClientes}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs uppercase tracking-wider text-gray-400">% en los primeros 15 clientes</p>
            <p className="font-oswald text-2xl text-orange-600">{pctTop15.toFixed(1)}%</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o RUC…"
            className="flex-1 min-w-[220px] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal bg-white"
          />
          <select
            value={vendedorSel}
            onChange={e => setVendedorSel(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
          >
            <option value="">Todos los vendedores</option>
            {vendedores.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer px-3 py-2 border border-gray-200 rounded-lg bg-white">
            <input type="checkbox" checked={soloReincidentes} onChange={e => setSoloReincidentes(e.target.checked)} className="accent-logisalud-teal" />
            3+ facturas vencidas
          </label>
          {(busqueda || vendedorSel || soloReincidentes) && (
            <button
              onClick={() => { setBusqueda(''); setVendedorSel(''); setSoloReincidentes(false); }}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Limpiar filtros
            </button>
          )}
          <span className="text-xs text-gray-400 ml-auto">{filtrados.length} de {nClientes}</span>
        </div>

        {cargando ? (
          <div className="text-center py-16 text-gray-400 text-sm">Cargando…</div>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
            No hay clientes que coincidan con el filtro.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-gray-500 bg-gray-50">
                  <th className="px-4 py-3 text-left cursor-pointer select-none" onClick={() => ordenarPor('razon_social')}>Cliente{flecha('razon_social')}</th>
                  <th className="px-4 py-3 text-left cursor-pointer select-none" onClick={() => ordenarPor('vendedor_nombre')}>Vendedor{flecha('vendedor_nombre')}</th>
                  <th className="px-4 py-3 text-left">Zona</th>
                  <th className="px-4 py-3 text-right cursor-pointer select-none" onClick={() => ordenarPor('monto_vencido')}>Monto Vencido{flecha('monto_vencido')}</th>
                  <th className="px-4 py-3 text-right cursor-pointer select-none" onClick={() => ordenarPor('n_facturas_vencidas')}>N° Facturas{flecha('n_facturas_vencidas')}</th>
                  <th className="px-4 py-3 text-right cursor-pointer select-none" onClick={() => ordenarPor('dias_retraso_max')}>Días Máx.{flecha('dias_retraso_max')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtrados.map(c => (
                  <tr key={c.cliente_ruc} className="hover:bg-logisalud-green/5 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{c.razon_social}</p>
                      <p className="text-xs text-gray-400">{c.cliente_ruc}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {c.vendedor_nombre ?? 'Sin asignar'}
                      {c.vendedor_codigo && <span className="text-gray-400"> ({c.vendedor_codigo})</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{c.zona_nombre ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-red-600">{fmt(c.monto_vencido)}</td>
                    <td className={`px-4 py-3 text-right text-xs ${c.n_facturas_vencidas >= 3 ? 'font-semibold text-orange-600' : 'text-gray-500'}`}>
                      {c.n_facturas_vencidas}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-500">{c.dias_retraso_max}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
