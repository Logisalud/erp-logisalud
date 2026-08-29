'use client'

import { useEffect } from 'react'
import { usePilaNavegacion } from './pila-navegacion-provider'

/**
 * Registra el paso actual en la pila de navegación sin renderizar nada —
 * para pantallas que no usan <Encabezado> (la portada del módulo tiene su
 * propio header con el logo) pero igual necesitan quedar en la pila.
 *
 * Sin esto, la portada nunca aparece como paso: un hijo que pierde toda su
 * historia real (pila con un solo paso) cae al `atras` estático sin sacar
 * nada de la pila, y el hijo siguiente vuelve a apilarse — dos pantallas
 * rebotando entre sí para siempre, sin nunca llegar a la portada. Bug real
 * visto entre "Órdenes de compra" y "Nueva orden de compra de un bien".
 */
export function RegistrarPaso({ href, texto }: { href: string; texto: string }) {
  const { registrarPaso } = usePilaNavegacion()

  useEffect(() => {
    registrarPaso({ href, texto })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [href, texto])

  return null
}
