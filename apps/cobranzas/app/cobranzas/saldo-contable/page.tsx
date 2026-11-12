'use client';

import { Fragment, useEffect, useState } from 'react';

interface FacturaContable {
  id: string; comprobante: string; fecha_emision: string; fecha_vencimiento: string | null;
  importe: number; total_nc: number; total_nd: number; total_pagado: number; letras_pagadas: number;
  saldo_contable: number; saldo_cartera: number; diferencia: number; motivo: string | null;
}
interface ClienteContable {
  cliente_ruc: string; razon_social: string; vendedor_nombre: string | null;
  saldo_contable: number; saldo_cartera: number; diferencia: number;
  facturas: FacturaContable[];
}

const fmt = (n: number) => 'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n));
const conSigno = (n: number) => (n < -0.005 ? `−${fmt(n)}` : fmt(n));
const fmtFecha = (s: string | null) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };

type Filtro = 'todos' | 'negativos' | 'con-diferencia';

export default function SaldoContablePage() {
  const [clientes, setClientes] = useState<ClienteContable[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/saldo-contable', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => d.error ? setError(d.error) : setClientes(d.clientes))
      .catch(e => setError(String(e)));
  }, []);

  const texto = q.trim().toLowerCase();
  const visibles = (clientes ?? [])
    .filter(c => filtro !== 'negativos' || c.saldo_contable < -0.005)
    .filter(c => filtro !== 'con-diferencia' || Math.abs(c.diferencia) > 0.005)
    .filter(c => !texto || c.razon_social.toLowerCase().includes(texto) || c.cliente_ruc.includes(texto));

  const totalContable = visibles.reduce((s, c) => s + c.saldo_contable, 0);
  const totalCartera = visibles.reduce((s, c) => s + c.saldo_cartera, 0);
  const negativos = visibles.filter(c => c.saldo_contable < -0.005);
  const totalNegativo = negativos.reduce((s, c) => s + c.saldo_contable, 0);

  return (
    <div>
      <header className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-oswald tracking-wide">LOGISALUD</h1>
            <p className="text-white/70 text-sm">Saldo contable por cliente</p>
          </div>
          <a href="/cobranzas" className="text-white/80 hover:text-white text-sm">&larr; Menú</a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto mt-6 px-4 pb-16">
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <p className="text-sm text-gray-600">
            El saldo <strong>tal como lo dicen los documentos</strong>, con signo y sin ninguna
            regla de cobranza: <em>importe + notas de débito − notas de crédito − pagos − letras
            pagadas</em>.
          </p>
          <p className="text-xs text-gray-500 mt-2">
            No da nada por cobrado sin un pago registrado, no perdona el redondeo, una factura dada
            de baja por incobrable sigue figurando, y una factura a la que se le aplicó de más queda
            en <strong>negativo</strong> en vez de en cero. Por eso no coincide con la cartera — y
            cada diferencia viene con su motivo.
          </p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{error}</div>}
        {!clientes && !error && <div className="text-center py-16 text-gray-400 text-sm">Cargando…</div>}

        {clientes && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">Saldo contable</p>
                <p className="font-oswald text-2xl mt-0.5 text-gray-800">{conSigno(totalContable)}</p>
                <p className="text-[11px] text-gray-400">{visibles.length} cliente{visibles.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">Cartera (a cobrar)</p>
                <p className="font-oswald text-2xl mt-0.5" style={{ color: '#4ABCC2' }}>{fmt(totalCartera)}</p>
                <p className="text-[11px] text-gray-400">diferencia {conSigno(totalContable - totalCartera)}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">En negativo</p>
                <p className="font-oswald text-2xl mt-0.5" style={{ color: '#c0392b' }}>{conSigno(totalNegativo)}</p>
                <p className="text-[11px] text-gray-400">{negativos.length} cliente{negativos.length !== 1 ? 's' : ''} a su favor</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap items-center gap-3">
              <input
                type="text" value={q} onChange={e => setQ(e.target.value)}
                placeholder="Buscar cliente o RUC…"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
              />
              <div className="flex gap-1.5">
                {([['todos', 'Todos'], ['negativos', 'Solo negativos'], ['con-diferencia', 'Solo con diferencia']] as [Filtro, string][]).map(([k, t]) => (
                  <button key={k} onClick={() => setFiltro(k)}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition ${filtro === k ? 'text-white border-transparent' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                    style={filtro === k ? { background: '#4ABCC2' } : undefined}>
                    {t}
                  </button>
                ))}
              </div>
              <a href="/api/exportar/saldo-contable"
                className="ml-auto px-3 py-2 text-xs font-medium rounded-lg text-white" style={{ background: '#4BB168' }}>
                ⬇ Exportar a Excel
              </a>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Cliente</th>
                      <th className="px-4 py-2.5 text-left">Vendedor</th>
                      <th className="px-4 py-2.5 text-right">Saldo contable</th>
                      <th className="px-4 py-2.5 text-right">Cartera</th>
                      <th className="px-4 py-2.5 text-right">Diferencia</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {visibles.map(c => {
                      const abierta = abierto === c.cliente_ruc;
                      const negativo = c.saldo_contable < -0.005;
                      return (
                        <Fragment key={c.cliente_ruc}>
                          <tr className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => setAbierto(abierta ? null : c.cliente_ruc)}>
                            <td className="px-4 py-2.5">
                              <p className="font-semibold text-gray-800">{c.razon_social}</p>
                              <p className="text-xs text-gray-400">{c.cliente_ruc}</p>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-500">{c.vendedor_nombre ?? 'Sin vendedor'}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold whitespace-nowrap"
                              style={{ color: negativo ? '#c0392b' : '#374151' }}>
                              {conSigno(c.saldo_contable)}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-500 whitespace-nowrap">{fmt(c.saldo_cartera)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap"
                              style={{ color: Math.abs(c.diferencia) > 0.005 ? '#b45309' : '#9ca3af' }}>
                              {Math.abs(c.diferencia) > 0.005 ? conSigno(c.diferencia) : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-gray-300 text-xs">{abierta ? '▲' : '▼'}</td>
                          </tr>
                          {abierta && (
                            <tr>
                              <td colSpan={6} className="bg-gray-50 border-t border-gray-100 px-4 py-3">
                                <div className="overflow-x-auto">
                                <table className="w-full text-xs min-w-[860px]">
                                  <thead className="text-gray-400">
                                    <tr>
                                      <th className="py-1 text-left font-medium">Comprobante</th>
                                      <th className="py-1 text-left font-medium">Emisión</th>
                                      <th className="py-1 text-right font-medium">Importe</th>
                                      <th className="py-1 text-right font-medium">NC</th>
                                      <th className="py-1 text-right font-medium">ND</th>
                                      <th className="py-1 text-right font-medium">Pagos</th>
                                      <th className="py-1 text-right font-medium">Letras pag.</th>
                                      <th className="py-1 text-right font-medium">Contable</th>
                                      <th className="py-1 text-right font-medium">Cartera</th>
                                      <th className="py-1 text-left font-medium">Motivo de la diferencia</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {c.facturas.map(f => (
                                      <tr key={f.id} className="border-t border-gray-200">
                                        <td className="py-1.5 font-medium text-gray-700">{f.comprobante}</td>
                                        <td className="py-1.5 text-gray-500">{fmtFecha(f.fecha_emision)}</td>
                                        <td className="py-1.5 text-right tabular-nums text-gray-600">{fmt(f.importe)}</td>
                                        <td className="py-1.5 text-right tabular-nums text-gray-600">{f.total_nc ? fmt(f.total_nc) : '—'}</td>
                                        <td className="py-1.5 text-right tabular-nums text-gray-600">{f.total_nd ? fmt(f.total_nd) : '—'}</td>
                                        <td className="py-1.5 text-right tabular-nums text-gray-600">{f.total_pagado ? fmt(f.total_pagado) : '—'}</td>
                                        <td className="py-1.5 text-right tabular-nums text-gray-600">{f.letras_pagadas ? fmt(f.letras_pagadas) : '—'}</td>
                                        <td className="py-1.5 text-right tabular-nums font-semibold"
                                          style={{ color: f.saldo_contable < -0.005 ? '#c0392b' : '#374151' }}>
                                          {conSigno(f.saldo_contable)}
                                        </td>
                                        <td className="py-1.5 text-right tabular-nums text-gray-500">{fmt(f.saldo_cartera)}</td>
                                        <td className="py-1.5 text-gray-500">{f.motivo ?? ''}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                </div>
                                <a href={`/cobranzas/clientes/${c.cliente_ruc}/estado-cuenta`}
                                  className="inline-block mt-3 text-xs" style={{ color: '#4ABCC2' }}>
                                  Ver el estado de cuenta completo →
                                </a>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {visibles.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400 text-sm">Sin resultados.</td></tr>
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
