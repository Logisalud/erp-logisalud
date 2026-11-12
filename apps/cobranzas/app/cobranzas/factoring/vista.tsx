'use client';

import { useCallback, useEffect, useState } from 'react';

interface ClienteBuscado {
  cliente_ruc: string;
  razon_social: string;
}

interface FacturaCliente {
  id: string;
  comprobante: string;
  fecha_vencimiento: string | null;
  saldo_pendiente: number;
  tiene_letras: boolean;
  en_canje_activo: boolean;
  en_factoring: boolean;
  monto_canje: number | null;
}

interface CanjeFactura {
  documento_id: string; comprobante: string; monto_canje: number;
  /** El vencimiento que tomó la entidad. Vacío en los canjes anteriores al 05/11/2026. */
  fecha_vencimiento: string | null;
  fecha_vencimiento_factura: string | null;
  retencion: number;
  estado: 'en_factoring' | 'ingresada' | 'anulada';
  /** El cliente ya le pagó a la entidad de factoring. No afecta el saldo. */
  pagado_al_factor: boolean;
  fecha_pago_al_factor: string | null;
}
interface Canje {
  id: string; cliente_ruc: string; razon_social: string; fecha_canje: string;
  observaciones: string | null; registrado_por: string | null;
  anulado: boolean; anulado_motivo: string | null; facturas: CanjeFactura[];
}

interface IngresoFactura { documento_id: string; comprobante?: string; razon_social?: string; monto_factorizado: number; }
interface Gasto { tipo: 'garantia' | 'comision' | 'otros'; monto: number; incluye_igv: boolean | null; numero_factura: string | null; recuperado: boolean; observaciones: string | null; }
interface Ingreso {
  id: string; entidad: string; fecha_ingreso: string; monto_neto_recibido: number;
  referencia: string | null; observaciones: string | null; registrado_por: string | null;
  anulado: boolean; anulado_motivo: string | null; facturas: IngresoFactura[]; gastos: Gasto[];
}

interface FilaReporte {
  documento_id: string; comprobante: string; cliente_ruc: string; razon_social: string;
  fecha_vencimiento: string | null; monto: number; fecha_canje: string; dias_en_factoring: number;
}

const fmt = (n: number) =>
  'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtFecha = (s: string | null) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
const hoy = () => new Date().toISOString().split('T')[0];

function useBuscadorCliente() {
  const [busqueda, setBusqueda] = useState('');
  const [sugerencias, setSugerencias] = useState<ClienteBuscado[]>([]);
  const [seleccionado, setSeleccionado] = useState<ClienteBuscado | null>(null);

  useEffect(() => {
    if (seleccionado || busqueda.length < 2) { setSugerencias([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/clientes/buscar?q=${encodeURIComponent(busqueda)}`, { cache: 'no-store' });
      const d = await res.json();
      setSugerencias(d.clientes ?? []);
    }, 280);
    return () => clearTimeout(t);
  }, [busqueda, seleccionado]);

  const seleccionar = (c: ClienteBuscado) => { setSeleccionado(c); setBusqueda(c.razon_social); setSugerencias([]); };
  const limpiar = () => { setSeleccionado(null); setBusqueda(''); setSugerencias([]); };

  return { busqueda, setBusqueda, sugerencias, seleccionado, seleccionar, limpiar };
}

function BuscadorCliente({ b, placeholder }: { b: ReturnType<typeof useBuscadorCliente>; placeholder: string }) {
  return (
    <div className="relative">
      <input
        type="text" value={b.busqueda}
        onChange={e => { b.setBusqueda(e.target.value); if (b.seleccionado) b.limpiar(); }}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
      />
      {b.seleccionado && (
        <button onClick={b.limpiar} className="absolute right-2 top-2 text-gray-400 hover:text-red-600 text-xs">✕</button>
      )}
      {b.sugerencias.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white rounded-lg border border-gray-200 shadow-lg max-h-56 overflow-y-auto">
          {b.sugerencias.map(c => (
            <button key={c.cliente_ruc} onClick={() => b.seleccionar(c)} className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0 text-sm">
              <p className="text-gray-700 truncate">{c.razon_social}</p>
              <p className="text-xs text-gray-400">{c.cliente_ruc}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FactoringVista({ puedeAnular }: { puedeAnular: boolean }) {
  const [tab, setTab] = useState<'canjear' | 'ingreso' | 'reporte'>('canjear');

  return (
    <div>
      <header className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-oswald tracking-wide">LOGISALUD</h1>
            <p className="text-white/70 text-sm">Factoring de facturas</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTab('reporte')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${tab === 'reporte' ? 'bg-white text-logisalud-green' : 'bg-white/20 text-white hover:bg-white/30'}`}
            >
              📊 Ver reporte
            </button>
            <a href="/cobranzas" className="text-white/80 hover:text-white text-sm">&larr; Menú</a>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto mt-6 px-4 pb-16">
        {tab !== 'reporte' && (
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-sm mb-5">
            {([
              { key: 'canjear', label: 'Canjear facturas' },
              { key: 'ingreso', label: 'Ingreso al banco' },
            ] as const).map(o => (
              <button
                key={o.key} onClick={() => setTab(o.key)}
                className={`px-4 py-1.5 rounded-md font-medium transition ${tab === o.key ? 'text-white' : 'text-gray-500 hover:text-gray-700'}`}
                style={tab === o.key ? { background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' } : undefined}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}

        {tab === 'canjear' && <TabCanjear puedeAnular={puedeAnular} />}
        {tab === 'ingreso' && <TabIngreso puedeAnular={puedeAnular} />}
        {tab === 'reporte' && (
          <>
            <button onClick={() => setTab('canjear')} className="text-xs text-gray-400 hover:text-gray-600 mb-4">&larr; Volver a Factoring</button>
            <TabReporte />
          </>
        )}
      </main>
    </div>
  );
}

// ───────────────────────── Tab 1: Canjear facturas ─────────────────────────

function TabCanjear({ puedeAnular }: { puedeAnular: boolean }) {
  const b = useBuscadorCliente();
  const [facturas, setFacturas] = useState<FacturaCliente[]>([]);
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [montosCanje, setMontosCanje] = useState<Record<string, string>>({});
  // El vencimiento que va al contrato con la entidad: arranca en el de la
  // factura y se edita, porque el cliente suele confirmar dos o tres días
  // más y esa es la fecha con la que trabaja la financiera.
  const [vencimientos, setVencimientos] = useState<Record<string, string>>({});
  // El mismo vencimiento para todo el canje, arriba junto a la fecha. Es el
  // caso normal —la entidad fija una fecha para la operación— y además es
  // donde se lo busca: el campo por factura, metido adentro de la lista, no
  // se encontraba.
  const [vencimientoGeneral, setVencimientoGeneral] = useState('');
  const [retenciones, setRetenciones] = useState<Record<string, string>>({});
  const [fechaCanje, setFechaCanje] = useState(hoy());
  const [observaciones, setObservaciones] = useState('');
  const [registradoPor, setRegistradoPor] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [exitoMsg, setExitoMsg] = useState('');

  const [canjes, setCanjes] = useState<Canje[]>([]);
  const [cargandoHist, setCargandoHist] = useState(true);
  const [anulandoId, setAnulandoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');

  // Completar el vencimiento de un canje ya registrado. Los de antes del
  // 05/11/2026 quedaron sin esa fecha porque el campo no existía, y se
  // necesita igual: es la que tomó la entidad financiera.
  const [editandoVenc, setEditandoVenc] = useState<string | null>(null);
  const [vencEdit, setVencEdit] = useState<Record<string, string>>({});
  const [guardandoVenc, setGuardandoVenc] = useState(false);
  const [editandoFactor, setEditandoFactor] = useState<string | null>(null);
  const [factorEdit, setFactorEdit] = useState<Record<string, { pagado: boolean; fecha: string }>>({});
  const [guardandoFactor, setGuardandoFactor] = useState(false);

  const abrirVencimientos = (c: Canje) => {
    setEditandoVenc(c.id);
    setVencEdit(Object.fromEntries(
      c.facturas.map(f => [f.documento_id, f.fecha_vencimiento ?? f.fecha_vencimiento_factura ?? ''])
    ));
  };

  // Seguimiento del tramo que sigue a nuestro cobro: el cliente le paga a la
  // entidad. Solo se sigue en las facturas ya ingresadas — antes del ingreso
  // todavía no hay nada que el cliente le deba al factor.
  const facturasConFactor = (c: Canje) => c.facturas.filter(f => f.estado === 'ingresada');

  const abrirPagoAlFactor = (c: Canje) => {
    setEditandoFactor(c.id);
    setFactorEdit(Object.fromEntries(
      facturasConFactor(c).map(f => [f.documento_id, {
        pagado: f.pagado_al_factor,
        fecha: f.fecha_pago_al_factor ?? new Date().toLocaleDateString('en-CA'),
      }])
    ));
  };

  const guardarPagoAlFactor = async (c: Canje) => {
    setGuardandoFactor(true);
    try {
      const res = await fetch(`/api/factoring/canjes/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pagos_al_factor: facturasConFactor(c).map(f => ({
            documento_id: f.documento_id,
            pagado: factorEdit[f.documento_id]?.pagado ?? false,
            fecha_pago: factorEdit[f.documento_id]?.pagado ? (factorEdit[f.documento_id]?.fecha || null) : null,
          })),
        }),
      });
      const d = await res.json();
      if (d.error) { alert(d.error); return; }
      setEditandoFactor(null);
      await cargarHistorial();
    } finally { setGuardandoFactor(false); }
  };

  const guardarVencimientos = async (c: Canje) => {
    setGuardandoVenc(true);
    try {
      const res = await fetch(`/api/factoring/canjes/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vencimientos: c.facturas.map(f => ({
            documento_id: f.documento_id,
            fecha_vencimiento: vencEdit[f.documento_id] || null,
          })),
        }),
      });
      const d = await res.json();
      if (d.error) { alert(d.error); return; }
      setEditandoVenc(null);
      await cargarHistorial();
    } finally { setGuardandoVenc(false); }
  };

  useEffect(() => {
    const g = localStorage.getItem('registrado_por');
    if (g) setRegistradoPor(g);
  }, []);

  const cargarHistorial = useCallback(async () => {
    setCargandoHist(true);
    const res = await fetch('/api/factoring/canjes', { cache: 'no-store' });
    const d = await res.json();
    setCanjes(d.canjes ?? []);
    setCargandoHist(false);
  }, []);
  useEffect(() => { cargarHistorial(); }, [cargarHistorial]);

  useEffect(() => {
    if (!b.seleccionado) { setFacturas([]); setSeleccionadas(new Set()); return; }
    (async () => {
      const res = await fetch(`/api/factoring/facturas-cliente?cliente_ruc=${b.seleccionado!.cliente_ruc}`, { cache: 'no-store' });
      const d = await res.json();
      setFacturas(d.facturas ?? []);
      setSeleccionadas(new Set());
      setMontosCanje({});
      setVencimientos({});
      setVencimientoGeneral('');
      setRetenciones({});
    })();
  }, [b.seleccionado]);

  // Al marcar una factura, el valor a factorizar arranca en su saldo
  // pendiente completo pero queda editable — no siempre se factoriza el
  // 100% (retención, % parcial acordado con el factor, etc.).
  const toggle = (f: FacturaCliente) => {
    setSeleccionadas(prev => {
      const s = new Set(prev);
      if (s.has(f.id)) s.delete(f.id); else s.add(f.id);
      return s;
    });
    setMontosCanje(prev => {
      if (prev[f.id] !== undefined) {
        const { [f.id]: _omit, ...resto } = prev;
        return resto;
      }
      return { ...prev, [f.id]: f.saldo_pendiente.toFixed(2) };
    });
    setVencimientos(prev => {
      if (prev[f.id] !== undefined) {
        const { [f.id]: _omit, ...resto } = prev;
        return resto;
      }
      return { ...prev, [f.id]: vencimientoGeneral || f.fecha_vencimiento || '' };
    });
    setRetenciones(prev => {
      const { [f.id]: _omit, ...resto } = prev;
      return resto;
    });
  };

  /**
   * Cuando se escribe la retención, el valor a factorizar baja solo: lo que
   * el cliente retiene no se factoriza. Queda editable igual, por si el
   * acuerdo con el factor es otro.
   */
  const cambiarRetencion = (f: FacturaCliente, valor: string) => {
    setRetenciones(prev => ({ ...prev, [f.id]: valor }));
    const ret = Number(valor) || 0;
    if (ret < 0 || ret > f.saldo_pendiente) return;
    setMontosCanje(prev => ({ ...prev, [f.id]: (f.saldo_pendiente - ret).toFixed(2) }));
  };

  /** Todas vencen el mismo día: lo normal, y si no se edita una y listo. */
  const aplicarVencimientoATodas = (fecha: string) => {
    if (!fecha) return;
    setVencimientos(prev => {
      const s = { ...prev };
      for (const id of seleccionadas) s[id] = fecha;
      return s;
    });
  };

  const cambiarVencimientoGeneral = (fecha: string) => {
    setVencimientoGeneral(fecha);
    aplicarVencimientoATodas(fecha);
  };

  const registrar = async () => {
    if (!b.seleccionado) { setErrMsg('Selecciona un cliente.'); return; }
    if (seleccionadas.size === 0) { setErrMsg('Selecciona al menos una factura.'); return; }
    if (!registradoPor.trim()) { setErrMsg('Indica quién registra el canje.'); return; }
    for (const id of seleccionadas) {
      const monto = Number(montosCanje[id]);
      if (!monto || monto <= 0) { setErrMsg('Indica el valor a factorizar de cada factura seleccionada.'); return; }
      if (!vencimientos[id]) { setErrMsg('Indica la fecha de vencimiento del factoring de cada factura: es la que toma la entidad financiera.'); return; }
      const ret = Number(retenciones[id]) || 0;
      if (ret < 0) { setErrMsg('La retención no puede ser negativa.'); return; }
    }
    localStorage.setItem('registrado_por', registradoPor.trim());
    setGuardando(true); setErrMsg(''); setExitoMsg('');
    try {
      const res = await fetch('/api/factoring/canjes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_ruc: b.seleccionado.cliente_ruc,
          fecha_canje: fechaCanje,
          facturas: Array.from(seleccionadas).map(id => ({
            documento_id: id,
            monto_canje: Number(montosCanje[id]),
            fecha_vencimiento: vencimientos[id] || null,
            retencion: Number(retenciones[id]) || 0,
          })),
          observaciones: observaciones.trim() || undefined,
          registrado_por: registradoPor.trim(),
        }),
      });
      const d = await res.json();
      if (d.error) { setErrMsg(d.error); return; }
      setExitoMsg(`✓ ${seleccionadas.size} ${seleccionadas.size === 1 ? 'factura canjeada' : 'facturas canjeadas'} a factoring.`);
      // El canje se guardó aunque la retención haya fallado: se avisa, no se
      // esconde detrás del tilde verde.
      if (d.aviso) setErrMsg(d.aviso);
      setSeleccionadas(new Set()); setMontosCanje({}); setVencimientos({}); setVencimientoGeneral('');
      setRetenciones({}); setObservaciones(''); b.limpiar();
      await cargarHistorial();
    } finally { setGuardando(false); }
  };

  const confirmarAnulacion = async (c: Canje) => {
    if (!motivo.trim()) { alert('Indica el motivo.'); return; }
    const res = await fetch(`/api/factoring/canjes/${c.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anulado_motivo: motivo.trim() }),
    });
    const d = await res.json();
    if (d.error) { alert(d.error); return; }
    // Si el canje ya se había cobrado, la anulación arrastra el ingreso y
    // borra sus pagos: las facturas vuelven a deber. Hay que decirlo, no
    // dejar que el usuario lo descubra en el estado de cuenta del cliente.
    if (d.pagos_borrados > 0)
      alert(
        `Se anuló también el ingreso al banco de este canje y se borraron ${d.pagos_borrados} pago${d.pagos_borrados !== 1 ? 's' : ''}. ` +
        'Las facturas volvieron a la cartera con su saldo pendiente.',
      );
    setAnulandoId(null); setMotivo('');
    await cargarHistorial();
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-oswald text-base text-gray-700 tracking-wide">Canjear facturas a factoring</h3>
          <p className="text-xs text-gray-400 mt-0.5">Solo cambia su estado — el saldo no se toca hasta que se registre el ingreso al banco.</p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Cliente *</label>
            <BuscadorCliente b={b} placeholder="RUC o razón social…" />
          </div>

          {b.seleccionado && (
            <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
              {facturas.length === 0 ? (
                <p className="text-sm text-gray-400 p-3">Este cliente no tiene facturas con saldo pendiente.</p>
              ) : facturas.map(f => {
                const deshabilitada = f.tiene_letras || f.en_canje_activo;
                const seleccionada = seleccionadas.has(f.id);
                return (
                  <div key={f.id} className={`flex flex-wrap items-center justify-between gap-3 px-3 py-2 ${deshabilitada ? 'opacity-50' : 'hover:bg-gray-50'}`}>
                    <label className={`flex items-center gap-3 min-w-0 flex-1 ${deshabilitada ? '' : 'cursor-pointer'}`}>
                      <input
                        type="checkbox" disabled={deshabilitada}
                        checked={seleccionada}
                        onChange={() => toggle(f)}
                      />
                      <div className="min-w-0">
                        <span className="font-mono text-sm text-gray-700">{f.comprobante}</span>
                        <p className="text-xs text-gray-400">
                          Vence {fmtFecha(f.fecha_vencimiento)} · saldo {fmt(f.saldo_pendiente)}
                          {f.tiene_letras && <span className="text-red-500"> · tiene letras</span>}
                          {f.en_canje_activo && <span className="text-amber-600"> · ya en factoring</span>}
                        </p>
                      </div>
                    </label>
                    {seleccionada ? (
                      <div className="shrink-0 flex items-end gap-2 flex-wrap justify-end">
                        <div className="text-left">
                          <label className="block text-[10px] text-gray-400 mb-0.5">Vence (factoring)</label>
                          <input
                            type="date"
                            value={vencimientos[f.id] ?? ''}
                            onChange={e => setVencimientos(prev => ({ ...prev, [f.id]: e.target.value }))}
                            onBlur={e => { if (seleccionadas.size > 1 && e.target.value) aplicarVencimientoATodas(e.target.value); }}
                            className="w-36 px-2 py-1 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                          />
                        </div>
                        <div className="text-right">
                          <label className="block text-[10px] text-gray-400 mb-0.5">Retención IGV</label>
                          <input
                            type="number" min="0" max={f.saldo_pendiente} step="0.01" placeholder="0.00"
                            value={retenciones[f.id] ?? ''}
                            onChange={e => cambiarRetencion(f, e.target.value)}
                            className="w-24 px-2 py-1 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                          />
                        </div>
                        <div className="text-right">
                          <label className="block text-[10px] text-gray-400 mb-0.5">Valor a factorizar</label>
                          <input
                            type="number" min="0.01" max={f.saldo_pendiente} step="0.01"
                            value={montosCanje[f.id] ?? ''}
                            onChange={e => setMontosCanje(prev => ({ ...prev, [f.id]: e.target.value }))}
                            className="w-28 px-2 py-1 border border-gray-200 rounded-lg text-sm text-right font-semibold focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm font-semibold text-gray-800 shrink-0">{fmt(f.saldo_pendiente)}</span>
                    )}
                  </div>
                );
              })}
              {seleccionadas.size > 0 && (
                <div className="px-3 py-2 bg-gray-50 text-sm space-y-1">
                  <div className="flex justify-between font-semibold">
                    <span>Total a factorizar</span>
                    <span style={{ color: '#4BB168' }}>
                      {fmt(Array.from(seleccionadas).reduce((s, id) => s + (Number(montosCanje[id]) || 0), 0))}
                    </span>
                  </div>
                  {Array.from(seleccionadas).some(id => Number(retenciones[id]) > 0) && (
                    <div className="flex justify-between text-gray-500 text-xs">
                      <span>Retención IGV (no se factoriza)</span>
                      <span>{fmt(Array.from(seleccionadas).reduce((s, id) => s + (Number(retenciones[id]) || 0), 0))}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Fecha del canje *</label>
              <input type="date" value={fechaCanje} onChange={e => setFechaCanje(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Vencimiento del factoring *</label>
              <input type="date" value={vencimientoGeneral} onChange={e => cambiarVencimientoGeneral(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal" />
              <p className="text-[11px] text-gray-400 mt-1">
                El que toma la entidad financiera, que suele ser el de la factura más dos o tres días.
                Se aplica a todas las facturas marcadas; si alguna vence distinto, se cambia en su fila.
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Observaciones (opcional)</label>
              <input type="text" value={observaciones} onChange={e => setObservaciones(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">¿Quién registra? *</label>
              <input type="text" value={registradoPor} onChange={e => setRegistradoPor(e.target.value)} placeholder="Tu nombre"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal" />
            </div>
          </div>

          {errMsg && <p className="text-sm text-red-600">{errMsg}</p>}
          {exitoMsg && <p className="text-sm text-green-600">{exitoMsg}</p>}

          <button onClick={registrar} disabled={guardando}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition"
            style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
            {guardando ? 'Guardando…' : `Canjear ${seleccionadas.size || ''} factura(s) a factoring`}
          </button>
        </div>
      </div>

      <div>
        <h3 className="font-oswald text-base text-gray-700 tracking-wide mb-2">Historial de canjes</h3>
        {cargandoHist ? (
          <div className="text-center py-8 text-gray-400 text-sm">Cargando…</div>
        ) : canjes.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-400 text-sm">Sin canjes registrados.</div>
        ) : (
          <div className="space-y-3">
            {canjes.map(c => (
              <div key={c.id} className={`bg-white rounded-xl border border-gray-200 p-4 ${c.anulado ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-semibold text-gray-800">
                      {c.razon_social}
                      {c.anulado && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">Anulado</span>}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {fmtFecha(c.fecha_canje)}{c.registrado_por && <> · {c.registrado_por}</>}
                    </p>
                  </div>
                </div>
                {c.observaciones && <p className="text-xs text-gray-500 mt-1 italic">{c.observaciones}</p>}
                {c.anulado && c.anulado_motivo && <p className="text-xs text-red-500 mt-1">Motivo: {c.anulado_motivo}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.facturas.map(f => (
                    <span key={f.documento_id} className={`text-xs px-2 py-0.5 rounded-full font-mono ${
                      f.estado === 'ingresada' ? 'bg-green-100 text-green-700' : f.estado === 'anulada' ? 'bg-gray-100 text-gray-400' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {f.comprobante} · {fmt(f.monto_canje)}
                      {f.fecha_vencimiento
                        ? <> · vence {fmtFecha(f.fecha_vencimiento)}</>
                        : <span className="opacity-60"> · sin vencimiento</span>}
                      {f.estado === 'ingresada' && (
                        f.pagado_al_factor
                          ? <> · <span className="font-semibold">pagó al factor</span>{f.fecha_pago_al_factor ? ` ${fmtFecha(f.fecha_pago_al_factor)}` : ''}</>
                          : <> · <span className="font-semibold text-red-600">no pagó al factor</span></>
                      )}
                    </span>
                  ))}
                </div>
                {editandoVenc === c.id ? (
                  <div className="mt-3 p-3 rounded-lg bg-gray-50 border border-gray-200 space-y-2">
                    <p className="text-xs text-gray-500">
                      El vencimiento que tomó la entidad financiera. Se propone el de cada factura;
                      cambialo si el contrato quedó con otra fecha.
                    </p>
                    {c.facturas.map(f => (
                      <div key={f.documento_id} className="flex items-center justify-between gap-3 flex-wrap">
                        <span className="font-mono text-xs text-gray-600">{f.comprobante}</span>
                        <input
                          type="date"
                          value={vencEdit[f.documento_id] ?? ''}
                          onChange={e => setVencEdit(prev => ({ ...prev, [f.documento_id]: e.target.value }))}
                          className="px-2 py-1 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                        />
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => guardarVencimientos(c)}
                        disabled={guardandoVenc}
                        className="px-4 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}
                      >
                        {guardandoVenc ? 'Guardando…' : 'Guardar'}
                      </button>
                      <button
                        onClick={() => setEditandoVenc(null)}
                        className="px-4 py-1.5 rounded-lg text-sm text-gray-500 border border-gray-200 hover:bg-gray-50"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => abrirVencimientos(c)}
                    className="mt-3 mr-4 text-xs text-logisalud-teal hover:underline font-medium"
                  >
                    {c.facturas.some(f => !f.fecha_vencimiento)
                      ? 'Completar vencimiento'
                      : 'Editar vencimiento'}
                  </button>
                )}

                {/* El cliente le paga a la ENTIDAD, no a nosotros. Nuestra
                    factura ya está cobrada; esto sigue el tramo de después,
                    porque si el cliente no le paga al factor, el factor
                    vuelve sobre nosotros. No mueve ningún saldo. */}
                {editandoFactor === c.id ? (
                  <div className="mt-3 p-3 rounded-lg bg-gray-50 border border-gray-200 space-y-2">
                    <p className="text-xs text-gray-500">
                      ¿El cliente ya le pagó a la entidad? Esto no cambia el saldo de la factura
                      —ya la cobramos del factor— pero sí el seguimiento.
                    </p>
                    {facturasConFactor(c).map(f => (
                      <div key={f.documento_id} className="flex items-center justify-between gap-3 flex-wrap">
                        <label className="flex items-center gap-2 text-xs text-gray-600">
                          <input
                            type="checkbox"
                            checked={factorEdit[f.documento_id]?.pagado ?? false}
                            onChange={e => setFactorEdit(prev => ({
                              ...prev,
                              [f.documento_id]: { pagado: e.target.checked, fecha: prev[f.documento_id]?.fecha ?? '' },
                            }))}
                          />
                          <span className="font-mono">{f.comprobante}</span>
                          <span className="text-gray-400">{fmt(f.monto_canje)}</span>
                        </label>
                        <input
                          type="date"
                          disabled={!(factorEdit[f.documento_id]?.pagado ?? false)}
                          value={factorEdit[f.documento_id]?.fecha ?? ''}
                          onChange={e => setFactorEdit(prev => ({
                            ...prev,
                            [f.documento_id]: { pagado: prev[f.documento_id]?.pagado ?? false, fecha: e.target.value },
                          }))}
                          className="px-2 py-1 border border-gray-200 rounded-lg text-sm disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                        />
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => guardarPagoAlFactor(c)}
                        disabled={guardandoFactor}
                        className="px-4 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}
                      >
                        {guardandoFactor ? 'Guardando…' : 'Guardar'}
                      </button>
                      <button
                        onClick={() => setEditandoFactor(null)}
                        className="px-4 py-1.5 rounded-lg text-sm text-gray-500 border border-gray-200 hover:bg-gray-50"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : facturasConFactor(c).length > 0 ? (
                  <button
                    onClick={() => abrirPagoAlFactor(c)}
                    className="mt-3 mr-4 text-xs text-logisalud-teal hover:underline font-medium"
                  >
                    Pago del cliente al factor
                  </button>
                ) : null}

                {puedeAnular && !c.anulado && (
                  anulandoId === c.id ? (
                    <div className="mt-3 p-3 rounded-lg bg-red-50/40 border border-red-100 space-y-2">
                      {c.facturas.some(f => f.estado === 'ingresada') && (
                        <p className="text-xs text-red-700">
                          Este canje ya tuvo ingreso al banco. Anularlo <strong>también anula el ingreso</strong> y
                          borra sus pagos: las facturas vuelven a la cartera con su saldo pendiente.
                        </p>
                      )}
                      <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo de la anulación"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      <div className="flex gap-2">
                        <button onClick={() => confirmarAnulacion(c)} className="px-4 py-1.5 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700">Confirmar</button>
                        <button onClick={() => { setAnulandoId(null); setMotivo(''); }} className="px-4 py-1.5 rounded-lg text-sm text-gray-500 border border-gray-200 hover:bg-gray-50">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setAnulandoId(c.id)} className="mt-3 text-xs text-gray-400 hover:text-red-600 font-medium">Anular canje</button>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Tab 2: Ingreso al banco ─────────────────────────

function TabIngreso({ puedeAnular }: { puedeAnular: boolean }) {
  const b = useBuscadorCliente();
  const [facturas, setFacturas] = useState<FacturaCliente[]>([]);
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());

  const [entidad, setEntidad] = useState('');
  const [fechaIngreso, setFechaIngreso] = useState(hoy());
  const [montoNeto, setMontoNeto] = useState('');
  const [referencia, setReferencia] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [registradoPor, setRegistradoPor] = useState('');

  const [montoGarantia, setMontoGarantia] = useState('');
  const [montoComision, setMontoComision] = useState('');
  const [comisionIncluyeIgv, setComisionIncluyeIgv] = useState(true);
  const [comisionFactura, setComisionFactura] = useState('');
  const [montoOtros, setMontoOtros] = useState('');
  const [otrosObs, setOtrosObs] = useState('');

  const [guardando, setGuardando] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [exitoMsg, setExitoMsg] = useState('');

  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [cargandoHist, setCargandoHist] = useState(true);
  const [anulandoId, setAnulandoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    const g = localStorage.getItem('registrado_por');
    if (g) setRegistradoPor(g);
  }, []);

  const cargarHistorial = useCallback(async () => {
    setCargandoHist(true);
    const res = await fetch('/api/factoring/ingresos', { cache: 'no-store' });
    const d = await res.json();
    setIngresos(d.ingresos ?? []);
    setCargandoHist(false);
  }, []);
  useEffect(() => { cargarHistorial(); }, [cargarHistorial]);

  useEffect(() => {
    if (!b.seleccionado) { setFacturas([]); setSeleccionadas(new Set()); return; }
    (async () => {
      const res = await fetch(`/api/factoring/facturas-cliente?cliente_ruc=${b.seleccionado!.cliente_ruc}`, { cache: 'no-store' });
      const d = await res.json();
      setFacturas((d.facturas ?? []).filter((f: FacturaCliente) => f.en_factoring));
      setSeleccionadas(new Set());
    })();
  }, [b.seleccionado]);

  const toggle = (id: string) => setSeleccionadas(prev => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });

  const totalSeleccionado = facturas.filter(f => seleccionadas.has(f.id)).reduce((s, f) => s + (f.monto_canje ?? f.saldo_pendiente), 0);

  const limpiarForm = () => {
    setSeleccionadas(new Set()); setEntidad(''); setFechaIngreso(hoy()); setMontoNeto('');
    setReferencia(''); setObservaciones('');
    setMontoGarantia(''); setMontoComision(''); setComisionFactura(''); setMontoOtros(''); setOtrosObs('');
    b.limpiar();
  };

  const registrar = async () => {
    if (!b.seleccionado) { setErrMsg('Selecciona un cliente.'); return; }
    if (seleccionadas.size === 0) { setErrMsg('Selecciona al menos una factura en factoring.'); return; }
    if (!entidad.trim()) { setErrMsg('Indica la entidad de factoring.'); return; }
    if (!montoNeto || Number(montoNeto) < 0) { setErrMsg('Indica el monto neto recibido.'); return; }
    if (!registradoPor.trim()) { setErrMsg('Indica quién registra el ingreso.'); return; }
    localStorage.setItem('registrado_por', registradoPor.trim());

    const gastos = [
      Number(montoGarantia) > 0 ? { tipo: 'garantia' as const, monto: Number(montoGarantia) } : null,
      Number(montoComision) > 0 ? { tipo: 'comision' as const, monto: Number(montoComision), incluye_igv: comisionIncluyeIgv, numero_factura: comisionFactura.trim() || undefined } : null,
      Number(montoOtros) > 0 ? { tipo: 'otros' as const, monto: Number(montoOtros), observaciones: otrosObs.trim() || undefined } : null,
    ].filter((g): g is NonNullable<typeof g> => g !== null);

    setGuardando(true); setErrMsg(''); setExitoMsg('');
    try {
      const res = await fetch('/api/factoring/ingresos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entidad: entidad.trim(), fecha_ingreso: fechaIngreso, monto_neto_recibido: Number(montoNeto),
          referencia: referencia.trim() || undefined, observaciones: observaciones.trim() || undefined,
          registrado_por: registradoPor.trim(), documento_ids: Array.from(seleccionadas), gastos,
        }),
      });
      const d = await res.json();
      if (d.error) { setErrMsg(d.error); return; }
      setExitoMsg(`✓ Ingreso registrado: ${seleccionadas.size} ${seleccionadas.size === 1 ? 'factura' : 'facturas'} por ${fmt(totalSeleccionado)}.`);
      limpiarForm();
      await cargarHistorial();
    } finally { setGuardando(false); }
  };

  const confirmarAnulacion = async (i: Ingreso) => {
    if (!motivo.trim()) { alert('Indica el motivo.'); return; }
    const res = await fetch(`/api/factoring/ingresos/${i.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anulado_motivo: motivo.trim() }),
    });
    const d = await res.json();
    if (d.error) { alert(d.error); return; }
    setAnulandoId(null); setMotivo('');
    await cargarHistorial();
  };

  const GASTO_LABEL: Record<string, string> = { garantia: 'Garantía de transacción', comision: 'Comisión', otros: 'Otros gastos' };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-oswald text-base text-gray-700 tracking-wide">Registrar ingreso al banco</h3>
          <p className="text-xs text-gray-400 mt-0.5">Crea un pago real por cada factura — el saldo baja a 0, como cualquier pago normal.</p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Cliente *</label>
            <BuscadorCliente b={b} placeholder="RUC o razón social…" />
          </div>

          {b.seleccionado && (
            <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
              {facturas.length === 0 ? (
                <p className="text-sm text-gray-400 p-3">Este cliente no tiene facturas en factoring (canjéalas primero en el paso 1).</p>
              ) : facturas.map(f => (
                <label key={f.id} className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50">
                  <div className="flex items-center gap-3 min-w-0">
                    <input type="checkbox" checked={seleccionadas.has(f.id)} onChange={() => toggle(f.id)} />
                    <div className="min-w-0">
                      <span className="font-mono text-sm text-gray-700">{f.comprobante}</span>
                      <p className="text-xs text-gray-400">
                        Vence {fmtFecha(f.fecha_vencimiento)}
                        {f.monto_canje != null && f.monto_canje < f.saldo_pendiente && (
                          <span className="text-gray-400"> · saldo factura {fmt(f.saldo_pendiente)}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-gray-800 shrink-0">{fmt(f.monto_canje ?? f.saldo_pendiente)}</span>
                </label>
              ))}
              {seleccionadas.size > 0 && (
                <div className="flex justify-between px-3 py-2 bg-gray-50 font-semibold text-sm">
                  <span>Total canjeado</span>
                  <span style={{ color: '#4BB168' }}>{fmt(totalSeleccionado)}</span>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Entidad de factoring *</label>
              <input type="text" value={entidad} onChange={e => setEntidad(e.target.value)} placeholder="Ej. Caja Trujillo…"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Fecha del ingreso *</label>
              <input type="date" value={fechaIngreso} onChange={e => setFechaIngreso(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Monto neto recibido *</label>
              <input type="number" min="0" step="0.01" value={montoNeto} onChange={e => setMontoNeto(e.target.value)} placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-logisalud-teal" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">N° de operación (opcional)</label>
              <input type="text" value={referencia} onChange={e => setReferencia(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Observaciones (opcional)</label>
              <input type="text" value={observaciones} onChange={e => setObservaciones(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal" />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-500 mb-2 font-medium">Gasto financiero (opcional, deja en 0 lo que no aplique)</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Garantía de transacción</label>
                <input type="number" min="0" step="0.01" value={montoGarantia} onChange={e => setMontoGarantia(e.target.value)} placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-logisalud-teal" />
                <p className="text-[11px] text-gray-400 mt-1">Retención del banco, a recuperar después.</p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Comisión de la entidad</label>
                <input type="number" min="0" step="0.01" value={montoComision} onChange={e => setMontoComision(e.target.value)} placeholder="0.00 (inc. IGV)"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-logisalud-teal" />
                {Number(montoComision) > 0 && (
                  <div className="mt-1.5 space-y-1">
                    <label className="flex items-center gap-1.5 text-[11px] text-gray-500">
                      <input type="checkbox" checked={comisionIncluyeIgv} onChange={e => setComisionIncluyeIgv(e.target.checked)} />
                      Incluye IGV
                    </label>
                    <input type="text" value={comisionFactura} onChange={e => setComisionFactura(e.target.value)} placeholder="N° de factura"
                      className="w-full px-2 py-1 border border-gray-200 rounded text-xs" />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Otros gastos financieros</label>
                <input type="number" min="0" step="0.01" value={montoOtros} onChange={e => setMontoOtros(e.target.value)} placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-logisalud-teal" />
                {Number(montoOtros) > 0 && (
                  <input type="text" value={otrosObs} onChange={e => setOtrosObs(e.target.value)} placeholder="Detalle"
                    className="w-full mt-1.5 px-2 py-1 border border-gray-200 rounded text-xs" />
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">¿Quién registra? *</label>
            <input type="text" value={registradoPor} onChange={e => setRegistradoPor(e.target.value)} placeholder="Tu nombre"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal" />
          </div>

          {errMsg && <p className="text-sm text-red-600">{errMsg}</p>}
          {exitoMsg && <p className="text-sm text-green-600">{exitoMsg}</p>}

          <button onClick={registrar} disabled={guardando}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition"
            style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
            {guardando ? 'Guardando…' : 'Registrar ingreso al banco'}
          </button>
        </div>
      </div>

      <div>
        <h3 className="font-oswald text-base text-gray-700 tracking-wide mb-2">Historial de ingresos</h3>
        {cargandoHist ? (
          <div className="text-center py-8 text-gray-400 text-sm">Cargando…</div>
        ) : ingresos.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-400 text-sm">Sin ingresos registrados.</div>
        ) : (
          <div className="space-y-3">
            {ingresos.map(i => {
              const totalFacturado = i.facturas.reduce((s, f) => s + Number(f.monto_factorizado), 0);
              return (
                <div key={i.id} className={`bg-white rounded-xl border border-gray-200 p-4 ${i.anulado ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-semibold text-gray-800">
                        {i.entidad}
                        {i.anulado && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">Anulado</span>}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {fmtFecha(i.fecha_ingreso)}{i.registrado_por && <> · {i.registrado_por}</>}{i.referencia && <> · {i.referencia}</>}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-oswald text-lg" style={{ color: '#4BB168' }}>{fmt(i.monto_neto_recibido)}</p>
                      <p className="text-xs text-gray-400">neto recibido · facturado {fmt(totalFacturado)}</p>
                    </div>
                  </div>
                  {i.gastos.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {i.gastos.map((g, idx) => (
                        <span key={idx} className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                          {GASTO_LABEL[g.tipo]}: {fmt(Number(g.monto))}
                        </span>
                      ))}
                    </div>
                  )}
                  {i.observaciones && <p className="text-xs text-gray-500 mt-1 italic">{i.observaciones}</p>}
                  {i.anulado && i.anulado_motivo && <p className="text-xs text-red-500 mt-1">Motivo: {i.anulado_motivo}</p>}
                  <div className="mt-2 divide-y divide-gray-50 border-t border-gray-100">
                    {i.facturas.map(f => (
                      <div key={f.documento_id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                        <div className="min-w-0">
                          <span className="font-mono text-gray-700">{f.comprobante ?? '—'}</span>
                          <span className="text-gray-400 text-xs ml-2 truncate">{f.razon_social}</span>
                        </div>
                        <span className="text-gray-700 shrink-0">{fmt(Number(f.monto_factorizado))}</span>
                      </div>
                    ))}
                  </div>
                  {puedeAnular && !i.anulado && (
                    anulandoId === i.id ? (
                      <div className="mt-3 p-3 rounded-lg bg-red-50/40 border border-red-100 space-y-2">
                        <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo de la anulación"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                        <div className="flex gap-2">
                          <button onClick={() => confirmarAnulacion(i)} className="px-4 py-1.5 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700">Confirmar</button>
                          <button onClick={() => { setAnulandoId(null); setMotivo(''); }} className="px-4 py-1.5 rounded-lg text-sm text-gray-500 border border-gray-200 hover:bg-gray-50">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setAnulandoId(i.id)} className="mt-3 text-xs text-gray-400 hover:text-red-600 font-medium">Anular ingreso</button>
                    )
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Tab 3: Reporte ─────────────────────────

function TabReporte() {
  const b = useBuscadorCliente();
  const [filas, setFilas] = useState<FilaReporte[]>([]);
  const [total, setTotal] = useState(0);
  const [porCliente, setPorCliente] = useState<{ cliente_ruc: string; razon_social: string; monto: number; documentos: number }[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    const p = new URLSearchParams();
    if (b.seleccionado) p.set('cliente_ruc', b.seleccionado.cliente_ruc);
    const res = await fetch(`/api/factoring/reporte?${p.toString()}`, { cache: 'no-store' });
    const d = await res.json();
    setFilas(d.filas ?? []); setTotal(d.total ?? 0); setPorCliente(d.porCliente ?? []);
    setCargando(false);
  }, [b.seleccionado]);
  useEffect(() => { cargar(); }, [cargar]);

  const exportUrl = (() => {
    const p = new URLSearchParams();
    if (b.seleccionado) p.set('cliente_ruc', b.seleccionado.cliente_ruc);
    return `/api/exportar/factoring-reporte?${p.toString()}`;
  })();

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-end justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs text-gray-500 mb-1">Filtrar por cliente (opcional)</label>
          <BuscadorCliente b={b} placeholder="RUC o razón social…" />
        </div>
        <a href={exportUrl} className="px-3 py-2 text-xs font-medium rounded-lg text-white transition"
          style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
          📥 Descargar Excel
        </a>
      </div>

      {!cargando && (
        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-white rounded-xl border border-gray-200 p-3.5">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider">Facturas en factoring</p>
            <p className="font-oswald text-xl mt-0.5 text-gray-700">{filas.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3.5">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider">Monto total</p>
            <p className="font-oswald text-xl mt-0.5" style={{ color: '#4BB168' }}>{fmt(total)}</p>
          </div>
        </div>
      )}

      {!cargando && !b.seleccionado && porCliente.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 text-xs uppercase tracking-wide text-gray-500 font-semibold">Por cliente</div>
          <div className="divide-y divide-gray-100">
            {porCliente.map(c => (
              <div key={c.cliente_ruc} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <div className="min-w-0">
                  <p className="text-gray-700 truncate">{c.razon_social}</p>
                  <p className="text-xs text-gray-400">{c.documentos} {c.documentos === 1 ? 'factura' : 'facturas'}</p>
                </div>
                <span className="font-semibold text-gray-800 shrink-0">{fmt(c.monto)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {cargando ? (
        <div className="text-center py-10 text-gray-400 text-sm">Cargando…</div>
      ) : filas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">No hay facturas en factoring.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2.5 text-left">Comprobante</th>
                <th className="px-3 py-2.5 text-left">Cliente</th>
                <th className="px-3 py-2.5 text-left">Vencimiento</th>
                <th className="px-3 py-2.5 text-right">Monto</th>
                <th className="px-3 py-2.5 text-left">Canjeada</th>
                <th className="px-3 py-2.5 text-right">Días en factoring</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filas.map(f => (
                <tr key={f.documento_id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">{f.comprobante}</td>
                  <td className="px-3 py-2">
                    <p className="text-gray-800 truncate max-w-[220px]">{f.razon_social}</p>
                    <p className="text-xs text-gray-400">{f.cliente_ruc}</p>
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtFecha(f.fecha_vencimiento)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-800">{fmt(f.monto)}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtFecha(f.fecha_canje)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">{f.dias_en_factoring}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
