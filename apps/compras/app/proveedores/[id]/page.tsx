import { notFound } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { obtenerProveedor } from '@/services/proveedores'
import { FormularioCuentaBancariaProveedor } from './formulario-cuenta-bancaria'

export const dynamic = 'force-dynamic'

const ETIQUETA_TIPO = { mercaderia: 'Mercadería', bien: 'Bienes (no revendemos)', ambos: 'Mercadería y bienes' } as const

export default async function DetalleProveedor({ params }: { params: { id: string } }) {
  const datos = await obtenerProveedor(params.id)
  if (!datos) notFound()
  const { proveedor, cuentas } = datos

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Encabezado
        titulo={proveedor.razon_social}
        atras={{ href: '/proveedores', texto: 'Proveedores' }}
      />

      <section className="card">
        <h2 className="font-heading text-lg">Datos</h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          <Dato termino="RUC" valor={proveedor.ruc} />
          <Dato termino="Nombre comercial" valor={proveedor.nombre_comercial} />
          <Dato termino="Contacto" valor={proveedor.contacto_nombre} />
          <Dato termino="Correo" valor={proveedor.contacto_email} />
          <Dato termino="Teléfono" valor={proveedor.contacto_telefono} />
          <Dato termino="Le compramos" valor={ETIQUETA_TIPO[proveedor.tipo]} />
          <Dato termino="Condición de pago" valor={`${proveedor.condicion_pago_dias} días`} />
          <Dato termino="Moneda" valor={proveedor.moneda_principal} />
          <Dato termino="Estado" valor={proveedor.activo ? 'Activo' : 'Inactivo'} />
        </dl>
      </section>

      <FormularioCuentaBancariaProveedor
        proveedorId={proveedor.id}
        cuentas={cuentas}
        nombreProveedor={proveedor.razon_social}
      />
    </main>
  )
}

function Dato({ termino, valor }: { termino: string; valor: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="text-gray-500">{termino}:</dt>
      <dd>{valor || '—'}</dd>
    </div>
  )
}
