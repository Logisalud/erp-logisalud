'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface FacturaBuscar {
  id: string;
  comprobante: string;
  cliente_ruc: string;
  razon_social: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  importe_total: number;
  saldo_pendiente: number;
  rango_vencimiento: string;
  tiene_letras: boolean;
}

interface Letra {
  id: string;
  documento_id: string;
  numero_letra: string;
  importe: number;
  fecha_giro: string | null;
  fecha_vencimiento: string;
  estado: 'en_cartera' | 'en_banco' | 'pagada' | 'protestada';
  banco: string | null;
  fecha_pago: string | null;
  observaciones: string | null;
}

interface FilaNueva {
  numero_letra: string;
  importe: string;
  fecha_giro: string;
  fecha_vencimiento: string;
  banco: string;
}

const fmt = (n: number) =>
  'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtFecha = (s: string | null) => {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};

const ESTADO_LABEL: Record<string, string> = {
  en_cartera: 'En cartera',
  en_banco:   'En banco',
  pagada:     'Pagada',
  protestada: 'Protestada',
};

const ESTADO_STYLE: Record<string, string> = {
  en_cartera: 'bg-gray-100 text-gray-600',
  en_banco:   'bg-teal-100 text-teal-700',
  pagada:     'bg-green-100 text-green-700',
  protestada: 'bg-red-100 text-red-700',
};

const ESTADOS = ['en_cartera', 'en_banco', 'pagada', 'protestada'] as const;

const filaVacia = (): FilaNueva => ({
  numero_letra: '', importe: '', fecha_giro: '', fecha_vencimiento: '', banco: '',
});

export default function LetrasPage() {
  const [busqueda, setBusqueda]         = useState('');
  const [sugerencias, setSugerencias]   = useState<FacturaBuscar[]>([]);
  const [buscando, setBuscando]         = useState(false);
  const [factura, setFactura]           = useState<FacturaBuscar | null>(null);
  const [letras, setLetras]             = useState<Letra[]>([]);
  const [cargandoLetras, setCargandoLetras] = useState(false);
  const [filas, setFilas]               = useState<FilaNueva[]>([filaVacia()]);
  const [guardando, setGuardando]       = useState(false);
  const [errMsg, setErrMsg]             = useState('');
  const [cambioEstado, setCambioEstado] = useState<Record<string, boolean>>({});
  const [pagoModal, setPagoModal]       = useState<{ letraId: string; fecha: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const buscarDebounced = useCallback((q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (q.length < 2) { setSugerencias([]); return; }
      setBuscando(true);
      const res = await fetch(`/api/facturas/buscar?q=${encodeURIComponent(q)}`);
      const d   = await res.json();
      setSugerencias(d.facturas ?? []);
      setBuscando(false);
    }, 280);
  }, []);

  const onBusquedaChange = (v: string) => {
    setBusqueda(v);
    if (factura) { setFactura(null); setLetras([]); }
    buscarDebounced(v);
  };

  const seleccionarFactura = async (f: FacturaBuscar) => {
    setFactura(f);
    setSugerencias([]);
    setBusqueda(`${f.comprobante} — ${f.razon_social}`);
    setErrMsg('');
    setFilas([filaVacia()]);
    setCargandoLetras(true);
    const res = await fetch(`/api/letras?documento_id=${f.id}`, { cache: 'no-store' });
    const d   = await res.json();
    setLetras(d.letras ?? []);
    setCargandoLetras(false);
  };

  const recargarLetras = useCallback(async () => {
    if (!factura) return;
    const [resL, resF] = await Promise.all([
      fetch(`/api/letras?documento_id=${factura.id}`, { cache: 'no-store' }),
      fetch(`/api/facturas/${factura.id}`, { cache: 'no-store' }),
    ]);
    const [dL, dF] = await Promise.all([resL.json(), resF.json()]);
    setLetras(dL.letras ?? []);
    if (dF.factura) setFactura(dF.factura);
  }, [factura]);

  const guardarLetras = async () => {
    if (!factura) return;
    setErrMsg('');
    for (const f of filas) {
      if (!f.numero_letra.trim())    { setErrMsg('Número de letra es obligatorio en todas las filas');  return; }
      if (!f.importe || Number(f.importe) <= 0) { setErrMsg('Importe debe ser mayor a 0 en todas las filas'); return; }
      if (!f.fecha_vencimiento)      { setErrMsg('Fecha de vencimiento es obligatoria en todas las filas'); return; }
    }
    setGuardando(true);
    const res = await fetch('/api/letras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documento_id: factura.id,
        letras: filas.map(f => ({
          numero_letra:     f.numero_letra.trim(),
          importe:          Number(f.importe),
          fecha_giro:       f.fecha_giro       || undefined,
          fecha_vencimiento: f.fecha_vencimiento,
          banco:            f.banco.trim()     || undefined,
        })),
      }),
    });
    const d = await res.json();
    if (d.error) { setErrMsg(d.error); setGuardando(false); return; }
    setFilas([filaVacia()]);
    await recargarLetras();
    setGuardando(false);
  };

  const cambiarEstado = async (letraId: string, nuevoEstado: string) => {
    if (nuevoEstado === 'pagada') {
      setPagoModal({ letraId, fecha: new Date().toISOString().split('T')[0] });
      return;
    }
    setCambioEstado(p => ({ ...p, [letraId]: true }));
    await fetch(`/api/letras/${letraId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: nuevoEstado }),
    });
    await recargarLetras();
    setCambioEstado(p => ({ ...p, [letraId]: false }));
  };

  const confirmarPago = async () => {
    if (!pagoModal) return;
    const { letraId, fecha } = pagoModal;
    setPagoModal(null);
    setCambioEstado(p => ({ ...p, [letraId]: true }));
    await fetch(`/api/letras/${letraId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'pagada', fecha_pago: fecha }),
    });
    await recargarLetras();
    setCambioEstado(p => ({ ...p, [letraId]: false }));
  };

  const eliminarLetra = async (letraId: string) => {
    if (!confirm('¿Eliminar esta letra? Esta acción no se puede deshacer.')) return;
    await fetch(`/api/letras/${letraId}`, { method: 'DELETE' });
    await recargarLetras();
  };

  const actualizarFila = (idx: number, campo: keyof FilaNueva, valor: string) => {
    const nuevas = [...filas];
    nuevas[idx] = { ...nuevas[idx], [campo]: valor };
    setFilas(nuevas);
  };

  const sumaLetras  = letras.reduce((a, l) => a + Number(l.importe), 0);
  const diferencia  = factura ? sumaLetras - Number(factura.importe_total) : 0;
  const cuadraOk    = Math.abs(diferencia) < 0.01;

  return (
    <div className="min-h-screen bg-gray-50 font-poppins">

      <header className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-oswald tracking-wide">LOGISALUD</h1>
            <p className="text-white/70 text-sm">Letras de cambio</p>
          </div>
          <a href="/" className="text-white/80 hover:text-white text-sm">&larr; Menú</a>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* Buscador */}
        <div className="relative mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Buscar factura a crédito por comprobante, RUC o razón social
          </label>
          <input
            type="text"
            value={busqueda}
            onChange={e => onBusquedaChange(e.target.value)}
            placeholder="Ej : FFF1-1211 · 20601234567 · FARMACIA"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal bg-white"
          />
          {buscando && (
            <span className="absolute right-3 top-9 text-xs text-gray-400">Buscando…</span>
          )}
          {sugerencias.length > 0 && (
            <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden divide-y divide-gray-100">
              {sugerencias.map(f => (
                <li key={f.id}>
                  <button
                    onClick={() => seleccionarFactura(f)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left"
                  >
                    <div className="min-w-0">
                      <span className="font-mono font-semibold text-logisalud-green text-sm">{f.comprobante}</span>
                      {f.tiene_letras && (
                        <span className="ml-2 text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full">
                          Con letras
                        </span>
                      )}
                      <p className="text-gray-600 text-xs truncate mt-0.5">{f.razon_social}</p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p className="text-xs text-gray-400">{fmt(Number(f.importe_total))}</p>
                      <p className="text-xs font-semibold text-gray-800">
                        Saldo: {fmt(Number(f.saldo_pendiente))}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {errMsg && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm mb-4">{errMsg}</div>
        )}

        {factura && (
          <div className="space-y-5">

            {/* Tarjeta de la factura */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Factura seleccionada</p>
                  <h2 className="font-oswald text-xl text-gray-800 tracking-wide">{factura.comprobante}</h2>
                  <p className="text-gray-700 text-sm mt-0.5 font-medium">{factura.razon_social}</p>
                  <p className="text-gray-400 text-xs mt-0.5">RUC {factura.cliente_ruc}</p>
                  <div className="flex gap-4 mt-2 text-xs text-gray-400">
                    <span>Emisión: <span className="text-gray-600">{fmtFecha(factura.fecha_emision)}</span></span>
                    <span>Vencimiento: <span className="text-gray-600">{fmtFecha(factura.fecha_vencimiento)}</span></span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Importe total</p>
                  <p className="text-2xl font-semibold text-gray-900">{fmt(Number(factura.importe_total))}</p>
                  <p className="text-xs text-gray-400 mt-2">Saldo pendiente</p>
                  <p className={`text-base font-semibold ${
                    Number(factura.saldo_pendiente) > 0 ? 'text-orange-600' : 'text-gray-400'
                  }`}>{fmt(Number(factura.saldo_pendiente))}</p>
                </div>
              </div>
            </div>

            {/* Letras existentes */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-oswald text-base text-gray-700 tracking-wide">
                  Letras giradas
                  <span className="ml-2 text-sm font-normal text-gray-400">({letras.length})</span>
                </h3>
                {letras.length > 0 && (
                  <div className={`flex items-center gap-2 text-sm ${
                    cuadraOk ? 'text-green-600' : diferencia > 0 ? 'text-orange-600' : 'text-red-600'
                  }`}>
                    <span className="font-semibold">
                      {cuadraOk ? '✓ Cuadra' : `Dif: ${diferencia > 0 ? '+' : ''}${fmt(diferencia)}`}
                    </span>
                    {!cuadraOk && (
                      <span className="text-xs text-gray-400">
                        {diferencia > 0 ? '(intereses/gastos)' : '(letras menores al importe)'}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {cargandoLetras ? (
                <div className="py-10 text-center text-gray-400 text-sm">Cargando letras…</div>
              ) : letras.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-sm">
                  No hay letras giradas. Usa el formulario de abajo para girar.
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs uppercase tracking-wide text-gray-400 bg-gray-50">
                          <th className="px-4 py-3 text-left">N° Letra</th>
                          <th className="px-4 py-3 text-right">Importe</th>
                          <th className="px-4 py-3 text-center">F. Giro</th>
                          <th className="px-4 py-3 text-center">F. Vencimiento</th>
                          <th className="px-4 py-3 text-left">Banco</th>
                          <th className="px-4 py-3 text-center">Estado</th>
                          <th className="px-4 py-3 text-center">F. Pago</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {letras.map(l => (
                          <tr key={l.id} className={`hover:bg-gray-50 ${
                            l.estado === 'protestada' ? 'bg-red-50/30' :
                            l.estado === 'pagada'     ? 'bg-green-50/20' : ''
                          }`}>
                            <td className="px-4 py-3 font-mono text-xs font-medium text-gray-700">{l.numero_letra}</td>
                            <td className="px-4 py-3 text-right font-semibold">{fmt(Number(l.importe))}</td>
                            <td className="px-4 py-3 text-center text-xs text-gray-400">{fmtFecha(l.fecha_giro)}</td>
                            <td className="px-4 py-3 text-center text-xs text-gray-700 font-medium">{fmtFecha(l.fecha_vencimiento)}</td>
                            <td className="px-4 py-3 text-xs text-gray-400">{l.banco ?? '—'}</td>
                            <td className="px-4 py-3 text-center">
                              <select
                                value={l.estado}
                                disabled={!!cambioEstado[l.id]}
                                onChange={e => cambiarEstado(l.id, e.target.value)}
                                className={`text-xs px-2.5 py-1 rounded-full border-0 font-medium cursor-pointer
                                  focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-logisalud-teal
                                  disabled:opacity-60 ${ESTADO_STYLE[l.estado]}`}
                              >
                                {ESTADOS.map(s => (
                                  <option key={s} value={s}>{ESTADO_LABEL[s]}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-3 text-center text-xs text-green-600">
                              {l.fecha_pago ? fmtFecha(l.fecha_pago) : '—'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => eliminarLetra(l.id)}
                                className="text-red-400 hover:text-red-600 text-xs hover:underline"
                              >
                                Eliminar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Cuadre detalle */}
                  <div className="px-5 py-4 border-t border-gray-100 bg-gray-50">
                    <div className="flex flex-wrap gap-6 text-sm">
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Importe factura</p>
                        <p className="font-semibold text-gray-800">{fmt(Number(factura.importe_total))}</p>
                      </div>
                      <div className="text-gray-300 text-xl self-end pb-0.5">=</div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Suma de letras ({letras.length})</p>
                        <p className="font-semibold text-gray-800">{fmt(sumaLetras)}</p>
                      </div>
                      <div className="text-gray-300 text-xl self-end pb-0.5">→</div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Diferencia</p>
                        <p className={`font-semibold ${
                          cuadraOk ? 'text-green-600' : diferencia > 0 ? 'text-orange-600' : 'text-red-600'
                        }`}>
                          {cuadraOk ? '✓ Cuadra' : `${diferencia > 0 ? '+' : ''}${fmt(diferencia)}`}
                        </p>
                        {!cuadraOk && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {diferencia > 0 ? 'Intereses / gastos bancarios' : 'Letras menores al importe'}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Formulario para girar letras */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-oswald text-base text-gray-700 tracking-wide">Girar letras</h3>
                <p className="text-xs text-gray-400 mt-0.5">Agrega una o varias letras a la vez. Los campos con * son obligatorios.</p>
              </div>
              <div className="p-5">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                        <th className="pb-2 text-left pr-3 font-medium">N° Letra *</th>
                        <th className="pb-2 text-right pr-3 font-medium">Importe *</th>
                        <th className="pb-2 text-center pr-3 font-medium">F. Giro</th>
                        <th className="pb-2 text-center pr-3 font-medium">F. Vencimiento *</th>
                        <th className="pb-2 text-left pr-3 font-medium">Banco</th>
                        <th className="pb-2 w-6" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filas.map((fila, idx) => (
                        <tr key={idx}>
                          <td className="py-2 pr-3">
                            <input
                              value={fila.numero_letra}
                              onChange={e => actualizarFila(idx, 'numero_letra', e.target.value)}
                              placeholder="LET-001"
                              className="w-28 px-2 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-logisalud-teal"
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              type="number" min="0.01" step="0.01"
                              value={fila.importe}
                              onChange={e => actualizarFila(idx, 'importe', e.target.value)}
                              placeholder="0.00"
                              className="w-28 px-2 py-1.5 border border-gray-200 rounded text-xs text-right focus:outline-none focus:ring-1 focus:ring-logisalud-teal"
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              type="date"
                              value={fila.fecha_giro}
                              onChange={e => actualizarFila(idx, 'fecha_giro', e.target.value)}
                              className="px-2 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-logisalud-teal"
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              type="date"
                              value={fila.fecha_vencimiento}
                              onChange={e => actualizarFila(idx, 'fecha_vencimiento', e.target.value)}
                              className="px-2 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-logisalud-teal"
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              value={fila.banco}
                              onChange={e => actualizarFila(idx, 'banco', e.target.value)}
                              placeholder="Opcional"
                              className="w-32 px-2 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-logisalud-teal"
                            />
                          </td>
                          <td className="py-2">
                            {filas.length > 1 && (
                              <button
                                onClick={() => setFilas(filas.filter((_, i) => i !== idx))}
                                className="text-gray-300 hover:text-red-400 text-base leading-none"
                              >
                                ✕
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-4 mt-4 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => setFilas([...filas, filaVacia()])}
                    className="text-sm text-logisalud-teal hover:underline font-medium"
                  >
                    + Agregar fila
                  </button>
                  <button
                    onClick={guardarLetras}
                    disabled={guardando}
                    className="ml-auto px-6 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition"
                    style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}
                  >
                    {guardando
                      ? 'Guardando…'
                      : `Guardar ${filas.length} letra${filas.length !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Modal fecha de pago */}
      {pagoModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-80">
            <h3 className="font-oswald text-lg text-gray-800 mb-1">Registrar pago</h3>
            <p className="text-xs text-gray-400 mb-4">Confirma la fecha en que se cobró esta letra.</p>
            <input
              type="date"
              value={pagoModal.fecha}
              onChange={e => setPagoModal({ ...pagoModal, fecha: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setPagoModal(null)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarPago}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: '#4BB168' }}
              >
                Confirmar pago
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
