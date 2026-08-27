'use client';

import { useState, useEffect, useCallback } from 'react';

interface Fila {
  id: string;
  documento_id: string;
  comprobante: string;
  cliente_ruc: string | null;
  razon_social: string;
  forma_pago: string | null;
  monto: number;
  fecha_registro: string;
  registrado_por: string | null;
  voucher_path: string | null;
  referencia: string | null;
  dias_transcurridos: number;
  umbral_dias: number;
  investigado: boolean;
  investigado_comentario: string | null;
  investigado_en: string | null;
}

const fmt = (n: number) => 'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtFechaHora = (s: string) => {
  const d = new Date(s);
  return d.toLocaleDateString('es-PE') + ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
};

export default function PagosSinConfirmarPage() {
  const [filas, setFilas]                 = useState<Fila[]>([]);
  const [cargando, setCargando]           = useState(true);
  const [historico, setHistorico]         = useState(false);
  const [verInvestigados, setVerInvestigados] = useState(false);
  const [investigandoId, setInvestigandoId] = useState<string | null>(null);
  const [comentario, setComentario]       = useState('');
  const [guardando, setGuardando]         = useState(false);
  const [msg, setMsg]                     = useState<{ texto: string; ok: boolean } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const params = new URLSearchParams();
      if (historico) params.set('historico', '1');
      if (verInvestigados) params.set('investigados', '1');
      const res = await fetch(`/api/pagos-sin-confirmar?${params}`, { cache: 'no-store' });
      const d = await res.json();
      setFilas(d.filas ?? []);
    } finally {
      setCargando(false);
    }
  }, [historico, verInvestigados]);

  useEffect(() => { cargar(); }, [cargar]);

  const verVoucher = async (path: string) => {
    const res = await fetch(`/api/pagos/voucher-url?path=${encodeURIComponent(path)}`);
    const d = await res.json();
    if (d.url) window.open(d.url, '_blank');
    else alert('No se pudo obtener el voucher.');
  };

  const abrirInvestigar = (id: string) => {
    setInvestigandoId(id);
    setComentario('');
    setMsg(null);
  };

  const guardarInvestigacion = async () => {
    if (!investigandoId || !comentario.trim()) return;
    setGuardando(true); setMsg(null);
    try {
      const res = await fetch('/api/pagos-sin-confirmar/investigar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pago_id: investigandoId, comentario: comentario.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Error');
      setMsg({ texto: '✓ Marcado como investigado.', ok: true });
      setInvestigandoId(null); setComentario('');
      await cargar();
    } catch (e) {
      setMsg({ texto: String(e), ok: false });
    } finally {
      setGuardando(false);
    }
  };

  const totalMonto = filas.reduce((s, f) => s + Number(f.monto), 0);
  const sinInvestigar = filas.filter(f => !f.investigado).length;

  return (
    <div className="min-h-screen bg-gray-50 font-poppins">
      <header className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-oswald tracking-wide">LOGISALUD</h1>
            <p className="text-white/70 text-sm">Pagos sin confirmar contra el banco</p>
          </div>
          <a href="/cobranzas" className="text-white/80 hover:text-white text-sm">&larr; Menú</a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto mt-6 px-4 pb-16">
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs uppercase tracking-wider text-gray-400">Pagos en alerta</p>
            <p className="font-oswald text-2xl text-gray-800">{filas.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs uppercase tracking-wider text-gray-400">Monto total</p>
            <p className="font-oswald text-2xl text-gray-800">{fmt(totalMonto)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs uppercase tracking-wider text-gray-400">Sin investigar</p>
            <p className="font-oswald text-2xl text-orange-600">{sinInvestigar}</p>
          </div>
        </div>

        <div className="flex items-center gap-5 mb-4 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={historico} onChange={e => setHistorico(e.target.checked)} className="accent-logisalud-teal" />
            <span className="text-gray-600">Ver histórico completo (antes del lanzamiento)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={verInvestigados} onChange={e => setVerInvestigados(e.target.checked)} className="accent-logisalud-teal" />
            <span className="text-gray-600">Incluir ya investigados</span>
          </label>
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
            No hay pagos sin confirmar por encima del umbral de antigüedad. 🎉
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="divide-y divide-gray-100">
              {filas.map(f => (
                <div key={f.id} className={`px-5 py-4 ${f.investigado ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-logisalud-green text-sm">{f.comprobante}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${f.forma_pago === 'CONTADO' ? 'bg-orange-100 text-orange-700' : 'bg-blue-50 text-blue-600'}`}>
                          {f.forma_pago ?? '—'}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-700">
                          {f.dias_transcurridos} días sin confirmar (umbral {f.umbral_dias})
                        </span>
                        {f.investigado && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">Investigado</span>
                        )}
                      </div>
                      <p className="text-gray-700 text-sm font-medium mt-0.5">{f.razon_social}</p>
                      <p className="text-gray-400 text-xs">RUC {f.cliente_ruc}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Registrado {fmtFechaHora(f.fecha_registro)}
                        {f.registrado_por && <> · por <span className="text-gray-600">{f.registrado_por}</span></>}
                        {f.referencia && <> · Ref: {f.referencia}</>}
                      </p>
                      {f.investigado && f.investigado_comentario && (
                        <p className="text-xs text-gray-500 mt-1 bg-gray-50 rounded px-2 py-1 inline-block">
                          📝 {f.investigado_comentario}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xl font-bold text-gray-800">{fmt(Number(f.monto))}</p>
                      <div className="flex items-center gap-3 mt-2 justify-end">
                        {f.voucher_path && (
                          <button onClick={() => verVoucher(f.voucher_path as string)} className="text-xs text-logisalud-teal hover:underline font-medium">
                            Ver voucher ↗
                          </button>
                        )}
                        {!f.investigado && (
                          <button onClick={() => abrirInvestigar(f.id)} className="text-xs text-gray-500 hover:text-blue-600 font-medium px-2 py-1 rounded hover:bg-blue-50">
                            Marcar como investigado
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {investigandoId === f.id && (
                    <div className="mt-3 p-3 rounded-lg bg-blue-50/40 border border-blue-100 space-y-2">
                      <label className="block text-xs text-gray-500">Comentario de la investigación *</label>
                      <textarea
                        value={comentario}
                        onChange={e => setComentario(e.target.value)}
                        rows={2}
                        placeholder="Ej: Confirmado con el cliente por WhatsApp, el banco tarda por ser fin de semana."
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={guardarInvestigacion}
                          disabled={guardando || !comentario.trim()}
                          className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition"
                          style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}
                        >
                          {guardando ? 'Guardando…' : 'Guardar'}
                        </button>
                        <button onClick={() => setInvestigandoId(null)} className="px-4 py-2 rounded-lg text-sm text-gray-500 border border-gray-200 hover:bg-gray-50 transition">
                          Cancelar
                        </button>
                      </div>
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
