'use client';

import { useEffect, useState } from 'react';
import { Download, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import {
  PageHeader, Badge, Button, KpiCard, FilterBar, FilterField,
  DataTable, EstadoCargando, EstadoError,
} from '@/components/ds';
import type { Columna, Semaforo } from '@/components/ds';
import { fmtMoneda, fmtPorcentaje, fmtFecha, fmtEntero } from '@/lib/formato';
import { FICHAS } from '@/lib/fichasIndicadores';

function hoyLima() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
}

type Respuesta = any; // formas vienen de lib/indicadoresCobranza.ts (6 shapes distintos)

const TARJETAS: { clave: keyof Respuesta; ficha: string; etiqueta: string; formato: 'pct' }[] = [
  { clave: 'efectividad', ficha: 'efectividad_cobranza', etiqueta: 'Efectividad de cobranza', formato: 'pct' },
  { clave: 'dso', ficha: 'dso', etiqueta: 'DSO vs. plazo otorgado', formato: 'pct' },
  { clave: 'morosidad', ficha: 'morosidad_dura', etiqueta: 'Morosidad dura (>60d)', formato: 'pct' },
  { clave: 'ventaDeuda', ficha: 'venta_deuda_vencida', etiqueta: 'Venta a deuda vencida', formato: 'pct' },
  { clave: 'cobroVendido', ficha: 'cobro_vendido', etiqueta: 'Cobro de lo vendido (piloto)', formato: 'pct' },
  { clave: 'registroOportuno', ficha: 'registro_oportuno', etiqueta: 'Registro oportuno', formato: 'pct' },
];

export default function IndicadoresCobranza() {
  const [fechaCorte, setFechaCorte] = useState(hoyLima());
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);

  useEffect(() => {
    setCargando(true);
    setError(null);
    fetch(`/api/indicadores-cobranza?fecha_corte=${fechaCorte}`)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setDatos(d); })
      .catch(e => setError(String(e.message ?? e)))
      .finally(() => setCargando(false));
  }, [fechaCorte]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8">
      <PageHeader
        titulo="Indicadores de cobranza"
        subtitulo={`6 indicadores de Finanzas — corte ${fmtFecha(fechaCorte)}.`}
        migas={[{ label: 'Cobranza diaria', href: '/cobranzas' }, { label: 'Indicadores de cobranza' }]}
        acciones={<a href={`/api/exportar/indicadores-cobranza?fecha_corte=${fechaCorte}`}><Button variante="primario"><Download size={14} /> Exportar Excel</Button></a>}
      />

      <FilterBar>
        <FilterField label="Fecha de corte">
          <input type="date" value={fechaCorte} onChange={e => setFechaCorte(e.target.value)}
            className="rounded-ds-input border border-ink-300 px-2.5 py-1.5 text-sm font-poppins" />
        </FilterField>
      </FilterBar>

      {cargando ? (
        <EstadoCargando texto="Calculando indicadores…" />
      ) : error ? (
        <EstadoError mensaje={error} />
      ) : datos ? (
        <>
          <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TARJETAS.map(t => {
              const d = datos[t.clave];
              return (
                <KpiCard
                  key={String(t.clave)}
                  etiqueta={t.etiqueta}
                  valor={fmtPorcentaje(d.valor)}
                  meta={typeof d.meta === 'number' ? fmtPorcentaje(d.meta) : String(d.meta)}
                  tono={d.semaforo as Semaforo}
                  onClick={() => setSeleccionada(seleccionada === t.ficha ? null : t.ficha)}
                />
              );
            })}
          </section>

          {seleccionada && <PanelIndicador clave={seleccionada} datos={datos} fechaCorte={fechaCorte} />}
        </>
      ) : null}
    </main>
  );
}

function PanelIndicador({ clave, datos, fechaCorte }: { clave: string; datos: Respuesta; fechaCorte: string }) {
  const ficha = FICHAS[clave];
  return (
    <section className="rounded-ds-card border border-ink-200 bg-white p-5">
      <h2 className="font-oswald text-xl uppercase tracking-wide text-ink-900">{ficha.titulo}</h2>
      <dl className="mt-3 grid grid-cols-1 gap-3 text-sm font-poppins sm:grid-cols-2">
        <Ficha etiqueta="Cómo se calcula" valor={ficha.comoSeCalcula} />
        <Ficha etiqueta="Mejor si" valor={ficha.mejorSi} />
        <Ficha etiqueta="Meta" valor={ficha.meta} />
        <Ficha etiqueta="Alerta" valor={ficha.alerta} />
        <Ficha etiqueta="Responsable" valor={ficha.responsable} />
        <Ficha etiqueta="Qué debe hacer" valor={ficha.queDebeHacer} />
        <Ficha etiqueta="Definición usada en el ERP" valor={ficha.definicionUsadaEnElErp} />
      </dl>

      {clave === 'morosidad_dura' && (
        <Link href="/cobranzas/fases-cobranza" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-green-600 hover:underline">
          Ver en Fases de cobranza (fases 5 y 6) <ArrowRight size={14} />
        </Link>
      )}

      <div className="mt-5">
        {clave === 'efectividad_cobranza' && <TablaEfectividad datos={datos.efectividad} />}
        {clave === 'dso' && <TablaDSO datos={datos.dso} />}
        {clave === 'morosidad_dura' && <TablaMorosidad datos={datos.morosidad} />}
        {clave === 'venta_deuda_vencida' && <TablaVentaDeuda datos={datos.ventaDeuda} />}
        {clave === 'cobro_vendido' && <TablaCobroVendido datos={datos.cobroVendido} />}
        {clave === 'registro_oportuno' && <TablaRegistroOportuno datos={datos.registroOportuno} fechaCorte={fechaCorte} />}
      </div>

      {(clave === 'efectividad_cobranza' || clave === 'cobro_vendido') && (
        <DesgloseVendedorSeccion clave={clave} datos={datos} />
      )}
    </section>
  );
}

function Ficha({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">{etiqueta}</dt>
      <dd className="mt-0.5 text-ink-700">{valor}</dd>
    </div>
  );
}

function TablaEfectividad({ datos }: { datos: any }) {
  const cols: Columna<any>[] = [
    { clave: 'cliente', titulo: 'Cliente', render: c => c.clienteRuc },
    { clave: 'vendedor', titulo: 'Vendedor', render: c => c.vendedor },
    { clave: 'docs', titulo: 'Docs', align: 'right', render: c => c.docs },
    { clave: 'dias', titulo: 'Días vencido', align: 'right', render: c => c.diasVencido },
    { clave: 'pendiente', titulo: 'Pendiente', align: 'right', render: c => fmtMoneda(c.pendiente) },
  ];
  return <><p className="mb-2 text-xs font-semibold uppercase text-ink-400">Dónde enfocarse — 5 clientes con más deuda vencida del mes</p><DataTable columnas={cols} filas={datos.dondeEnfocarse} claveFila={c => c.clienteRuc} /></>;
}

function TablaDSO({ datos }: { datos: any }) {
  const cols: Columna<any>[] = [
    { clave: 'vendedor', titulo: 'Vendedor', render: v => v.vendedor },
    { clave: 'dso', titulo: 'DSO', align: 'right', render: v => `${v.dso.toFixed(0)} d` },
    { clave: 'plazo', titulo: 'Plazo', align: 'right', render: v => `${v.plazo.toFixed(0)} d` },
    { clave: 'brecha', titulo: 'Brecha', align: 'right', render: v => `${v.brecha >= 0 ? '+' : ''}${v.brecha.toFixed(0)} d` },
    { clave: 'saldo', titulo: 'Saldo', align: 'right', render: v => fmtMoneda(v.saldo) },
  ];
  return <><p className="mb-2 text-xs font-semibold uppercase text-ink-400">Dónde enfocarse — 5 vendedores con mayor brecha</p><DataTable columnas={cols} filas={datos.dondeEnfocarse} claveFila={v => v.vendedorId ?? v.vendedor} /></>;
}

function TablaMorosidad({ datos }: { datos: any }) {
  const cols: Columna<any>[] = [
    { clave: 'cliente', titulo: 'Cliente', render: c => c.clienteRuc },
    { clave: 'vendedor', titulo: 'Vendedor', render: c => c.vendedor },
    { clave: 'docs', titulo: 'Docs', align: 'right', render: c => c.docs },
    { clave: 'dias', titulo: 'Máx. días', align: 'right', render: c => c.maxDias },
    { clave: 'monto', titulo: 'Monto', align: 'right', render: c => fmtMoneda(c.monto) },
  ];
  return <><p className="mb-2 text-xs font-semibold uppercase text-ink-400">Dónde enfocarse — 5 clientes con mayor deuda &gt;60 días ({fmtEntero(datos.nClientes)} clientes en total)</p><DataTable columnas={cols} filas={datos.dondeEnfocarse} claveFila={c => c.clienteRuc} /></>;
}

function TablaVentaDeuda({ datos }: { datos: any }) {
  const cols: Columna<any>[] = [
    { clave: 'cliente', titulo: 'Cliente', render: c => c.razonSocial },
    { clave: 'vendedor', titulo: 'Vendedor', render: c => c.vendedor },
    { clave: 'venta', titulo: 'Venta del mes', align: 'right', render: c => fmtMoneda(c.ventaMes) },
    { clave: 'deuda', titulo: 'Deuda >30 días hoy', align: 'right', render: c => fmtMoneda(c.deudaVencida) },
  ];
  return (
    <>
      {datos.alertaVenta60Count > 0 && (
        <p className="mb-2 rounded-ds-xs bg-red-50 px-2 py-1 text-xs text-red-700">⚠ {datos.alertaVenta60Count} cliente(s) con venta a deuda &gt;60 días</p>
      )}
      <p className="mb-2 text-xs font-semibold uppercase text-ink-400">Dónde enfocarse — 5 clientes con deuda vieja a los que se vendió en el mes</p>
      <DataTable columnas={cols} filas={datos.dondeEnfocarse} claveFila={c => c.clienteRuc} />
    </>
  );
}

function TablaCobroVendido({ datos }: { datos: any }) {
  const cols: Columna<any>[] = [
    { clave: 'vendedor', titulo: 'Vendedor', render: v => v.vendedor },
    { clave: 'vendido', titulo: 'Vendido', align: 'right', render: v => fmtMoneda(v.vendido) },
    { clave: 'cobrado', titulo: 'Cobrado en plazo', align: 'right', render: v => fmtMoneda(v.cobradoEnPlazo) },
    { clave: 'pct', titulo: '% Cobrado', align: 'right', render: v => fmtPorcentaje(v.pct) },
  ];
  return <><p className="mb-2 text-xs font-semibold uppercase text-ink-400">Dónde enfocarse — 5 vendedores con menor %</p><DataTable columnas={cols} filas={datos.dondeEnfocarse} claveFila={v => v.vendedorId ?? v.vendedor} /></>;
}

function TablaRegistroOportuno({ datos, fechaCorte }: { datos: any; fechaCorte: string }) {
  const cols: Columna<any>[] = [
    { clave: 'monto', titulo: 'Monto', align: 'right', render: p => fmtMoneda(p.monto) },
    { clave: 'depositado', titulo: 'F. Depósito', render: p => fmtFecha(p.fecha_pago) },
    { clave: 'registrado', titulo: 'F. Registro', render: p => fmtFecha((p.created_at ?? '').slice(0, 10)) },
    { clave: 'dias', titulo: 'Días hábiles', align: 'right', render: p => p.diasHabiles },
    { clave: 'registrador', titulo: 'Registrado por', render: p => p.registrado_por ?? '—' },
  ];
  const tienePorRegistrador = Array.isArray(datos.porRegistrador) && datos.porRegistrador.length > 0;
  return (
    <>
      {datos.demoradosMas5 > 0 && <p className="mb-2 rounded-ds-xs bg-red-50 px-2 py-1 text-xs text-red-700">⚠ {datos.demoradosMas5} pago(s) de {fmtFecha(fechaCorte)} con más de 5 días hábiles</p>}
      {tienePorRegistrador && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold uppercase text-ink-400">Por registrador (solo gerencia)</p>
          <DataTable
            columnas={[
              { clave: 'r', titulo: 'Registrador', render: (r: any) => r.registrador },
              { clave: 'total', titulo: 'Total', align: 'right', render: (r: any) => r.total },
              { clave: 'pct', titulo: '% a tiempo', align: 'right', render: (r: any) => fmtPorcentaje(r.pct) },
            ]}
            filas={datos.porRegistrador}
            claveFila={(r: any) => r.registrador}
          />
        </div>
      )}
      {Array.isArray(datos.dondeEnfocarse) && datos.dondeEnfocarse.length > 0 && (
        <>
          <p className="mb-2 text-xs font-semibold uppercase text-ink-400">Pagos del mes con mayor demora (solo gerencia)</p>
          <DataTable columnas={cols} filas={datos.dondeEnfocarse} claveFila={(p: any) => p.id} />
        </>
      )}
    </>
  );
}

// ---------- Desglose por vendedor (Ind. 1, 2 y 5) ----------
// Empresa arriba (ya se ve en la tarjeta/tabla de la propia sección);
// acá solo la tabla "Por vendedor", ordenable, con fila "Total empresa"
// para reconciliar y Distribuidoras (CODI01) aparte del ranking de
// personas. Solo AREAS_LECTURA ve esta pantalla entera (la ruta ya lo
// exige) — los vendedores no tienen acceso.

function DesgloseVendedorSeccion({ clave, datos }: { clave: string; datos: Respuesta }) {
  if (clave === 'efectividad_cobranza') return <DesgloseEfectividad datos={datos.efectividad} />;
  if (clave === 'cobro_vendido') return <DesgloseCobroVendido datos={datos.cobroVendido} />;
  return null;
}

function filaTotalEmpresa(etiqueta: string) {
  return { vendedorId: '__total__', vendedor: etiqueta, codigo: null, esDistribuidoras: false, muestraPequena: false };
}

function DesgloseEfectividad({ datos }: { datos: any }) {
  const personas = (datos.vendedores as any[]).filter(v => !v.esDistribuidoras);
  const distribuidoras = (datos.vendedores as any[]).find(v => v.esDistribuidoras);
  const total = { ...filaTotalEmpresa('Total empresa'), vencido: datos.vencido, cobrado: datos.cobrado, pendiente: datos.pendiente, efectividad: datos.valor, nDocs: personas.reduce((s, v) => s + v.nDocs, 0) + (distribuidoras?.nDocs ?? 0), semaforo: datos.semaforo };

  const cols: Columna<any>[] = [
    { clave: 'vendedor', titulo: 'Vendedor', render: v => v.vendedor },
    { clave: 'docs', titulo: 'Docs', align: 'right', valorOrden: v => v.nDocs ?? 0, render: v => v.nDocs ?? '—' },
    { clave: 'vencido', titulo: 'Vencido', align: 'right', valorOrden: v => v.vencido ?? 0, render: v => fmtMoneda(v.vencido ?? 0) },
    { clave: 'cobrado', titulo: 'Cobrado', align: 'right', valorOrden: v => v.cobrado ?? 0, render: v => fmtMoneda(v.cobrado ?? 0) },
    { clave: 'pendiente', titulo: 'Pendiente', align: 'right', valorOrden: v => v.pendiente ?? 0, render: v => fmtMoneda(v.pendiente ?? 0) },
    { clave: 'efectividad', titulo: 'Efectividad', align: 'right', valorOrden: v => v.efectividad ?? 0, render: v => <Badge tono={v.semaforo ?? 'neutral'}>{fmtPorcentaje(v.efectividad ?? 0)}</Badge> },
  ];

  return (
    <section className="mt-6 border-t border-ink-200 pt-5">
      <h3 className="mb-1 font-oswald text-sm uppercase tracking-widest text-ink-400">Desglose por vendedor</h3>
      <p className="mb-3 text-xs text-ink-400 font-poppins">Vendedor = vendedor actual del cliente. Ordena por columna. Muestra pequeña (vencido &lt; {fmtMoneda(3000)}) en gris — no se oculta.</p>
      <DataTable
        columnas={cols}
        filas={[...personas, ...(distribuidoras ? [distribuidoras] : [])]}
        claveFila={v => v.vendedorId ?? v.vendedor}
        filaAtenuada={v => v.muestraPequena}
        filaFinal={total}
        ordenInicial={{ clave: 'efectividad', dir: 'asc' }}
      />
    </section>
  );
}

function DesgloseCobroVendido({ datos }: { datos: any }) {
  const personas = (datos.vendedores as any[]).filter(v => !v.esDistribuidoras);
  const distribuidoras = (datos.vendedores as any[]).find(v => v.esDistribuidoras);
  const total = { ...filaTotalEmpresa('Total empresa'), vendido: datos.vendidoTotal, cobradoEnPlazo: datos.cobradoTotal, pct: datos.valor, nDocs: personas.reduce((s, v) => s + v.nDocs, 0) + (distribuidoras?.nDocs ?? 0), semaforo: datos.semaforo, morosidadVendedor: null };

  const cols: Columna<any>[] = [
    { clave: 'vendedor', titulo: 'Vendedor', render: v => v.vendedor },
    { clave: 'docs', titulo: 'Docs', align: 'right', valorOrden: v => v.nDocs ?? 0, render: v => v.nDocs ?? '—' },
    { clave: 'vendido', titulo: 'Vendido', align: 'right', valorOrden: v => v.vendido ?? 0, render: v => fmtMoneda(v.vendido ?? 0) },
    { clave: 'cobrado', titulo: 'Cobrado en plazo', align: 'right', valorOrden: v => v.cobradoEnPlazo ?? 0, render: v => fmtMoneda(v.cobradoEnPlazo ?? 0) },
    { clave: 'pct', titulo: '% Cobrado', align: 'right', valorOrden: v => v.pct ?? 0, render: v => <Badge tono={v.semaforo ?? 'neutral'}>{fmtPorcentaje(v.pct ?? 0)}</Badge> },
    { clave: 'morosidad', titulo: 'Morosidad del vendedor', align: 'right', valorOrden: v => v.morosidadVendedor ?? -1, render: v => v.morosidadVendedor != null ? fmtPorcentaje(v.morosidadVendedor) : '—' },
  ];

  return (
    <section className="mt-6 border-t border-ink-200 pt-5">
      <h3 className="mb-1 font-oswald text-sm uppercase tracking-widest text-ink-400">Desglose por vendedor</h3>
      <p className="mb-3 text-xs text-ink-400 font-poppins">
        Vendedor = vendedor actual del cliente, no quien vendió. &quot;Morosidad del vendedor&quot; es la misma definición de morosidad_diaria (% vencido de su cartera HOY, no as-of el corte elegido) — se mira junto a este número a propósito. Muestra pequeña (vendido &lt; {fmtMoneda(3000)}) en gris.
      </p>
      <DataTable
        columnas={cols}
        filas={[...personas, ...(distribuidoras ? [distribuidoras] : [])]}
        claveFila={v => v.vendedorId ?? v.vendedor}
        filaAtenuada={v => v.muestraPequena}
        filaFinal={total}
        ordenInicial={{ clave: 'pct', dir: 'asc' }}
      />
    </section>
  );
}
