import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { buscarProveedoresUnificado } from '@/services/proveedores-unificado'
import { ETIQUETA_FUENTE_PROVEEDOR, type FuenteProveedor } from '@/domain/proveedor'

export const dynamic = 'force-dynamic'

/**
 * Punto único de entrada a proveedores — junta compras.proveedores
 * (mercadería/bienes) y servicios.proveedores_servicio (dos tablas reales
 * y separadas, ver services/proveedores-unificado.ts) en una sola
 * búsqueda. Sin gate por perfil a propósito: la policy RLS de cada tabla
 * ya restringe la escritura a compras/admin — ocultar el botón nunca fue
 * eso.
 */
export default async function Proveedores({
  searchParams,
}: {
  searchParams: { q?: string; fuente?: string }
}) {
  const fuente = searchParams.fuente === 'compra' || searchParams.fuente === 'servicio' ? searchParams.fuente : undefined
  const proveedores = await buscarProveedoresUnificado({ busqueda: searchParams.q, fuente })

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Encabezado titulo="Proveedores" atras={{ href: '/', texto: 'Módulos' }} />

      <div className="mb-4">
        <Link href="/proveedores/nuevo" className="btn-primary w-full sm:w-auto">
          + Nuevo proveedor
        </Link>
      </div>

      <form className="mb-4 flex flex-wrap gap-2">
        <input
          type="search"
          name="q"
          defaultValue={searchParams.q ?? ''}
          placeholder="RUC o razón social"
          className="min-h-12 flex-1 rounded-md border border-gray-300 px-3"
        />
        <select name="fuente" defaultValue={searchParams.fuente ?? ''} className="min-h-12 rounded-md border border-gray-300 bg-white px-3">
          <option value="">Todos</option>
          <option value="compra">Mercadería / bienes</option>
          <option value="servicio">Servicios</option>
        </select>
        <button type="submit" className="btn-secondary">Buscar</button>
      </form>

      {proveedores.length === 0 ? (
        <p className="card text-sm text-gray-600">
          {searchParams.q ? `Ningún proveedor coincide con "${searchParams.q}".` : 'Todavía no hay proveedores cargados.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {proveedores.map((p) => (
            <li key={`${p.fuente}-${p.id}`}>
              <Link
                href={p.fuente === 'compra' ? `/proveedores/${p.id}` : `/proveedores/servicio/${p.id}`}
                className="card block transition hover:shadow-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-medium">{p.razonSocial}</span>
                  <span className="flex items-center gap-2">
                    {/* Creado desde el alta rápida de una orden, sin cuenta
                        todavía — no se le puede pagar hasta cargarla. */}
                    {!p.tieneCuenta ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                        Falta cuenta bancaria
                      </span>
                    ) : null}
                    {!p.activo ? <span className="text-xs text-gray-500">inactivo</span> : null}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-gray-600">
                  RUC {p.ruc} · {p.condicionPagoDias} días · {p.monedaPrincipal} · {ETIQUETA_FUENTE_PROVEEDOR[p.fuente as FuenteProveedor]}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
