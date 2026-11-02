'use client';

import { useState } from 'react';
import { Download, Filter, Plus } from 'lucide-react';
import {
  PageHeader, Badge, Button, KpiCard, FilterBar, FilterField,
  DataTable, EstadoVacio, EstadoCargando, EstadoError, ConfirmDialog,
} from '@/components/ds';
import type { Columna } from '@/components/ds';
import { fmtMoneda, fmtFecha, fmtPorcentaje } from '@/lib/formato';

// Hoja visual del sistema de diseño — pantalla temporal, SIN enlace en el
// menú (no aparece en app/cobranzas/page.tsx). Sirve para que Sebastián
// apruebe tokens y componentes antes de construir Bloque A/B o tocar
// pantallas existentes. Se elimina (o se deja como referencia interna)
// cuando el rediseño esté mergeado.

type FilaEjemplo = { id: string; cliente: string; ruc: string; vendedor: string; dias: number; saldo: number };

const FILAS_EJEMPLO: FilaEjemplo[] = [
  { id: '1', cliente: 'BVC FARMA E.I.R.L.', ruc: '20482528695', vendedor: 'Milagritos', dias: 45, saldo: 3564.90 },
  { id: '2', cliente: 'DINACEN S.A.C.', ruc: '20100012345', vendedor: 'Romina', dias: 12, saldo: 1890.00 },
  { id: '3', cliente: 'CORPORACION PIONERO', ruc: '20293155586', vendedor: 'CODI01', dias: 95, saldo: 6006.85 },
];

const COLUMNAS: Columna<FilaEjemplo>[] = [
  { clave: 'cliente', titulo: 'Cliente', render: f => <span className="font-medium text-ink-900">{f.cliente}</span> },
  { clave: 'ruc', titulo: 'RUC', render: f => <span className="font-mono text-xs">{f.ruc}</span> },
  { clave: 'vendedor', titulo: 'Vendedor', render: f => f.vendedor },
  { clave: 'dias', titulo: 'Días vencido', align: 'right', render: f => f.dias },
  { clave: 'saldo', titulo: 'Saldo vencido', align: 'right', render: f => <span className="font-medium">{fmtMoneda(f.saldo)}</span> },
];

export default function SistemaDiseno() {
  const [confirmando, setConfirmando] = useState(false);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <PageHeader
        titulo="Sistema de diseño"
        subtitulo="Tokens, componentes y patrones — hoja de referencia, no es una pantalla del menú."
        migas={[{ label: 'Cobranza diaria', href: '/cobranzas' }, { label: 'Sistema de diseño' }]}
        acciones={<Button variante="primario"><Download size={14} /> Exportar</Button>}
      />

      <Seccion titulo="Tipografía">
        <div className="space-y-2">
          <p className="font-oswald text-3xl uppercase tracking-wide text-ink-900">Título Oswald 3xl</p>
          <p className="font-oswald text-xl uppercase tracking-wide text-ink-900">Subtítulo Oswald xl</p>
          <p className="font-poppins text-base text-ink-700">Texto de cuerpo Poppins — regular, para tablas y párrafos.</p>
          <p className="font-poppins text-sm text-ink-500">Texto secundario Poppins — metadatos, ayudas, fechas.</p>
        </div>
      </Seccion>

      <Seccion titulo="Colores de marca">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Chip clase="bg-brand-green-500" label="brand-green-500" />
          <Chip clase="bg-brand-green-700" label="brand-green-700" />
          <Chip clase="bg-brand-teal-500" label="brand-teal-500" />
          <Chip clase="bg-brand-teal-700" label="brand-teal-700" />
          <Chip clase="bg-ink-100 text-ink-900" label="ink-100" />
          <Chip clase="bg-ink-500" label="ink-500" />
          <Chip clase="bg-ink-900" label="ink-900" />
          <Chip clase="bg-white border border-ink-200 text-ink-900" label="surface" />
        </div>
      </Seccion>

      <Seccion titulo="Semáforo / Badges">
        <div className="flex flex-wrap gap-2">
          <Badge tono="ok" />
          <Badge tono="alerta" />
          <Badge tono="riesgo" />
          <Badge tono="critico" />
          <Badge tono="neutral" />
          <Badge tono="ok">Fase 0 · Preventivo</Badge>
          <Badge tono="critico">Fase 6 · Legal</Badge>
        </div>
      </Seccion>

      <Seccion titulo="Botones">
        <div className="flex flex-wrap items-center gap-2">
          <Button variante="primario"><Plus size={14} /> Primario</Button>
          <Button variante="secundario"><Filter size={14} /> Secundario</Button>
          <Button variante="peligro">Peligro</Button>
          <Button variante="primario" cargando>Cargando</Button>
          <Button variante="primario" disabled>Deshabilitado</Button>
          <Button variante="secundario" tamano="sm">Pequeño</Button>
        </div>
      </Seccion>

      <Seccion titulo="Tarjetas KPI">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard etiqueta="Efectividad de cobranza" valor={fmtPorcentaje(87.2)} meta="≥ 85%" tono="ok"
            variacion={{ valor: '+2.1 pp', direccion: 'sube', esBueno: true }} />
          <KpiCard etiqueta="DSO vs. plazo" valor="42 días" meta="40 días" tono="alerta"
            variacion={{ valor: '+2 días', direccion: 'sube', esBueno: false }}
            alerta="DSO sube 2 meses seguidos" />
          <KpiCard etiqueta="Morosidad dura (&gt;60d)" valor={fmtPorcentaje(10.7)} meta="≤ 5%" tono="critico"
            variacion={{ valor: '53 clientes', direccion: 'igual' }} />
        </div>
      </Seccion>

      <Seccion titulo="Barra de filtros">
        <FilterBar>
          <FilterField label="Fase">
            <select className="rounded-ds-input border border-ink-300 px-2.5 py-1.5 text-sm font-poppins">
              <option>Todas</option>
              <option>Fase 4 · Bloqueo</option>
            </select>
          </FilterField>
          <FilterField label="Vendedor">
            <input className="rounded-ds-input border border-ink-300 px-2.5 py-1.5 text-sm font-poppins" placeholder="Buscar vendedor…" />
          </FilterField>
          <Button variante="primario" tamano="sm">Aplicar</Button>
        </FilterBar>
      </Seccion>

      <Seccion titulo="Tabla de datos">
        <DataTable columnas={COLUMNAS} filas={FILAS_EJEMPLO} claveFila={f => f.id}
          filaDestacada={f => f.dias > 60} onClickFila={() => {}} />
      </Seccion>

      <Seccion titulo="Estados vacío / carga / error">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <EstadoVacio titulo="Sin clientes en esta fase" descripcion="No hay facturas vencidas en este rango." />
          <EstadoCargando />
          <EstadoError mensaje="No se pudo cargar el reporte. Reintenta en unos segundos." />
        </div>
      </Seccion>

      <Seccion titulo="Diálogo de confirmación">
        <Button variante="peligro" onClick={() => setConfirmando(true)}>Anular ingreso…</Button>
        <ConfirmDialog
          abierto={confirmando}
          titulo="¿Anular este ingreso?"
          descripcion="Esta acción no se puede deshacer. El pago vinculado también se anula."
          variantePeligro
          textoConfirmar="Sí, anular"
          onConfirmar={() => setConfirmando(false)}
          onCancelar={() => setConfirmando(false)}
        />
      </Seccion>

      <Seccion titulo="Fecha de referencia">
        <p className="text-sm text-ink-700 font-poppins">{fmtFecha('2026-10-17')} (formato dd/mm/aaaa, antes era {`'2026-10-17'`})</p>
      </Seccion>
    </main>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 font-oswald text-sm uppercase tracking-widest text-ink-400">{titulo}</h2>
      {children}
    </section>
  );
}

function Chip({ clase, label }: { clase: string; label: string }) {
  return (
    <div className={`flex h-16 flex-col items-center justify-center rounded-ds-card text-xs font-poppins font-medium text-white ${clase}`}>
      {label}
    </div>
  );
}
