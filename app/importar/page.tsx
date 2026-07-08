'use client';

import { useState, useRef } from 'react';

interface ClienteNuevo { ruc: string; razon_social: string; }
interface ErrorFila { fila: number; mensaje: string; }

interface Preview {
  total_filas: number;
  validas: number;
  facturas: number;
  boletas: number;
  notas_credito: number;
  notas_debito: number;
  anuladas: number;
  clientes_nuevos: ClienteNuevo[];
  errores: ErrorFila[];
  filas: unknown[];
}

type Estado = 'idle' | 'cargando' | 'preview' | 'confirmando' | 'done' | 'error';

export default function ImportarPage() {
  const [estado, setEstado] = useState<Estado>('idle');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [resultado, setResultado] = useState<{ insertados: number; actualizados: number; errores: string[] } | null>(null);
  const [mensajeError, setMensajeError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEstado('cargando');
    setPreview(null);
    setMensajeError('');

    const form = new FormData();
    form.append('archivo', file);

    try {
      const res = await fetch('/api/importar/preview', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido');
      setPreview(data);
      setEstado('preview');
    } catch (err) {
      setMensajeError(String(err));
      setEstado('error');
    }
  }

  async function handleConfirmar() {
    if (!preview) return;
    setEstado('confirmando');
    try {
      const res = await fetch('/api/importar/confirmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filas: preview.filas }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido');
      setResultado(data);
      setEstado('done');
    } catch (err) {
      setMensajeError(String(err));
      setEstado('error');
    }
  }

  function reset() {
    setEstado('idle');
    setPreview(null);
    setResultado(null);
    setMensajeError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div>
      <header className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-oswald tracking-wide">LOGISALUD</h1>
            <p className="text-white/70 text-sm">Importar reporte Nubefact</p>
          </div>
          <a href="/" className="text-white/80 hover:text-white text-sm">&larr; Menú</a>
        </div>
      </header>
    <main className="max-w-3xl mx-auto mt-8 px-4 pb-16">
      <h1 className="text-2xl font-bold mb-1">Importar reporte Nubefact</h1>
      <p className="text-gray-500 text-sm mb-8">Sube el Excel exportado desde Nubefact. El sistema mostrará un resumen antes de guardar.</p>

      {/* Zona de carga */}
      {(estado === 'idle' || estado === 'error') && (
        <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition">
          <span className="text-4xl mb-2">📂</span>
          <span className="text-gray-600 font-medium">Haz clic o arrastra tu archivo .xlsx</span>
          <span className="text-gray-400 text-xs mt-1">Solo archivos Excel (.xlsx)</span>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleArchivo}
          />
        </label>
      )}

      {/* Cargando */}
      {estado === 'cargando' && (
        <div className="flex items-center gap-3 p-6 bg-blue-50 rounded-xl">
          <svg className="animate-spin h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <span className="text-blue-700">Procesando archivo…</span>
        </div>
      )}

      {/* Error */}
      {estado === 'error' && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <strong>Error:</strong> {mensajeError}
        </div>
      )}

      {/* Preview */}
      {estado === 'preview' && preview && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <Stat label="Filas válidas" value={preview.validas} of={preview.total_filas} color="blue" />
            <Stat label="Facturas" value={preview.facturas} color="green" />
            <Stat label="Boletas" value={preview.boletas} color="green" />
            <Stat label="Notas de crédito" value={preview.notas_credito} color="yellow" />
            <Stat label="Notas de débito" value={preview.notas_debito} color="orange" />
            <Stat label="Anuladas" value={preview.anuladas} color="gray" />
          </div>

          {preview.clientes_nuevos.length > 0 && (
            <section>
              <h2 className="font-semibold mb-2 text-orange-700">⚠️ Clientes nuevos que se crearán ({preview.clientes_nuevos.length})</h2>
              <ul className="text-sm bg-orange-50 border border-orange-200 rounded-lg divide-y divide-orange-100 max-h-48 overflow-y-auto">
                {preview.clientes_nuevos.map(c => (
                  <li key={c.ruc} className="px-3 py-2">
                    <span className="font-mono text-xs text-gray-500">{c.ruc}</span> — {c.razon_social}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {preview.errores.length > 0 && (
            <section>
              <h2 className="font-semibold mb-2 text-red-700">❌ Filas con errores (no se importarán: {preview.errores.length})</h2>
              <ul className="text-sm bg-red-50 border border-red-200 rounded-lg divide-y divide-red-100 max-h-48 overflow-y-auto">
                {preview.errores.map((e, i) => (
                  <li key={i} className="px-3 py-2">
                    <span className="font-mono text-xs text-gray-500">Fila {e.fila}</span> — {e.mensaje}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleConfirmar}
              className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition"
            >
              ✅ Confirmar e importar {preview.validas} documentos
            </button>
            <button
              onClick={reset}
              className="px-4 py-2.5 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Confirmando */}
      {estado === 'confirmando' && (
        <div className="flex items-center gap-3 p-6 bg-blue-50 rounded-xl">
          <svg className="animate-spin h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <span className="text-blue-700">Guardando en la base de datos…</span>
        </div>
      )}

      {/* Resultado final */}
      {estado === 'done' && resultado && (
        <div className="space-y-4">
          <div className="p-6 bg-green-50 border border-green-200 rounded-xl">
            <h2 className="text-green-800 font-semibold text-lg mb-3">✅ Importación completada</h2>
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Insertados / Actualizados" value={resultado.insertados} color="green" />
              <Stat label="Errores" value={resultado.errores.length} color={resultado.errores.length > 0 ? 'red' : 'gray'} />
            </div>
          </div>
          {resultado.errores.length > 0 && (
            <section>
              <h3 className="font-semibold text-red-700 mb-2">Errores al guardar</h3>
              <ul className="text-sm bg-red-50 border border-red-200 rounded-lg divide-y divide-red-100 max-h-48 overflow-y-auto">
                {resultado.errores.map((e, i) => <li key={i} className="px-3 py-2">{e}</li>)}
              </ul>
            </section>
          )}
          <button onClick={reset} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition text-sm">
            Importar otro archivo
          </button>
        </div>
      )}
    </main>
    </div>
  );
}

function Stat({ label, value, of: total, color }: { label: string; value: number; of?: number; color: string }) {
  const colors: Record<string, string> = {
    blue:   'bg-blue-50 text-blue-700',
    green:  'bg-green-50 text-green-700',
    yellow: 'bg-yellow-50 text-yellow-700',
    orange: 'bg-orange-50 text-orange-700',
    gray:   'bg-gray-100 text-gray-600',
    red:    'bg-red-50 text-red-700',
  };
  return (
    <div className={`rounded-lg p-4 ${colors[color] ?? colors.gray}`}>
      <div className="text-2xl font-bold">
        {value}{total !== undefined ? <span className="text-base font-normal"> / {total}</span> : null}
      </div>
      <div className="text-xs mt-1 opacity-80">{label}</div>
    </div>
  );
}
