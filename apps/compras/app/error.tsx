'use client'

import { useEffect } from 'react'
import Link from 'next/link'

/**
 * Lo que se ve cuando una pantalla del módulo se cae.
 *
 * Sin esto, Next muestra su pantalla blanca de fábrica: "Application error: a
 * server-side exception has occurred" y un número suelto. Sebas nos mandó dos
 * capturas de esa pantalla en dos días y ninguna decía qué hacer ni a quién
 * avisar; el número —el `digest`— es justamente lo único que sirve para
 * encontrar el error en los logs, así que acá se muestra grande y con su
 * nombre, no escondido en una línea gris.
 *
 * No redirige solo a ningún lado: tapar un error con un redirect automático
 * hace que nadie se entere de que se cayó, y este módulo mueve plata.
 */
export default function ErrorDelModulo({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Queda en la consola del navegador además de en los logs del servidor,
    // para cuando alguien reporta el problema con la consola abierta.
    console.error('[compras] pantalla caída:', error)
  }, [error])

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <div className="card border-red-200">
        <h1 className="font-heading text-xl">Se cayó esta pantalla</h1>
        <p className="mt-2 text-sm text-gray-700">
          No es algo que hayas hecho mal. Lo que estabas viendo no se pudo cargar — y si
          justo habías guardado algo, puede que sí se haya guardado: revisalo antes de
          volver a cargarlo.
        </p>

        {error.digest ? (
          <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5">
            <p className="text-xs text-gray-500">Código del error (pásalo cuando reportes):</p>
            <p className="font-heading mt-0.5 select-all text-lg tabular-nums">{error.digest}</p>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={reset} className="btn-primary">
            Reintentar
          </button>
          <Link href="/" className="btn-secondary">
            Volver al menú
          </Link>
        </div>

        <p className="mt-4 text-sm text-gray-600">
          Si te vuelve a pasar, avisa a Sebastián con ese código y con qué estabas
          haciendo.
        </p>
      </div>
    </main>
  )
}
