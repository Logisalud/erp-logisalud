import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { perfilActual } from '@logisalud/auth/server'
import { listarProveedores } from '@/services/proveedores'
import { FormularioOCBien } from './formulario'

export const dynamic = 'force-dynamic'

/** Igual que /ordenes-compra/nueva pero para bienes que NO son para revender
 * (equipos, muebles) — no están en catalogo.productos, así que las líneas
 * son texto libre en vez del buscador de producto. */
export default async function NuevaOCBien() {
  const [proveedores, perfil] = await Promise.all([
    listarProveedores({ tipo: 'bien' }),
    perfilActual(),
  ])
  const puedeRegistrarProveedor = perfil?.area === 'compras' || perfil?.area === 'admin'

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Encabezado
        titulo="Nueva orden de compra de un bien"
        atras={{ href: '/ordenes-compra', texto: 'Órdenes de compra' }}
      />
      {proveedores.length === 0 ? (
        <div className="card space-y-3 text-sm text-gray-600">
          <p>
            No hay proveedores de bienes cargados. {puedeRegistrarProveedor
              ? 'Registra el primero para poder crear una orden.'
              : 'Pídele a Compras que cargue al menos uno antes de poder crear una orden.'}
          </p>
          {puedeRegistrarProveedor ? (
            <Link href="/proveedores/nuevo?tipo=bien&volver=/ordenes-compra/nueva-bien" className="btn-primary w-full sm:w-auto">
              Registrar proveedor
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          <FormularioOCBien
            proveedores={proveedores.map((p) => ({
              id: p.id,
              nombre: `${p.razon_social} — RUC ${p.ruc}`,
              condicionPagoDias: p.condicion_pago_dias,
              moneda: p.moneda_principal,
            }))}
          />
          {puedeRegistrarProveedor ? (
            <Link
              href="/proveedores/nuevo?tipo=bien&volver=/ordenes-compra/nueva-bien"
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
