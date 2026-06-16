'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface VendedorInfo {
  id: string;
  nombres: string;
  apellidos: string;
  codigo: string;
  zona: string | null;
}

interface ClienteRow {
  ruc: string;
  razon_social: string;
  vendedor_actual_id: string | null;
  fecha_reasignacion: string | null;
  vendedor_actual: { id: string; nombres: string; apellidos: string; codigo: string } | null;
}

interface ApiClientes {
  clientes: ClienteRow[];
  total: number;
  page: number;
  pageSize: number;
}

export default function ClientesPage() {
  const [vendedores, setVendedores]     = useState<VendedorInfo[]>([]);
  const [clientes, setClientes]         = useState<ClienteRow[]>([]);
  const [total, setTotal]               = useState(0);
  const [page, setPage]                 = useState(0);
  const [search, setSearch]             = useState('');
  const [sinAsignar, setSinAsignar]     = useState(false);
  const [cargando, setCargando]         = useState(false);
  const [guardando, setGuardando]       = useState<string | null>(null); // ruc en guardado
  const [seleccion, setSeleccion]       = useState<Record<string, string>>({}); // ruc -> vendedor_id
  const [mensaje, setMensaje]           = useState<{ ruc: string; texto: string; ok: boolean } | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const PAGE_SIZE = 50;

  // Cargar lista de vendedores una sola vez
  useEffect(() => {
    fetch('/api/vendedores')
      .then(r => r.json())
      .then(d => setVendedores(d.vendedores ?? []))
      .catch(console.error);
  }, []);

  const cargarClientes = useCallback(async (p: number, q: string, sa: boolean) => {
    setCargando(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        ...(q && { search: q }),
        ...(sa && { sin_asignar: 'true' }),
      });
      const res  = await fetch(`/api/clientes?${params}`);
      const data: ApiClientes = await res.json();
      setClientes(data.clientes ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      console.error(e);
    } finally {
      setCargando(false);
    }
  }, []);

  // Recargar cuando cambia pagina, sin_asignar
  useEffect(() => {
    cargarClientes(page, search, sinAsignar);
  }, [page, sinAsignar, cargarClientes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Busqueda con debounce
  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(0);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => cargarClientes(0, val, sinAsignar), 350);
  };

  const handleAsignar = async (ruc: string) => {
    const vendedor_id = seleccion[ruc] ?? null;
    setGuardando(ruc);
    setMensaje(null);
    try {
      const res  = await fetch(`/api/clientes/${ruc}/asignar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendedor_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMensaje({ ruc, texto: data.cambio_registrado ? 'Reasignado (historial guardado)' : 'Asignado', ok: true });
      cargarClientes(page, search, sinAsignar);
    } catch (err) {
      setMensaje({ ruc, texto: String(err), ok: false });
    } finally {
      setGuardando(null);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <main className="max-w-5xl mx-auto mt-10 px-4 pb-16">
      <h1 className="text-2xl font-bold mb-1">Clientes</h1>
      <p className="text-gray-500 text-sm mb-6">Asigna o reasigna vendedores. Los cambios quedan registrados con historial.</p>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="Buscar por RUC o razón social..."
          value={search}
          onChange={e => handleSearch(e.target.value)}
          className="flex-1 min-w-[220px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={sinAsignar}
            onChange={e => { setSinAsignar(e.target.checked); setPage(0); }}
            className="accent-blue-600"
          />
          Solo sin asignar
        </label>
        <span className="text-sm text-gray-400 self-center">{total} cliente{total !== 1 ? 's' : ''}</span>
      </div>

      {/* Tabla */}
      {cargando ? (
        <div className="text-center py-16 text-gray-400">Cargando…</div>
      ) : clientes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">No hay clientes para mostrar.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">RUC</th>
                <th className="px-4 py-3 text-left">Razón social</th>
                <th className="px-4 py-3 text-left">Vendedor actual</th>
                <th className="px-4 py-3 text-left">Asignar vendedor</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clientes.map(c => {
                const actual    = c.vendedor_actual;
                const selVal    = seleccion[c.ruc] ?? actual?.id ?? '';
                const enGuardado = guardando === c.ruc;
                const msg        = mensaje?.ruc === c.ruc ? mensaje : null;
                return (
                  <tr key={c.ruc} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{c.ruc}</td>
                    <td className="px-4 py-3 font-medium">{c.razon_social}</td>
                    <td className="px-4 py-3">
                      {actual ? (
                        <span className="text-gray-700">
                          {actual.nombres} {actual.apellidos}
                          <span className="ml-1 text-xs text-gray-400">({actual.codigo})</span>
                        </span>
                      ) : (
                        <span className="text-orange-500 font-medium">Sin asignar</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={selVal}
                        onChange={e => setSeleccion(prev => ({ ...prev, [c.ruc]: e.target.value }))}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      >
                        <option value="">-- Sin asignar --</option>
                        {vendedores.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.nombres} {v.apellidos} ({v.codigo}){v.zona ? ` — ${v.zona}` : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-end gap-1">
                        <button
                          onClick={() => handleAsignar(c.ruc)}
                          disabled={enGuardado || selVal === (actual?.id ?? '')}
                          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                        >
                          {enGuardado ? 'Guardando…' : 'Guardar'}
                        </button>
                        {msg && (
                          <span className={`text-xs ${msg.ok ? 'text-green-600' : 'text-red-600'}`}>
                            {msg.texto}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginacion */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40"
          >
            ← Anterior
          </button>
          <span className="text-sm text-gray-600">Página {page + 1} de {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40"
          >
            Siguiente →
          </button>
        </div>
      )}
    </main>
  );
}
