import Link from 'next/link'
import { BotonCerrarSesion } from '@logisalud/auth/componentes'
import { perfilActual, usuarioActual } from '@logisalud/auth/server'

export const dynamic = 'force-dynamic'

/** Portada del módulo: sesión, Dashboard y el resto de las pantallas por Bounded Context. */
export default async function Inicio() {
  const usuario = await usuarioActual()
  const perfil = await perfilActual()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl">Compras y Pagos</h1>
          <p className="mt-1 text-sm text-gray-600">ERP LOGISALUD</p>
        </div>
        <BotonCerrarSesion />
      </header>

      <section className="card mt-6">
        <h2 className="font-heading text-lg">Sesión</h2>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex gap-2">
            <dt className="text-gray-500">Correo:</dt>
            <dd>{usuario?.email ?? '— sin sesión —'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-500">Nombre:</dt>
            <dd>{perfil?.nombre ?? '— sin perfil en public.perfiles —'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-500">Área:</dt>
            <dd>{perfil?.area ?? '—'}</dd>
          </div>
        </dl>
        {usuario && !perfil ? (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            Tu cuenta existe pero no tiene fila en <code>public.perfiles</code>, así que las
            políticas RLS te van a negar todo. Corré <code>scripts/seed-usuarios.ts</code>.
          </p>
        ) : null}
      </section>

      <Link href="/dashboard" className="btn-primary mt-4 w-full sm:w-auto">
        Dashboard — qué necesita atención
      </Link>

      <section className="card mt-4">
        <h2 className="font-heading text-lg">Compras</h2>
        <ul className="mt-3 space-y-2">
          <li>
            <Link href="/ordenes-compra" className="block rounded-md border border-gray-200 p-3 transition hover:shadow-sm">
              <span className="font-medium">Órdenes de compra</span>
              <p className="text-sm text-gray-600">Crear, ver y mandarle la OC al proveedor.</p>
            </Link>
          </li>
          <li>
            <Link href="/proveedores" className="block rounded-md border border-gray-200 p-3 transition hover:shadow-sm">
              <span className="font-medium">Proveedores</span>
              <p className="text-sm text-gray-600">Datos de contacto y cuentas bancarias.</p>
            </Link>
          </li>
        </ul>
      </section>

      <section className="card mt-4">
        <h2 className="font-heading text-lg">Almacén</h2>
        <ul className="mt-3 space-y-2">
          <li>
            <Link href="/almacen" className="block rounded-md border border-gray-200 p-3 transition hover:shadow-sm">
              <span className="font-medium">Recepciones</span>
              <p className="text-sm text-gray-600">
                Recibir contra una OC y resolver discrepancias (faltantes, dañados, vencidos…).
              </p>
            </Link>
          </li>
        </ul>
      </section>

      <section className="card mt-4">
        <h2 className="font-heading text-lg">Cuentas por Pagar</h2>
        <ul className="mt-3 space-y-2">
          <li>
            <Link href="/cuentas-por-pagar" className="block rounded-md border border-gray-200 p-3 transition hover:shadow-sm">
              <span className="font-medium">Obligaciones</span>
              <p className="text-sm text-gray-600">
                Registrar la factura desde una recepción conforme, dar conformidad, notas de crédito.
              </p>
            </Link>
          </li>
          <li>
            <Link href="/cuentas-por-pagar/propuestas" className="block rounded-md border border-gray-200 p-3 transition hover:shadow-sm">
              <span className="font-medium">Propuestas de pago</span>
              <p className="text-sm text-gray-600">
                Armar el lote semanal, aprobación de Gerencia, ejecutar el pago.
              </p>
            </Link>
          </li>
        </ul>
        <p className="mt-3 text-sm text-gray-500">
          Obligaciones de origen "compra", "gasto_directo", "reembolso" y "anticipo" — Servicios,
          Caja Chica, Financiamiento e Impuestos tienen su modelo de datos y sus políticas
          aplicadas; las pantallas vienen después.
        </p>
      </section>

      <section className="card mt-4">
        <h2 className="font-heading text-lg">Gastos y Anticipos</h2>
        <ul className="mt-3 space-y-2">
          <li>
            <Link href="/gastos" className="block rounded-md border border-gray-200 p-3 transition hover:shadow-sm">
              <span className="font-medium">Mis solicitudes</span>
              <p className="text-sm text-gray-600">
                Pedir un gasto directo, reembolso o anticipo, y rendir los anticipos ya pagados.
              </p>
            </Link>
          </li>
        </ul>
      </section>

      <section className="card mt-4">
        <h2 className="font-heading text-lg">Financiamiento e Impuestos</h2>
        <ul className="mt-3 space-y-2">
          <li>
            <Link href="/financiamiento" className="block rounded-md border border-gray-200 p-3 transition hover:shadow-sm">
              <span className="font-medium">Préstamos, fraccionamiento SUNAT, impuestos</span>
              <p className="text-sm text-gray-600">
                Cronograma de cuotas, vencimientos próximos, planilla vía BUK. Las letras por pagar
                se generan desde una obligación de compra en Cuentas por Pagar.
              </p>
            </Link>
          </li>
        </ul>
      </section>

      <section className="card mt-4">
        <h2 className="font-heading text-lg">Caja Chica</h2>
        <ul className="mt-3 space-y-2">
          <li>
            <Link href="/caja-chica" className="block rounded-md border border-gray-200 p-3 transition hover:shadow-sm">
              <span className="font-medium">Mis fondos</span>
              <p className="text-sm text-gray-600">
                Registrar un gasto del fondo fijo y pedir reposición cuando se agota.
              </p>
            </Link>
          </li>
        </ul>
      </section>
    </main>
  )
}
