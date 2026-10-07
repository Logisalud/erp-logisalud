'use client';

import { useCallback, useEffect, useState } from 'react';

interface Fila {
  letra_id: string;
  numero_letra: string;
  cliente_ruc: string;
  razon_social: string;
  comprobantes: string;
  fecha_vencimiento: string;
  importe: number;
  estado: 'en_cartera' | 'en_banco' | 'pagada' | 'protestada';
  banco: string | null;
}

interface ClienteBuscado {
  cliente_ruc: string;
  razon_social: string;
}

const ESTADOS: { value: string; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'en_cartera', label: 'En cartera' },
  { value: 'en_banco', label: 'En banco' },
  { value: 'pagada', label: 'Pagada' },
  { value: 'protestada', label: 'Protestada' },
];

const ESTADO_BADGE: Record<string, string> = {
  en_cartera: 'bg-gray-100 text-gray-600',
  en_banco: 'bg-blue-100 text-blue-700',
  pagada: 'bg-green-100 text-green-700',
  protestada: 'bg-red-100 text-red-700',
};

const fmt = (n: number) =>
  'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtFecha = (s: string) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };

export default function ReporteLetrasPage() {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);

  const [estado, setEstado] = useState('todos');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [sugerencias, setSugerencias] = useState<ClienteBuscado[]>([]);
  const [clienteSel, setClienteSel] = useState<ClienteBuscado | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const p = new URLSearchParams();
    if (estado !== 'todos') p.set('estado', estado);
    if (clienteSel) p.set('cliente_ruc', clienteSel.cliente_ruc);
    if (desde) p.set('desde', desde);
    if (hasta) p.set('hasta', hasta);
    const res = await fetch(`/api/letras/reporte?${p.toString()}`, { cache: 'no-store' });
    const d = await res.json();
    setFilas(d.filas ?? []);
    setCargando(false);
  }, [estado, clienteSel, desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (busquedaCliente.length < 2) { setSugerencias([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/clientes/buscar?q=${encodeURIComponent(busquedaCliente)}`, { cache: 'no-store' });
      const d = await res.json();
      setSugerencias(d.clientes ?? []);
    }, 280);
    return () => clearTimeout(t);
  }, [busquedaCliente]);

  const seleccionarCliente = (c: ClienteBuscado) => {
    setClienteSel(c); setBusquedaCliente(c.razon_social); setSugerencias([]);
  };
  const limpiarCliente = () => { setClienteSel(null); setBusquedaCliente(''); setSugerencias([]); };

  const exportUrl = (() => {
    const p = new URLSearchParams();
    if (estado !== 'todos') p.set('estado', estado);
    if (clienteSel) p.set('cliente_ruc', clienteSel.cliente_ruc);
    if (desde) p.set('desde', desde);
    if (hasta) p.set('hasta', hasta);
    return `/api/exportar/letras-reporte?${p.toString()}`;
  })();

  const totalMonto = filas.reduce((s, f) => s + f.importe, 0);

  return (
    <div>
      <header className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-oswald tracking-wide">LOGISALUD</h1>
            <p className="text-white/70 text-sm">Reporte de letras</p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={exportUrl}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/20 text-white hover:bg-white/30 transition"
            >
              📥 Descargar Excel
            </a>
            <a href="/cobranzas" className="text-white/80 hover:text-white text-sm">&larr; Menú</a>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto mt-6 px-4 pb-16">
        <p className="text-gray-500 text-sm mb-4">
          Agenda de seguimiento de letras con el banco — todas las letras, ordenadas por fecha de vencimiento.
        </p>

        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Estado</label>
            <select
              value={estado} onChange={e => setEstado(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
            >
              {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </div>
          <div className="relative">
            <label className="block text-xs text-gray-500 mb-1">Cliente</label>
            <input
              type="text" value={busquedaCliente}
              onChange={e => { setBusquedaCliente(e.target.value); if (clienteSel) setClienteSel(null); }}
              placeholder="RUC o razón social…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
            />
            {clienteSel && (
              <button onClick={limpiarCliente} className="absolute right-2 top-7 text-gray-400 hover:text-red-600 text-xs">✕</button>
            )}
            {sugerencias.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white rounded-lg border border-gray-200 shadow-lg max-h-56 overflow-y-auto">
                {sugerencias.map(c => (
                  <button
                    key={c.cliente_ruc}
                    onClick={() => seleccionarCliente(c)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0 text-sm"
                  >
                    <p className="text-gray-700 truncate">{c.razon_social}</p>
                    <p className="text-xs text-gray-400">{c.cliente_ruc}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Vence desde</label>
            <input
              type="date" value={desde} onChange={e => setDesde(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Vence hasta</label>
            <input
              type="date" value={hasta} onChange={e => setHasta(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
            />
          </div>
        </div>

        {!cargando && (
          <div className="grid grid-cols-2 gap-2.5 mb-4">
            <div className="bg-white rounded-xl border border-gray-200 p-3.5">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider">Letras</p>
              <p className="font-oswald text-xl mt-0.5 text-gray-700">{filas.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3.5">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider">Monto total</p>
              <p className="font-oswald text-xl mt-0.5" style={{ color: '#4BB168' }}>{fmt(totalMonto)}</p>
            </div>
          </div>
        )}

        {cargando ? (
          <div className="text-center py-16 text-gray-400 text-sm">Cargando…</div>
        ) : filas.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
            No hay letras con estos filtros.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm min-w-[860px]">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2.5 text-left">N° Letra</th>
                  <th className="px-3 py-2.5 text-left">Cliente</th>
                  <th className="px-3 py-2.5 text-left">Comprobante(s)</th>
                  <th className="px-3 py-2.5 text-left">Vencimiento</th>
                  <th className="px-3 py-2.5 text-right">Monto</th>
                  <th className="px-3 py-2.5 text-left">Estado</th>
                  <th className="px-3 py-2.5 text-left">Banco</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filas.map(f => (
                  <tr key={f.letra_id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">{f.numero_letra}</td>
                    <td className="px-3 py-2">
                      <p className="text-gray-800 truncate max-w-[220px]">{f.razon_social}</p>
                      <p className="text-xs text-gray-400">{f.cliente_ruc}</p>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">{f.comprobantes}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtFecha(f.fecha_vencimiento)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-800">{fmt(f.importe)}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_BADGE[f.estado]}`}>
                        {ESTADOS.find(e => e.value === f.estado)?.label ?? f.estado}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500">{f.banco ?? '—'}</td>
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
