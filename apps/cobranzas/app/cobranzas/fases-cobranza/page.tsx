'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, ChevronDown, ChevronRight } from 'lucide-react';
import {
  PageHeader, Badge, Button, FilterBar, FilterField,
  DataTable, EstadoVacio, EstadoCargando, EstadoError,
} from '@/components/ds';
import type { Columna, Semaforo } from '@/components/ds';
import { fmtMoneda, fmtFecha, fmtPorcentaje, fmtEntero } from '@/lib/formato';
import type { ReporteFasesCobranza, ClienteFase, FacturaCobranza, NumeroFase } from '@/lib/fasesCobranza';

const FASE_SEMAFORO: Record<NumeroFase, Semaforo> = {
  0: 'ok', 1: 'ok', 2: 'alerta', 3: 'alerta', 4: 'riesgo', 5: 'critico', 6: 'critico',
};

function hoyLima() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
}

export default function FasesCobranza() {
  const [fechaCorte, setFechaCorte] = useState(hoyLima());
  const [vendedor, setVendedor] = useState('');
  const [faseSeleccionada, setFaseSeleccionada] = useState<NumeroFase | null>(null);
  const [expandido, setExpandido] = useState<Set<string>>(new Set());
  const [reporte, setReporte] = useState<ReporteFasesCobranza | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCargando(true);
    setError(null);
    const p = new URLSearchParams({ fecha_corte: fechaCorte });
    if (vendedor.trim()) p.set('vendedor', vendedor.trim());
    fetch(`/api/fases-cobranza?${p.toString()}`)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setReporte(d); })
      .catch(e => setError(String(e.message ?? e)))
      .finally(() => setCargando(false));
  }, [fechaCorte, vendedor]);

  const urlExportar = useMemo(() => {
    const p = new URLSearchParams({ fecha_corte: fechaCorte });
    return `/api/exportar/fases-cobranza?${p.toString()}`;
  }, [fechaCorte]);

  const clientesMostrados = useMemo(() => {
    if (!reporte) return [];
    return faseSeleccionada === null ? reporte.clientes : reporte.clientes.filter(c => c.fase === faseSeleccionada);
  }, [reporte, faseSeleccionada]);

  function toggleExpandido(ruc: string) {
    setExpandido(prev => {
      const next = new Set(prev);
      next.has(ruc) ? next.delete(ruc) : next.add(ruc);
      return next;
    });
  }

  const columnasClientes: Columna<ClienteFase>[] = [
    {
      clave: 'expand', titulo: '', anchoClase: 'w-8',
      render: c => (expandido.has(c.clienteRuc) ? <ChevronDown size={14} /> : <ChevronRight size={14} />),
    },
    { clave: 'cliente', titulo: 'Cliente', render: c => <span className="font-medium text-ink-900">{c.razonSocial}</span> },
    { clave: 'ruc', titulo: 'RUC', render: c => <span className="font-mono text-xs">{c.clienteRuc}</span> },
    { clave: 'vendedor', titulo: 'Vendedor', render: c => c.vendedores },
    {
      clave: 'dias', titulo: faseSeleccionada === 0 ? 'Días para vencer' : 'Máx. días vencido', align: 'right',
      render: c => c.maxDiasVencido,
    },
    {
      clave: 'monto', titulo: faseSeleccionada === 0 ? 'Vence en 7 días' : 'Saldo vencido', align: 'right',
      render: c => <span className="font-medium">{fmtMoneda(c.montoAGestionar)}</span>,
    },
    { clave: 'pctFase', titulo: '% de la fase', align: 'right', render: c => fmtPorcentaje(c.pctDeLaFase) },
    { clave: 'pctAcum', titulo: '% acumulado', align: 'right', render: c => fmtPorcentaje(c.pctAcumulado) },
    { clave: 'top80', titulo: 'Top 80%', align: 'center', render: c => c.top80 ? <Badge tono="alerta" conPunto={false}>Sí</Badge> : '—' },
    { clave: 'saldoTotal', titulo: 'Saldo total por cobrar', align: 'right', render: c => fmtMoneda(c.saldoTotalPorCobrar) },
    { clave: 'nDocs', titulo: 'N° docs', align: 'right', render: c => fmtEntero(c.nDocs) },
  ];

  const columnasFacturas: Columna<FacturaCobranza>[] = [
    { clave: 'fase', titulo: 'Fase', render: f => <Badge tono={FASE_SEMAFORO[f.fase]} conPunto={false}>{f.fase}</Badge> },
    { clave: 'comprobante', titulo: 'Comprobante', render: f => f.comprobante },
    { clave: 'emision', titulo: 'F. Emisión', render: f => fmtFecha(f.fechaEmision) },
    { clave: 'vencimiento', titulo: 'F. Vencimiento', render: f => <>{fmtFecha(f.fechaVencimiento)}{f.tieneLetras && <span className="ml-1 text-[10px] text-ink-400">(letra)</span>}</> },
    { clave: 'dias', titulo: 'Días vencido', align: 'right', render: f => f.diasVencido },
    { clave: 'saldo', titulo: 'Saldo', align: 'right', render: f => fmtMoneda(f.saldo) },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8">
      <PageHeader
        titulo="Fases de cobranza"
        subtitulo={`Agenda de gestión por cliente — corte ${fmtFecha(fechaCorte)}.`}
        migas={[{ label: 'Cobranza diaria', href: '/cobranzas' }, { label: 'Fases de cobranza' }]}
        acciones={<a href={urlExportar}><Button variante="primario"><Download size={14} /> Exportar Excel</Button></a>}
      />

      <FilterBar>
        <FilterField label="Fecha de corte">
          <input type="date" value={fechaCorte} onChange={e => setFechaCorte(e.target.value)}
            className="rounded-ds-input border border-ink-300 px-2.5 py-1.5 text-sm font-poppins" />
        </FilterField>
        <FilterField label="Vendedor">
          <input type="text" value={vendedor} onChange={e => setVendedor(e.target.value)} placeholder="Buscar vendedor…"
            className="rounded-ds-input border border-ink-300 px-2.5 py-1.5 text-sm font-poppins" />
        </FilterField>
      </FilterBar>

      {cargando ? (
        <EstadoCargando texto="Calculando fases de cobranza…" />
      ) : error ? (
        <EstadoError mensaje={error} />
      ) : !reporte || reporte.totalClientes === 0 ? (
        <EstadoVacio titulo="Sin clientes con deuda vencida ni próxima a vencer" />
      ) : (
        <>
          <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {reporte.resumen.map(r => (
              <button
                key={r.fase}
                onClick={() => setFaseSeleccionada(faseSeleccionada === r.fase ? null : r.fase)}
                className={`rounded-ds-card border p-3 text-left transition hover:shadow-ds-sm ${
                  faseSeleccionada === r.fase ? 'border-brand-green-500 ring-1 ring-brand-green-500' : 'border-ink-200 bg-white'
                }`}
              >
                <Badge tono={FASE_SEMAFORO[r.fase]} conPunto={false}>Fase {r.fase}</Badge>
                <p className="mt-1.5 text-xs font-medium text-ink-500 font-poppins">{r.nombre}</p>
                <p className="font-oswald text-lg text-ink-900">{fmtMoneda(r.monto)}</p>
                <p className="text-xs text-ink-400 font-poppins">{fmtEntero(r.nClientes)} clientes · {fmtPorcentaje(r.pctDelTotal)}</p>
              </button>
            ))}
          </section>

          {faseSeleccionada !== null && (
            <div className="mb-3 rounded-ds-card border border-ink-200 bg-ink-50/60 p-3 text-sm text-ink-700 font-poppins">
              <strong>Acción — Fase {faseSeleccionada} ({reporte.resumen[faseSeleccionada].nombre}):</strong> {reporte.resumen[faseSeleccionada].accion}
            </div>
          )}

          <DataTable
            columnas={columnasClientes}
            filas={clientesMostrados}
            claveFila={c => c.clienteRuc}
            onClickFila={c => toggleExpandido(c.clienteRuc)}
            vacio={<EstadoVacio titulo="No hay clientes en esta fase" />}
          />

          {clientesMostrados.filter(c => expandido.has(c.clienteRuc)).map(c => (
            <div key={c.clienteRuc} className="mb-4 ml-4 mt-2 rounded-ds-card border border-ink-100 bg-ink-50/40 p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-500 font-poppins">
                Facturas de {c.razonSocial}
              </p>
              <DataTable columnas={columnasFacturas} filas={c.facturas} claveFila={f => f.documentoId} />
            </div>
          ))}
        </>
      )}
    </main>
  );
}
