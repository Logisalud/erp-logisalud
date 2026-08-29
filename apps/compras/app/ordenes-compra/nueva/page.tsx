import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { perfilActual } from '@logisalud/auth/server'
import { listarProveedores } from '@/services/proveedores'
import { FormularioOC } from './formulario'

export const dynamic = 'force-dynamic'

export default async function NuevaOC() {
  const [proveedores, perfil] = await Promise.all([
    listarProveedores({ tipo: 'mercaderia' }),
    perfilActual(),
  ])
  const puedeRegistrarProveedor = perfil?.area === 'compras' || perfil?.area === 'admin'

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Encabezado
        titulo="Nueva orden de compra"
        atras={{ href: '/ordenes-compra', texto: 'Órdenes de compra' }}
      />
      {proveedores.length === 0 ? (
        <div className="card space-y-3 text-sm text-gray-600">
          <p>
            No hay proveedores de mercadería cargados. {puedeRegistrarProveedor
              ? 'Registra el primero para poder crear una orden.'
              : 'Pídele a Compras que cargue al menos uno antes de poder crear una orden.'}
          </p>
          {puedeRegistrarProveedor ? (
            <Link href="/proveedores/nuevo?tipo=mercaderia&volver=/ordenes-compra/nueva" className="btn-primary w-full sm:w-auto">
              Registrar proveedor
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          <FormularioOC />
          {puedeRegistrarProveedor ? (
            <Link
              href="/proveedores/nuevo?tipo=mercaderia&volver=/ordenes-compra/nueva"
              className="mt-3 inline-block text-sm text-logisalud-teal underline"
            >
              Registrar otro proveedor
            </Link>
          ) : null}
        </>
      )}
    </main>
  )
}
