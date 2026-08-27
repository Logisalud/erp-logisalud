'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface VendedorInfo {
  id: string;
  nombres: string;
  apellidos: string;
  codigo: string;
}

interface ZonaInfo {
  codigo_zona: string;
  nombre_zona: string | null;
  vendedor: VendedorInfo | null;
}

interface ClienteRow {
  ruc: string;
  razon_social: string;
  vendedor_actual_id: string | null;
  vendedor_manual_id: string | null;
  fecha_reasignacion: string | null;
  codigo_zona: string | null;
  distrito: string | null;
  zona_manual: boolean;
  vendedor_actual: VendedorInfo | null;
  vendedor_manual: VendedorInfo | null;
}

function nombreVendedor(v: VendedorInfo | null): string {
  if (!v) return '';
  return `${v.nombres} ${v.apellidos} (${v.codigo})`;
}

export default function ClientesPage() {
  const [vendedores, setVendedores]   = useState<VendedorInfo[]>([]);
  const [zonas, setZonas]             = useState<ZonaInfo[]>([]);
  const [clientes, setClientes]       = useState<ClienteRow[]>([]);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(0);
  const [search, setSearch]           = useState('');
  const [sinAsignar, setSinAsignar]   = useState(false);
  const [soloOverride, setSoloOverride] = useState(false);
  const [zonaFiltro, setZonaFiltro]   = useState('');
  const [vendedorFiltro, setVendedorFiltro] = useState('');
  const [resumen, setResumen]         = useState<{ total: number; sinZona: number; porZona: Record<string, number>; porVendedor: Record<string, number> } | null>(null);
  const [verDistribucion, setVerDistribucion] = useState(false);
  const [cargando, setCargando]       = useState(false);
  const [guardando, setGuardando]     = useState<string | null>(null);
  const [msg, setMsg]                 = useState<{ ruc: string; texto: string; ok: boolean } | null>(null);

  // edición local por fila
  const [editZona, setEditZona]       = useState<Record<string, string>>({});
  const [editManual, setEditManual]   = useState<Record<string, string>>({});

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const PAGE_SIZE = 50;

  useEffect(() => {
    fetch('/api/vendedores', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setVendedores(d.vendedores ?? []))
      .catch(console.error);
    fetch('/api/digemid-zonas', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setZonas(d.zonas ?? []))
      .catch(console.error);
    fetch('/api/clientes/resumen', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setResumen(d))
      .catch(console.error);
  }, []);

  const cargarClientes = useCallback(async (p: number, q: string, sa: boolean, ov: boolean, zn: string, vd: string) => {
    setCargando(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        ...(q && { search: q }),
        ...(sa && { sin_asignar: 'true' }),
        ...(ov && { solo_override: 'true' }),
        ...(zn && { zona: zn }),
        ...(vd && { vendedor_id: vd }),
      });
      const res  = await fetch(`/api/clientes?${params}`, { cache: 'no-store' });
      const data = await res.json();
      setClientes(data.clientes ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarClientes(page, search, sinAsignar, soloOverride, zonaFiltro, vendedorFiltro);
  }, [page, sinAsignar, soloOverride, zonaFiltro, vendedorFiltro, cargarClientes]); // eslint-disable-line

  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(0);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => cargarClientes(0, val, sinAsignar, soloOverride, zonaFiltro, vendedorFiltro), 350);
  };

  const hayFiltros = !!(search || sinAsignar || soloOverride || zonaFiltro || vendedorFiltro);

  const limpiarFiltros = () => {
    setSearch(''); setSinAsignar(false); setSoloOverride(false);
    setZonaFiltro(''); setVendedorFiltro(''); setPage(0);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    cargarClientes(0, '', false, false, '', '');
  };

  const exportarUrl = () => {
    const p = new URLSearchParams({
      ...(search && { search }),
      ...(sinAsignar && { sin_asignar: 'true' }),
      ...(soloOverride && { solo_override: 'true' }),
      ...(zonaFiltro && { zona: zonaFiltro }),
      ...(vendedorFiltro && { vendedor_id: vendedorFiltro }),
    });
    return `/api/clientes/exportar?${p.toString()}`;
  };

  // Zona del mapeo DIGEMID para un codigo_zona dado
  const zonaVendedor = (codigoZona: string | null): VendedorInfo | null =>
    zonas.find(z => z.codigo_zona === codigoZona)?.vendedor ?? null;

  const guardarZona = async (c: ClienteRow) => {
    const nuevaZona   = editZona[c.ruc] ?? c.codigo_zona ?? '';
    const codigoFinal = nuevaZona || null;
    if (codigoFinal === c.codigo_zona) return;
    setGuardando(c.ruc);
    setMsg(null);
    try {
      const res = await fetch(`/api/clientes/${c.ruc}/zona`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo_zona: codigoFinal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg({ ruc: c.ruc, texto: 'Zona actualizada', ok: true });
      cargarClientes(page, search, sinAsignar, soloOverride, zonaFiltro, vendedorFiltro);
    } catch (err) {
      setMsg({ ruc: c.ruc, texto: String(err), ok: false });
    } finally {
      setGuardando(null);
    }
  };

  const guardarOverride = async (c: ClienteRow, nuevoVendedorId: string | null) => {
    setGuardando(c.ruc + ':override');
    setMsg(null);
    try {
      const res = await fetch(`/api/clientes/${c.ruc}/zona`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendedor_manual_id: nuevoVendedorId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg({ ruc: c.ruc, texto: nuevoVendedorId ? 'Override aplicado' : 'Override eliminado', ok: true });
      setEditManual(prev => { const n = { ...prev }; delete n[c.ruc]; return n; });
      cargarClientes(page, search, sinAsignar, soloOverride, zonaFiltro, vendedorFiltro);
    } catch (err) {
      setMsg({ ruc: c.ruc, texto: String(err), ok: false });
    } finally {
      setGuardando(null);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <header className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-oswald tracking-wide">LOGISALUD</h1>
            <p className="text-white/70 text-sm">Gestión de clientes</p>
          </div>
          <a href="/cobranzas" className="text-white/80 hover:text-white text-sm">&larr; Menú</a>
        </div>
      </header>
    <main className="max-w-7xl mx-auto mt-6 px-4 pb-16">

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Buscar por RUC o razón social…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="flex-1 min-w-[220px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
          />
          <select
            value={zonaFiltro}
            onChange={e => { setZonaFiltro(e.target.value); setPage(0); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal min-w-[150px]"
          >
            <option value="">Todas las zonas</option>
            {zonas.map(z => (
              <option key={z.codigo_zona} value={z.codigo_zona}>
                {z.codigo_zona}{resumen?.porZona[z.codigo_zona] ? ` (${resumen.porZona[z.codigo_zona]})` : ''}
              </option>
            ))}
          </select>
          <select
            value={vendedorFiltro}
            onChange={e => { setVendedorFiltro(e.target.value); setPage(0); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal min-w-[200px]"
          >
            <option value="">Todos los vendedores</option>
            {vendedores.map(v => (
              <option key={v.id} value={v.id}>
                {v.nombres} {v.apellidos} ({v.codigo}){resumen?.porVendedor[v.id] ? ` · ${resumen.porVendedor[v.id]}` : ''}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={sinAsignar} onChange={e => { setSinAsignar(e.target.checked); setPage(0); }} className="accent-blue-600" />
            Sin zona
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={soloOverride} onChange={e => { setSoloOverride(e.target.checked); setPage(0); }} className="accent-amber-500" />
            Override manual
          </label>
          {hayFiltros && (
            <button onClick={limpiarFiltros} className="px-3 py-2 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-gray-100">
          <span className="text-sm font-semibold text-gray-700">
            {total} cliente{total !== 1 ? 's' : ''}
            {hayFiltros && resumen && <span className="font-normal text-gray-400"> de {resumen.total}</span>}
          </span>
          <a
            href={exportarUrl()}
            className="px-3 py-1.5 text-xs font-medium rounded-lg text-white transition"
            style={{ background: '#4BB168' }}
          >
            ⬇ Exportar a Excel
          </a>
          {resumen && (
            <button onClick={() => setVerDistribucion(v => !v)} className="text-xs text-logisalud-teal hover:underline">
              {verDistribucion ? 'Ocultar distribución' : 'Ver distribución por zona'}
            </button>
          )}
        </div>

        {verDistribucion && resumen && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Distribución por zona (clic para filtrar)</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(resumen.porZona).sort((a, b) => a[0].localeCompare(b[0])).map(([z, n]) => (
                <button
                  key={z}
                  onClick={() => { setZonaFiltro(z); setPage(0); setVerDistribucion(false); }}
                  className={`px-2 py-1 rounded-md text-xs border transition ${zonaFiltro === z ? 'text-white border-transparent' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                  style={zonaFiltro === z ? { background: '#4ABCC2' } : undefined}
                >
                  {z} <span className="font-semibold">{n}</span>
                </button>
              ))}
              {resumen.sinZona > 0 && (
                <span className="px-2 py-1 rounded-md text-xs bg-gray-50 border border-gray-200 text-gray-400">
                  Sin zona <span className="font-semibold">{resumen.sinZona}</span>
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-4 mb-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-400"></span> Vendedor con override manual</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-blue-400"></span> Vendedor derivado de zona</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-gray-300"></span> Sin zona asignada</span>
        <span className="flex items-center gap-1 text-violet-600">✏️ Zona corregida manualmente</span>
      </div>

      {cargando ? (
        <div className="text-center py-16 text-gray-400">Cargando…</div>
      ) : clientes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">No hay clientes para mostrar.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-3 text-left">RUC</th>
                <th className="px-3 py-3 text-left">Razón social</th>
                <th className="px-3 py-3 text-left">Distrito</th>
                <th className="px-3 py-3 text-left">Zona DIGEMID</th>
                <th className="px-3 py-3 text-left">Vendedor por zona</th>
                <th className="px-3 py-3 text-left">Vendedor efectivo</th>
                <th className="px-3 py-3 text-left">Override manual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clientes.map(c => {
                const tieneOverride  = !!c.vendedor_manual_id;
                const zonaV          = zonaVendedor(c.codigo_zona);
                const zonaEditVal    = editZona[c.ruc] ?? c.codigo_zona ?? '';
                const manualEditVal  = editManual[c.ruc] ?? c.vendedor_manual_id ?? '';
                const guardandoEsta  = guardando === c.ruc || guardando === c.ruc + ':override';
                const rowMsg         = msg?.ruc === c.ruc ? msg : null;

                return (
                  <tr key={c.ruc} className={`hover:bg-gray-50 transition ${tieneOverride ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-3 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">{c.ruc}</td>

                    <td className="px-3 py-3 font-medium max-w-[220px]">
                      <span title={c.razon_social} className="line-clamp-2">{c.razon_social}</span>
                    </td>

                    <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {c.distrito ?? <span className="text-gray-300">—</span>}
                    </td>

                    {/* Zona DIGEMID — editable */}
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <select
                            value={zonaEditVal}
                            onChange={e => setEditZona(prev => ({ ...prev, [c.ruc]: e.target.value }))}
                            className={`px-2 py-1 border rounded text-xs focus:outline-none focus:ring-1 w-28
                              ${c.zona_manual
                                ? 'border-violet-400 focus:ring-violet-400 bg-violet-50'
                                : 'border-gray-300 focus:ring-blue-400'}`}
                          >
                            <option value="">-- Sin zona --</option>
                            {zonas.map(z => (
                              <option key={z.codigo_zona} value={z.codigo_zona}>
                                {z.codigo_zona}
                              </option>
                            ))}
                          </select>
                          {zonaEditVal !== (c.codigo_zona ?? '') && (
                            <button
                              onClick={() => guardarZona(c)}
                              disabled={guardandoEsta}
                              className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-40 transition whitespace-nowrap"
                            >
                              {guardando === c.ruc ? '…' : 'Guardar'}
                            </button>
                          )}
                        </div>
                        {c.zona_manual && (
                          <span className="text-[10px] text-violet-600 font-medium flex items-center gap-0.5">
                            ✏️ Corregida
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Vendedor por zona */}
                    <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {zonaV ? (
                        <span>{zonaV.nombres} {zonaV.apellidos}<br/><span className="text-gray-400">({zonaV.codigo})</span></span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    {/* Vendedor efectivo */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      {c.vendedor_actual ? (
                        <span className={`flex items-center gap-1.5 text-xs ${tieneOverride ? 'text-amber-700 font-semibold' : 'text-gray-700'}`}>
                          <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${tieneOverride ? 'bg-amber-400' : c.codigo_zona ? 'bg-blue-400' : 'bg-gray-300'}`}></span>
                          {c.vendedor_actual.nombres} {c.vendedor_actual.apellidos}
                          <span className="text-gray-400">({c.vendedor_actual.codigo})</span>
                          {tieneOverride && (
                            <span className="ml-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold border border-amber-200">
                              MANUAL
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-orange-500 text-xs font-medium">Sin asignar</span>
                      )}
                    </td>

                    {/* Override manual */}
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <select
                            value={manualEditVal}
                            onChange={e => setEditManual(prev => ({ ...prev, [c.ruc]: e.target.value }))}
                            className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 w-40"
                          >
                            <option value="">-- Seguir zona --</option>
                            {vendedores.map(v => (
                              <option key={v.id} value={v.id}>
                                {v.nombres} {v.apellidos} ({v.codigo})
                              </option>
                            ))}
                          </select>
                          {manualEditVal !== (c.vendedor_manual_id ?? '') && (
                            <button
                              onClick={() => guardarOverride(c, manualEditVal || null)}
                              disabled={guardandoEsta}
                              className="px-2 py-1 bg-amber-500 text-white text-xs rounded hover:bg-amber-600 disabled:opacity-40 transition whitespace-nowrap"
                            >
                              {guardando === c.ruc + ':override' ? '…' : manualEditVal ? 'Fijar' : 'Quitar'}
                            </button>
                          )}
                          {tieneOverride && manualEditVal === (c.vendedor_manual_id ?? '') && (
                            <button
                              onClick={() => guardarOverride(c, null)}
                              disabled={guardandoEsta}
                              title="Quitar override y volver a la zona"
                              className="px-2 py-0.5 text-xs text-red-500 border border-red-200 rounded hover:bg-red-50 disabled:opacity-40 transition"
                            >
                              ✕ Quitar
                            </button>
                          )}
                        </div>
                        {rowMsg && (
                          <span className={`text-xs ${rowMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
                            {rowMsg.texto}
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
    </div>
  );
}
