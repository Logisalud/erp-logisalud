import Link from 'next/link'
import { BotonCerrarSesion } from '@logisalud/auth/componentes'
import { perfilActual, usuarioActual } from '@logisalud/auth/server'
import { determinarVistaEntrada } from '@/domain/inicio'
import {
  obtenerResumenAlmacen,
  obtenerResumenContabilidad,
  obtenerResumenGerencia,
  obtenerResumenTesoreria,
} from '@/services/inicio'

export const dynamic = 'force-dynamic'

/** Portada del módulo: hero por rol, "Pedir un pago", Dashboard y el resto por Bounded Context. */
export default async function Inicio() {
  const usuario = await usuarioActual()
  const perfil = await perfilActual()
  const vista = determinarVistaEntrada(perfil?.area)

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl">Compras y Pagos</h1>
          <p className="mt-1 text-sm text-gray-600">ERP LOGISALUD</p>
        </div>
        <BotonCerrarSesion />
      </header>

      {vista === 'tesoreria' ? <HeroTesoreria /> : null}
      {vista === 'almacen' ? <HeroAlmacen /> : null}
      {vista === 'contabilidad' ? <HeroContabilidad /> : null}
      {vista === 'gerencia' ? <HeroGerencia /> : null}

      <Link href="/pedir-pago" className="btn-primary mt-4 w-full sm:w-auto">
        Pedir un pago
      </Link>

      <Link href="/dashboard" className="btn-secondary mt-3 w-full sm:w-auto">
        Dashboard — qué necesita atención
      </Link>

      {usuario && !perfil ? (
        <p className="card mt-4 border-amber-200 bg-amber-50 text-sm text-amber-900">
          Tu cuenta existe pero no tiene fila en <code>public.perfiles</code>, así que las
          políticas RLS te van a negar todo. Corré <code>scripts/seed-usuarios.ts</code>.
        </p>
      ) : null}

      <details className="mt-6">
        <summary className="cursor-pointer text-sm font-medium text-gray-600">
          Ver todas las secciones
        </summary>

      <section className="card mt-4">
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
      </section>

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
      </details>
    </main>
  )
}

async function HeroTesoreria() {
  const { propuestasListasParaPagar } = await obtenerResumenTesoreria()
  return (
    <Link href="/cuentas-por-pagar/propuestas" className="card-highlight mt-6 block">
      <p className="text-sm text-gray-600">Qué tengo que pagar hoy</p>
      <p className="font-heading mt-1 text-3xl">{propuestasListasParaPagar}</p>
      <p className="mt-1 text-sm text-gray-600">
        {propuestasListasParaPagar === 1 ? 'propuesta lista para ejecutar' : 'propuestas listas para ejecutar'}
      </p>
    </Link>
  )
}

async function HeroAlmacen() {
  const { recepcionesPendientes } = await obtenerResumenAlmacen()
  return (
    <Link href="/almacen" className="card-highlight mt-6 block">
      <p className="text-sm text-gray-600">Tus recepciones pendientes</p>
      <p className="font-heading mt-1 text-3xl">{recepcionesPendientes}</p>
      <p className="mt-1 text-sm text-gray-600">
        {recepcionesPendientes === 1 ? 'recepción por resolver' : 'recepciones por resolver'}
      </p>
    </Link>
  )
}

async function HeroContabilidad() {
  const { totalPendientes } = await obtenerResumenContabilidad()
  return (
    <Link href="/dashboard" className="card-highlight mt-6 block">
      <p className="text-sm text-gray-600">Pendientes de tu cola</p>
      <p className="font-heading mt-1 text-3xl">{totalPendientes}</p>
      <p className="mt-1 text-sm text-gray-600">
        {totalPendientes === 1 ? 'caso que necesita atención' : 'casos que necesitan atención'}
      </p>
    </Link>
  )
}

async function HeroGerencia() {
  const { propuestasPorAprobar } = await obtenerResumenGerencia()
  return (
    <Link href="/cuentas-por-pagar/propuestas" className="card-highlight mt-6 block">
      <p className="text-sm text-gray-600">Propuestas por aprobar</p>
      <p className="font-heading mt-1 text-3xl">{propuestasPorAprobar}</p>
      <p className="mt-1 text-sm text-gray-600">
        {propuestasPorAprobar === 1 ? 'propuesta esperando tu aprobación' : 'propuestas esperando tu aprobación'}
      </p>
    </Link>
  )
}
