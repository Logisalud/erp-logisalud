'use client';

import { useState, useEffect, useCallback } from 'react';

interface Fila {
  id: string;
  documento_id: string;
  comprobante: string;
  cliente_ruc: string | null;
  razon_social: string;
  monto: number;
  fecha_pago: string;
  registrado_por: string | null;
  voucher_path: string | null;
  voucher_deposito_path: string | null;
  estado_efectivo: 'cobrado_por_depositar' | 'depositado';
  fecha_deposito: string | null;
  referencia: string | null;
  dias_sin_depositar: number | null;
}

const fmt = (n: number) => 'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtFecha = (s: string) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
const hoy = () => new Date().toISOString().split('T')[0];

export default function EfectivoPorDepositarPage() {
  const [filas, setFilas]           = useState<Fila[]>([]);
  const [total, setTotal]           = useState(0);
  const [cargando, setCargando]     = useState(true);
  const [verDepositados, setVerDepositados] = useState(false);
  const [depositandoId, setDepositandoId] = useState<string | null>(null);
  const [fechaDeposito, setFechaDeposito] = useState(hoy());
  const [archivoDep, setArchivoDep] = useState<File | null>(null);
  const [voucherDepPath, setVoucherDepPath] = useState<string | null>(null);
  const [referenciaDep, setReferenciaDep] = useState('');
  const [subiendo, setSubiendo]     = useState(false);
  const [guardando, setGuardando]   = useState(false);
  const [msg, setMsg]               = useState<{ texto: string; ok: boolean } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch(`/api/efectivo-por-depositar${verDepositados ? '?depositados=1' : ''}`, { cache: 'no-store' });
      const d = await res.json();
      setFilas(d.filas ?? []);
      setTotal(d.total ?? 0);
    } finally {
      setCargando(false);
    }
  }, [verDepositados]);

  useEffect(() => { cargar(); }, [cargar]);

  const verVoucher = async (path: string) => {
    const res = await fetch(`/api/pagos/voucher-url?path=${encodeURIComponent(path)}`);
    const d = await res.json();
    if (d.url) window.open(d.url, '_blank');
    else alert('No se pudo obtener el voucher.');
  };

  const abrirDeposito = (id: string) => {
    setDepositandoId(id);
    setFechaDeposito(hoy());
    setArchivoDep(null);
    setVoucherDepPath(null);
    setReferenciaDep('');
    setMsg(null);
  };

  const onArchivoDepChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setArchivoDep(file);
    setVoucherDepPath(null);
    setSubiendo(true);
    const fd = new FormData();
    fd.append('file', file);
    const res  = await fetch('/api/pagos/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.error) { alert(`Error al subir: ${data.error}`); setSubiendo(false); return; }
    setVoucherDepPath(data.path);
    setSubiendo(false);
  };

  const confirmarDeposito = async () => {
    if (!depositandoId || !fechaDeposito) return;
    setGuardando(true); setMsg(null);
    try {
      const res = await fetch('/api/efectivo-por-depositar/depositar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pago_id: depositandoId,
          fecha_deposito: fechaDeposito,
          ...(voucherDepPath ? { voucher_deposito_path: voucherDepPath } : {}),
          ...(referenciaDep.trim() ? { referencia: referenciaDep.trim() } : {}),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Error');
      setMsg({ texto: '✓ Marcado como depositado.', ok: true });
      setDepositandoId(null);
      await cargar();
    } catch (e) {
      setMsg({ texto: String(e), ok: false });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-poppins">
      <header className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-oswald tracking-wide">LOGISALUD</h1>
            <p className="text-white/70 text-sm">Efectivo por depositar</p>
          </div>
          <a href="/cobranzas" className="text-white/80 hover:text-white text-sm">&larr; Menú</a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto mt-6 px-4 pb-16">
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs uppercase tracking-wider text-gray-400">Pagos pendientes de depositar</p>
            <p className="font-oswald text-2xl text-gray-800">{filas.filter(f => f.estado_efectivo === 'cobrado_por_depositar').length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs uppercase tracking-wider text-gray-400">Monto total pendiente</p>
            <p className="font-oswald text-2xl text-amber-600">{fmt(total)}</p>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer mb-4">
          <input type="checkbox" checked={verDepositados} onChange={e => setVerDepositados(e.target.checked)} className="accent-logisalud-teal" />
          Incluir ya depositados (historial completo)
        </label>

        {msg && (
          <div className={`p-3 rounded-lg text-sm mb-4 ${msg.ok ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            {msg.texto}
          </div>
        )}

        {cargando ? (
          <div className="text-center py-16 text-gray-400 text-sm">Cargando…</div>
        ) : filas.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
            No hay efectivo pendiente de depositar. 🎉
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="divide-y divide-gray-100">
              {filas.map(f => {
                const depositado = f.estado_efectivo === 'depositado';
                return (
                  <div key={f.id} className={`px-5 py-4 ${depositado ? 'opacity-75' : ''}`}>
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-semibold text-logisalud-green text-sm">{f.comprobante}</span>
                          {depositado ? (
                            <>
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
                                💵 Depositado {f.fecha_deposito ? `(${fmtFecha(f.fecha_deposito)})` : ''}
                              </span>
                              {f.referencia && <span className="text-xs text-gray-500">Ref: {f.referencia}</span>}
                            </>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                              💵 {f.dias_sin_depositar} {f.dias_sin_depositar === 1 ? 'día' : 'días'} sin depositar
                            </span>
                          )}
                        </div>
                        <p className="text-gray-700 text-sm font-medium mt-0.5">{f.razon_social}</p>
                        <p className="text-gray-400 text-xs">RUC {f.cliente_ruc}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          Cobrado el {fmtFecha(f.fecha_pago)}
                          {f.registrado_por && <> · por <span className="text-gray-600">{f.registrado_por}</span></>}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5">
                          {f.voucher_path && (
                            <button onClick={() => verVoucher(f.voucher_path as string)} className="text-xs text-logisalud-teal hover:underline font-medium">
                              Ver voucher de cobro ↗
                            </button>
                          )}
                          {depositado && f.voucher_deposito_path && (
                            <button onClick={() => verVoucher(f.voucher_deposito_path as string)} className="text-xs text-green-700 hover:underline font-medium">
                              Ver voucher de depósito ↗
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xl font-bold text-gray-800">{fmt(Number(f.monto))}</p>
                        {!depositado && depositandoId !== f.id && (
                          <button
                            onClick={() => abrirDeposito(f.id)}
                            className="mt-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition"
                            style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}
                          >
                            Marcar como depositado
                          </button>
                        )}
                      </div>
                    </div>

                    {depositandoId === f.id && (
                      <div className="mt-3 p-3 rounded-lg bg-blue-50/40 border border-blue-100 space-y-3">
                        <div className="flex items-end gap-3 flex-wrap">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Fecha de depósito</label>
                            <input
                              type="date" value={fechaDeposito}
                              onChange={e => setFechaDeposito(e.target.value)}
                              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Referencia / N° operación (opcional)</label>
                            <input
                              type="text" value={referenciaDep}
                              onChange={e => setReferenciaDep(e.target.value)}
                              placeholder="OP-123456"
                              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                            />
                          </div>
                          <div>
                            <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-logisalud-teal transition text-xs">
                              <span>📎</span>
                              <span className="text-gray-500">
                                {archivoDep ? archivoDep.name : 'Voucher del depósito (opcional)'}
                              </span>
                              {subiendo && <span className="text-gray-400">Subiendo…</span>}
                              {voucherDepPath && <span className="text-green-600">✓ Listo</span>}
                              <input type="file" accept="image/*,.pdf" onChange={onArchivoDepChange} className="hidden" />
                            </label>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={confirmarDeposito}
                            disabled={guardando || subiendo}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition"
                            style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}
                          >
                            {guardando ? 'Guardando…' : 'Confirmar depósito'}
                          </button>
                          <button onClick={() => setDepositandoId(null)} className="px-4 py-2 rounded-lg text-sm text-gray-500 border border-gray-200 hover:bg-gray-50 transition">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
