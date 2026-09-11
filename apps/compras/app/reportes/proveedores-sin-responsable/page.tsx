import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import {
  listarProveedoresPorResponsable,
  puedeVerReporteResponsables,
} from '@/services/proveedores-responsable'
import { ETIQUETA_DESENLACE, type FilaProveedorResponsable } from '@/domain/responsable-proveedor'

export const dynamic = 'force-dynamic'

/**
 * Proveedores sin responsable asignado, y proveedores cuya última OC/OS la
 * generó alguien distinto del responsable — o el responsable quedó
 * desactualizado, o se compró por fuera.
 *
 * "Sin movimientos todavía" NO va con los hallazgos: un proveedor recién
 * dado de alta con responsable está perfecto, y mezclarlo hace que la lista
 * deje de mirarse. Va aparte, al final.
 */
export default async function ProveedoresSinResponsable({
  searchParams,
}: {
  searchParams: { inactivos?: string }
}) {
  if (!(await puedeVerReporteResponsables())) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Encabezado titulo="Proveedores sin responsable" atras={{ href: '/reportes', texto: 'Ver reportes' }} />
        <p className="card text-sm text-gray-600">
          Este reporte es de Contabilidad — es quien necesita saber a quién reclamarle por cada
          proveedor.
        </p>
      </main>
    )
  }

  const incluirInactivos = searchParams.inactivos === '1'
  const { hallazgos, sinActividad } = await listarProveedoresPorResponsable({ incluirInactivos })

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Encabezado titulo="Proveedores sin responsable" atras={{ href: '/reportes', texto: 'Ver reportes' }} />

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <Link
          href={incluirInactivos ? '/reportes/proveedores-sin-responsable' : '/reportes/proveedores-sin-responsable?inactivos=1'}
          className="rounded-full border border-gray-200 px-3 py-1 text-gray-600"
        >
          {incluirInactivos ? 'Ocultar inactivos' : 'Incluir proveedores inactivos'}
        </Link>
      </div>

      {hallazgos.length === 0 ? (
        <p className="card text-sm text-gray-600">
          Todos los proveedores con movimientos tienen responsable, y coincide con quien generó la
          última orden. Nada que revisar.
        </p>
      ) : (
        <Tabla filas={hallazgos} />
      )}

      {sinActividad.length > 0 ? (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-gray-600">
            {sinActividad.length} proveedor{sinActividad.length === 1 ? '' : 'es'} sin movimientos
            todavía — no es un hallazgo
          </summary>
          <div className="mt-2">
            <Tabla filas={sinActividad} />
          </div>
        </details>
      ) : null}
    </main>
  )
}

function Tabla({ filas }: { filas: FilaProveedorResponsable[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
            <th className="px-3 py-2 font-medium">Proveedor</th>
            <th className="px-3 py-2 font-medium">RUC</th>
            <th className="px-3 py-2 font-medium">Responsable</th>
            <th className="px-3 py-2 font-medium">Última actividad</th>
            <th className="px-3 py-2 font-medium">Situación</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={`${f.fuente}-${f.id}`} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
              <td className="px-3 py-2">
                <Link href={f.href} className="font-medium text-logisalud-teal underline">
                  {f.razonSocial}
                </Link>
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-gray-600">{f.ruc ?? '—'}</td>
              <td className="px-3 py-2">
                {f.responsable ?? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                    sin asignar
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-gray-600">
                {f.ultimaActividadFecha ? (
                  <>
                    {f.ultimaActividadPor ?? '—'}
                    <span className="block text-xs text-gray-500">
                      {f.ultimaActividadCodigo} · {f.ultimaActividadFecha.slice(0, 10)}
                    </span>
                  </>
                ) : (
                  '—'
                )}
              </td>
              <td className="px-3 py-2 text-gray-700">{ETIQUETA_DESENLACE[f.desenlace]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
