'use client';

import { useEffect, useRef, useState } from 'react';

interface ClienteHit {
  cliente_ruc: string;
  razon_social: string;
  saldo_total: number;
}

/**
 * Puerta de entrada al estado de cuenta desde el link del vendedor.
 *
 * El extracto necesita un RUC en la URL y el vendedor no se lo sabe de
 * memoria, así que acá busca por RUC o razón social. El buscador es
 * `/api/v/clientes/buscar`, que sólo devuelve clientes de SU cartera: no hay
 * forma de llegar desde acá al extracto de un cliente ajeno, y si alguien
 * escribe el RUC a mano en la URL, la API responde 403.
 */
export default function BuscarEstadoCuentaDelVendedorPage({
  params,
}: {
  params: { token: string };
}) {
  const token = params.token;
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
        const r = await fetch(
          `/api/v/clientes/buscar?token=${encodeURIComponent(token)}&q=${encodeURIComponent(q.trim())}`,
          { cache: 'no-store' },
        );
        const j = await r.json();
        setHits(j.clientes ?? []);
      } finally {
        setBuscando(false);
      }
    }, 250);
  }, [q, token]);

  return (
    <div className="min-h-screen bg-gray-50 font-poppins">
      <header className="px-4 py-4" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-white text-xl font-oswald tracking-wide">LOGISALUD</h1>
            <p className="text-white/70 text-sm">Estado de cuenta por cliente</p>
          </div>
          <a href={`/v/${token}`} className="shrink-0 text-white/80 hover:text-white text-sm">
            &larr; Mi cartera
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <p className="mb-4 text-sm text-gray-600">
          El historial completo de un cliente tuyo: facturas, notas de crédito, pagos y letras,
          con el saldo acumulado — también lo que ya está saldado.
        </p>

        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="RUC o razón social…"
          className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base"
        />

        {buscando && <p className="mt-3 text-sm text-gray-400">Buscando…</p>}

        {hits.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {hits.map((h) => (
              <li key={h.cliente_ruc}>
                <a
                  href={`/v/${token}/estado-cuenta/${h.cliente_ruc}`}
                  className="flex items-baseline justify-between gap-3 px-4 py-3 hover:bg-gray-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-gray-800">{h.razon_social}</span>
                    <span className="text-xs text-gray-400">RUC {h.cliente_ruc}</span>
                  </span>
                  <span className="shrink-0 text-sm text-gray-600">
                    S/ {h.saldo_total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}

        {!buscando && q.trim().length >= 2 && hits.length === 0 && (
          <div className="mt-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
            Ningún cliente tuyo coincide con “{q.trim()}”. El buscador sólo muestra los clientes
            de tu cartera.
          </div>
        )}

        <p className="mt-6 text-center text-[11px] text-gray-300">
          LOGISALUD · Vista de consulta — solo lectura
        </p>
      </main>
    </div>
  );
}
