'use client'

import Link from 'next/link'
import { Money } from '@/components/money'
import { ETIQUETA_ESTADO, type EstadoObligacion } from '@/domain/obligacion'
import { ETIQUETA_ESTADO_PROPUESTA, type EstadoPropuesta } from '@/domain/propuesta'
import { ETIQUETA_ORIGEN, type OrigenObligacion } from '@/domain/reportes'
import { categoriaDeEstado, estaVencida, type CategoriaEstado } from '@/domain/categorias-estado-obligacion'

/**
 * La tabla de obligaciones, una sola vez para todo el módulo.
 *
 * Nació dentro de /cuentas-por-pagar y se extrajo cuando "Nueva propuesta de
 * pago" pidió las mismas columnas (pedido de Mariela, 2026-09-12): la
 * alternativa era una segunda tabla "parecida", que es exactamente como dos
 * pantallas empiezan a divergir sin que nadie lo note.
 *
 * Con `seleccion` agrega la columna de checkboxes; sin ella es la tabla de
 * siempre. Por eso es un componente cliente: la pantalla de Cuentas por
 * Pagar la renderiza desde el servidor sin pasarle funciones, y el
 * formulario de propuesta le pasa su estado de selección.
 */

export type FilaObligacion = {
  id: string
  codigo: string
  numero_factura: string | null
  origen: string
  estado: EstadoObligacion
  moneda: string
  neto_a_pagar: number
  fecha_vencimiento_real: string | null
  concepto?: string | null
  proveedor: { razon_social: string } | null
  beneficiario: { nombre: string | null } | null
  propuesta?: { id: string; codigo: string; estado: string } | null
  yaPagada?: boolean
  /** Nota al pie de la fila (ej. "tiene una nota de crédito sin aplicar").
   * Es un string y no un nodo a propósito: así la fila sigue siendo data
   * serializable y la puede armar un componente de servidor. */
  aviso?: string | null
}

export type SeleccionTabla = {
  elegidas: Set<string>
  alternar: (id: string) => void
  alternarTodas: () => void
  /** Nombre del campo del formulario que recibe cada id elegido. */
  nombreCampo: string
}

export function TablaObligaciones({
  filas, hoy, seleccion,
}: {
  filas: readonly FilaObligacion[]
  /** 'YYYY-MM-DD'. Viene de afuera para que el vencido no dependa del reloj
   * del navegador de cada quien. */
  hoy: string
  seleccion?: SeleccionTabla
}) {
  const todasElegidas =
    !!seleccion && filas.length > 0 && filas.every((f) => seleccion.elegidas.has(f.id))

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
            {seleccion ? (
              <th className="px-3 py-2 font-medium">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox" checked={todasElegidas} onChange={seleccion.alternarTodas}
                    className="h-5 w-5" aria-label="Seleccionar todas las visibles"
                  />
                  <span className="sr-only">Seleccionar todas las visibles</span>
                </label>
              </th>
            ) : null}
            <th className="px-3 py-2 font-medium">Código</th>
            <th className="px-3 py-2 font-medium">Proveedor / Beneficiario</th>
            <th className="px-3 py-2 font-medium">Origen</th>
            <th className="px-3 py-2 font-medium">Estado</th>
            <th className="px-3 py-2 text-right font-medium">Monto</th>
            <th className="px-3 py-2 font-medium">Vencimiento</th>
            <th className="px-3 py-2 font-medium">Lote</th>
            <th className="px-3 py-2 font-medium">Concepto</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((o) => (
            <tr key={o.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
              {seleccion ? (
                <td className="px-3 py-2">
                  <input
                    type="checkbox" name={seleccion.nombreCampo} value={o.id}
                    checked={seleccion.elegidas.has(o.id)}
                    onChange={() => seleccion.alternar(o.id)}
                    className="h-5 w-5"
                    aria-label={`Incluir ${o.codigo}`}
                  />
                </td>
              ) : null}
              <td className="px-3 py-2 whitespace-nowrap">
                <Link href={`/cuentas-por-pagar/${o.id}`} className="font-medium text-logisalud-teal underline">
                  {o.codigo}
                </Link>
                {o.numero_factura ? (
                  <span className="block text-xs text-gray-500">{o.numero_factura}</span>
                ) : null}
              </td>
              <td className="px-3 py-2 max-w-[220px] truncate">
                {o.proveedor?.razon_social ?? o.beneficiario?.nombre ?? '—'}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                {ETIQUETA_ORIGEN[o.origen as OrigenObligacion] ?? o.origen}
              </td>
              {/* El estado EXACTO, no la categoría: el filtro agrupa, la
                  fila no pierde precisión. */}
              <td className="px-3 py-2 whitespace-nowrap">
                <EstadoChip estado={o.estado} />
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                <Money valor={o.neto_a_pagar} moneda={o.moneda} />
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <Vencimiento
                  fecha={o.fecha_vencimiento_real}
                  vencida={estaVencida(o.fecha_vencimiento_real, o.estado, hoy)}
                />
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <CeldaLote propuesta={o.propuesta ?? null} yaPagada={!!o.yaPagada} />
              </td>
              <td className="px-3 py-2 max-w-[240px]">
                <span className="block truncate" title={o.concepto ?? undefined}>
                  {o.concepto ?? '—'}
                </span>
                {o.aviso ? <span className="block text-xs text-amber-700">{o.aviso}</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Tono por categoría, nunca como única señal: siempre acompaña al texto. */
const TONO_POR_CATEGORIA: Record<CategoriaEstado, string> = {
  por_completar: 'border-amber-200 bg-amber-50 text-amber-800',
  en_revision: 'border-amber-200 bg-amber-50 text-amber-800',
  en_camino_a_pago: 'border-sky-200 bg-sky-50 text-sky-800',
  pagada: 'border-green-200 bg-green-50 text-green-800',
  en_cuotas: 'border-gray-200 bg-gray-50 text-gray-700',
  no_procede: 'border-red-200 bg-red-50 text-red-800',
}

function EstadoChip({ estado }: { estado: EstadoObligacion }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${TONO_POR_CATEGORIA[categoriaDeEstado(estado)]}`}
    >
      {ETIQUETA_ESTADO[estado]}
    </span>
  )
}

/**
 * El vencido en rojo — pero solo cuando todavía hay algo que pagar (ver
 * `estaVencida`): pintar de rojo una obligación ya pagada entrenaría a
 * ignorar el color.
 */
function Vencimiento({ fecha, vencida }: { fecha: string | null; vencida: boolean }) {
  if (!fecha) return <span className="text-gray-400">—</span>
  return (
    <span className={vencida ? 'font-medium text-red-700' : 'text-gray-600'}>
      {fecha}
      {vencida ? <span className="block text-xs">vencida</span> : null}
    </span>
  )
}

/** En qué lote entró, y si ese lote ya se puede pagar. */
function CeldaLote({
  propuesta, yaPagada,
}: {
  propuesta: { id: string; codigo: string; estado: string } | null
  yaPagada: boolean
}) {
  if (!propuesta) return <span className="text-gray-400">—</span>
  const aprobada = propuesta.estado === 'aprobada'
  return (
    <>
      <Link
        href={`/cuentas-por-pagar/propuestas/${propuesta.id}`}
        className={
          aprobada && !yaPagada
            ? 'font-medium text-logisalud-green underline'
            : 'text-logisalud-teal underline'
        }
      >
        {propuesta.codigo}
      </Link>
      <span className="block text-xs text-gray-500">
        {yaPagada
          ? 'pagada'
          : aprobada
            ? 'lista para pagar'
            : ETIQUETA_ESTADO_PROPUESTA[propuesta.estado as EstadoPropuesta]}
      </span>
    </>
  )
}
