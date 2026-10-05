'use client';

import { useEffect, useState } from 'react';

interface Fila {
  vendedor_id: string;
  nombre: string;
  codigo: string | null;
  piloto_whatsapp: boolean;
  accesos: number;
  wa_descuento: number;
  wa_vencimiento: number;
  wa_total: number;
}

export default function WhatsappRankingPage() {
  const [filas, setFilas]       = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    fetch('/api/whatsapp-ranking', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setFilas(d.filas ?? []))
      .catch(console.error)
      .finally(() => setCargando(false));
  }, []);

  const totalDescuento   = filas.reduce((s, f) => s + f.wa_descuento, 0);
  const totalVencimiento = filas.reduce((s, f) => s + f.wa_vencimiento, 0);
  const sinUsarNingunBoton = filas.filter(f => f.wa_total === 0 && f.accesos > 0).length;

  return (
    <div>
      <header className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-oswald tracking-wide">LOGISALUD</h1>
            <p className="text-white/70 text-sm">Uso de los botones de WhatsApp</p>
          </div>
          <a href="/cobranzas" className="text-white/80 hover:text-white text-sm">&larr; Menú</a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto mt-6 px-4 pb-16">
        <p className="text-gray-500 text-sm mb-4">
          Cuántos recordatorios de <strong>pronto pago</strong> (descuento) y de <strong>vencimiento</strong> envió cada
          vendedor desde su link de cobranza. Los que entran seguido pero nunca mandan ninguno aparecen marcados abajo.
        </p>

        {!cargando && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
            <div className="bg-white rounded-xl border border-gray-200 p-3.5">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider">Vendedores</p>
              <p className="font-oswald text-xl mt-0.5 text-gray-700">{filas.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3.5">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider">Rec. pronto pago</p>
              <p className="font-oswald text-xl mt-0.5" style={{ color: '#4BB168' }}>{totalDescuento}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3.5">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider">Rec. vencimiento</p>
              <p className="font-oswald text-xl mt-0.5 text-gray-600">{totalVencimiento}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3.5">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider">Entran pero no usan</p>
              <p className={`font-oswald text-xl mt-0.5 ${sinUsarNingunBoton > 0 ? 'text-red-600' : 'text-gray-300'}`}>{sinUsarNingunBoton}</p>
            </div>
          </div>
        )}

        {cargando ? (
          <div className="text-center py-16 text-gray-400 text-sm">Cargando…</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm min-w-[620px]">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Vendedor</th>
                  <th className="px-4 py-3 text-right">Accesos</th>
                  <th className="px-4 py-3 text-right">Pronto pago</th>
                  <th className="px-4 py-3 text-right">Vencimiento</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filas.map(f => {
                  const sinUso = f.wa_total === 0 && f.accesos > 0;
                  return (
                    <tr key={f.vendedor_id} className={sinUso ? 'bg-red-50/40' : 'hover:bg-gray-50'}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-800">{f.nombre}</p>
                        <p className="text-xs text-gray-400">
                          {f.codigo ?? '—'}
                          {!f.piloto_whatsapp && <span className="ml-2 px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">sin piloto WhatsApp</span>}
                          {sinUso && <span className="ml-2 px-1.5 py-0.5 bg-red-100 text-red-600 rounded">entra pero no usa</span>}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600">{f.accesos}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium" style={{ color: f.wa_descuento > 0 ? '#4BB168' : '#9ca3af' }}>{f.wa_descuento}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium" style={{ color: f.wa_vencimiento > 0 ? '#c07d1e' : '#9ca3af' }}>{f.wa_vencimiento}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-800">{f.wa_total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
