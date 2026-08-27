import { notFound } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { obtenerProveedor } from '@/services/proveedores'

export const dynamic = 'force-dynamic'

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
          <Dato termino="Condición de pago" valor={`${proveedor.condicion_pago_dias} días`} />
          <Dato termino="Moneda" valor={proveedor.moneda_principal} />
          <Dato termino="Estado" valor={proveedor.activo ? 'Activo' : 'Inactivo'} />
        </dl>
      </section>

      <section className="card mt-4">
        <h2 className="font-heading text-lg">Cuentas bancarias</h2>
        {cuentas.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">
            Sin cuentas registradas. Sin una cuenta no se le puede programar un pago.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {cuentas.map((c) => (
              <li key={c.id} className="rounded-md border border-gray-200 p-3 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {c.banco} · {c.moneda}
                  </span>
                  {c.es_principal ? (
                    <span className="text-xs font-medium text-logisalud-green">principal</span>
                  ) : null}
                </div>
                <p className="mt-1 text-gray-600">
                  {c.tipo_cuenta ? `${c.tipo_cuenta} · ` : ''}
                  {c.numero_cuenta}
                </p>
                <p className="mt-0.5 font-mono text-xs text-gray-500">CCI {c.cci}</p>
                <p className="mt-0.5 text-gray-600">Titular: {c.titular}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
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
