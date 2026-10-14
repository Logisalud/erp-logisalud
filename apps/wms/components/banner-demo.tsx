'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { FlaskConical } from 'lucide-react'
import { cambiarRolDemoAccion } from '@/app/acciones-entradas'
import type { Rol } from '@/domain/tipos'
import { ETIQUETA_ROL } from '@/domain/permisos'

const ROLES: Rol[] = ['jefe_almacen', 'auxiliar', 'asistente_dt', 'direccion_tecnica', 'admin_wms', 'auditoria_lectura']

/** Aviso visible en TODA pantalla mientras el modo demostración esté activo (fijo arriba, alto 2.25rem). */
export function BannerDemo({ rolActual }: { rolActual?: Rol | null }) {
  const router = useRouter()
  const [, empezar] = useTransition()
  return (
    <div
      role="status"
      data-testid="banner-demo"
      className="sticky top-0 z-[70] flex h-9 items-center justify-center gap-2 bg-gray-900 px-3 text-xs font-medium text-white"
    >
      <FlaskConical className="h-4 w-4 shrink-0 text-teal-300" aria-hidden />
      <span className="rounded bg-teal-300 px-1.5 py-0.5 font-bold tracking-wide text-teal-950">DEMO</span>
      <span className="truncate sm:hidden">Datos de prueba</span>
      <span className="hidden truncate sm:inline lg:hidden">Datos de prueba, sin base real</span>
      <span className="hidden truncate lg:inline">Datos de prueba, sin conexión a ninguna base real. Lo que hagas aquí no se guarda.</span>
      {rolActual && (
        <label className="ml-1 flex shrink-0 items-center gap-1.5">
          <span className="sr-only sm:not-sr-only sm:text-gray-300">Probar como</span>
          <select aria-label="Cambiar el rol de prueba" data-testid="cambiar-rol-demo" value={rolActual}
            onChange={(e) => empezar(async () => { await cambiarRolDemoAccion(e.target.value); router.refresh() })}
            className="h-7 max-w-[11rem] rounded border border-gray-600 bg-gray-800 px-1.5 text-xs text-white focus:border-teal-300">
            {ROLES.map((r) => <option key={r} value={r}>{ETIQUETA_ROL[r]}</option>)}
          </select>
        </label>
      )}
    </div>
  )
}
