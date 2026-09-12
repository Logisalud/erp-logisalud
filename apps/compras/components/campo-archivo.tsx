'use client'

import { useState } from 'react'
import { excedeTamanoMaximo, mensajeArchivoDemasiadoGrande } from '@/domain/archivo'

/**
 * Un `<input type="file">` que avisa en el momento si el archivo no va a
 * entrar, en vez de dejar que el envío muera en silencio.
 *
 * Sin esto, un archivo por encima del límite del body hacía que la Server
 * Action se rechazara antes de ejecutarse: `useFormState` nunca recibía un
 * estado, no había nada que pintar, y el botón parecía muerto. Acá se
 * detecta al ELEGIR el archivo (no al enviar), que es cuando la persona
 * todavía tiene el contexto de qué acaba de adjuntar.
 *
 * Cuando el archivo no entra se limpia el input: es preferible mandar la
 * solicitud sin adjunto —el archivo se puede subir después desde la ficha—
 * que no poder mandarla.
 */
export function CampoArchivo({
  nombre, accept, className, alElegir,
}: {
  nombre: string
  accept?: string
  className?: string
  /** Se llama solo con un archivo que SÍ entra (ej. el lector de facturas).
   * Así ningún consumidor tiene que repetir la validación de tamaño. */
  alElegir?: (archivo: File) => void
}) {
  const [error, setError] = useState<string | null>(null)

  return (
    <>
      <input
        type="file" name={nombre} accept={accept}
        className={className}
        onChange={(e) => {
          const archivo = e.target.files?.[0]
          if (archivo && excedeTamanoMaximo(archivo.size)) {
            setError(mensajeArchivoDemasiadoGrande(archivo.name, archivo.size))
            e.target.value = ''
          } else {
            setError(null)
            if (archivo) alElegir?.(archivo)
          }
        }}
      />
      {error ? (
        <p role="alert" className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {error}
        </p>
      ) : null}
    </>
  )
}
