import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { ChipEstado } from '@/components/chip-estado'
import { listarMisOperaciones } from '@/services/mis-operaciones'
import {
  ETIQUETA_ESTADO_PAGO, ETIQUETA_TIPO_OPERACION,
  type FilaOperacion, type TonoEstado,
} from '@/domain/mis-operaciones'
import type { ColorEstado } from '@/domain/ordenes-unificadas'
import { VerVoucher } from '../cuentas-por-pagar/[id]/ver-voucher'

export const dynamic = 'force-dynamic'

/**
 * Todo lo que creó la persona que está mirando, de los seis tipos, en una
 * sola tabla. No repite el trabajo del Dashboard (que prioriza los loops
 * abiertos de toda la empresa): acá la pregunta es "¿en qué quedó lo MÍO?".
 */
export default async function MisOperaciones() {
  const filas = await listarMisOperaciones()

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Encabezado titulo="Mis operaciones" atras={{ href: '/', texto: 'Compras y Pagos' }} />

      {filas.length === 0 ? (
        <p className="card text-sm text-gray-600">
          Todavía no creaste ninguna orden, pago directo, anticipo ni reembolso. Cuando lo hagas, van
          a aparecer todos aquí con su estado.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Código</th>
                <th className="px-3 py-2 font-medium">Creada</th>
                <th className="px-3 py-2 font-medium">Proveedor / Categoría</th>
                <th className="px-3 py-2 text-right font-medium">Monto</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Próximo paso</th>
                <th className="px-3 py-2 font-medium">¿Pagado?</th>
                <th className="px-3 py-2 font-medium">Voucher</th>
                <th className="px-3 py-2 font-medium">Acción</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={`${f.tipo}-${f.id}`} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap">{ETIQUETA_TIPO_OPERACION[f.tipo]}</td>
                  <td className="px-3 py-2">
                    <Link href={f.href} className="font-medium text-logisalud-teal underline">
                      {f.codigo}
                    </Link>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{f.fechaCreacion.slice(0, 10)}</td>
                  <td className="px-3 py-2 max-w-[220px] truncate">{f.referencia ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Money valor={f.monto} moneda={f.moneda} />
                  </td>
                  <td className="px-3 py-2">
                    {/* El motivo del rechazo/anulación viaja en el title: la
                        columna no puede crecer, pero el porqué no se pierde. */}
                    <span title={f.motivoCorte ?? undefined}>
                      <ChipEstado texto={f.estadoTexto} color={COLOR_POR_TONO[f.estadoTono]} />
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{f.proximoPaso}</td>
                  <td className="px-3 py-2">{ETIQUETA_ESTADO_PAGO[f.pagado]}</td>
                  <td className="px-3 py-2">
                    <CeldaVoucher voucher={f.voucher} />
                  </td>
                  <td className="px-3 py-2">
                    <Link href={f.href} className="text-logisalud-teal underline">Ver detalle</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

const COLOR_POR_TONO: Record<TonoEstado, ColorEstado> = {
  pendiente: 'ambar',
  aprobado: 'teal',
  rechazado: 'rojo',
  anulado: 'rojo',
  neutro: 'gris',
}

function CeldaVoucher({ voucher }: { voucher: FilaOperacion['voucher'] }) {
  if (voucher.tipo === 'ninguno') return <span className="text-gray-400">—</span>
  if (voucher.tipo === 'archivo') return <VerVoucher storagePath={voucher.storagePath} etiqueta="Ver voucher" />
  if (voucher.tipo === 'sin_adjunto') {
    return <span className="text-xs text-amber-700">sin voucher adjunto</span>
  }
  return (
    <Link href={voucher.href} className="text-logisalud-teal underline">
      Ver los pagos
    </Link>
  )
}
