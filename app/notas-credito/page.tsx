'use client';

import { useState, useEffect, useCallback } from 'react';

interface Fila {
  id: string;
  comprobante: string;
  fecha_emision: string;
  cliente_ruc: string;
  razon_social: string;
  factura_relacionada: string | null;
  importe_total: number;
}

const fmt = (n: number) => 'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtFecha = (s: string) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };

export default function NotasCreditoPage() {
  const [filas, setFilas]     = useState<Fila[]>([]);
  const [total, setTotal]     = useState(0);
  const [cargando, setCargando] = useState(true);
  const [desde, setDesde]     = useState('');
  const [hasta, setHasta]     = useState('');
  const [cliente, setCliente] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const params = new URLSearchParams();
      if (desde) params.set('desde', desde);
      if (hasta) params.set('hasta', hasta);
      if (cliente.trim()) params.set('cliente', cliente.trim());
      const res = await fetch(`/api/notas-credito?${params}`, { cache: 'no-store' });
      const d = await res.json();
      setFilas(d.filas ?? []);
      setTotal(d.total ?? 0);
    } finally {
      setCargando(false);
    }
  }, [desde, hasta, cliente]);

  useEffect(() => { cargar(); }, [cargar]);

  const exportarUrl = () => {
    const params = new URLSearchParams();
    if (desde) params.set('desde', desde);
    if (hasta) params.set('hasta', hasta);
    if (cliente.trim()) params.set('cliente', cliente.trim());
    return `/api/notas-credito/exportar?${params}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 font-poppins">
      <header className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-oswald tracking-wide">LOGISALUD</h1>
            <p className="text-white/70 text-sm">Notas de Crédito emitidas</p>
          </div>
          <a href="/" className="text-white/80 hover:text-white text-sm">&larr; Menú</a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto mt-6 px-4 pb-16">
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs uppercase tracking-wider text-gray-400">N° de NC</p>
            <p className="font-oswald text-2xl text-gray-800">{filas.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs uppercase tracking-wider text-gray-400">Monto total</p>
            <p className="font-oswald text-2xl text-purple-700">{fmt(total)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Desde</label>
            <input
              type="date" value={desde}
              onChange={e => setDesde(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Hasta</label>
            <input
              type="date" value={hasta}
              onChange={e => setHasta(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
            />
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs text-gray-500 mb-1">Cliente (RUC o razón social)</label>
            <input
              type="text" value={cliente}
              onChange={e => setCliente(e.target.value)}
              placeholder="Buscar cliente…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
            />
          </div>
          {(desde || hasta || cliente) && (
            <button
              onClick={() => { setDesde(''); setHasta(''); setCliente(''); }}
              className="text-xs text-gray-400 hover:text-gray-600 underline mb-2"
            >
              Limpiar filtros
            </button>
          )}
          <a
            href={exportarUrl()}
            className="ml-auto px-4 py-2 rounded-lg text-sm font-medium text-white transition"
            style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}
          >
            ↓ Exportar
          </a>
        </div>

        {cargando ? (
          <div className="text-center py-16 text-gray-400 text-sm">Cargando…</div>
        ) : filas.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
            No hay notas de crédito que coincidan con el filtro.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-gray-500 bg-gray-50">
                  <th className="px-4 py-3 text-left">N° NC</th>
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Factura/Boleta</th>
                  <th className="px-4 py-3 text-right">Monto NC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filas.map(f => (
                  <tr key={f.id} className="hover:bg-logisalud-green/5 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-purple-700">{f.comprobante}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtFecha(f.fecha_emision)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{f.razon_social}</p>
                      <p className="text-xs text-gray-400">{f.cliente_ruc}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{f.factura_relacionada ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-purple-700">{fmt(f.importe_total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-300 text-xs font-semibold">
                <tr>
                  <td colSpan={4} className="px-4 py-3 font-oswald text-sm text-gray-700 tracking-wide">TOTAL</td>
                  <td className="px-4 py-3 text-right text-purple-700">{fmt(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
