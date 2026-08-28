import Link from 'next/link'
import { BotonCerrarSesion } from '@logisalud/auth/componentes'
import { perfilActual, usuarioActual } from '@logisalud/auth/server'
import { BrandMark } from '@logisalud/design-system/componentes'
import { determinarVistaEntrada } from '@/domain/inicio'
import { obtenerResumenGerencia, obtenerResumenTesoreria } from '@/services/inicio'

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

      <section className="mt-4 space-y-3">
        <MenuItem
          href="/ordenes-compra/nueva" emoji="🛒"
          titulo="Crear orden de compra de mercadería"
          descripcion="Productos que compramos para revender (catálogo)."
        />
        <MenuItem
          href="/ordenes-compra/nueva-bien" emoji="💼"
          titulo="Crear orden de compra de un bien"
          descripcion="Bienes que NO son para revender (equipos, muebles, etc.)."
        />
        <MenuItem
          href="/servicios/nueva" emoji="🤝"
          titulo="Contratar un servicio"
          descripcion="Orden de Servicio a un proveedor de servicios."
        />
        <MenuItem
          href="/pedir-pago" emoji="💵"
          titulo="Pedir un pago"
          descripcion="Reembolso, anticipo, o pago directo a un proveedor."
        />
        <MenuItem
          href="/cuentas-por-pagar/reportes" emoji="📊"
          titulo="Ver reportes"
          descripcion="Cuentas por pagar, pendientes, facturas, detracciones."
        />
      </section>

      <section className="mt-5">
        <h2 className="text-xs font-medium text-gray-500">Otras gestiones</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            href="/impuestos/nueva"
            className="flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50"
          >
            <span aria-hidden>🧮</span> Registrar impuesto
          </Link>
          <Link
            href="/caja-chica"
            className="flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50"
          >
            <span aria-hidden>💳</span> Caja chica
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

      <section className="mt-4">
        <h2 className="font-heading mb-2 text-lg">Compras</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <AccionVerbo href="/ordenes-compra/nueva" emoji="🧾" color="green" titulo="Crear Orden de Compra" descripcion="Elige proveedor, productos y mándale la OC." />
          <AccionVerbo href="/proveedores/nuevo" emoji="🏢" color="teal" titulo="Registrar Proveedor" descripcion="RUC, contacto y condición de pago." />
        </div>
        <Link href="/ordenes-compra" className="mt-2 inline-block text-sm text-logisalud-teal underline">
          Ver órdenes de compra
        </Link>
      </section>

      <section className="mt-4">
        <h2 className="font-heading mb-2 text-lg">Almacén</h2>
        <AccionVerbo href="/almacen/recepciones/nueva" emoji="📦" color="green" titulo="Recibir mercadería" descripcion="Recibir contra una OC y resolver discrepancias (faltantes, dañados, vencidos…)." />
        <Link href="/almacen" className="mt-2 inline-block text-sm text-logisalud-teal underline">
          Ver recepciones
        </Link>
      </section>

      <section className="mt-4">
        <h2 className="font-heading mb-2 text-lg">Cuentas por Pagar</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <AccionVerbo href="/almacen" emoji="🧾" color="green" titulo="Registrar factura" descripcion="Desde una recepción conforme de Almacén." />
          <AccionVerbo href="/cuentas-por-pagar" emoji="✅" color="teal" titulo="Dar conformidad" descripcion="Revisa las obligaciones pendientes y confirma cada una." />
        </div>
        <Link href="/cuentas-por-pagar/propuestas" className="btn-secondary mt-3 w-full sm:w-auto">
          Propuestas de pago
        </Link>
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

      <section className="mt-4">
        <h2 className="font-heading mb-2 text-lg">Financiamiento e Impuestos</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <AccionVerbo href="/financiamiento/prestamos/nueva" emoji="🏦" color="green" titulo="Registrar financiamiento" descripcion="Préstamo o fraccionamiento SUNAT, con su cronograma de cuotas." />
          <AccionVerbo href="/impuestos/nueva" emoji="🧮" color="teal" titulo="Cargar impuesto" descripcion="Essalud, ONP, AFP, Renta, Seguro Vida Ley — por periodo." />
        </div>
        <Link href="/financiamiento" className="mt-2 inline-block text-sm text-logisalud-teal underline">
          Ver préstamos, fraccionamientos y vencimientos
        </Link>
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

const COLOR_BORDE = {
  green: 'border-logisalud-green',
  teal: 'border-logisalud-teal',
} as const
const COLOR_TEXTO = {
  green: 'text-logisalud-green',
  teal: 'text-logisalud-teal',
} as const

/** Ítem del menú principal — lista plana de acciones, una por fila, sin
 * agrupar por Bounded Context: la persona no tiene que saber qué contexto
 * gobierna cada cosa, solo qué quiere hacer. */
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

/**
 * Botón de acción principal por verbo — mismo patrón que ya usa Cobranzas en
 * su propia home (emoji + título en color + descripción de una línea, borde
 * de color) para que las tres apps del ERP se sientan un mismo sistema.
 */
function AccionVerbo({
  href, emoji, color, titulo, descripcion,
}: { href: string; emoji: string; color: 'green' | 'teal'; titulo: string; descripcion: string }) {
  return (
    <Link
      href={href}
      className={`block rounded-lg border-2 bg-white p-5 shadow-sm transition hover:shadow-md ${COLOR_BORDE[color]}`}
    >
      <h3 className={`font-heading text-base ${COLOR_TEXTO[color]}`}>
        <span aria-hidden>{emoji}</span> {titulo}
      </h3>
      <p className="mt-1 text-sm text-gray-600">{descripcion}</p>
    </Link>
  )
}
