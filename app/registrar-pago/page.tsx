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
  total_nc: number;
  total_nd: number;
  total_pagado: number;
  saldo_pendiente: number;
  rango_vencimiento: string;
  tiene_letras: boolean;
  forma_pago: string | null;
  contado_pendiente: boolean;
}

interface NcNd {
  id: string;
  tipo: string;
  serie: string;
  numero: number;
  fecha_emision: string;
  importe_total: number;
}

interface Letra {
  id: string;
  numero_letra: string;
  importe: number;
  fecha_vencimiento: string;
  estado: string;
  banco: string | null;
  voucher_path: string | null;
}

interface Pago {
  id: string;
  monto: number;
  fecha_pago: string;
  referencia: string | null;
  voucher_path: string | null;
  tipo?: 'pago' | 'retencion';
  registrado_por?: string | null;
}

interface PagoBuscar {
  id: string;
  monto: number;
  fecha_pago: string;
  referencia: string | null;
  documento_id: string;
  documentos: { comprobante: string; cliente_ruc: string; razon_social: string } | null;
}

const fmt = (n: number) =>
  'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtFecha = (s: string | null) => {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};

const hoy = () => new Date().toISOString().split('T')[0];

const ESTADO_STYLE: Record<string, string> = {
  en_cartera: 'bg-gray-100 text-gray-600',
  en_banco:   'bg-teal-100 text-teal-700',
  pagada:     'bg-green-100 text-green-700',
  protestada: 'bg-red-100 text-red-700',
};

function FileUpload({
  archivo, previewUrl, subiendo, voucherPath, onChange,
}: {
  archivo: File | null;
  previewUrl: string | null;
  subiendo: boolean;
  voucherPath: string | null;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">Voucher (foto o PDF) — opcional</label>
      <label className="flex items-center gap-3 px-4 py-3 border-2 border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-logisalud-teal transition">
        <span className="text-2xl">📎</span>
        <div className="flex-1 min-w-0">
          {archivo ? (
            <p className="text-sm text-gray-700 truncate font-medium">{archivo.name}</p>
          ) : (
            <p className="text-sm text-gray-400">Selecciona imagen o PDF</p>
          )}
          {subiendo && <p className="text-xs text-gray-400 mt-0.5">Subiendo al servidor…</p>}
          {voucherPath && !subiendo && <p className="text-xs text-green-600 mt-0.5">✓ Voucher listo</p>}
        </div>
        {previewUrl && (
          <img src={previewUrl} alt="preview" className="h-14 w-14 object-cover rounded border ml-auto shrink-0" />
        )}
        <input type="file" accept="image/*,.pdf" onChange={onChange} className="hidden" />
      </label>
    </div>
  );
}

export default function RegistrarPagoPage() {
  const [busqueda, setBusqueda]         = useState('');
  const [sugerencias, setSugerencias]   = useState<FacturaBuscar[]>([]);
  const [sugerenciasPagos, setSugerenciasPagos] = useState<PagoBuscar[]>([]);
  const [tipoBusqueda, setTipoBusqueda] = useState<'texto' | 'monto'>('texto');
  const [buscando, setBuscando]         = useState(false);
  const [factura, setFactura]           = useState<FacturaBuscar | null>(null);
  const [letras, setLetras]             = useState<Letra[]>([]);
  const [pagos, setPagos]               = useState<Pago[]>([]);
  const [ncnds, setNcnds]               = useState<NcNd[]>([]);
  const [cargando, setCargando]         = useState(false);

  const [letraSelId, setLetraSelId]     = useState<string | null>(null);
  const [monto, setMonto]               = useState('');
  const [conRetencion, setConRetencion] = useState(false);
  const [retencion, setRetencion]       = useState('');
  const [modoSoloRet, setModoSoloRet]   = useState(false);
  const [soloRetMonto, setSoloRetMonto] = useState('');
  const [fechaPago, setFechaPago]       = useState(hoy());
  const [referencia, setReferencia]     = useState('');
  const [registradoPor, setRegistradoPor] = useState('');
  const [medioCobro, setMedioCobro]     = useState<'transferencia' | 'efectivo'>('transferencia');
  const [archivo, setArchivo]           = useState<File | null>(null);
  const [voucherPath, setVoucherPath]   = useState<string | null>(null);
  const [previewUrl, setPreviewUrl]     = useState<string | null>(null);
  const [subiendo, setSubiendo]         = useState(false);
  const [guardando, setGuardando]       = useState(false);
  const [errMsg, setErrMsg]             = useState('');
  const [exitoMsg, setExitoMsg]         = useState('');

  // Estado para edición inline de pagos
  const [editandoId, setEditandoId]     = useState<string | null>(null);
  const [editMonto, setEditMonto]       = useState('');
  const [editFecha, setEditFecha]       = useState('');
  const [editRef, setEditRef]           = useState('');
  const [editRegistradoPor, setEditRegistradoPor] = useState('');
  const [editArchivo, setEditArchivo]   = useState<File | null>(null);
  const [editVoucher, setEditVoucher]   = useState<string | null>(null);
  const [editPreview, setEditPreview]   = useState<string | null>(null);
  const [editSubiendo, setEditSubiendo] = useState(false);
  const [editGuardando, setEditGuardando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [togContado, setTogContado]     = useState(false);

  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevUrlRef = useRef<string | null>(null);
  const enviandoRef = useRef(false); // guarda anti doble-envío (antes del re-render)

  useEffect(() => {
    const guardado = localStorage.getItem('registrado_por');
    if (guardado) setRegistradoPor(guardado);
  }, []);

  useEffect(() => {
    prevUrlRef.current = previewUrl;
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    };
  }, []);

  const buscarDebounced = useCallback((q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (q.length < 2) { setSugerencias([]); setSugerenciasPagos([]); return; }
      setBuscando(true);
      const res = await fetch(`/api/facturas/buscar?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      const d   = await res.json();
      setSugerencias(d.facturas ?? []);
      setSugerenciasPagos(d.pagos ?? []);
      setTipoBusqueda(d.tipoBusqueda ?? 'texto');
      setBuscando(false);
    }, 280);
  }, []);

  const onBusquedaChange = (v: string) => {
    setBusqueda(v);
    if (factura) { setFactura(null); setLetras([]); setPagos([]); setNcnds([]); }
    if (!v.trim()) { setSugerencias([]); setSugerenciasPagos([]); }
    buscarDebounced(v);
  };

  const cargarDetalle = useCallback(async (f: FacturaBuscar) => {
    setCargando(true);
    const opts = { cache: 'no-store' } as RequestInit;
    const [resL, resP, resNC] = await Promise.all([
      fetch(`/api/letras?documento_id=${f.id}`, opts).then(r => r.json()),
      fetch(`/api/pagos?documento_id=${f.id}`, opts).then(r => r.json()),
      fetch(`/api/facturas/${f.id}/nc-nd`, opts).then(r => r.json()),
    ]);
    setLetras(resL.letras ?? []);
    setPagos(resP.pagos ?? []);
    setNcnds(resNC.documentos ?? []);
    setCargando(false);
  }, []);

  const seleccionarFactura = async (f: FacturaBuscar) => {
    setSugerencias([]);
    setSugerenciasPagos([]);
    setBusqueda(`${f.comprobante} — ${f.razon_social}`);
    setErrMsg(''); setExitoMsg('');
    setLetraSelId(null); setMonto(''); setFechaPago(hoy()); setReferencia('');
    setArchivo(null); setVoucherPath(null); setPreviewUrl(null);
    setEditandoId(null); setTogContado(false); setMedioCobro('transferencia');
    // Fetch fresco para no mostrar el saldo cacheado del buscador
    const res = await fetch(`/api/facturas/${f.id}`, { cache: 'no-store' });
    const d   = await res.json();
    const fresca = d.factura ?? f;
    setFactura(fresca);
    await cargarDetalle(fresca);
  };

  const toggleContadoPendiente = async (fActual: FacturaBuscar) => {
    setTogContado(true);
    try {
      const nuevo = !fActual.contado_pendiente;
      const res = await fetch(`/api/documentos/${fActual.id}/contado-pendiente`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contado_pendiente: nuevo }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      await recargar(fActual);
    } catch (e) { alert(String(e)); }
    finally { setTogContado(false); }
  };

  const recargar = useCallback(async (fActual: FacturaBuscar) => {
    const res = await fetch(`/api/facturas/${fActual.id}`, { cache: 'no-store' });
    const d   = await res.json();
    if (d.factura) setFactura(d.factura);
    await cargarDetalle(d.factura ?? fActual);
  }, [cargarDetalle]);

  const onArchivoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    setArchivo(file);
    setVoucherPath(null);
    setErrMsg('');
    const url = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    setPreviewUrl(url);
    setSubiendo(true);
    const fd = new FormData();
    fd.append('file', file);
    const res  = await fetch('/api/pagos/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.error) { setErrMsg(`Error al subir: ${data.error}`); setSubiendo(false); return; }
    setVoucherPath(data.path);
    setSubiendo(false);
  };

  const onEditArchivoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditArchivo(file);
    setEditVoucher(null);
    const url = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    setEditPreview(url);
    setEditSubiendo(true);
    const fd = new FormData();
    fd.append('file', file);
    const res  = await fetch('/api/pagos/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.error) { alert(`Error al subir: ${data.error}`); setEditSubiendo(false); return; }
    setEditVoucher(data.path);
    setEditSubiendo(false);
  };

  const limpiarForm = () => {
    setMonto(''); setReferencia(''); setFechaPago(hoy());
    setArchivo(null); setVoucherPath(null); setPreviewUrl(null);
    setLetraSelId(null);
    setConRetencion(false); setRetencion('');
    setModoSoloRet(false); setSoloRetMonto('');
    setMedioCobro('transferencia');
  };

  // Al activar la retención: precarga el 3% del importe total y sugiere el
  // depósito (97%). Al desactivarla, limpia la retención.
  const toggleRetencion = () => {
    if (!factura) return;
    if (!conRetencion) {
      const imp = Number(factura.importe_total);
      const ret = Math.round(imp * 0.03 * 100) / 100;
      setRetencion(ret.toFixed(2));
      setMonto((imp - ret).toFixed(2));
      setConRetencion(true);
    } else {
      setConRetencion(false);
      setRetencion('');
    }
  };

  // Al editar el monto de retención, recalcula el depósito sugerido (97%)
  // para que pago + retención sigan cubriendo el importe total.
  const onRetencionChange = (v: string) => {
    setRetencion(v);
    if (factura) {
      const imp = Number(factura.importe_total);
      const ret = Number(v) || 0;
      setMonto((imp - ret).toFixed(2));
    }
  };

  const registrarPagoFactura = async () => {
    if (!factura || enviandoRef.current) return;
    if (!monto || Number(monto) <= 0)  { setErrMsg('El monto debe ser mayor a 0.');        return; }
    if (conRetencion && Number(retencion) <= 0) { setErrMsg('La retención debe ser mayor a 0.'); return; }
    if (!registradoPor.trim()) { setErrMsg('Indica quién registra este pago.'); return; }
    localStorage.setItem('registrado_por', registradoPor.trim());
    enviandoRef.current = true;
    setGuardando(true); setErrMsg(''); setExitoMsg('');
    try {
      const res = await fetch('/api/pagos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documento_id: factura.id,
          monto: Number(monto),
          fecha_pago: fechaPago,
          referencia: referencia.trim() || undefined,
          registrado_por: registradoPor.trim(),
          medio_cobro: medioCobro,
          ...(voucherPath ? { voucher_path: voucherPath } : {}),
          ...(conRetencion && Number(retencion) > 0 ? { retencion: Number(retencion) } : {}),
        }),
      });
      const d = await res.json();
      if (d.error) { setErrMsg(d.error); return; }
      setExitoMsg(conRetencion
        ? `✓ Pago de ${fmt(Number(monto))} + retención IGV de ${fmt(Number(retencion))} registrados.`
        : `✓ Pago de ${fmt(Number(monto))} registrado correctamente.`);
      limpiarForm();
      await recargar(factura);
    } finally {
      enviandoRef.current = false;
      setGuardando(false);
    }
  };

  // Abre el modo "solo retención": precarga el monto con el saldo pendiente
  // actual (que en estos casos es justo el 3% que falta), editable.
  const abrirSoloRetencion = () => {
    if (!factura) return;
    setSoloRetMonto(Number(factura.saldo_pendiente).toFixed(2));
    setModoSoloRet(true);
    setErrMsg(''); setExitoMsg('');
  };

  const registrarSoloRetencion = async () => {
    if (!factura || enviandoRef.current) return;
    if (!soloRetMonto || Number(soloRetMonto) <= 0) { setErrMsg('La retención debe ser mayor a 0.'); return; }
    if (!registradoPor.trim()) { setErrMsg('Indica quién registra este pago.'); return; }
    localStorage.setItem('registrado_por', registradoPor.trim());
    enviandoRef.current = true;
    setGuardando(true); setErrMsg(''); setExitoMsg('');
    try {
      const res = await fetch('/api/pagos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documento_id: factura.id,
          monto: Number(soloRetMonto),
          fecha_pago: fechaPago,
          solo_retencion: true,
          registrado_por: registradoPor.trim(),
        }),
      });
      const d = await res.json();
      if (d.error) { setErrMsg(d.error); return; }
      setExitoMsg(`✓ Retención IGV de ${fmt(Number(soloRetMonto))} registrada.`);
      limpiarForm();
      await recargar(factura);
    } finally {
      enviandoRef.current = false;
      setGuardando(false);
    }
  };

  const registrarPagoLetra = async () => {
    if (!factura || enviandoRef.current) return;
    if (!letraSelId) { setErrMsg('Selecciona una letra.'); return; }
    enviandoRef.current = true;
    setGuardando(true); setErrMsg(''); setExitoMsg('');
    try {
      const res = await fetch(`/api/letras/${letraSelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'pagada', fecha_pago: fechaPago, voucher_path: voucherPath }),
      });
      const d = await res.json();
      if (d.error) { setErrMsg(d.error); return; }
      const num = letras.find(l => l.id === letraSelId)?.numero_letra ?? '';
      setExitoMsg(`✓ Letra ${num} marcada como pagada.`);
      limpiarForm();
      await recargar(factura);
    } finally {
      enviandoRef.current = false;
      setGuardando(false);
    }
  };

  const verVoucher = async (path: string) => {
    const res = await fetch(`/api/pagos/voucher-url?path=${encodeURIComponent(path)}`);
    const d   = await res.json();
    if (d.url) window.open(d.url, '_blank');
    else alert('No se pudo obtener el voucher.');
  };

  const abrirEdicion = (p: Pago) => {
    setEditandoId(p.id);
    setEditMonto(String(p.monto));
    setEditFecha(p.fecha_pago);
    setEditRef(p.referencia ?? '');
    setEditRegistradoPor(p.registrado_por ?? '');
    setEditArchivo(null); setEditVoucher(null); setEditPreview(null);
  };

  const guardarEdicion = async (p: Pago) => {
    if (!editMonto || Number(editMonto) <= 0) { alert('El monto debe ser mayor a 0.'); return; }
    setEditGuardando(true);
    const body: Record<string, unknown> = {
      monto: Number(editMonto),
      fecha_pago: editFecha,
      referencia: editRef.trim() || null,
      registrado_por: editRegistradoPor.trim() || null,
    };
    if (editVoucher) body.voucher_path = editVoucher;
    const res = await fetch(`/api/pagos/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (d.error) { alert(d.error); setEditGuardando(false); return; }
    setPagos(prev => prev.map(x => x.id === p.id ? d.pago : x));
    setEditandoId(null);
    setEditGuardando(false);
    if (factura) await recargar(factura);
  };

  const eliminarPago = async (p: Pago) => {
    if (!confirm(`¿Eliminar el pago de ${fmt(Number(p.monto))} del ${fmtFecha(p.fecha_pago)}?`)) return;
    setEliminandoId(p.id);
    const res = await fetch(`/api/pagos/${p.id}`, { method: 'DELETE' });
    const d   = await res.json();
    if (d.error) { alert(d.error); setEliminandoId(null); return; }
    setPagos(prev => prev.filter(x => x.id !== p.id));
    setEliminandoId(null);
    if (factura) await recargar(factura);
  };

  const letrasPendientes = letras.filter(l => l.estado !== 'pagada');
  const letraSel         = letras.find(l => l.id === letraSelId);
  const esContado        = factura?.forma_pago === 'CONTADO';

  // Desglose: separa pagos reales de la retención de IGV (ambos viven en pagos)
  const totalRetencion   = pagos.filter(p => p.tipo === 'retencion').reduce((s, p) => s + Number(p.monto), 0);
  const totalPagoReal    = pagos.filter(p => p.tipo !== 'retencion').reduce((s, p) => s + Number(p.monto), 0);

  return (
    <div className="min-h-screen bg-gray-50 font-poppins">

      <header className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-oswald tracking-wide">LOGISALUD</h1>
            <p className="text-white/70 text-sm">Registrar pago con voucher</p>
          </div>
          <a href="/" className="text-white/80 hover:text-white text-sm">&larr; Menú</a>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">

        {/* Buscador */}
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Buscar por comprobante, RUC, razón social o monto
          </label>
          <input
            type="text"
            value={busqueda}
            onChange={e => onBusquedaChange(e.target.value)}
            placeholder="Ej: FFF1-1211 · 20601234567 · FARMACIA · 257.79"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal bg-white"
          />
          {buscando && <span className="absolute right-3 top-9 text-xs text-gray-400">Buscando…</span>}
          {(sugerencias.length > 0 || sugerenciasPagos.length > 0) && (
            <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden divide-y divide-gray-100">
              {tipoBusqueda === 'monto' && sugerencias.length > 0 && (
                <li className="px-4 py-1.5 bg-gray-50">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Facturas con ese importe o saldo</span>
                </li>
              )}
              {sugerencias.map(f => (
                <li key={f.id}>
                  <button
                    onClick={() => seleccionarFactura(f)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-logisalud-green text-sm">{f.comprobante}</span>
                        {f.tiene_letras && (
                          <span className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full">Con letras</span>
                        )}
                        {f.forma_pago === 'CONTADO' && f.contado_pendiente && (
                          <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">Cdo. pendiente</span>
                        )}
                        {f.forma_pago === 'CONTADO' && !f.contado_pendiente && (
                          <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">CONTADO</span>
                        )}
                      </div>
                      <p className="text-gray-600 text-xs truncate mt-0.5">{f.razon_social}</p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      {tipoBusqueda === 'monto' && (
                        <p className="text-xs text-gray-500">importe: <span className="font-semibold">{fmt(Number(f.importe_total))}</span></p>
                      )}
                      <p className={`text-sm font-bold ${Number(f.saldo_pendiente) > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                        {fmt(Number(f.saldo_pendiente))}
                      </p>
                      <p className="text-xs text-gray-400">saldo</p>
                    </div>
                  </button>
                </li>
              ))}
              {sugerenciasPagos.length > 0 && (
                <>
                  <li className="px-4 py-1.5 bg-gray-50 border-t border-gray-100">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Pagos ya registrados con ese monto</span>
                  </li>
                  {sugerenciasPagos.map(p => (
                    <li key={p.id} className="px-4 py-3 flex items-center justify-between gap-4 bg-blue-50/30">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-blue-700 text-sm">{fmt(p.monto)}</span>
                          <span className="text-xs text-gray-400">{fmtFecha(p.fecha_pago)}</span>
                          {p.referencia && <span className="text-xs text-gray-500">Ref: {p.referencia}</span>}
                        </div>
                        {p.documentos && (
                          <p className="text-xs text-gray-600 truncate mt-0.5">
                            {p.documentos.comprobante} — {p.documentos.razon_social}
                          </p>
                        )}
                      </div>
                      {p.documentos && (
                        <button
                          onClick={() => {
                            const fake = sugerencias.find(f => f.id === p.documento_id);
                            if (fake) seleccionarFactura(fake);
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800 underline shrink-0"
                        >
                          Ver factura
                        </button>
                      )}
                    </li>
                  ))}
                </>
              )}
            </ul>
          )}
        </div>

        {errMsg   && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{errMsg}</div>}
        {exitoMsg && <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm font-medium">{exitoMsg}</div>}

        {factura && (
          <>
            {/* Tarjeta factura */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Factura</p>
                  <h2 className="font-oswald text-xl text-gray-800">{factura.comprobante}</h2>
                  <p className="text-gray-700 text-sm font-medium mt-0.5">{factura.razon_social}</p>
                  <p className="text-gray-400 text-xs">RUC {factura.cliente_ruc}</p>
                  <div className="flex gap-4 mt-2 text-xs text-gray-400">
                    <span>Emisión: <span className="text-gray-600">{fmtFecha(factura.fecha_emision)}</span></span>
                    {factura.fecha_vencimiento && (
                      <span>Vencimiento: <span className="text-gray-600">{fmtFecha(factura.fecha_vencimiento)}</span></span>
                    )}
                  </div>
                  {/* Estado forma de pago */}
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {esContado ? (
                      factura.contado_pendiente ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200">
                          ⏳ CONTADO · Pendiente de cobro
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-500">
                          CONTADO
                        </span>
                      )
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-600">
                        CRÉDITO
                      </span>
                    )}
                    {factura.tiene_letras && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-teal-50 text-teal-700">
                        Con letras
                      </span>
                    )}
                  </div>
                  {/* Toggle contado_pendiente */}
                  {esContado && (
                    <div className="flex items-center gap-3 mt-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                      <button
                        disabled={togContado}
                        onClick={() => toggleContadoPendiente(factura)}
                        className={`relative w-10 h-5 rounded-full transition-colors disabled:opacity-50 focus:outline-none ${
                          factura.contado_pendiente ? 'bg-orange-400' : 'bg-gray-300'
                        }`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                          factura.contado_pendiente ? 'translate-x-5' : 'translate-x-0'
                        }`} />
                      </button>
                      <span className="text-xs text-gray-600">
                        {togContado ? 'Actualizando…' : factura.contado_pendiente
                          ? 'Pendiente de cobro — activo en cartera'
                          : 'Marcar como pendiente de cobro'}
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400 mb-0.5">Saldo pendiente</p>
                  <p className={`text-3xl font-bold ${
                    Number(factura.saldo_pendiente) > 0 ? 'text-orange-600' : 'text-green-600'
                  }`}>
                    {fmt(Number(factura.saldo_pendiente))}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">de {fmt(Number(factura.importe_total))} total</p>
                  {esContado && Number(factura.saldo_pendiente) === 0 && (
                    <p className="text-xs text-green-600 mt-1 font-medium">Saldo liquidado por v_saldos</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Desglose del saldo ──────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
                <h3 className="font-oswald text-sm text-gray-600 tracking-wide uppercase">Desglose del saldo</h3>
              </div>
              <div className="px-5 py-4 space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Importe de la factura</span>
                  <span className="font-medium text-gray-800 tabular-nums">{fmt(Number(factura.importe_total))}</span>
                </div>
                {Number(factura.total_nc) > 0 && (
                  <div className="flex justify-between items-center text-purple-700">
                    <span>(−) Notas de crédito aplicadas</span>
                    <span className="font-medium tabular-nums">− {fmt(Number(factura.total_nc))}</span>
                  </div>
                )}
                {Number(factura.total_nd) > 0 && (
                  <div className="flex justify-between items-center text-blue-700">
                    <span>(+) Notas de débito aplicadas</span>
                    <span className="font-medium tabular-nums">+ {fmt(Number(factura.total_nd))}</span>
                  </div>
                )}
                {totalPagoReal > 0 && (
                  <div className="flex justify-between items-center text-green-700">
                    <span>(−) Pagos registrados</span>
                    <span className="font-medium tabular-nums">− {fmt(totalPagoReal)}</span>
                  </div>
                )}
                {totalRetencion > 0 && (
                  <div className="flex justify-between items-center" style={{ color: '#4ABCC2' }}>
                    <span>(−) Retención IGV</span>
                    <span className="font-medium tabular-nums">− {fmt(totalRetencion)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                  <span className="font-semibold text-gray-700">(=) Saldo pendiente</span>
                  <span className={`font-bold tabular-nums text-base ${
                    Number(factura.saldo_pendiente) > 0 ? 'text-orange-600' : 'text-green-600'
                  }`}>
                    {fmt(Number(factura.saldo_pendiente))}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Lista de NC / ND ────────────────────────────────────────── */}
            {!cargando && ncnds.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="font-oswald text-base text-gray-700 tracking-wide">
                    Notas de crédito / débito aplicadas
                    <span className="ml-2 font-normal text-sm text-gray-400">({ncnds.length})</span>
                  </h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {ncnds.map(doc => {
                    const esNC = doc.tipo === '07';
                    return (
                      <div key={doc.id} className="px-5 py-3 flex items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              esNC ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {esNC ? 'NC' : 'ND'}
                            </span>
                            <span className="font-mono text-sm font-semibold text-gray-800">
                              {doc.serie}-{doc.numero}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{fmtFecha(doc.fecha_emision)}</p>
                        </div>
                        <p className={`text-sm font-semibold tabular-nums shrink-0 ${
                          esNC ? 'text-purple-700' : 'text-blue-700'
                        }`}>
                          {esNC ? '− ' : '+ '}{fmt(Number(doc.importe_total))}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {cargando ? (
              <div className="text-center py-10 text-gray-400 text-sm">Cargando…</div>
            ) : factura.tiene_letras ? (

              /* ── Modo letras ──────────────────────────────────────────────── */
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="font-oswald text-base text-gray-700 tracking-wide">Selecciona la letra que se pagó</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {letrasPendientes.length} letra{letrasPendientes.length !== 1 ? 's' : ''} pendiente{letrasPendientes.length !== 1 ? 's' : ''}
                  </p>
                </div>

                {letrasPendientes.length === 0 ? (
                  <div className="px-5 py-10 text-center text-gray-400 text-sm">Todas las letras de esta factura están pagadas.</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {letrasPendientes.map(l => (
                      <label
                        key={l.id}
                        className={`flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 transition ${
                          letraSelId === l.id ? 'bg-logisalud-green/5' : ''
                        }`}
                      >
                        <input
                          type="radio" name="letra" value={l.id}
                          checked={letraSelId === l.id}
                          onChange={() => { setLetraSelId(l.id); setErrMsg(''); setExitoMsg(''); }}
                          className="w-4 h-4 shrink-0 accent-logisalud-green"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="font-mono font-semibold text-sm text-gray-800">{l.numero_letra}</span>
                          {l.banco && <span className="ml-2 text-xs text-gray-400">{l.banco}</span>}
                          <p className="text-xs text-gray-400 mt-0.5">Vence {fmtFecha(l.fecha_vencimiento)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-semibold text-gray-900 text-sm">{fmt(Number(l.importe))}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                          ESTADO_STYLE[l.estado] ?? 'bg-gray-100 text-gray-500'
                        }`}>
                          {l.estado.replace('_', ' ')}
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {letraSelId && letraSel && (
                  <div className="px-5 py-5 border-t border-gray-100 bg-gray-50/60 space-y-4">
                    <p className="text-sm font-medium text-gray-700">
                      Registrar pago de&nbsp;
                      <span className="text-logisalud-green font-semibold">{letraSel.numero_letra}</span>
                      &nbsp;&mdash;&nbsp;{fmt(Number(letraSel.importe))}
                    </p>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Fecha de pago *</label>
                      <input
                        type="date" value={fechaPago}
                        onChange={e => setFechaPago(e.target.value)}
                        className="w-48 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                      />
                    </div>
                    <FileUpload
                      archivo={archivo} previewUrl={previewUrl}
                      subiendo={subiendo} voucherPath={voucherPath}
                      onChange={onArchivoChange}
                    />
                    <button
                      onClick={registrarPagoLetra}
                      disabled={guardando || subiendo}
                      className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition"
                      style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}
                    >
                      {guardando ? 'Registrando…' : `Marcar ${letraSel.numero_letra} como pagada`}
                    </button>
                  </div>
                )}
              </div>

            ) : (

              /* ── Modo pago directo ────────────────────────────────────────── */
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="font-oswald text-base text-gray-700 tracking-wide">Registrar pago</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {esContado ? 'Factura CONTADO — adjunta el voucher de pago' : 'Factura sin letras — pago directo'}
                  </p>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Medio de cobro</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setMedioCobro('transferencia')}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                          medioCobro === 'transferencia'
                            ? 'bg-logisalud-teal/10 border-logisalud-teal text-logisalud-teal'
                            : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        🏦 Transferencia
                      </button>
                      <button
                        type="button"
                        onClick={() => setMedioCobro('efectivo')}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                          medioCobro === 'efectivo'
                            ? 'bg-amber-50 border-amber-400 text-amber-700'
                            : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        💵 Efectivo
                      </button>
                    </div>
                    {medioCobro === 'efectivo' && (
                      <p className="text-[11px] text-amber-600 mt-1">
                        Queda como &quot;cobrado, por depositar&quot; hasta que alguien lo marque como depositado.
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Monto *</label>
                      <input
                        type="number" min="0.01" step="0.01"
                        value={monto}
                        onChange={e => setMonto(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Fecha de pago *</label>
                      <input
                        type="date" value={fechaPago}
                        onChange={e => setFechaPago(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">Referencia / N° operación</label>
                      <input
                        type="text" value={referencia}
                        onChange={e => setReferencia(e.target.value)}
                        placeholder="OP-123456"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">¿Quién registra este pago? *</label>
                      <input
                        type="text" value={registradoPor}
                        onChange={e => setRegistradoPor(e.target.value)}
                        placeholder="Tu nombre"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                      />
                    </div>
                  </div>
                  {/* Retención de IGV (3%) */}
                  <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={toggleRetencion}
                        className={`relative w-10 h-5 rounded-full transition-colors focus:outline-none ${
                          conRetencion ? '' : 'bg-gray-300'
                        }`}
                        style={conRetencion ? { background: '#4ABCC2' } : undefined}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                          conRetencion ? 'translate-x-5' : 'translate-x-0'
                        }`} />
                      </button>
                      <span className="text-sm text-gray-700">Aplica retención de IGV (3%)</span>
                    </div>

                    {conRetencion && (
                      <div className="mt-3 space-y-2">
                        <div className="flex justify-between items-center text-xs text-gray-500">
                          <span>Importe total de la factura</span>
                          <span className="tabular-nums text-gray-700">{fmt(Number(factura.importe_total))}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <label className="text-xs text-gray-500">Retención 3% (editable)</label>
                          <input
                            type="number" min="0" step="0.01"
                            value={retencion}
                            onChange={e => onRetencionChange(e.target.value)}
                            className="w-32 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                          />
                        </div>
                        <div className="flex justify-between items-center text-xs pt-1 border-t border-gray-200">
                          <span className="text-gray-500">Depósito sugerido (97%)</span>
                          <span className="tabular-nums font-semibold" style={{ color: '#4BB168' }}>{fmt(Number(monto) || 0)}</span>
                        </div>
                        <p className="text-[11px] text-gray-400">
                          Se registran dos movimientos: el depósito y la retención IGV. Juntos saldan la factura.
                        </p>
                      </div>
                    )}
                  </div>

                  <FileUpload
                    archivo={archivo} previewUrl={previewUrl}
                    subiendo={subiendo} voucherPath={voucherPath}
                    onChange={onArchivoChange}
                  />
                  <button
                    onClick={registrarPagoFactura}
                    disabled={guardando || subiendo || !monto}
                    className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition"
                    style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}
                  >
                    {guardando ? 'Registrando…' : conRetencion ? 'Registrar pago + retención' : 'Registrar pago'}
                  </button>
                </div>
              </div>
            )}

            {/* Solo retención — cuando el depósito ya se registró y solo falta el 3% */}
            {!cargando && !factura.tiene_letras && pagos.length > 0 && Number(factura.saldo_pendiente) > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                {!modoSoloRet ? (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-medium text-gray-700">¿El depósito ya se registró y solo falta la retención?</p>
                      <p className="text-xs text-gray-400 mt-0.5">Registra solo el 3% de retención de IGV para saldar la factura, sin duplicar el pago.</p>
                    </div>
                    <button
                      onClick={abrirSoloRetencion}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-white transition shrink-0"
                      style={{ background: '#4ABCC2' }}
                    >
                      Registrar solo retención de IGV
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="font-oswald text-base text-gray-700 tracking-wide">Registrar solo retención de IGV</p>
                    <div className="flex justify-between items-center text-xs text-gray-500">
                      <span>Saldo pendiente actual</span>
                      <span className="tabular-nums text-gray-700">{fmt(Number(factura.saldo_pendiente))}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-xs text-gray-500">Monto de retención (editable)</label>
                      <input
                        type="number" min="0" step="0.01"
                        value={soloRetMonto}
                        onChange={e => setSoloRetMonto(e.target.value)}
                        className="w-32 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-gray-500 shrink-0">Fecha</label>
                      <input
                        type="date" value={fechaPago}
                        onChange={e => setFechaPago(e.target.value)}
                        className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-gray-500 shrink-0">¿Quién registra? *</label>
                      <input
                        type="text" value={registradoPor}
                        onChange={e => setRegistradoPor(e.target.value)}
                        placeholder="Tu nombre"
                        className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                      />
                    </div>
                    <p className="text-[11px] text-gray-400">No registra ningún depósito nuevo: solo la retención de IGV.</p>
                    <div className="flex gap-2">
                      <button
                        onClick={registrarSoloRetencion}
                        disabled={guardando || !soloRetMonto}
                        className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition"
                        style={{ background: '#4ABCC2' }}
                      >
                        {guardando ? 'Registrando…' : 'Registrar retención'}
                      </button>
                      <button
                        onClick={() => { setModoSoloRet(false); setSoloRetMonto(''); }}
                        className="px-4 py-2.5 rounded-lg text-sm text-gray-500 border border-gray-200 hover:bg-gray-50 transition"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Pagos registrados */}
            {pagos.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="font-oswald text-base text-gray-700 tracking-wide">
                    Pagos registrados
                    <span className="ml-2 font-normal text-sm text-gray-400">({pagos.length})</span>
                  </h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {pagos.map(p => (
                    <div key={p.id}>
                      {editandoId === p.id ? (
                        /* Formulario de edición inline */
                        <div className="px-5 py-4 bg-blue-50/40 space-y-3">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Editar pago</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Monto *</label>
                              <input
                                type="number" min="0.01" step="0.01"
                                value={editMonto}
                                onChange={e => setEditMonto(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Fecha de pago *</label>
                              <input
                                type="date" value={editFecha}
                                onChange={e => setEditFecha(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs text-gray-500 mb-1">Referencia</label>
                              <input
                                type="text" value={editRef}
                                onChange={e => setEditRef(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs text-gray-500 mb-1">¿Quién registró este pago?</label>
                              <input
                                type="text" value={editRegistradoPor}
                                onChange={e => setEditRegistradoPor(e.target.value)}
                                placeholder="Corrige si quedó atribuido a la persona equivocada"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                              />
                            </div>
                          </div>
                          {/* Reemplazar voucher opcional */}
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Reemplazar voucher (opcional)</label>
                            <label className="flex items-center gap-3 px-3 py-2 border border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-logisalud-teal transition text-xs">
                              <span>📎</span>
                              <span className="text-gray-400">
                                {editArchivo ? editArchivo.name : 'Selecciona nuevo archivo'}
                              </span>
                              {editSubiendo && <span className="text-gray-400">Subiendo…</span>}
                              {editVoucher  && <span className="text-green-600">✓ Listo</span>}
                              {editPreview  && <img src={editPreview} alt="preview" className="h-10 w-10 object-cover rounded border ml-auto" />}
                              <input type="file" accept="image/*,.pdf" onChange={onEditArchivoChange} className="hidden" />
                            </label>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => guardarEdicion(p)}
                              disabled={editGuardando || editSubiendo}
                              className="flex-1 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition"
                              style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}
                            >
                              {editGuardando ? 'Guardando…' : '✓ Guardar cambios'}
                            </button>
                            <button
                              onClick={() => setEditandoId(null)}
                              className="px-4 py-2 rounded-lg text-sm text-gray-500 border border-gray-200 hover:bg-gray-50 transition"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Fila normal */
                        <div className="px-5 py-3 flex items-center justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-gray-800">{fmt(Number(p.monto))}</p>
                              {p.tipo === 'retencion' && (
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: '#E0F5F6', color: '#2A8A90' }}>
                                  Retención IGV
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400">
                              {fmtFecha(p.fecha_pago)}
                              {p.referencia && <> · <span className="text-gray-500">{p.referencia}</span></>}
                              {p.registrado_por && <> · registrado por <span className="text-gray-500">{p.registrado_por}</span></>}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {p.voucher_path && (
                              <button
                                onClick={() => verVoucher(p.voucher_path as string)}
                                className="text-xs text-logisalud-teal hover:underline font-medium"
                              >
                                Ver voucher ↗
                              </button>
                            )}
                            <button
                              onClick={() => abrirEdicion(p)}
                              className="text-xs text-gray-400 hover:text-blue-600 transition font-medium px-2 py-1 rounded hover:bg-blue-50"
                              title="Editar pago"
                            >
                              ✏️ Editar
                            </button>
                            <button
                              onClick={() => eliminarPago(p)}
                              disabled={eliminandoId === p.id}
                              className="text-xs text-gray-400 hover:text-red-600 transition font-medium px-2 py-1 rounded hover:bg-red-50 disabled:opacity-50"
                              title="Eliminar pago"
                            >
                              {eliminandoId === p.id ? '…' : '🗑️ Eliminar'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
