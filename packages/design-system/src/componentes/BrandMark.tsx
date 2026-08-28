import Image from 'next/image'

/**
 * Renderiza el logo oficial de Logisalud. Nunca desenfocar, distorsionar,
 * rotar, recolorear ni sombrear el logo (regla de marca explícita) — por
 * eso este componente no acepta className para tintar o transformar la
 * imagen, solo `size`/`className` para el contenedor.
 *
 * Cada app consumidora tiene que copiar los PNG de
 * `packages/design-system/src/assets/` a su propio `public/brand/` (Next.js
 * sirve estáticos desde el `public/` de cada app, no desde node_modules) —
 * este componente asume esa ruta.
 *
 * Usa `next/image` (no un `<img>` plano) a propósito: las tres apps sirven
 * bajo un `basePath` distinto (`/compras`, futuro `/pedidos`, ninguno en
 * cobranzas) y `next/image` es quien antepone ese basePath solo a un `src`
 * que arranca con `/` — un `<img src="/brand/...">` plano pide siempre la
 * raíz del host y rompe en cualquier app con basePath (ícono roto).
 */
export type BrandMarkLayout = 'horizontal' | 'stacked' | 'icon'
export type BrandMarkColorway = 'color' | 'black' | 'white'

const ARCHIVO: Record<BrandMarkLayout, Record<BrandMarkColorway, { archivo: string; ancho: number; alto: number }>> = {
  horizontal: {
    color: { archivo: 'logisalud-color-horizontal.png', ancho: 1798, alto: 358 },
    black: { archivo: 'logisalud-black-horizontal.png', ancho: 5956, alto: 1188 },
    white: { archivo: 'logisalud-white-horizontal.png', ancho: 1800, alto: 359 },
  },
  stacked: {
    color: { archivo: 'logisalud-color-stacked.png', ancho: 1200, alto: 844 },
    black: { archivo: 'logisalud-black-stacked.png', ancho: 2969, alto: 2088 },
    white: { archivo: 'logisalud-white-stacked.png', ancho: 2969, alto: 2088 },
  },
  icon: {
    color: { archivo: 'logisalud-icon-color.png', ancho: 262, alto: 257 },
    black: { archivo: 'logisalud-icon-black.png', ancho: 262, alto: 257 },
    white: { archivo: 'logisalud-icon-white.png', ancho: 262, alto: 257 },
  },
}

export function BrandMark({
  layout = 'horizontal',
  colorway = 'color',
  height = 32,
  className,
}: {
  layout?: BrandMarkLayout
  colorway?: BrandMarkColorway
  /** Alto en px — el ancho se ajusta solo, la imagen mantiene su proporción real. */
  height?: number
  className?: string
}) {
  const { archivo, ancho, alto } = ARCHIVO[layout][colorway]
  return (
    <Image
      src={`/brand/${archivo}`}
      alt="Logisalud"
      width={ancho}
      height={alto}
      style={{ height, width: 'auto' }}
      className={className}
      priority
    />
  )
}
