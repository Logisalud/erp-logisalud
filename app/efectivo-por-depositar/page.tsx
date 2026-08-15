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
  dias_sin_depositar: number;
}

const fmt = (n: number) => 'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtFecha = (s: string) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
const hoy = () => new Date().toISOString().split('T')[0];

export default function EfectivoPorDepositarPage() {
  const [filas, setFilas]           = useState<Fila[]>([]);
  const [cargando, setCargando]     = useState(true);
  const [depositandoId, setDepositandoId] = useState<string | null>(null);
  const [fechaDeposito, setFechaDeposito] = useState(hoy());
  const [guardando, setGuardando]   = useState(false);
  const [msg, setMsg]               = useState<{ texto: string; ok: boolean } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch('/api/efectivo-por-depositar', { cache: 'no-store' });
      const d = await res.json();
      setFilas(d.filas ?? []);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirDeposito = (id: string) => {
    setDepositandoId(id);
    setFechaDeposito(hoy());
    setMsg(null);
  };

  const confirmarDeposito = async () => {
    if (!depositandoId || !fechaDeposito) return;
    setGuardando(true); setMsg(null);
    try {
      const res = await fetch('/api/efectivo-por-depositar/depositar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pago_id: depositandoId, fecha_deposito: fechaDeposito }),
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

  const total = filas.reduce((s, f) => s + Number(f.monto), 0);

  return (
    <div className="min-h-screen bg-gray-50 font-poppins">
      <header className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-oswald tracking-wide">LOGISALUD</h1>
            <p className="text-white/70 text-sm">Efectivo por depositar</p>
          </div>
          <a href="/" className="text-white/80 hover:text-white text-sm">&larr; Menú</a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto mt-6 px-4 pb-16">
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs uppercase tracking-wider text-gray-400">Pagos pendientes de depositar</p>
            <p className="font-oswald text-2xl text-gray-800">{filas.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs uppercase tracking-wider text-gray-400">Monto total en efectivo</p>
            <p className="font-oswald text-2xl text-amber-600">{fmt(total)}</p>
          </div>
        </div>

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
              {filas.map(f => (
                <div key={f.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-logisalud-green text-sm">{f.comprobante}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                          💵 {f.dias_sin_depositar} {f.dias_sin_depositar === 1 ? 'día' : 'días'} sin depositar
                        </span>
                      </div>
                      <p className="text-gray-700 text-sm font-medium mt-0.5">{f.razon_social}</p>
                      <p className="text-gray-400 text-xs">RUC {f.cliente_ruc}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Cobrado el {fmtFecha(f.fecha_pago)}
                        {f.registrado_por && <> · por <span className="text-gray-600">{f.registrado_por}</span></>}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xl font-bold text-gray-800">{fmt(Number(f.monto))}</p>
                      {depositandoId !== f.id && (
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
                    <div className="mt-3 p-3 rounded-lg bg-blue-50/40 border border-blue-100 flex items-end gap-3 flex-wrap">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Fecha de depósito</label>
                        <input
                          type="date" value={fechaDeposito}
                          onChange={e => setFechaDeposito(e.target.value)}
                          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                        />
                      </div>
                      <button
                        onClick={confirmarDeposito}
                        disabled={guardando}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition"
                        style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}
                      >
                        {guardando ? 'Guardando…' : 'Confirmar depósito'}
                      </button>
                      <button onClick={() => setDepositandoId(null)} className="px-4 py-2 rounded-lg text-sm text-gray-500 border border-gray-200 hover:bg-gray-50 transition">
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
