'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface Fila {
  id?: string;
  fecha: string | null;
  descripcion: string;
  monto: number;
  operacion_numero: string | null;
  clasificacion: 'cobro' | 'no_cobranza';
  nombre_banco_detectado: string | null;
  estado?: 'nuevo' | 'duplicado';
}
interface Resumen { cobros_n: number; cobros_suma: number; no_cobranza_n: number; no_cobranza_suma: number; }

const fmt = (n: number) => 'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtFecha = (s: string | null) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };

export default function ConciliacionPage() {
  const [filas, setFilas]       = useState<Fila[]>([]);
  const [resumen, setResumen]   = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [msg, setMsg]           = useState<{ texto: string; ok: boolean } | null>(null);
  const [filtro, setFiltro]     = useState<'todos' | 'cobro' | 'no_cobranza'>('todos');
  const inputRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch('/api/conciliacion/movimientos', { cache: 'no-store' });
      const d = await res.json();
      setFilas(d.filas ?? []);
      setResumen(d.resumen ?? null);
    } finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function subir(file: File) {
    setSubiendo(true); setMsg(null);
    const form = new FormData();
    form.append('archivo', file);
    try {
      const res = await fetch('/api/conciliacion/importar', { method: 'POST', body: form });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Error');
      setMsg({ texto: `✓ ${d.insertados} movimientos importados · ${d.omitidos_duplicados} duplicados omitidos (de ${d.total_archivo} en el archivo).`, ok: true });
      await cargar();
    } catch (e) {
      setMsg({ texto: String(e), ok: false });
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) subir(f); };
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) subir(f); };

  const visibles = filas.filter(f => filtro === 'todos' || f.clasificacion === filtro);

  return (
    <div>
      <header className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-oswald tracking-wide">LOGISALUD</h1>
            <p className="text-white/70 text-sm">Conciliación bancaria — importar extracto</p>
          </div>
          <a href="/" className="text-white/80 hover:text-white text-sm">&larr; Menú</a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto mt-6 px-4 pb-16">
        <p className="text-gray-500 text-sm mb-4">
          Sube el Excel del extracto (BCP). Los movimientos se importan y clasifican en una tabla aparte —
          <strong> no toca facturas, pagos ni saldos</strong>. Montos positivos = cobro a revisar; negativos = no es cobranza.
        </p>

        {/* Zona de carga */}
        <label
          onDragOver={e => e.preventDefault()} onDrop={onDrop}
          className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-logisalud-teal hover:bg-teal-50/30 transition mb-4"
        >
          <span className="text-3xl mb-1">🏦</span>
          <span className="text-gray-600 font-medium">{subiendo ? 'Procesando…' : 'Haz clic o arrastra el extracto .xlsx'}</span>
          <span className="text-gray-400 text-xs mt-1">Se evita duplicar movimientos ya importados</span>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onFile} disabled={subiendo} />
        </label>

        {msg && (
          <div className={`p-3 rounded-lg text-sm mb-4 ${msg.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {msg.texto}
          </div>
        )}

        {/* Resumen */}
        {resumen && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-white rounded-xl border border-gray-200 p-3.5">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider">Movimientos</p>
              <p className="font-oswald text-xl mt-0.5 text-gray-800">{filas.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3.5">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider">Cobros a revisar</p>
              <p className="font-oswald text-xl mt-0.5" style={{ color: '#4BB168' }}>{resumen.cobros_n}</p>
              <p className="text-[11px] text-gray-400">{fmt(resumen.cobros_suma)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3.5">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider">No es cobranza</p>
              <p className="font-oswald text-xl mt-0.5 text-gray-500">{resumen.no_cobranza_n}</p>
              <p className="text-[11px] text-gray-400">{fmt(resumen.no_cobranza_suma)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3.5">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider">Con nombre detectado</p>
              <p className="font-oswald text-xl mt-0.5" style={{ color: '#4ABCC2' }}>{filas.filter(f => f.nombre_banco_detectado).length}</p>
            </div>
          </div>
        )}

        {/* Filtro */}
        <div className="flex gap-1.5 mb-3">
          {([['todos', 'Todos'], ['cobro', 'Cobros'], ['no_cobranza', 'No cobranza']] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setFiltro(k)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition ${filtro === k ? 'text-white border-transparent' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
              style={filtro === k ? { background: '#4ABCC2' } : undefined}>
              {lbl}
            </button>
          ))}
        </div>

        {/* Tabla */}
        {cargando ? (
          <div className="text-center py-16 text-gray-400 text-sm">Cargando…</div>
        ) : visibles.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">Aún no hay movimientos importados.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2.5 text-left">Fecha</th>
                  <th className="px-3 py-2.5 text-left">Descripción</th>
                  <th className="px-3 py-2.5 text-right">Monto</th>
                  <th className="px-3 py-2.5 text-left">N° Operación</th>
                  <th className="px-3 py-2.5 text-left">Clasificación</th>
                  <th className="px-3 py-2.5 text-left">Nombre detectado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibles.map((f, i) => (
                  <tr key={f.id ?? i} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtFecha(f.fecha)}</td>
                    <td className="px-3 py-2 text-gray-700 max-w-[280px] truncate" title={f.descripcion}>{f.descripcion}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold whitespace-nowrap ${f.monto < 0 ? 'text-gray-400' : 'text-gray-800'}`}>{fmt(f.monto)}</td>
                    <td className="px-3 py-2 text-gray-500 font-mono text-xs whitespace-nowrap">{f.operacion_numero ?? '—'}</td>
                    <td className="px-3 py-2">
                      {f.clasificacion === 'cobro'
                        ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#e9f7ee', color: '#166534' }}>Cobro a revisar</span>
                        : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">No es cobranza</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{f.nombre_banco_detectado ?? <span className="text-gray-300">—</span>}</td>
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
