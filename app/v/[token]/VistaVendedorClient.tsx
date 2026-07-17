'use client';

import { Fragment, useState } from 'react';

export interface FacturaVista {
  id: string;
  comprobante: string;
  cliente_ruc: string;
  razon_social: string;
  distrito: string | null;
  fecha_emision: string;
  fecha_venc: string | null;   // vencimiento efectivo (próxima letra si tiene)
  letra_fecha: string | null;  // fecha de la próxima letra pendiente, si aplica
  importe_total: number;
  total_nc: number;
  total_pagado: number;
  saldo_pendiente: number;
  vencido: number;             // suma de buckets 1-30..+90 de esta factura
}

export interface ContadoVista {
  id: string;
  comprobante: string;
  cliente_ruc: string;
  razon_social: string;
  fecha_emision: string;
  importe: number;
}

const fmt = (n: number) =>
  'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtFecha = (s: string | null) => {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};

function diasParaVencer(fecha: string | null, hoyISO: string): number | null {
  if (!fecha) return null;
  const [y, m, d] = fecha.split('-').map(Number);
  const [hy, hm, hd] = hoyISO.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(hy, hm - 1, hd)) / 86400000);
}

function textoPlazo(dias: number | null): { txt: string; cls: string; color?: string } {
  if (dias === null) return { txt: 'sin fecha', cls: 'text-gray-400' };
  if (dias < 0) {
    const v = Math.abs(dias);
    return { txt: `vencido ${v} ${v === 1 ? 'día' : 'días'}`, cls: 'text-red-600 font-semibold' };
  }
  if (dias === 0) return { txt: 'vence hoy', cls: 'text-amber-600 font-semibold' };
  if (dias <= 7)  return { txt: `en ${dias} ${dias === 1 ? 'día' : 'días'}`, cls: 'text-amber-600 font-semibold' };
  return { txt: `en ${dias} días`, cls: 'font-medium', color: '#4BB168' };
}

function Plazo({ dias }: { dias: number | null }) {
  const p = textoPlazo(dias);
  return <span className={`text-xs ${p.cls}`} style={p.color ? { color: p.color } : undefined}>{p.txt}</span>;
}

interface GrupoCliente {
  ruc: string;
  razon_social: string;
  distrito: string | null;
  facturas: FacturaVista[];
  saldo: number;
  vencido: number;
  morosidad: number;
}

function agrupar(facturas: FacturaVista[]): GrupoCliente[] {
  // Las facturas ya vienen ordenadas por fecha de vencimiento (más próxima primero);
  // el Map preserva ese orden, así los grupos quedan ordenados por su factura más urgente.
  const map = new Map<string, GrupoCliente>();
  for (const f of facturas) {
    let g = map.get(f.cliente_ruc);
    if (!g) {
      g = { ruc: f.cliente_ruc, razon_social: f.razon_social, distrito: f.distrito, facturas: [], saldo: 0, vencido: 0, morosidad: 0 };
      map.set(f.cliente_ruc, g);
    }
    g.facturas.push(f);
    g.saldo += f.saldo_pendiente;
    g.vencido += f.vencido;
  }
  for (const g of map.values()) g.morosidad = g.saldo > 0 ? Math.round(g.vencido / g.saldo * 100) : 0;
  return [...map.values()];
}

export default function VistaVendedorClient({
  facturas, hoyISO, total, totalNc, totalPagado, totalImporte, contado, contadoTotal,
}: {
  facturas: FacturaVista[];
  hoyISO: string;
  total: number;
  totalNc: number;
  totalPagado: number;
  totalImporte: number;
  contado: ContadoVista[];
  contadoTotal: number;
}) {
  const [vista, setVista] = useState<'tarjetas' | 'tabla' | 'contado'>('tarjetas');

  const grupos = facturas.length ? agrupar(facturas) : [];
  const totalVencido = facturas.reduce((s, f) => s + f.vencido, 0);

  const carteraAlDia = (
    <div className="max-w-2xl mx-auto bg-white rounded-xl border border-gray-200 p-8 mt-3 text-center">
      <p className="text-3xl mb-2">🎉</p>
      <p className="font-oswald text-lg text-gray-700">¡Cartera al día!</p>
      <p className="text-gray-500 text-sm mt-1">No tienes clientes con deuda pendiente.</p>
    </div>
  );

  const opciones: { key: 'tarjetas' | 'tabla' | 'contado'; label: string }[] = [
    { key: 'tarjetas', label: 'Tarjetas' },
    { key: 'tabla', label: 'Tabla' },
    { key: 'contado', label: `Contado${contado.length ? ` (${contado.length})` : ''}` },
  ];

  return (
    <>
      {/* Toggle: cobranza (Tarjetas/Tabla) + Contado (informativo) */}
      <div className="max-w-2xl mx-auto mt-4 print:hidden">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-sm">
          {opciones.map(o => (
            <button
              key={o.key}
              onClick={() => setVista(o.key)}
              className={`px-4 py-1.5 rounded-md font-medium transition ${
                vista === o.key ? 'text-white' : 'text-gray-500 hover:text-gray-700'
              }`}
              style={vista === o.key ? { background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' } : undefined}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {vista === 'tarjetas' && (facturas.length === 0 ? carteraAlDia : (
        <div className="max-w-2xl mx-auto mt-3 space-y-2">
          {facturas.map(f => {
            const dias = diasParaVencer(f.fecha_venc, hoyISO);
            return (
              <div key={f.id} className="bg-white rounded-xl border border-gray-200 px-3.5 py-2.5 print:border-gray-300 print:break-inside-avoid">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-gray-800 text-sm font-semibold truncate">{f.razon_social}</p>
                  <p className="font-oswald text-base text-gray-800 shrink-0">{fmt(f.saldo_pendiente)}</p>
                </div>
                <p className="text-gray-400 text-[11px] mt-0.5">
                  RUC {f.cliente_ruc}
                  {f.distrito && <span className="text-gray-500"> · {f.distrito}</span>}
                </p>
                <div className="flex items-baseline justify-between gap-3 mt-0.5">
                  <p className="text-gray-400 text-xs font-mono shrink-0">
                    {f.comprobante}
                    {f.letra_fecha && <span className="ml-1.5 font-sans" style={{ color: '#4ABCC2' }}>letra {fmtFecha(f.letra_fecha)}</span>}
                  </p>
                  <p className="text-xs text-right">
                    <span className="text-gray-400">Vence {fmtFecha(f.fecha_venc)}</span>
                    <span className="mx-1 text-gray-300">·</span>
                    <Plazo dias={dias} />
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {vista === 'tabla' && (facturas.length === 0 ? carteraAlDia : (
        <div className="mt-3">
          <style>{'@media print{@page{size:landscape;margin:8mm}}'}</style>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white print:border-gray-300 print:overflow-visible">
            <table className="w-full min-w-[920px] print:min-w-0 text-xs">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-gray-500 bg-gray-50 print:bg-gray-100">
                  <th className="px-3 py-2.5 text-left font-semibold">Comprobante</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Emisión</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Vencimiento</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Plazo</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Importe</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-green-600">N. Crédito</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-blue-500">Pagado</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Saldo</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-red-600">Vencido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {grupos.map(g => (
                  <Fragment key={g.ruc}>
                    <tr className="bg-teal-50/40 print:bg-gray-50 print:break-inside-avoid">
                      <td colSpan={9} className="px-3 py-2">
                        <div className="flex items-baseline justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <span className="font-semibold text-gray-800">{g.razon_social}</span>
                            <span className="text-gray-400 text-[11px] ml-2">
                              RUC {g.ruc}{g.distrito && <> · {g.distrito}</>}
                            </span>
                          </div>
                          <span className={`text-[11px] font-semibold shrink-0 ${g.morosidad >= 30 ? 'text-red-600' : 'text-gray-500'}`}>
                            Morosidad {g.morosidad}% · saldo {fmt(g.saldo)}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {g.facturas.map(f => {
                      const dias = diasParaVencer(f.fecha_venc, hoyISO);
                      const p = textoPlazo(dias);
                      return (
                        <tr key={f.id} className="hover:bg-gray-50 print:break-inside-avoid">
                          <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">
                            {f.comprobante}
                            {f.letra_fecha && <span className="ml-1.5 font-sans" style={{ color: '#4ABCC2' }}>letra</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtFecha(f.fecha_emision)}</td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtFecha(f.fecha_venc)}</td>
                          <td className={`px-3 py-2 whitespace-nowrap ${p.cls}`} style={p.color ? { color: p.color } : undefined}>{p.txt}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600 whitespace-nowrap">{fmt(f.importe_total)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-green-600 whitespace-nowrap">{f.total_nc > 0 ? fmt(f.total_nc) : '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-blue-500 whitespace-nowrap">{f.total_pagado > 0 ? fmt(f.total_pagado) : '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-800 whitespace-nowrap">{fmt(f.saldo_pendiente)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-red-600 whitespace-nowrap">{f.vencido > 0.005 ? fmt(f.vencido) : '—'}</td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 print:bg-gray-100 font-semibold text-gray-800">
                  <td className="px-3 py-2.5" colSpan={4}>TOTAL GENERAL · {facturas.length} {facturas.length === 1 ? 'documento' : 'documentos'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt(totalImporte)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-green-600">{fmt(totalNc)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-blue-500">{fmt(totalPagado)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: '#4BB168' }}>{fmt(total)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-red-600">{fmt(totalVencido)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}

      {vista === 'contado' && (
        <div className="max-w-2xl mx-auto mt-3">
          {/* Encabezado informativo: total de ventas al contado saldadas */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider" style={{ color: '#4ABCC2' }}>Ventas al contado · informativo</p>
              <p className="text-gray-500 text-xs mt-0.5">Facturas CONTADO ya saldadas — no es deuda por cobrar.</p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-oswald text-xl" style={{ color: '#4BB168' }}>{fmt(contadoTotal)}</p>
              <p className="text-[11px] text-gray-400">{contado.length} {contado.length === 1 ? 'factura' : 'facturas'}</p>
            </div>
          </div>

          {contado.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 mt-2 text-center">
              <p className="text-gray-500 text-sm">Sin ventas al contado registradas.</p>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              {contado.map(c => (
                <div key={c.id} className="bg-white rounded-xl border border-gray-200 px-3.5 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-gray-800 text-sm font-semibold truncate">{c.razon_social}</p>
                    <p className="font-oswald text-base text-gray-800 shrink-0">{fmt(c.importe)}</p>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 mt-0.5">
                    <p className="text-gray-400 text-xs font-mono">{c.comprobante} · RUC {c.cliente_ruc}</p>
                    <p className="text-xs text-gray-400">{fmtFecha(c.fecha_emision)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
