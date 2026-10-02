'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Movimiento, Resumen } from '@/lib/estado-cuenta';

interface ClienteInfo {
  ruc: string;
  razon_social: string;
  direccion?: string | null;
  distrito?: string | null;
  provincia?: string | null;
}

interface ClienteHit {
  cliente_ruc: string;
  razon_social: string;
  saldo_total: number;
}

const fmt = (n: number) =>
  n === 0 ? '' : n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtSaldo = (n: number) =>
  n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtFecha = (f: string) => {
  if (!f) return '';
  const [a, m, d] = f.split('-');
  return `${d}/${m}/${a}`;
};

/** Cada tipo de fila se lee distinto: el color hace el trabajo del ojo. */
function colorDe(m: Movimiento): string {
  if (m.tipo === 'AJUSTE') {
    return m.detalle?.startsWith('Diferencia sin explicar') ? 'text-red-700' : 'text-amber-700';
  }
  if (m.debe > 0) return 'text-gray-900';
  return 'text-[#276b3b]';
}

export default function EstadoCuentaClientePage({ params }: { params: { ruc: string } }) {
  const [cliente, setCliente] = useState<ClienteInfo | null>(null);
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Buscador para saltar a otro cliente sin volver al menú.
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<ClienteHit[]>([]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const p = new URLSearchParams();
      if (desde) p.set('desde', desde);
      if (hasta) p.set('hasta', hasta);
      const r = await fetch(
        `/api/estado-cuenta/historial/${encodeURIComponent(params.ruc)}?${p.toString()}`,
        { cache: 'no-store' },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'No se pudo cargar el estado de cuenta.');
      setCliente(j.cliente);
      setMovs(j.movimientos);
      setResumen(j.resumen);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, [params.ruc, desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      const r = await fetch(`/api/clientes/buscar?q=${encodeURIComponent(q.trim())}`, {
        cache: 'no-store',
      });
      const j = await r.json();
      setHits(j.clientes ?? []);
    }, 250);
  }, [q]);

  const urlExcel = useMemo(() => {
    const p = new URLSearchParams();
    if (desde) p.set('desde', desde);
    if (hasta) p.set('hasta', hasta);
    return `/api/exportar/estado-cuenta-cliente/${encodeURIComponent(params.ruc)}?${p.toString()}`;
  }, [params.ruc, desde, hasta]);

  const lugar = [cliente?.distrito, cliente?.provincia].filter(Boolean).join(' · ');

  return (
    <div className="min-h-screen bg-gray-50 font-poppins">
      <header className="px-6 py-4 print:hidden" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-oswald tracking-wide">LOGISALUD</h1>
            <p className="text-white/70 text-sm">Estado de cuenta del cliente</p>
          </div>
          <a href="/cobranzas" className="text-white/80 hover:text-white text-sm">&larr; Menú</a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Buscador: permite saltar a otro cliente sin salir de la pantalla. */}
        <div className="relative mb-4 print:hidden">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar otro cliente por RUC o razón social…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          {hits.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
              {hits.map((h) => (
                <li key={h.cliente_ruc}>
                  <a
                    href={`/cobranzas/clientes/${h.cliente_ruc}/estado-cuenta`}
                    className="flex justify-between gap-3 px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    <span className="truncate">
                      {h.razon_social} <span className="text-gray-400">· {h.cliente_ruc}</span>
                    </span>
                    <span className="shrink-0 text-gray-500">S/ {fmtSaldo(h.saldo_total)}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mb-4">
          <h2 className="font-oswald text-xl text-gray-800">
            {cliente?.razon_social ?? params.ruc}
          </h2>
          <p className="text-sm text-gray-500">
            RUC {params.ruc}
            {cliente?.direccion ? <> · {cliente.direccion}</> : null}
            {lugar ? <> · {lugar}</> : null}
          </p>
        </div>

        {/* Resumen antes de la tabla. */}
        {resumen && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-5">
            <Tile
              titulo={resumen.saldoActual < 0 ? 'Saldo a favor del cliente' : 'Saldo actual'}
              valor={fmtSaldo(Math.abs(resumen.saldoActual))}
              color={resumen.saldoActual < 0 ? '#276b3b' : resumen.saldoActual > 0 ? '#b91c1c' : '#374151'}
              nota={
                resumen.saldoActual < 0
                  ? 'Nosotros le debemos'
                  : resumen.saldoActual === 0
                    ? 'Sin deuda'
                    : 'En contra del cliente'
              }
            />
            <Tile titulo="Total facturado" valor={fmtSaldo(resumen.totalFacturado)} />
            <Tile titulo="Total pagado" valor={fmtSaldo(resumen.totalPagado)} nota="Incluye letras pagadas y retención" />
            <Tile titulo="Notas de crédito" valor={fmtSaldo(resumen.totalNotasCredito)} />
          </div>
        )}

        {resumen && resumen.totalSinExplicar > 0 && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Hay S/ {fmtSaldo(resumen.totalSinExplicar)} en diferencias que no encajan en ninguna
            regla conocida. Están marcadas en rojo en la tabla — conviene revisarlas.
          </p>
        )}

        {/* Filtro de fechas y exportación. */}
        <div className="mb-4 flex flex-wrap items-end gap-3 print:hidden">
          <label className="text-sm">
            <span className="block text-gray-600">Desde</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5" />
          </label>
          <label className="text-sm">
            <span className="block text-gray-600">Hasta</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5" />
          </label>
          {(desde || hasta) && (
            <button onClick={() => { setDesde(''); setHasta(''); }}
              className="text-sm text-gray-500 underline pb-2">Ver todo</button>
          )}
          <div className="ml-auto flex gap-2">
            <button onClick={() => window.print()}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50">
              🖨 Imprimir
            </button>
            <a href={urlExcel}
              className="rounded-lg px-3 py-2 text-sm font-medium text-white"
              style={{ background: '#276b3b' }}>
              ⬇ Exportar a Excel
            </a>
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        )}
        {cargando && <p className="text-sm text-gray-500">Cargando…</p>}

        {!cargando && !error && (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Fecha</th>
                  <th className="px-3 py-2 text-left font-medium">Tipo</th>
                  <th className="px-3 py-2 text-left font-medium">Documento</th>
                  <th className="px-3 py-2 text-right font-medium">Debe</th>
                  <th className="px-3 py-2 text-right font-medium">Haber</th>
                  <th className="px-3 py-2 text-right font-medium">Saldo</th>
                  <th className="px-3 py-2 text-left font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {movs.map((m, i) => (
                  <tr key={i} className={m.tipo === 'AJUSTE' ? 'bg-amber-50/50' : undefined}>
                    <td className="whitespace-nowrap px-3 py-1.5 text-gray-600">{fmtFecha(m.fecha)}</td>
                    <td className={`whitespace-nowrap px-3 py-1.5 ${colorDe(m)}`}>{m.etiqueta}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 font-mono text-gray-500">{m.documento}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{fmt(m.debe)}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-[#276b3b]">{fmt(m.haber)}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-semibold tabular-nums">{fmtSaldo(m.saldo)}</td>
                    <td className="px-3 py-1.5 text-gray-500">{m.detalle}</td>
                  </tr>
                ))}
                {movs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                      Este cliente no tiene movimientos {desde || hasta ? 'en el rango elegido' : 'registrados'}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs text-gray-400">
          Las filas en ámbar son ajustes: reglas del sistema que mueven el saldo sin ser un
          documento (un CONTADO cobrado al despacho, un redondeo de céntimos, un canje en
          letras o un pago de más). Están a la vista para que el saldo final cuadre exacto
          con lo que reporta cada factura.
        </p>
      </main>
    </div>
  );
}

function Tile({ titulo, valor, color, nota }: { titulo: string; valor: string; color?: string; nota?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3.5 py-3">
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{titulo}</p>
      <p className="font-oswald text-xl" style={{ color: color ?? '#374151' }}>S/ {valor}</p>
      {nota && <p className="text-[11px] text-gray-400">{nota}</p>}
    </div>
  );
}
