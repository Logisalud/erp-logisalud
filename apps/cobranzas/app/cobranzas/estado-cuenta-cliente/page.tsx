'use client';

import { useEffect, useRef, useState } from 'react';

interface ClienteHit {
  cliente_ruc: string;
  razon_social: string;
  vendedor_nombre: string | null;
  saldo_total: number;
}

/**
 * Puerta de entrada al estado de cuenta por cliente.
 *
 * Existe porque la pantalla del extracto necesita un RUC en la URL, y al
 * menú hay que poder entrar sin saberlo de memoria. Busca por RUC o razón
 * social contra `/api/clientes/buscar`, que es el mismo buscador que ya usa
 * la pantalla de cartera — un solo buscador, un solo comportamiento.
 */
export default function BuscarEstadoCuentaPage() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<ClienteHit[]>([]);
  const [buscando, setBuscando] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    setBuscando(true);
    debounce.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/clientes/buscar?q=${encodeURIComponent(q.trim())}`, {
          cache: 'no-store',
        });
        const j = await r.json();
        setHits(j.clientes ?? []);
      } finally {
        setBuscando(false);
      }
    }, 250);
  }, [q]);

  const rucDirecto = /^\d{8,11}$/.test(q.trim()) ? q.trim() : null;

  return (
    <div className="min-h-screen bg-gray-50 font-poppins">
      <header className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-oswald tracking-wide">LOGISALUD</h1>
            <p className="text-white/70 text-sm">Estado de cuenta por cliente</p>
          </div>
          <a href="/cobranzas" className="text-white/80 hover:text-white text-sm">&larr; Menú</a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <p className="mb-4 text-sm text-gray-600">
          El historial completo de un cliente, en orden cronológico y con saldo acumulado —
          facturas, notas de crédito, pagos y letras, también lo que ya está saldado.
        </p>

        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="RUC o razón social…"
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
        />

        {buscando && <p className="mt-3 text-sm text-gray-400">Buscando…</p>}

        {hits.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {hits.map((h) => (
              <li key={h.cliente_ruc}>
                <a
                  href={`/cobranzas/clientes/${h.cliente_ruc}/estado-cuenta`}
                  className="flex items-baseline justify-between gap-3 px-4 py-3 hover:bg-gray-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-gray-800">{h.razon_social}</span>
                    <span className="text-xs text-gray-400">
                      RUC {h.cliente_ruc}
                      {h.vendedor_nombre ? ` · ${h.vendedor_nombre}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm text-gray-600">
                    S/ {h.saldo_total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}

        {/*
          El buscador se apoya en `v_saldos`, así que un cliente sin ninguna
          factura no aparece. Si lo que se escribió tiene forma de RUC, se
          ofrece ir igual: su extracto va a salir vacío, que es la respuesta
          correcta y no un error.
        */}
        {!buscando && q.trim().length >= 2 && hits.length === 0 && (
          <div className="mt-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
            Ningún cliente con facturas coincide con “{q.trim()}”.
            {rucDirecto && (
              <>
                {' '}
                <a
                  href={`/cobranzas/clientes/${rucDirecto}/estado-cuenta`}
                  className="text-[#276b3b] underline"
                >
                  Abrir el estado de cuenta de {rucDirecto} igual
                </a>
                .
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
