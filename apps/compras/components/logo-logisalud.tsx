import Image from 'next/image'

/**
 * El logo de la empresa, con su ruta resuelta UNA sola vez.
 *
 * POR QUÉ EL PREFIJO VA A MANO: la app corre con `basePath: '/compras'`, y
 * hasta ahora el `src` iba sin prefijo porque `next/image` lo agregaba solo.
 * Dejó de ser cierto cuando se puso `images: { unoptimized: true }` (para
 * esquivar el 404 del optimizador a través del rewrite entre proyectos de
 * Vercel): con `unoptimized`, `generateImgAttrs` de Next devuelve el `src`
 * TAL CUAL —sin loader y sin basePath—, así que el navegador pedía
 * `erp.logisalud.com/brand/...`, que es la raíz de cobranzas, no de compras.
 * Cobranzas no tiene `public/brand/`, entonces 404 y logo en blanco.
 *
 * Se veía en el PDF que sale por correo porque ese documento no pide ninguna
 * URL: `services/pdf-documentos.tsx` incrusta el logo en base64.
 *
 * `NEXT_PUBLIC_BASE_PATH` es la misma variable que ya usan los combobox para
 * sus `fetch` (ver components/buscador-producto.tsx) — mismo problema, misma
 * solución, un solo lugar donde vive el prefijo.
 */
const RUTA_LOGO = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/brand/logisalud-color-horizontal.png`

export function LogoLogisalud({ alto = 32 }: { alto?: number }) {
  return (
    <Image
      src={RUTA_LOGO}
      alt="Logisalud"
      width={1798}
      height={358}
      style={{ height: `${alto}px`, width: 'auto' }}
      priority
    />
  )
}
