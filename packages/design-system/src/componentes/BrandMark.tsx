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
 * Las tres apps sirven bajo un `basePath` distinto (`/compras`, futuro
 * `/pedidos`, ninguno en cobranzas). La teoría era que `next/image`
 * antepone ese basePath solo a cualquier `src` que arranque con `/` — pero
 * confirmado en producción (fetch directo a erp.logisalud.com/compras) que
 * con `images.unoptimized: true` (necesario en compras, ver next.config.js)
 * next/image NO hace ese prefijo: el `<img>` final queda con
 * `src="/brand/...png"` a secas, que pide la raíz del host (cobranzas) y
 * rompe (ícono de imagen rota). Por eso acá se arma el path a mano con
 * `NEXT_PUBLIC_BASE_PATH` — mismo mecanismo que ya usa
 * `components/buscador-producto.tsx` para sus fetches de cliente, por la
 * misma razón: lo automático no se puede dar por hecho en esta app.
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
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
  return (
    <Image
      src={`${basePath}/brand/${archivo}`}
      alt="Logisalud"
      width={ancho}
      height={alto}
      style={{ height, width: 'auto' }}
      className={className}
      priority
    />
  )
}
