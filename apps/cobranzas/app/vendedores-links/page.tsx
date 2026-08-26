'use client';

import { useState, useEffect } from 'react';

interface VendedorLink {
  id: string;
  nombres: string;
  apellidos: string | null;
  codigo: string | null;
  activo: boolean;
  token_acceso: string | null;
}

export default function VendedoresLinksPage() {
  const [vendedores, setVendedores] = useState<VendedorLink[]>([]);
  const [cargando, setCargando]     = useState(true);
  const [regenerando, setRegenerando] = useState<string | null>(null);
  const [copiado, setCopiado]       = useState<string | null>(null);
  const [origin, setOrigin]         = useState('');

  useEffect(() => {
    // Usa el dominio de PRODUCCIÓN (público) para los links, no la URL de
    // deployment (que Vercel protege con login). Fallback al origin actual.
    fetch('/api/base-url', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setOrigin(d.baseUrl || window.location.origin))
      .catch(() => setOrigin(window.location.origin));
    cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    const res = await fetch('/api/vendedores-links', { cache: 'no-store' });
    const d   = await res.json();
    setVendedores(d.vendedores ?? []);
    setCargando(false);
  }

  async function regenerar(v: VendedorLink) {
    if (!confirm(`¿Regenerar el link de ${v.nombres}? El link anterior dejará de funcionar.`)) return;
    setRegenerando(v.id);
    const res = await fetch('/api/vendedores-links', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendedor_id: v.id }),
    });
    if (res.ok) await cargar();
    setRegenerando(null);
  }

  async function copiar(v: VendedorLink) {
    if (!v.token_acceso) return;
    await navigator.clipboard.writeText(`${origin}/v/${v.token_acceso}`);
    setCopiado(v.id);
    setTimeout(() => setCopiado(null), 1500);
  }

  return (
    <div>
      <header className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-oswald tracking-wide">LOGISALUD</h1>
            <p className="text-white/70 text-sm">Links de cobranza por vendedor</p>
          </div>
          <a href="/" className="text-white/80 hover:text-white text-sm">&larr; Menú</a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto mt-6 px-4 pb-16">
        <p className="text-gray-500 text-sm mb-6">
          Cada vendedor tiene un link privado de solo consulta con su cobranza pendiente.
          Copia el link y envíaselo. Si un vendedor se va o el link se filtra, regenera el token — el anterior queda revocado al instante.
          Los botones "Cartera de clientes" y "Cobranza del mes" descargan un Excel para adjuntar manualmente por WhatsApp o correo — un link no puede adjuntar archivos.
        </p>

        {cargando ? (
          <p className="text-gray-400 text-sm">Cargando…</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden divide-y divide-gray-100">
            {vendedores.map(v => (
              <div key={v.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-800">
                    {v.nombres} {v.apellidos ?? ''}
                    {v.codigo && <span className="ml-2 text-xs font-normal text-gray-400">{v.codigo}</span>}
                    {!v.activo && <span className="ml-2 text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">inactivo</span>}
                  </p>
                  {v.token_acceso ? (
                    <p className="text-xs text-gray-400 font-mono truncate mt-0.5">{origin}/v/{v.token_acceso}</p>
                  ) : (
                    <p className="text-xs text-gray-300 mt-0.5">sin token</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                  <a
                    href={`/api/vendedores-links/exportar-clientes?vendedor_id=${v.id}`}
                    className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition"
                  >
                    📋 Cartera de clientes
                  </a>
                  <a
                    href={`/api/vendedores-links/exportar-cobranza-mes?vendedor_id=${v.id}`}
                    className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition"
                  >
                    📅 Cobranza del mes
                  </a>
                  <button
                    onClick={() => copiar(v)}
                    disabled={!v.token_acceso}
                    className="px-3 py-1.5 text-xs rounded-lg text-white disabled:opacity-40 transition"
                    style={{ background: copiado === v.id ? '#4BB168' : '#4ABCC2' }}
                  >
                    {copiado === v.id ? '✓ Copiado' : 'Copiar link'}
                  </button>
                  <button
                    onClick={() => regenerar(v)}
                    disabled={regenerando === v.id}
                    className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition"
                  >
                    {regenerando === v.id ? '…' : 'Regenerar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-gray-400 mt-4">
          Nota: los links dan acceso de solo lectura a la cobranza de ese vendedor únicamente.
          Los vendedores inactivos no pueden entrar aunque tengan token.
        </p>
      </main>
    </div>
  );
}
