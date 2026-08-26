'use client';

import { useState, useRef } from 'react';

interface ConflictoCartera { ruc: string; razon_social: string; codigos: string[]; }

interface Preview {
  zonas: string[];
  total_vendedores: number;
  total_a_asignar: number;
  clientes_nuevos: number;
  cambios_vendedor: number;
  sin_asignar: number;
  conflictos: ConflictoCartera[];
  _vendedores: unknown[];
  _clientes: unknown[];
}

interface Resultado {
  zonas_creadas: number;
  vendedores_creados: number;
  clientes_asignados: number;
  errores_cliente: number;
  log: string[];
}

type Estado = 'idle' | 'cargando' | 'preview' | 'confirmando' | 'done' | 'error';

export default function ImportarCarteraPage() {
  const [estado, setEstado]         = useState<Estado>('idle');
  const [preview, setPreview]       = useState<Preview | null>(null);
  const [resultado, setResultado]   = useState<Resultado | null>(null);
  const [mensajeError, setMensajeError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEstado('cargando');
    setPreview(null);
    setMensajeError('');
    const form = new FormData();
    form.append('archivo', file);
    try {
      const res  = await fetch('/api/importar-cartera/preview', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido');
      setPreview(data);
      setEstado('preview');
    } catch (err) {
      setMensajeError(String(err));
      setEstado('error');
    }
  };

  const handleConfirmar = async () => {
    if (!preview) return;
    setEstado('confirmando');
    try {
      const res  = await fetch('/api/importar-cartera/confirmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _vendedores: preview._vendedores, _clientes: preview._clientes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido');
      setResultado(data);
      setEstado('done');
    } catch (err) {
      setMensajeError(String(err));
      setEstado('error');
    }
  };

  const reset = () => {
    setEstado('idle');
    setPreview(null);
    setResultado(null);
    setMensajeError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      <header className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-oswald tracking-wide">LOGISALUD</h1>
            <p className="text-white/70 text-sm">Importar Cartera 2026</p>
          </div>
          <a href="/" className="text-white/80 hover:text-white text-sm">&larr; Menú</a>
        </div>
      </header>
    <main className="max-w-3xl mx-auto mt-8 px-4 pb-16">
      <h1 className="text-2xl font-bold mb-1">Importar Cartera 2026</h1>
      <p className="text-gray-500 text-sm mb-8">
        Sube el Excel con las hojas <strong>BD VENDEDORES</strong> y <strong>TABLA DE VENTA</strong>.
        Se mostrará un resumen antes de guardar.
      </p>

      {(estado === 'idle' || estado === 'error') && (
        <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition">
          <span className="text-4xl mb-2">📂</span>
          <span className="text-gray-600 font-medium">Haz clic o arrastra tu archivo .xlsx</span>
          <span className="text-gray-400 text-xs mt-1">Debe contener las dos hojas requeridas</span>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleArchivo} />
        </label>
      )}

      {estado === 'error' && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <strong>Error:</strong> {mensajeError}
        </div>
      )}

      {estado === 'cargando' && <Spinner texto="Procesando archivo…" />}
      {estado === 'confirmando' && <Spinner texto="Guardando en la base de datos…" />}

      {estado === 'preview' && preview && (
        <div className="space-y-6">

          {/* Zonas */}
          <section>
            <h2 className="font-semibold mb-2 text-gray-700">Zonas detectadas ({preview.zonas.length})</h2>
            <div className="flex flex-wrap gap-2">
              {preview.zonas.map(z => (
                <span key={z} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-mono">{z}</span>
              ))}
            </div>
          </section>

          {/* Contadores */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Stat label="Vendedores" value={preview.total_vendedores} color="blue" />
            <Stat label="Clientes a asignar" value={preview.total_a_asignar} color="green" />
            <Stat label="Clientes nuevos" value={preview.clientes_nuevos} color="yellow" />
            <Stat label="Cambios de vendedor" value={preview.cambios_vendedor} color="yellow" />
            <Stat label="Sin asignar (quedan en BD)" value={preview.sin_asignar} color="gray" />
            <Stat label="Conflictos" value={preview.conflictos.length} color={preview.conflictos.length > 0 ? 'red' : 'gray'} />
          </div>

          {/* Conflictos */}
          {preview.conflictos.length > 0 && (
            <section>
              <h2 className="font-semibold mb-2 text-red-700">⚠️ Conflictos — NO se asignarán ({preview.conflictos.length})</h2>
              <p className="text-xs text-gray-500 mb-2">Estos RUC tienen más de un NUEVO CODIGO en el Excel. Resuélvelos manualmente y vuelve a importar.</p>
              <ul className="text-sm bg-red-50 border border-red-200 rounded-lg divide-y divide-red-100">
                {preview.conflictos.map(c => (
                  <li key={c.ruc} className="px-3 py-2">
                    <span className="font-mono text-xs text-gray-500">{c.ruc}</span> — {c.razon_social}
                    <span className="ml-2 text-red-600 text-xs">Códigos: {c.codigos.join(', ')}</span>
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
              ✅ Confirmar e importar
            </button>
            <button onClick={reset} className="px-4 py-2.5 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {estado === 'done' && resultado && (
        <div className="space-y-4">
          <div className="p-6 bg-green-50 border border-green-200 rounded-xl">
            <h2 className="text-green-800 font-semibold text-lg mb-3">✅ Cartera importada</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label="Zonas" value={resultado.zonas_creadas} color="blue" />
              <Stat label="Vendedores" value={resultado.vendedores_creados} color="blue" />
              <Stat label="Clientes asignados" value={resultado.clientes_asignados} color="green" />
              <Stat label="Errores" value={resultado.errores_cliente} color={resultado.errores_cliente > 0 ? 'red' : 'gray'} />
            </div>
          </div>
          {resultado.log.length > 0 && (
            <section>
              <h3 className="font-semibold text-yellow-700 mb-2">Log de advertencias</h3>
              <ul className="text-sm bg-yellow-50 border border-yellow-200 rounded-lg divide-y divide-yellow-100 max-h-48 overflow-y-auto">
                {resultado.log.map((l, i) => <li key={i} className="px-3 py-2 font-mono text-xs">{l}</li>)}
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

function Spinner({ texto }: { texto: string }) {
  return (
    <div className="flex items-center gap-3 p-6 bg-blue-50 rounded-xl">
      <svg className="animate-spin h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
      <span className="text-blue-700">{texto}</span>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    blue:   'bg-blue-50 text-blue-700',
    green:  'bg-green-50 text-green-700',
    yellow: 'bg-yellow-50 text-yellow-700',
    gray:   'bg-gray-100 text-gray-600',
    red:    'bg-red-50 text-red-700',
  };
  return (
    <div className={`rounded-lg p-4 ${colors[color] ?? colors.gray}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs mt-1 opacity-80">{label}</div>
    </div>
  );
}
