'use client'

import Link from 'next/link'

/**
 * El chip de filtro del módulo: nació en Cuentas por Pagar y se extrajo
 * cuando Pendientes de aprobar pidió el mismo filtro por tipo. Una sola
 * definición, para que los dos filtros se vean y se comporten igual.
 *
 * Acepta `href` (navegación con searchParams, como en Cuentas por Pagar) o
 * `onClick` (estado en el cliente, como en Pendientes de aprobar, donde las
 * filas ya están todas cargadas y filtrar no necesita ir al servidor).
 */
export function ChipFiltro({
  etiqueta, activo, href, onClick,
}: {
  etiqueta: string
  activo: boolean
  href?: string
  onClick?: () => void
}) {
  const clases = `rounded-full border px-3 py-1 ${
    activo
      ? 'border-logisalud-teal bg-logisalud-teal/10 text-logisalud-teal'
      : 'border-gray-200 text-gray-600'
  }`

  if (href) {
    return (
      <Link href={href} className={clases}>
        {etiqueta}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} aria-pressed={activo} className={clases}>
      {etiqueta}
    </button>
  )
}
