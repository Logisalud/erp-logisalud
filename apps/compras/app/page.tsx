import Link from 'next/link'
import { BotonCerrarSesion } from '@logisalud/auth/componentes'
import { perfilActual, usuarioActual } from '@logisalud/auth/server'
import { BrandMark } from '@logisalud/design-system/componentes'
import { determinarVistaEntrada } from '@/domain/inicio'
import { obtenerResumenGerencia, obtenerResumenTesoreria } from '@/services/inicio'
import { RegistrarPaso } from '@/components/registrar-paso'

export const dynamic = 'force-dynamic'

/**
 * Portada del módulo — tres secciones por tarea (Para hacer / Para
 * consultar / Otras gestiones), no por Bounded Context: la persona no tiene
 * que saber qué schema gobierna cada cosa, solo qué quiere hacer. Todo card
 * reutiliza una ruta que ya funciona — nada de rutas simuladas.
 */
export default async function Inicio() {
  const usuario = await usuarioActual()
  const perfil = await perfilActual()
  const vista = determinarVistaEntrada(perfil?.area)

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <RegistrarPaso href="/" texto="Compras y Pagos" />
      <header className="flex items-start justify-between gap-4">
        <div>
          <a href="/" className="text-sm text-logisalud-teal underline">
            &larr; Módulos
          </a>
          <BrandMark layout="horizontal" colorway="color" height={28} className="mt-2" />
          <h1 className="font-heading mt-2 text-2xl">🛒 Compras y Pagos</h1>
        </div>
        <BotonCerrarSesion />
      </header>

      {vista === 'tesoreria' ? <HeroTesoreria /> : null}
      {vista === 'gerencia' ? <HeroGerencia /> : null}

      <Grupo titulo="Para hacer">
        <MenuItem
          href="/ordenes" emoji="🛒"
          titulo="Órdenes de compra y servicio"
          descripcion="Crea una orden o revisa en qué etapa se encuentra."
        />
        <MenuItem
          href="/ordenes?pendientes=1" emoji="🧾"
          titulo="Registrar una factura"
          descripcion="Búscala en el listado y vincúlala con la orden aprobada para continuar hacia el pago."
        />
        <MenuItem
          href="/cuentas-por-pagar?estado=registrada" emoji="✅"
          titulo="Revisar facturas"
          descripcion="Revisa los documentos registrados y confirma que estén correctos."
        />
        <MenuItem
          href="/pedir-pago" emoji="💸"
          titulo="Pedir un pago"
          descripcion="Solicita un reembolso, anticipo o pago directo a un proveedor."
        />
      </Grupo>

      <Grupo titulo="Para consultar">
        <MenuItem
          href="/dashboard" emoji="📊"
          titulo="Dashboard"
          descripcion="Revisa pendientes, alertas y próximos vencimientos."
        />
        <MenuItem
          href="/cuentas-por-pagar" emoji="💳"
          titulo="Cuentas por pagar"
          descripcion="Consulta obligaciones, vencimientos y pagos realizados."
        />
        <MenuItem
          href="/reportes" emoji="📈"
          titulo="Reportes"
          descripcion="Consulta y descarga la información de compras y pagos."
        />
      </Grupo>

      <Grupo titulo="Otras gestiones">
        <MenuItem
          href="/proveedores" emoji="🏢"
          titulo="Proveedores"
          descripcion="Registra y actualiza proveedores y sus datos bancarios."
        />
        <MenuItem
          href="/impuestos/nueva" emoji="🧮"
          titulo="Registrar un impuesto"
          descripcion="Registra obligaciones tributarias para su programación y pago."
        />
        <MenuItem
          href="/caja-chica" emoji="💰"
          titulo="Caja chica"
          descripcion="Administra fondos, gastos y reposiciones de caja chica."
        />
      </Grupo>

      <section className="mt-4">
        <div className="flex flex-wrap gap-2">
          <Link
            href="/financiamiento"
            className="flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50"
          >
            <span aria-hidden>🏦</span> Financiamiento
          </Link>
          <Link
            href="/almacen"
            className="flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50"
          >
            <span aria-hidden>📦</span> Almacén
          </Link>
          <Link
            href="/mi-cuenta-bancaria"
            className="flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50"
          >
            <span aria-hidden>🏦</span> Mi cuenta bancaria
          </Link>
        </div>
      </section>

      {usuario && !perfil ? (
        <p className="card mt-4 border-amber-200 bg-amber-50 text-sm text-amber-900">
          Tu cuenta existe pero no tiene fila en <code>public.perfiles</code>, así que las
          políticas RLS te van a negar todo. Corré <code>scripts/seed-usuarios.ts</code>.
        </p>
      ) : null}

      <details className="mt-6">
        <summary className="cursor-pointer text-sm font-medium text-gray-600">
          Sesión
        </summary>
        <section className="card mt-4">
          <dl className="mt-1 space-y-1.5 text-sm">
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

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">{titulo}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function MenuItem({
  href, emoji, titulo, descripcion,
}: { href: string; emoji: string; titulo: string; descripcion: string }) {
  return (
    <Link
      href={href}
      className="flex items-start gap-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md"
    >
      <span aria-hidden className="mt-0.5 text-2xl">{emoji}</span>
      <span>
        <span className="font-heading block text-base">{titulo}</span>
        <span className="mt-1 block text-sm text-gray-600">{descripcion}</span>
      </span>
    </Link>
  )
}
