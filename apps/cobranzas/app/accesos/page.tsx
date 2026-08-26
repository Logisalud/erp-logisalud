'use client';

import { useEffect, useState } from 'react';

interface Fila {
  vendedor_id: string;
  nombre: string;
  codigo: string | null;
  activo: boolean;
  total: number;
  ultimos7: number;
  ultimo_acceso: string | null;
}

function fmtFechaHora(s: string | null): string {
  if (!s) return 'Nunca';
  const d = new Date(s);
  return d.toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima',
  });
}

function diasDesde(s: string | null): number | null {
  if (!s) return null;
  return Math.floor((Date.now() - new Date(s).getTime()) / 86400000);
}

// Estado de actividad por color: verde ≤7d, ámbar hace tiempo, rojo nunca.
function Estado({ ultimo }: { ultimo: string | null }) {
  const dias = diasDesde(ultimo);
  if (dias === null)
    return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Nunca entró</span>;
  if (dias <= 7)
    return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Activo</span>;
  if (dias <= 30)
    return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Hace {dias} días</span>;
  return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-600">Hace {dias} días</span>;
}

export default function AccesosPage() {
  const [filas, setFilas]   = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    fetch('/api/accesos-vendedor', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setFilas(d.filas ?? []))
      .catch(console.error)
      .finally(() => setCargando(false));
  }, []);

  const nunca = filas.filter(f => !f.ultimo_acceso).length;
  const activos = filas.filter(f => f.ultimo_acceso && diasDesde(f.ultimo_acceso)! <= 7).length;

  return (
    <div>
      <header className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-oswald tracking-wide">LOGISALUD</h1>
            <p className="text-white/70 text-sm">Accesos de vendedores a su cobranza</p>
          </div>
          <a href="/" className="text-white/80 hover:text-white text-sm">&larr; Menú</a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto mt-6 px-4 pb-16">
        <p className="text-gray-500 text-sm mb-4">
          Uso de la vista de cobranza (link privado). Los que <strong>nunca entraron</strong> o hace mucho aparecen arriba.
        </p>

        {!cargando && (
          <div className="grid grid-cols-3 gap-2.5 mb-4">
            <div className="bg-white rounded-xl border border-gray-200 p-3.5">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider">Vendedores</p>
              <p className="font-oswald text-xl mt-0.5 text-gray-700">{filas.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3.5">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider">Activos (≤7d)</p>
              <p className="font-oswald text-xl mt-0.5" style={{ color: '#4BB168' }}>{activos}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3.5">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider">Nunca entraron</p>
              <p className={`font-oswald text-xl mt-0.5 ${nunca > 0 ? 'text-red-600' : 'text-gray-300'}`}>{nunca}</p>
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
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-left">Último acceso</th>
                  <th className="px-4 py-3 text-right">Últimos 7 días</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filas.map(f => {
                  const nuncaEntro = !f.ultimo_acceso;
                  return (
                    <tr key={f.vendedor_id} className={nuncaEntro ? 'bg-red-50/40' : 'hover:bg-gray-50'}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-800">{f.nombre}</p>
                        <p className="text-xs text-gray-400">
                          {f.codigo ?? '—'}{!f.activo && <span className="ml-2 px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">inactivo</span>}
                        </p>
                      </td>
                      <td className="px-4 py-3"><Estado ultimo={f.ultimo_acceso} /></td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtFechaHora(f.ultimo_acceso)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium" style={{ color: f.ultimos7 > 0 ? '#4BB168' : '#9ca3af' }}>{f.ultimos7}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">{f.total}</td>
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
