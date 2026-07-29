'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface Factura { comprobante: string; razon_social: string; }
interface Fila {
  id: string;
  fecha: string | null;
  descripcion: string;
  monto: number;
  operacion_numero: string | null;
  clasificacion: 'cobro' | 'no_cobranza';
  nombre_banco_detectado: string | null;
  estado_conciliacion: 'pendiente' | 'conciliado' | 'descartado';
  pago_id: string | null;
  factura: Factura | null;
}
interface Resumen {
  cobros_n: number; cobros_suma: number; no_cobranza_n: number; no_cobranza_suma: number;
  conciliados: number; pendientes: number; descartados: number;
}
interface FacturaSug {
  id: string; comprobante: string; cliente_ruc: string; razon_social: string;
  importe_total: number; saldo_pendiente: number; fecha_emision: string; tiene_letras: boolean;
  match: 'cliente_y_monto' | 'monto_exacto';
}
type Categoria = 'nombre_y_monto' | 'nombre_sin_monto' | 'solo_monto_unica' | 'ambiguo' | 'sin_candidata';

const fmt = (n: number) => 'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtFecha = (s: string | null) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };

export default function ConciliacionPage() {
  const [filas, setFilas]       = useState<Fila[]>([]);
  const [resumen, setResumen]   = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [autoRun, setAutoRun]   = useState(false);
  const [msg, setMsg]           = useState<{ texto: string; ok: boolean } | null>(null);
  const [filtro, setFiltro]     = useState<'cobros' | 'pendientes' | 'conciliados' | 'no_cobranza' | 'todos'>('cobros');
  const [abierto, setAbierto]   = useState<string | null>(null);
  const [sug, setSug]           = useState<{ facturas: FacturaSug[]; clientes: { ruc: string; razon_social: string }[]; categoria: Categoria } | null>(null);
  const [cargandoSug, setCargandoSug] = useState(false);
  const [accion, setAccion]     = useState<string | null>(null);
  const [verificoAmbiguo, setVerificoAmbiguo] = useState(false);
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
    const form = new FormData(); form.append('archivo', file);
    try {
      const res = await fetch('/api/conciliacion/importar', { method: 'POST', body: form });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Error');
      setMsg({ texto: `✓ ${d.insertados} importados · ${d.omitidos_duplicados} duplicados omitidos (de ${d.total_archivo}).`, ok: true });
      await cargar();
    } catch (e) { setMsg({ texto: String(e), ok: false }); }
    finally { setSubiendo(false); if (inputRef.current) inputRef.current.value = ''; }
  }

  async function autoConciliar() {
    setAutoRun(true); setMsg(null);
    try {
      const res = await fetch('/api/conciliacion/auto', { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Error');
      setMsg({ texto: `✓ ${d.conciliados} movimientos conciliados automáticamente por N° de operación.`, ok: true });
      await cargar();
    } catch (e) { setMsg({ texto: String(e), ok: false }); }
    finally { setAutoRun(false); }
  }

  async function verSugerencias(id: string) {
    if (abierto === id) { setAbierto(null); setSug(null); return; }
    setAbierto(id); setSug(null); setVerificoAmbiguo(false); setCargandoSug(true);
    try {
      const res = await fetch(`/api/conciliacion/sugerencias?id=${id}`, { cache: 'no-store' });
      const d = await res.json();
      setSug({ facturas: d.facturas ?? [], clientes: d.clientes ?? [], categoria: d.categoria ?? 'sin_candidata' });
    } finally { setCargandoSug(false); }
  }

  async function confirmar(movimiento_id: string, documento_id: string) {
    setAccion(movimiento_id); setMsg(null);
    try {
      const res = await fetch('/api/conciliacion/confirmar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movimiento_id, documento_id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Error');
      setMsg({ texto: '✓ Pago registrado y movimiento conciliado.', ok: true });
      setAbierto(null); setSug(null);
      await cargar();
    } catch (e) { setMsg({ texto: String(e), ok: false }); }
    finally { setAccion(null); }
  }

  async function cambiarEstado(movimiento_id: string, acc: 'descartar' | 'reactivar' | 'desconciliar') {
    if (acc === 'desconciliar' && !confirm('Desconciliar solo desenlaza el movimiento; el pago NO se borra (si hay que anularlo, elimínalo en Registrar Pago). ¿Continuar?')) return;
    setAccion(movimiento_id); setMsg(null);
    try {
      const res = await fetch('/api/conciliacion/estado', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movimiento_id, accion: acc }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Error');
      await cargar();
    } catch (e) { setMsg({ texto: String(e), ok: false }); }
    finally { setAccion(null); }
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) subir(f); };
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) subir(f); };

  const visibles = filas.filter(f => {
    if (filtro === 'todos') return true;
    if (filtro === 'no_cobranza') return f.clasificacion === 'no_cobranza';
    if (filtro === 'cobros') return f.clasificacion === 'cobro';
    if (filtro === 'pendientes') return f.clasificacion === 'cobro' && f.estado_conciliacion === 'pendiente';
    if (filtro === 'conciliados') return f.clasificacion === 'cobro' && f.estado_conciliacion === 'conciliado';
    return true;
  });

  // Categorías honestas sobre qué señal hay detrás de cada sugerencia — nunca
  // un score numérico. Ninguna categoría de esta pantalla se auto-confirma:
  // el único mecanismo automático es /api/conciliacion/auto (N° de operación
  // exacto), que no se toca acá.
  const CATEGORIA_INFO: Record<Categoria, { label: string; bg: string; fg: string; border: string }> = {
    nombre_y_monto:    { label: '🟡 Nombre y monto coinciden',        bg: '#FEF6E0', fg: '#8A6A00', border: '#F5E1A0' },
    solo_monto_unica:  { label: '🟠 Solo el monto coincide',          bg: '#FDEEE3', fg: '#9A4E12', border: '#F3CFA9' },
    ambiguo:           { label: '🔴 Ambiguo — requiere investigación', bg: '#FCE7E7', fg: '#A11F1F', border: '#F3B8B8' },
    nombre_sin_monto:  { label: '⚫ Nombre coincide, monto no cuadra',  bg: '#EDEDED', fg: '#3A3A3A', border: '#D4D4D4' },
    sin_candidata:     { label: '⚪ Sin candidata',                    bg: '#F7F7F7', fg: '#8A8A8A', border: '#E4E4E4' },
  };

  const Badge = ({ e }: { e: Fila['estado_conciliacion'] }) => {
    if (e === 'conciliado') return <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#e9f7ee', color: '#166534' }}>Conciliado</span>;
    if (e === 'descartado') return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-400">Descartado</span>;
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Pendiente</span>;
  };

  return (
    <div>
      <header className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-oswald tracking-wide">LOGISALUD</h1>
            <p className="text-white/70 text-sm">Conciliación bancaria</p>
          </div>
          <a href="/" className="text-white/80 hover:text-white text-sm">&larr; Menú</a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto mt-6 px-4 pb-16">
        {/* Carga + auto-conciliar */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <label onDragOver={e => e.preventDefault()} onDrop={onDrop}
            className="flex-1 min-w-[260px] flex items-center gap-3 px-4 py-3 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-logisalud-teal transition">
            <span className="text-2xl">🏦</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700">{subiendo ? 'Procesando…' : 'Subir extracto .xlsx (BCP)'}</p>
              <p className="text-xs text-gray-400">Se evita duplicar movimientos ya importados</p>
            </div>
            <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onFile} disabled={subiendo} />
          </label>
          <button onClick={autoConciliar} disabled={autoRun || filas.length === 0}
            className="px-4 py-3 rounded-xl text-sm font-medium text-white disabled:opacity-50 transition"
            style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
            {autoRun ? 'Conciliando…' : '⚡ Auto-conciliar por N° operación'}
          </button>
        </div>

        {msg && <div className={`p-3 rounded-lg text-sm mb-4 ${msg.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{msg.texto}</div>}

        {/* Resumen */}
        {resumen && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-4">
            <div className="bg-white rounded-xl border border-gray-200 p-3">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider">Movimientos</p>
              <p className="font-oswald text-lg mt-0.5 text-gray-800">{filas.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider">Cobros</p>
              <p className="font-oswald text-lg mt-0.5" style={{ color: '#4BB168' }}>{resumen.cobros_n}</p>
              <p className="text-[10px] text-gray-400">{fmt(resumen.cobros_suma)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider">Conciliados</p>
              <p className="font-oswald text-lg mt-0.5 text-green-700">{resumen.conciliados}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider">Pendientes</p>
              <p className={`font-oswald text-lg mt-0.5 ${resumen.pendientes > 0 ? 'text-amber-600' : 'text-gray-300'}`}>{resumen.pendientes}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider">No es cobranza</p>
              <p className="font-oswald text-lg mt-0.5 text-gray-500">{resumen.no_cobranza_n}</p>
            </div>
          </div>
        )}

        {/* Filtro */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {([['cobros', 'Cobros'], ['pendientes', 'Pendientes'], ['conciliados', 'Conciliados'], ['no_cobranza', 'No cobranza'], ['todos', 'Todos']] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setFiltro(k)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition ${filtro === k ? 'text-white border-transparent' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
              style={filtro === k ? { background: '#4ABCC2' } : undefined}>{lbl}</button>
          ))}
        </div>

        {cargando ? (
          <div className="text-center py-16 text-gray-400 text-sm">Cargando…</div>
        ) : visibles.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">No hay movimientos para este filtro.</div>
        ) : (
          <div className="space-y-2">
            {visibles.map(f => {
              const esCobroPendiente = f.clasificacion === 'cobro' && f.estado_conciliacion === 'pendiente';
              return (
                <div key={f.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-gray-500 text-xs whitespace-nowrap">{fmtFecha(f.fecha)}</span>
                        <span className="text-gray-800 text-sm font-medium truncate max-w-[280px]" title={f.descripcion}>{f.descripcion}</span>
                        {f.nombre_banco_detectado && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#E0F5F6', color: '#2A8A90' }}>{f.nombre_banco_detectado}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                        <span className="font-mono">op {f.operacion_numero ?? '—'}</span>
                        {f.factura && <span className="text-green-700">→ {f.factura.comprobante} · {f.factura.razon_social}</span>}
                      </div>
                    </div>
                    <span className={`text-sm font-bold tabular-nums whitespace-nowrap ${f.monto < 0 ? 'text-gray-400' : 'text-gray-800'}`}>{fmt(f.monto)}</span>
                    {f.clasificacion === 'cobro'
                      ? <Badge e={f.estado_conciliacion} />
                      : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-400">No es cobranza</span>}

                    {esCobroPendiente && (
                      <div className="flex gap-1.5">
                        <button onClick={() => verSugerencias(f.id)} className="px-2.5 py-1 text-xs rounded-lg text-white transition" style={{ background: '#4ABCC2' }}>
                          {abierto === f.id ? 'Ocultar' : 'Sugerencias'}
                        </button>
                        <button onClick={() => cambiarEstado(f.id, 'descartar')} disabled={accion === f.id}
                          className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50">Descartar</button>
                      </div>
                    )}
                    {f.clasificacion === 'cobro' && f.estado_conciliacion === 'conciliado' && (
                      <button onClick={() => cambiarEstado(f.id, 'desconciliar')} disabled={accion === f.id}
                        className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50">Desconciliar</button>
                    )}
                    {f.clasificacion === 'cobro' && f.estado_conciliacion === 'descartado' && (
                      <button onClick={() => cambiarEstado(f.id, 'reactivar')} disabled={accion === f.id}
                        className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50">Reactivar</button>
                    )}
                  </div>

                  {/* Panel de sugerencias */}
                  {abierto === f.id && (
                    <div className="px-4 py-3 bg-gray-50/60 border-t border-gray-100">
                      {cargandoSug || !sug ? (
                        <p className="text-xs text-gray-400">Buscando coincidencias…</p>
                      ) : (() => {
                        const cat = sug.categoria;
                        const info = CATEGORIA_INFO[cat];
                        const puedeConfirmar = cat === 'nombre_y_monto' || cat === 'solo_monto_unica' || cat === 'ambiguo';
                        const botonesHabilitados = cat !== 'ambiguo' || verificoAmbiguo;

                        return (
                          <div>
                            <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-lg mb-2.5"
                              style={{ background: info.bg, color: info.fg, border: `1px solid ${info.border}` }}>
                              {info.label}
                            </span>

                            {/* Advertencias por categoría — la de "ambiguo" es deliberadamente
                                la más contundente: exige un paso explícito antes de habilitar
                                los botones, no solo un texto informativo de pasada. */}
                            {cat === 'solo_monto_unica' && (
                              <p className="text-xs text-orange-700 mb-2">⚠️ Sin nombre de respaldo — verifica antes de confirmar.</p>
                            )}
                            {cat === 'ambiguo' && (
                              <div className="rounded-lg border-2 border-red-300 bg-red-50 px-3 py-2.5 mb-3">
                                <p className="text-sm font-bold text-red-800">
                                  🚫 Hay {sug.facturas.length} facturas con montos similares de distintos clientes.
                                </p>
                                <p className="text-xs text-red-700 mt-1">
                                  Confirmar aquí sin verificar podría aplicar el pago al cliente equivocado. Revisa el nombre del pagador contra el extracto antes de continuar.
                                </p>
                                <label className="flex items-center gap-2 mt-2.5 text-xs font-medium text-red-800 cursor-pointer select-none">
                                  <input type="checkbox" checked={verificoAmbiguo} onChange={e => setVerificoAmbiguo(e.target.checked)} />
                                  Confirmo que verifiqué manualmente cuál es el cliente correcto
                                </label>
                              </div>
                            )}
                            {cat === 'nombre_sin_monto' && (
                              <p className="text-xs text-gray-600 mb-2">
                                Cliente identificado: <span className="font-medium">{sug.clientes.map(c => c.razon_social).join(', ')}</span>.
                                Ninguna de sus facturas tiene un saldo cercano a {fmt(f.monto)} — podría ser pago parcial, adelanto, o requerir revisión.
                              </p>
                            )}
                            {cat === 'sin_candidata' && (
                              <p className="text-xs text-gray-500 mb-2">Sin sugerencia — búsqueda 100% manual.</p>
                            )}

                            {/* ⚫ nunca ofrece factura para confirmar directamente: solo enlace a búsqueda manual. */}
                            {!puedeConfirmar ? (
                              <a href="/registrar-pago" className="inline-block text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-white transition">
                                Buscar manualmente →
                              </a>
                            ) : (
                              <div className="space-y-1.5">
                                {sug.facturas.map(fa => (
                                  <div key={fa.id} className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 px-3 py-2">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm text-gray-800 truncate">
                                        <span className="font-mono font-semibold">{fa.comprobante}</span> · {fa.razon_social}
                                      </p>
                                      <p className="text-xs text-gray-400">
                                        saldo {fmt(fa.saldo_pendiente)} · emitida {fmtFecha(fa.fecha_emision)}
                                        {fa.match === 'cliente_y_monto' && <span className="ml-1 text-green-700">· coincide cliente y monto</span>}
                                        {fa.tiene_letras && <span className="ml-1 text-red-500">· tiene letras</span>}
                                      </p>
                                    </div>
                                    <button onClick={() => confirmar(f.id, fa.id)} disabled={accion === f.id || fa.tiene_letras || !botonesHabilitados}
                                      title={!botonesHabilitados ? 'Marca la casilla de verificación primero' : undefined}
                                      className="px-3 py-1.5 text-xs font-medium rounded-lg text-white disabled:opacity-40 transition shrink-0"
                                      style={{ background: '#4BB168' }}>
                                      {accion === f.id ? '…' : 'Registrar y conciliar'}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
