'use client';

import { useState, useEffect, useCallback } from 'react';

interface ContadoRow {
  id: string;
  comprobante: string;
  fecha_emision: string;
  cliente_ruc: string;
  razon_social: string;
  vendedor_nombre: string | null;
  vendedor_codigo: string | null;
  zona_nombre: string | null;
  moneda: string;
  importe_total: number;
  total_pagado: number;
  saldo_pendiente: number;
  dias_retraso: number;
  rango_vencimiento: string;
  contado_pendiente: boolean;
}

const fmt = (n: number) =>
  'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtFecha = (s: string | null) => {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};

export default function ContadosPendientesVista() {
  const [rows, setRows]         = useState<ContadoRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError]       = useState('');
  const [toggling, setToggling] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const res = await fetch('/api/contados-pendientes', { cache: 'no-store' });
      const d   = await res.json();
      if (d.error) throw new Error(d.error);
      setRows(d.documentos ?? []);
    } catch (e) { setError(String(e)); }
    finally     { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const marcarPagado = async (row: ContadoRow) => {
    setToggling(row.id);
    try {
      const res = await fetch(`/api/documentos/${row.id}/contado-pendiente`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contado_pendiente: false }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      await cargar();
    } catch (e) { alert(String(e)); }
    finally { setToggling(null); }
  };

  const total = rows.reduce((a, r) => a + Number(r.saldo_pendiente), 0);

  return (
    <div className="min-h-screen bg-gray-50 font-poppins">
      <header className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-oswald tracking-wide">LOGISALUD</h1>
            <p className="text-white/70 text-sm">Contados pendientes de pago</p>
          </div>
          <a href="/cobranzas" className="text-white/80 hover:text-white text-sm">← Menú</a>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">

        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-oswald text-xl text-gray-700">
              Facturas CONTADO pendientes de cobro
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">
              Clientes que pagan al contado pero aún no han cancelado. Se incluyen en la cartera mientras tengan este flag activo.
            </p>
          </div>
          <button
            onClick={cargar}
            className="px-3 py-1.5 text-sm rounded-lg border-2 font-medium transition-colors hover:bg-green-50"
            style={{ borderColor: '#4BB168', color: '#4BB168' }}
          >
            ↻ Actualizar
          </button>
        </div>

        {error   && <div className="p-4 bg-red-50 text-red-700 rounded-lg mb-4 text-sm">{error}</div>}
        {cargando && <div className="text-center py-24 text-gray-400">Cargando…</div>}

        {!cargando && rows.length === 0 && (
          <div className="text-center py-24">
            <p className="text-4xl mb-3">✓</p>
            <p className="text-gray-500 font-medium">No hay contados pendientes</p>
            <p className="text-gray-400 text-sm mt-1">Todas las facturas CONTADO están al día</p>
          </div>
        )}

        {!cargando && rows.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div className="bg-white rounded-xl border border-orange-200 px-5 py-4">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total pendiente</p>
                <p className="text-2xl font-oswald text-orange-600">{fmt(total)}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">N° de facturas</p>
                <p className="text-2xl font-oswald text-gray-700">{rows.length}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Clientes afectados</p>
                <p className="text-2xl font-oswald text-gray-700">
                  {new Set(rows.map(r => r.cliente_ruc)).size}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-gray-500 bg-gray-50">
                    <th className="px-4 py-3 text-left">Comprobante</th>
                    <th className="px-4 py-3 text-left">Emisión</th>
                    <th className="px-4 py-3 text-left">Cliente</th>
                    <th className="px-4 py-3 text-left">Vendedor</th>
                    <th className="px-4 py-3 text-right">Importe</th>
                    <th className="px-4 py-3 text-right">Saldo</th>
                    <th className="px-4 py-3 text-right">Días</th>
                    <th className="px-4 py-3 text-center">Estado</th>
                    <th className="px-4 py-3 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map(r => {
                    const critico = r.dias_retraso > 7;
                    return (
                      <tr key={r.id} className={critico ? 'bg-orange-50/40' : 'hover:bg-gray-50'}>
                        <td className="px-4 py-3 font-mono text-xs">{r.comprobante}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{fmtFecha(r.fecha_emision)}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-sm text-gray-900">{r.razon_social}</p>
                          <p className="text-xs text-gray-400">{r.cliente_ruc}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {r.vendedor_codigo ? `${r.vendedor_codigo} — ` : ''}{r.vendedor_nombre ?? '—'}
                          {r.zona_nombre && <span className="block text-gray-400">{r.zona_nombre}</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-xs">{fmt(Number(r.importe_total))}</td>
                        <td className="px-4 py-3 text-right text-xs font-semibold text-orange-700">
                          {fmt(Number(r.saldo_pendiente))}
                        </td>
                        <td className={`px-4 py-3 text-right text-xs font-semibold ${critico ? 'text-red-600' : 'text-gray-600'}`}>
                          {r.dias_retraso > 0 ? `${r.dias_retraso}d` : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200">
                            Cdo. pendiente
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            disabled={toggling === r.id}
                            onClick={() => marcarPagado(r)}
                            className="px-3 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                            style={{ background: '#4BB16815', color: '#4BB168', border: '1.5px solid #4BB168' }}
                            onMouseEnter={e => { if (toggling !== r.id) (e.currentTarget as HTMLButtonElement).style.background = '#4BB16830'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#4BB16815'; }}
                          >
                            {toggling === r.id ? '...' : '✓ Marcar pagado'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-200 text-xs font-semibold">
                  <tr>
                    <td colSpan={5} className="px-4 py-3 font-oswald text-sm text-gray-700">TOTAL</td>
                    <td className="px-4 py-3 text-right text-orange-700">{fmt(total)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
