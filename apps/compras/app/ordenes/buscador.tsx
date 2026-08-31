'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

/**
 * Búsqueda con debounce que actualiza la URL (searchParams) sin recargar
 * toda la página — Next re-renderiza el Server Component de /ordenes con
 * los nuevos parámetros. Vuelve a página 1 en cada búsqueda nueva: seguir
 * en la página 4 de un filtro que ya no aplica mostraría "sin resultados"
 * de forma confusa.
 */
export function BuscadorOrdenes({ valorInicial }: { valorInicial: string }) {
  const [valor, setValor] = useState(valorInicial)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (valor.trim()) params.set('q', valor.trim())
      else params.delete('q')
      params.delete('pagina')
      router.push(`${pathname}?${params.toString()}`)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor])

  return (
    <input
      type="search"
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      placeholder="Buscar por número de orden, proveedor o RUC…"
      className="min-h-12 w-full rounded-md border border-gray-300 px-3"
      aria-label="Buscar órdenes"
    />
  )
}
