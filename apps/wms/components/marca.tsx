// Logo oficial. Con `unidoptimized` + basePath, next/image NO antepone el basePath: el
// prefijo se arma a mano (ver next.config.js y apps/compras/components/logo-logisalud.tsx).
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export function Marca({ variante = 'color', alto = 28 }: { variante?: 'color' | 'blanco'; alto?: number }) {
  const archivo = variante === 'blanco' ? 'logisalud-white-horizontal.png' : 'logisalud-color-horizontal.png'
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`${BASE}/brand/${archivo}`} alt="LOGISALUD" height={alto} style={{ height: alto, width: 'auto' }} />
}

export function MarcaIcono({ alto = 28 }: { alto?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`${BASE}/brand/logisalud-icon-color.png`} alt="LOGISALUD" height={alto} style={{ height: alto, width: 'auto' }} />
}
