'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

/** Los banners de empleados (DEMO y PILOTO) no se muestran en las páginas públicas del cliente (`/seguimiento`). El resto de las pantallas los lleva siempre. */
export function OcultarEnPublicas({ children }: { children: ReactNode }) {
  const ruta = usePathname() ?? ''
  return ruta === '/seguimiento' || ruta.startsWith('/seguimiento/') ? null : <>{children}</>
}
