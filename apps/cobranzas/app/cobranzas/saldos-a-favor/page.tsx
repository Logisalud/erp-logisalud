'use client';

import { Fragment, useEffect, useState } from 'react';

interface FacturaAFavor {
  id: string; comprobante: string; fecha_emision: string;
  importe_total: number; total_nc: number; total_pagado: number; a_favor: number;
}
interface FacturaDeuda {
  id: string; comprobante: string; fecha_emision: string;
  fecha_vencimiento: string | null; saldo: number; dias_retraso: number;
}
interface ClienteAFavor {
  cliente_ruc: string; razon_social: string;
  vendedor_nombre: string | null; vendedor_codigo: string | null;
  a_favor: number; deuda: number; neto: number;
  facturas: FacturaAFavor[]; facturasDeuda: FacturaDeuda[];
}

const fmt = (n: number) => 'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtFecha = (s: string) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };

// Por defecto se ocultan los menores a S/ 10: son redondeos del vuelto o de
// la retención (32 de 80 al 2026-11-11, S/ 68,80 entre todos) y tapan los
// pocos casos que de verdad hay que resolver.
const MINIMO_POR_DEFECTO = 10;

export default function SaldosAFavorPage() {
  const [clientes, setClientes] = useState<ClienteAFavor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocultarChicos, setOcultarChicos] = useState(true);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [soloLeDebemos, setSoloLeDebemos] = useState(false);

  useEffect(() => {
    fetch('/api/saldos-a-favor', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => d.error ? setError(d.error) : setClientes(d.clientes))
      .catch(e => setError(String(e)));
  }, []);

  const visibles = (clientes ?? [])
    .filter(c => !ocultarChicos || c.a_favor >= MINIMO_POR_DEFECTO)
    .filter(c => !soloLeDebemos || c.neto < -0.09);
  const totalAFavor = visibles.reduce((s, c) => s + c.a_favor, 0);
  const leDebemos = visibles.filter(c => c.neto < -0.09);
  const totalLeDebemos = leDebemos.reduce((s, c) => s + (-c.neto), 0);
  const ocultos = (clientes ?? []).length - visibles.length;

  return (
    <div>
      <header className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-oswald tracking-wide">LOGISALUD</h1>
            <p className="text-white/70 text-sm">Saldos a favor del cliente</p>
          </div>
          <a href="/cobranzas" className="text-white/80 hover:text-white text-sm">&larr; Menú</a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto mt-6 px-4 pb-16">
        <p className="text-sm text-gray-500 mb-4 max-w-3xl">
          Lo que se le aplicó de <strong>más</strong> a una factura: notas de crédito emitidas
          después de que el cliente pagó, o pagos por encima del importe. Como se{' '}
          <strong>compensa</strong> contra las compras siguientes, la columna que manda es el{' '}
          <strong>neto</strong>: si es negativo, le debemos esa plata; si es positivo, su propia
          deuda se come el saldo a favor y todavía nos debe la diferencia.
        </p>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{error}</div>}
        {!clientes && !error && <div className="text-center py-16 text-gray-400 text-sm">Cargando…</div>}

        {clientes && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">Total a favor</p>
                <p className="font-oswald text-2xl mt-0.5 text-gray-800">{fmt(totalAFavor)}</p>
                <p className="text-[11px] text-gray-400">{visibles.length} cliente{visibles.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">Le debemos (neto)</p>
                <p className="font-oswald text-2xl mt-0.5" style={{ color: '#c0392b' }}>{fmt(totalLeDebemos)}</p>
                <p className="text-[11px] text-gray-400">{leDebemos.length} cliente{leDebemos.length !== 1 ? 's' : ''} sin deuda que lo absorba</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col justify-between">
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked={ocultarChicos} onChange={e => setOcultarChicos(e.target.checked)} />
                  Ocultar menores a {fmt(MINIMO_POR_DEFECTO)}
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked={soloLeDebemos} onChange={e => setSoloLeDebemos(e.target.checked)} />
                  Solo a los que le debemos
                </label>
                <p className="text-[11px] text-gray-400">{ocultos > 0 ? `${ocultos} oculto${ocultos !== 1 ? 's' : ''} (redondeos)` : 'Nada oculto'}</p>
                <a href="/api/exportar/saldos-a-favor"
                  className="mt-2 inline-block text-center px-3 py-2 text-xs font-medium rounded-lg text-white" style={{ background: '#4BB168' }}>
                  ⬇ Exportar a Excel
                </a>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[760px]">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Cliente</th>
                      <th className="px-4 py-2.5 text-left">Vendedor</th>
                      <th className="px-4 py-2.5 text-right">A favor</th>
                      <th className="px-4 py-2.5 text-right">Deuda vigente</th>
                      <th className="px-4 py-2.5 text-right">
                        Neto
                        <span className="block font-normal normal-case text-[10px] text-gray-400 tracking-normal">
                          deuda − a favor
                        </span>
                      </th>
                      <th className="px-4 py-2.5 text-left">Situación</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {visibles.map(c => {
                      const abierta = abierto === c.cliente_ruc;
                      const debemos = c.neto < -0.09;
                      return (
                        <Fragment key={c.cliente_ruc}>
                          <tr className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => setAbierto(abierta ? null : c.cliente_ruc)}>
                            <td className="px-4 py-2.5">
                              <p className="font-semibold text-gray-800">{c.razon_social}</p>
                              <p className="text-xs text-gray-400">{c.cliente_ruc}</p>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-500">{c.vendedor_nombre ?? 'Sin vendedor'}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-800 whitespace-nowrap">{fmt(c.a_favor)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-500 whitespace-nowrap">{fmt(c.deuda)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold whitespace-nowrap"
                              style={{ color: debemos ? '#c0392b' : '#4BB168' }}>
                              {debemos ? `−${fmt(-c.neto)}` : fmt(c.neto)}
                            </td>
                            {/* Sin esta columna la tabla se lee al revés: un neto
                                POSITIVO en una pantalla titulada "a quién le
                                debemos" parece plata nuestra a pagar, y es lo
                                contrario — el cliente tiene saldo a favor, pero su
                                propia deuda se lo come y todavía nos debe. */}
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                debemos ? 'bg-red-100 text-red-700'
                                : c.neto > 0.09 ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-500'
                              }`}>
                                {debemos ? 'Le debemos' : c.neto > 0.09 ? 'Nos debe' : 'Compensado'}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-gray-300 text-xs">{abierta ? '▲' : '▼'}</td>
                          </tr>
                          {abierta && (
                            <tr>
                              <td colSpan={7} className="bg-gray-50 border-t border-gray-100 px-4 py-3">
                                <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-2">
                                  Saldo a favor — de dónde sale
                                </p>
                                <table className="w-full text-xs">
                                  <thead className="text-gray-400">
                                    <tr>
                                      <th className="py-1 text-left font-medium">Comprobante</th>
                                      <th className="py-1 text-left font-medium">Emisión</th>
                                      <th className="py-1 text-right font-medium">Importe</th>
                                      <th className="py-1 text-right font-medium">Notas de crédito</th>
                                      <th className="py-1 text-right font-medium">Pagado</th>
                                      <th className="py-1 text-right font-medium">A favor</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {c.facturas.map(f => (
                                      <tr key={f.id} className="border-t border-gray-200">
                                        <td className="py-1.5 font-medium text-gray-700">{f.comprobante}</td>
                                        <td className="py-1.5 text-gray-500">{fmtFecha(f.fecha_emision)}</td>
                                        <td className="py-1.5 text-right tabular-nums text-gray-600">{fmt(f.importe_total)}</td>
                                        <td className="py-1.5 text-right tabular-nums text-gray-600">{f.total_nc ? fmt(f.total_nc) : '—'}</td>
                                        <td className="py-1.5 text-right tabular-nums text-gray-600">{fmt(f.total_pagado)}</td>
                                        {/* En negativo: es plata del cliente, no nuestra.
                                            Con el signo, la columna se suma de corrido contra
                                            la deuda de abajo y da el neto. */}
                                        <td className="py-1.5 text-right tabular-nums font-semibold" style={{ color: '#c0392b' }}>
                                          −{fmt(f.a_favor)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                {c.facturasDeuda.length > 0 && (
                                  <>
                                    <p className="text-[11px] text-gray-400 uppercase tracking-wider mt-4 mb-2">
                                      Deuda vigente — qué se lo come
                                    </p>
                                    <table className="w-full text-xs">
                                      <thead className="text-gray-400">
                                        <tr>
                                          <th className="py-1 text-left font-medium">Comprobante</th>
                                          <th className="py-1 text-left font-medium">Emisión</th>
                                          <th className="py-1 text-left font-medium">Vence</th>
                                          <th className="py-1 text-right font-medium">Atraso</th>
                                          <th className="py-1 text-right font-medium">Saldo</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {c.facturasDeuda.map(f => (
                                          <tr key={f.id} className="border-t border-gray-200">
                                            <td className="py-1.5 font-medium text-gray-700">{f.comprobante}</td>
                                            <td className="py-1.5 text-gray-500">{fmtFecha(f.fecha_emision)}</td>
                                            <td className="py-1.5 text-gray-500">{f.fecha_vencimiento ? fmtFecha(f.fecha_vencimiento) : '—'}</td>
                                            <td className="py-1.5 text-right tabular-nums" style={f.dias_retraso > 0 ? { color: '#c0392b' } : undefined}>
                                              {f.dias_retraso > 0 ? `${f.dias_retraso} d` : '—'}
                                            </td>
                                            <td className="py-1.5 text-right tabular-nums font-semibold text-gray-800">{fmt(f.saldo)}</td>
                                          </tr>
                                        ))}
                                        <tr className="border-t-2 border-gray-300">
                                          <td className="py-1.5 font-semibold text-gray-700" colSpan={4}>
                                            Neto {c.neto < -0.09 ? '— le debemos' : c.neto > 0.09 ? '— nos debe' : '— compensado'}
                                          </td>
                                          <td className="py-1.5 text-right tabular-nums font-semibold"
                                            style={{ color: c.neto < -0.09 ? '#c0392b' : '#276b3b' }}>
                                            {c.neto < -0.09 ? `−${fmt(-c.neto)}` : fmt(c.neto)}
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </>
                                )}

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
                      <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400 text-sm">
                        No hay saldos a favor{ocultarChicos && ocultos > 0 ? ` por encima de ${fmt(MINIMO_POR_DEFECTO)}` : ''}.
                      </td></tr>
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
