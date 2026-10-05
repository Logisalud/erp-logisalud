'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface FacturaBuscar {
  id: string;
  comprobante: string;
  cliente_ruc: string;
  razon_social: string;
  saldo_pendiente: number;
  tiene_letras: boolean;
  factorizado?: boolean;
}

interface FacturaOperacion {
  id: string;
  documento_id: string;
  monto_factorizado: number;
  comprobante?: string;
  cliente_ruc?: string;
  razon_social?: string;
}

interface Operacion {
  id: string;
  entidad: string;
  fecha_operacion: string;
  monto_adelantado: number;
  porcentaje_adelanto: number | null;
  comision: number | null;
  referencia: string | null;
  observaciones: string | null;
  registrado_por: string | null;
  anulada: boolean;
  anulada_motivo: string | null;
  facturas: FacturaOperacion[];
}

const fmt = (n: number) =>
  'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtFecha = (s: string) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
const hoy = () => new Date().toISOString().split('T')[0];

export default function FactoringVista({ puedeAnular }: { puedeAnular: boolean }) {
  const [operaciones, setOperaciones] = useState<Operacion[]>([]);
  const [cargando, setCargando] = useState(true);

  const [busqueda, setBusqueda] = useState('');
  const [sugerencias, setSugerencias] = useState<FacturaBuscar[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [seleccionadas, setSeleccionadas] = useState<FacturaBuscar[]>([]);

  const [entidad, setEntidad] = useState('');
  const [fechaOperacion, setFechaOperacion] = useState(hoy());
  const [montoAdelantado, setMontoAdelantado] = useState('');
  const [porcentajeAdelanto, setPorcentajeAdelanto] = useState('');
  const [comision, setComision] = useState('');
  const [referencia, setReferencia] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [registradoPor, setRegistradoPor] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [exitoMsg, setExitoMsg] = useState('');

  const [anulandoId, setAnulandoId] = useState<string | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cargarOperaciones = useCallback(async () => {
    setCargando(true);
    const res = await fetch('/api/factoring', { cache: 'no-store' });
    const d = await res.json();
    setOperaciones(d.operaciones ?? []);
    setCargando(false);
  }, []);

  useEffect(() => { cargarOperaciones(); }, [cargarOperaciones]);

  useEffect(() => {
    const guardado = localStorage.getItem('registrado_por');
    if (guardado) setRegistradoPor(guardado);
  }, []);

  const buscarDebounced = useCallback((q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (q.length < 2) { setSugerencias([]); return; }
      setBuscando(true);
      const res = await fetch(`/api/facturas/buscar?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      const d = await res.json();
      setSugerencias(d.facturas ?? []);
      setBuscando(false);
    }, 280);
  }, []);

  const onBusquedaChange = (v: string) => {
    setBusqueda(v);
    buscarDebounced(v);
  };

  const agregarFactura = (f: FacturaBuscar) => {
    setBusqueda(''); setSugerencias([]);
    setErrMsg('');
    if (seleccionadas.some(s => s.id === f.id)) return;
    if (f.tiene_letras) { setErrMsg(`${f.comprobante} tiene letras — no se puede factorizar.`); return; }
    if (f.factorizado) { setErrMsg(`${f.comprobante} ya está factorizada.`); return; }
    if (Number(f.saldo_pendiente) <= 0) { setErrMsg(`${f.comprobante} no tiene saldo pendiente.`); return; }
    setSeleccionadas(prev => [...prev, f]);
  };

  const quitarFactura = (id: string) => setSeleccionadas(prev => prev.filter(f => f.id !== id));

  const totalFacturado = seleccionadas.reduce((s, f) => s + Number(f.saldo_pendiente), 0);

  const limpiarForm = () => {
    setSeleccionadas([]); setEntidad(''); setFechaOperacion(hoy());
    setMontoAdelantado(''); setPorcentajeAdelanto(''); setComision('');
    setReferencia(''); setObservaciones('');
  };

  const registrarOperacion = async () => {
    if (!entidad.trim()) { setErrMsg('Indica la entidad de factoring.'); return; }
    if (seleccionadas.length === 0) { setErrMsg('Agrega al menos una factura.'); return; }
    if (!montoAdelantado || Number(montoAdelantado) < 0) { setErrMsg('Indica el monto adelantado.'); return; }
    if (!registradoPor.trim()) { setErrMsg('Indica quién registra esta operación.'); return; }
    localStorage.setItem('registrado_por', registradoPor.trim());
    setGuardando(true); setErrMsg(''); setExitoMsg('');
    try {
      const res = await fetch('/api/factoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entidad: entidad.trim(),
          fecha_operacion: fechaOperacion,
          monto_adelantado: Number(montoAdelantado),
          ...(porcentajeAdelanto ? { porcentaje_adelanto: Number(porcentajeAdelanto) } : {}),
          ...(comision ? { comision: Number(comision) } : {}),
          referencia: referencia.trim() || undefined,
          observaciones: observaciones.trim() || undefined,
          registrado_por: registradoPor.trim(),
          documento_ids: seleccionadas.map(f => f.id),
        }),
      });
      const d = await res.json();
      if (d.error) { setErrMsg(d.error); return; }
      setExitoMsg(`✓ Operación registrada: ${seleccionadas.length} ${seleccionadas.length === 1 ? 'factura' : 'facturas'} por ${fmt(totalFacturado)}.`);
      limpiarForm();
      await cargarOperaciones();
    } finally {
      setGuardando(false);
    }
  };

  const confirmarAnulacion = async (op: Operacion) => {
    if (!motivoAnulacion.trim()) { alert('Indica el motivo de la anulación.'); return; }
    const res = await fetch(`/api/factoring/${op.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anulada_motivo: motivoAnulacion.trim() }),
    });
    const d = await res.json();
    if (d.error) { alert(d.error); return; }
    setAnulandoId(null); setMotivoAnulacion('');
    await cargarOperaciones();
  };

  return (
    <div>
      <header className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-oswald tracking-wide">LOGISALUD</h1>
            <p className="text-white/70 text-sm">Factoring de facturas</p>
          </div>
          <a href="/cobranzas" className="text-white/80 hover:text-white text-sm">&larr; Menú</a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto mt-6 px-4 pb-16 space-y-6">
        <p className="text-gray-500 text-sm">
          Registra qué facturas se vendieron a una empresa de factoring. Al confirmar, esas facturas
          dejan de aparecer como pendientes en la cartera y en la vista del vendedor — el cobro ya
          entró vía el factor, no se registra un pago normal del cliente.
        </p>

        {/* ── Formulario ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-oswald text-base text-gray-700 tracking-wide">Nueva operación</h3>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Buscar facturas (comprobante, RUC o cliente)</label>
              <div className="relative">
                <input
                  type="text" value={busqueda}
                  onChange={e => onBusquedaChange(e.target.value)}
                  placeholder="FFF1-123, RUC o razón social…"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                />
                {(sugerencias.length > 0 || buscando) && (
                  <div className="absolute z-10 mt-1 w-full bg-white rounded-lg border border-gray-200 shadow-lg max-h-72 overflow-y-auto">
                    {buscando ? (
                      <div className="px-3 py-2 text-xs text-gray-400">Buscando…</div>
                    ) : sugerencias.map(f => (
                      <button
                        key={f.id}
                        onClick={() => agregarFactura(f)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                      >
                        <div className="flex justify-between gap-2">
                          <span className="font-mono text-sm text-gray-700">{f.comprobante}</span>
                          <span className="text-sm font-semibold text-gray-800">{fmt(Number(f.saldo_pendiente))}</span>
                        </div>
                        <p className="text-xs text-gray-400 truncate">{f.razon_social} · RUC {f.cliente_ruc}</p>
                        {(f.tiene_letras || f.factorizado) && (
                          <p className="text-xs text-red-500">
                            {f.tiene_letras ? 'Tiene letras' : 'Ya factorizada'}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {seleccionadas.length > 0 && (
              <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
                {seleccionadas.map(f => (
                  <div key={f.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <span className="font-mono text-sm text-gray-700">{f.comprobante}</span>
                      <p className="text-xs text-gray-400 truncate">{f.razon_social}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-semibold text-gray-800">{fmt(Number(f.saldo_pendiente))}</span>
                      <button onClick={() => quitarFactura(f.id)} className="text-gray-400 hover:text-red-600 text-sm">✕</button>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 font-semibold text-sm">
                  <span>Total a factorizar</span>
                  <span style={{ color: '#4BB168' }}>{fmt(totalFacturado)}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Entidad de factoring *</label>
                <input
                  type="text" value={entidad} onChange={e => setEntidad(e.target.value)}
                  placeholder="Ej. Caja Trujillo, BBVA Factoring…"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Fecha de la operación *</label>
                <input
                  type="date" value={fechaOperacion} onChange={e => setFechaOperacion(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Monto adelantado (recibido) *</label>
                <input
                  type="number" min="0" step="0.01" value={montoAdelantado}
                  onChange={e => setMontoAdelantado(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">% de adelanto (opcional)</label>
                <input
                  type="number" min="0" max="100" step="0.1" value={porcentajeAdelanto}
                  onChange={e => setPorcentajeAdelanto(e.target.value)}
                  placeholder="90"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Comisión / interés (opcional)</label>
                <input
                  type="number" min="0" step="0.01" value={comision}
                  onChange={e => setComision(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">N° de contrato / operación (opcional)</label>
                <input
                  type="text" value={referencia} onChange={e => setReferencia(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Observaciones (opcional)</label>
                <textarea
                  value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">¿Quién registra esta operación? *</label>
                <input
                  type="text" value={registradoPor} onChange={e => setRegistradoPor(e.target.value)}
                  placeholder="Tu nombre"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                />
              </div>
            </div>

            {errMsg && <p className="text-sm text-red-600">{errMsg}</p>}
            {exitoMsg && <p className="text-sm text-green-600">{exitoMsg}</p>}

            <button
              onClick={registrarOperacion}
              disabled={guardando}
              className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition"
              style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}
            >
              {guardando ? 'Guardando…' : 'Registrar operación de factoring'}
            </button>
          </div>
        </div>

        {/* ── Historial ──────────────────────────────────────────────────── */}
        <div>
          <h3 className="font-oswald text-base text-gray-700 tracking-wide mb-2">Historial</h3>
          {cargando ? (
            <div className="text-center py-10 text-gray-400 text-sm">Cargando…</div>
          ) : operaciones.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
              Sin operaciones de factoring registradas.
            </div>
          ) : (
            <div className="space-y-3">
              {operaciones.map(op => {
                const totalOp = op.facturas.reduce((s, f) => s + Number(f.monto_factorizado), 0);
                return (
                  <div key={op.id} className={`bg-white rounded-xl border p-4 ${op.anulada ? 'border-gray-200 opacity-60' : 'border-gray-200'}`}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="font-semibold text-gray-800">
                          {op.entidad}
                          {op.anulada && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">Anulada</span>}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {fmtFecha(op.fecha_operacion)}
                          {op.registrado_por && <> · registrado por {op.registrado_por}</>}
                          {op.referencia && <> · {op.referencia}</>}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-oswald text-lg" style={{ color: '#4BB168' }}>{fmt(op.monto_adelantado)}</p>
                        <p className="text-xs text-gray-400">
                          adelanto{op.porcentaje_adelanto ? ` (${op.porcentaje_adelanto}%)` : ''} · facturado {fmt(totalOp)}
                        </p>
                      </div>
                    </div>

                    {op.comision != null && (
                      <p className="text-xs text-gray-400 mt-1">Comisión: {fmt(op.comision)}</p>
                    )}
                    {op.observaciones && (
                      <p className="text-xs text-gray-500 mt-1 italic">{op.observaciones}</p>
                    )}
                    {op.anulada && op.anulada_motivo && (
                      <p className="text-xs text-red-500 mt-1">Motivo de anulación: {op.anulada_motivo}</p>
                    )}

                    <div className="mt-2 divide-y divide-gray-50 border-t border-gray-100">
                      {op.facturas.map(f => (
                        <div key={f.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                          <div className="min-w-0">
                            <span className="font-mono text-gray-700">{f.comprobante ?? '—'}</span>
                            <span className="text-gray-400 text-xs ml-2 truncate">{f.razon_social}</span>
                          </div>
                          <span className="text-gray-700 shrink-0">{fmt(Number(f.monto_factorizado))}</span>
                        </div>
                      ))}
                    </div>

                    {puedeAnular && !op.anulada && (
                      anulandoId === op.id ? (
                        <div className="mt-3 p-3 rounded-lg bg-red-50/40 border border-red-100 space-y-2">
                          <input
                            type="text" value={motivoAnulacion} onChange={e => setMotivoAnulacion(e.target.value)}
                            placeholder="Motivo de la anulación"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => confirmarAnulacion(op)}
                              className="px-4 py-1.5 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition"
                            >
                              Confirmar anulación
                            </button>
                            <button
                              onClick={() => { setAnulandoId(null); setMotivoAnulacion(''); }}
                              className="px-4 py-1.5 rounded-lg text-sm text-gray-500 border border-gray-200 hover:bg-gray-50 transition"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAnulandoId(op.id)}
                          className="mt-3 text-xs text-gray-400 hover:text-red-600 transition font-medium"
                        >
                          Anular operación
                        </button>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
