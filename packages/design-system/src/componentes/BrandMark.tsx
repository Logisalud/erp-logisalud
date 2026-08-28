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
 */
export type BrandMarkLayout = 'horizontal' | 'stacked' | 'icon'
export type BrandMarkColorway = 'color' | 'black' | 'white'

const ARCHIVO: Record<BrandMarkLayout, Record<BrandMarkColorway, string>> = {
  horizontal: {
    color: 'logisalud-color-horizontal.png',
    black: 'logisalud-black-horizontal.png',
    white: 'logisalud-white-horizontal.png',
  },
  stacked: {
    color: 'logisalud-color-stacked.png',
    black: 'logisalud-black-stacked.png',
    white: 'logisalud-white-stacked.png',
  },
  icon: {
    color: 'logisalud-icon-color.png',
    black: 'logisalud-icon-black.png',
    white: 'logisalud-icon-white.png',
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
  return (
    <img
      src={`/brand/${ARCHIVO[layout][colorway]}`}
      alt="Logisalud"
      height={height}
      style={{ height, width: 'auto' }}
      className={className}
    />
  )
}
