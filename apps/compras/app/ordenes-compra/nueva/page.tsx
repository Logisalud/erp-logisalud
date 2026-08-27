import { Encabezado } from '@/components/nav'
import { listarProveedores } from '@/services/proveedores'
import { FormularioOC } from './formulario'

export const dynamic = 'force-dynamic'

export default async function NuevaOC() {
  const proveedores = await listarProveedores()

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Encabezado
        titulo="Nueva orden de compra"
        atras={{ href: '/ordenes-compra', texto: 'Órdenes de compra' }}
      />
      {proveedores.length === 0 ? (
        <p className="card text-sm text-gray-600">
          No hay proveedores cargados. Una orden de compra necesita un proveedor.
        </p>
      ) : (
        <FormularioOC
          proveedores={proveedores.map((p) => ({
            id: p.id,
            nombre: `${p.razon_social} — RUC ${p.ruc}`,
            condicionPagoDias: p.condicion_pago_dias,
            moneda: p.moneda_principal,
          }))}
        />
      )}
    </main>
  )
}
