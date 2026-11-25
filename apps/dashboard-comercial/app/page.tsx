import { redirect } from 'next/navigation'

/**
 * La raíz la reescribe `next.config.mjs` hacia `/tablero.html`, así que
 * esta página solo se alcanza si esa reescritura falla. Mandar al tablero
 * evita una pantalla en blanco sin explicación.
 */
export default function Inicio() {
  redirect('/tablero.html')
}
