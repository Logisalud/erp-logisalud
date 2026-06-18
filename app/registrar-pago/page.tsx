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
      <label className="block text-xs text-gray-500 mb-1">Voucher (foto o PDF) *</label>
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
  const [buscando, setBuscando]         = useState(false);
  const [factura, setFactura]           = useState<FacturaBuscar | null>(null);
  const [letras, setLetras]             = useState<Letra[]>([]);
  const [pagos, setPagos]               = useState<Pago[]>([]);
  const [cargando, setCargando]         = useState(false);

  const [letraSelId, setLetraSelId]     = useState<string | null>(null);
  const [monto, setMonto]               = useState('');
  const [fechaPago, setFechaPago]       = useState(hoy());
  const [referencia, setReferencia]     = useState('');
  const [archivo, setArchivo]           = useState<File | null>(null);
  const [voucherPath, setVoucherPath]   = useState<string | null>(null);
  const [previewUrl, setPreviewUrl]     = useState<string | null>(null);
  const [subiendo, setSubiendo]         = useState(false);
  const [guardando, setGuardando]       = useState(false);
  const [errMsg, setErrMsg]             = useState('');
  const [exitoMsg, setExitoMsg]         = useState('');

  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevUrlRef = useRef<string | null>(null);

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
    if (factura) { setFactura(null); setLetras([]); setPagos([]); }
    buscarDebounced(v);
  };

  const cargarDetalle = useCallback(async (f: FacturaBuscar) => {
    setCargando(true);
    const [resL, resP] = await Promise.all([
      fetch(`/api/letras?documento_id=${f.id}`).then(r => r.json()),
      fetch(`/api/pagos?documento_id=${f.id}`).then(r => r.json()),
    ]);
    setLetras(resL.letras ?? []);
    setPagos(resP.pagos ?? []);
    setCargando(false);
  }, []);

  const seleccionarFactura = async (f: FacturaBuscar) => {
    setFactura(f);
    setSugerencias([]);
    setBusqueda(`${f.comprobante} — ${f.razon_social}`);
    setErrMsg(''); setExitoMsg('');
    setLetraSelId(null); setMonto(''); setFechaPago(hoy()); setReferencia('');
    setArchivo(null); setVoucherPath(null); setPreviewUrl(null);
    await cargarDetalle(f);
  };

  const recargar = useCallback(async (fActual: FacturaBuscar) => {
    const res = await fetch(`/api/facturas/buscar?q=${encodeURIComponent(fActual.comprobante)}`);
    const d   = await res.json();
    const actualizada = (d.facturas as FacturaBuscar[] ?? []).find(f => f.id === fActual.id);
    if (actualizada) setFactura(actualizada);
    await cargarDetalle(actualizada ?? fActual);
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

  const limpiarForm = () => {
    setMonto(''); setReferencia(''); setFechaPago(hoy());
    setArchivo(null); setVoucherPath(null); setPreviewUrl(null);
    setLetraSelId(null);
  };

  const registrarPagoFactura = async () => {
    if (!factura) return;
    if (!voucherPath)           { setErrMsg('El voucher es obligatorio.');            return; }
    if (!monto || Number(monto) <= 0) { setErrMsg('El monto debe ser mayor a 0.');  return; }
    setGuardando(true); setErrMsg(''); setExitoMsg('');
    const res = await fetch('/api/pagos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documento_id: factura.id,
        monto: Number(monto),
        fecha_pago: fechaPago,
        referencia: referencia.trim() || undefined,
        voucher_path: voucherPath,
      }),
    });
    const d = await res.json();
    if (d.error) { setErrMsg(d.error); setGuardando(false); return; }
    setExitoMsg(`✓ Pago de ${fmt(Number(monto))} registrado correctamente.`);
    limpiarForm();
    await recargar(factura);
    setGuardando(false);
  };

  const registrarPagoLetra = async () => {
    if (!factura || !letraSelId) { setErrMsg('Selecciona una letra.');        return; }
    if (!voucherPath)             { setErrMsg('El voucher es obligatorio.');  return; }
    setGuardando(true); setErrMsg(''); setExitoMsg('');
    const res = await fetch(`/api/letras/${letraSelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'pagada', fecha_pago: fechaPago, voucher_path: voucherPath }),
    });
    const d = await res.json();
    if (d.error) { setErrMsg(d.error); setGuardando(false); return; }
    const num = letras.find(l => l.id === letraSelId)?.numero_letra ?? '';
    setExitoMsg(`✓ Letra ${num} marcada como pagada.`);
    limpiarForm();
    await recargar(factura);
    setGuardando(false);
  };

  const verVoucher = async (path: string) => {
    const res = await fetch(`/api/pagos/voucher-url?path=${encodeURIComponent(path)}`);
    const d   = await res.json();
    if (d.url) window.open(d.url, '_blank');
    else alert('No se pudo obtener el voucher.');
  };

  const letrasPendientes = letras.filter(l => l.estado !== 'pagada');
  const letraSel         = letras.find(l => l.id === letraSelId);

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
            Buscar factura a crédito por comprobante, RUC o razón social
          </label>
          <input
            type="text"
            value={busqueda}
            onChange={e => onBusquedaChange(e.target.value)}
            placeholder="Ej: FFF1-1211 · 20601234567 · FARMACIA"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal bg-white"
          />
          {buscando && <span className="absolute right-3 top-9 text-xs text-gray-400">Buscando…</span>}
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
                        <span className="ml-2 text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full">Con letras</span>
                      )}
                      <p className="text-gray-600 text-xs truncate mt-0.5">{f.razon_social}</p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p className="text-sm font-bold text-orange-600">{fmt(Number(f.saldo_pendiente))}</p>
                      <p className="text-xs text-gray-400">saldo</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {errMsg  && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{errMsg}</div>}
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
                    <span>Vencimiento: <span className="text-gray-600">{fmtFecha(factura.fecha_vencimiento)}</span></span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400 mb-0.5">Saldo pendiente</p>
                  <p className={`text-3xl font-bold ${
                    Number(factura.saldo_pendiente) > 0 ? 'text-orange-600' : 'text-green-600'
                  }`}>
                    {fmt(Number(factura.saldo_pendiente))}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">de {fmt(Number(factura.importe_total))} total</p>
                </div>
              </div>
            </div>

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
                      disabled={guardando || subiendo || !voucherPath}
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
                  <p className="text-xs text-gray-400 mt-0.5">Factura sin letras — pago directo</p>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Monto * <span className="text-gray-400">(máx {fmt(Number(factura.saldo_pendiente))})</span>
                      </label>
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
                  </div>
                  <FileUpload
                    archivo={archivo} previewUrl={previewUrl}
                    subiendo={subiendo} voucherPath={voucherPath}
                    onChange={onArchivoChange}
                  />
                  <button
                    onClick={registrarPagoFactura}
                    disabled={guardando || subiendo || !voucherPath || !monto}
                    className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition"
                    style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}
                  >
                    {guardando ? 'Registrando…' : 'Registrar pago'}
                  </button>
                </div>
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
                    <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{fmt(Number(p.monto))}</p>
                        <p className="text-xs text-gray-400">
                          {fmtFecha(p.fecha_pago)}
                          {p.referencia && <> · <span className="text-gray-500">{p.referencia}</span></>}
                        </p>
                      </div>
                      {p.voucher_path && (
                        <button
                          onClick={() => verVoucher(p.voucher_path as string)}
                          className="text-xs text-logisalud-teal hover:underline font-medium shrink-0"
                        >
                          Ver voucher ↗
                        </button>
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
