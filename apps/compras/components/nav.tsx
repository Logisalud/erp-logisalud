import Link from 'next/link'
import { BotonCerrarSesion } from '@logisalud/auth/componentes'

/** Cabecera común. El link a "Módulos" vuelve al selector, que vive en cobranzas. */
export function Encabezado({ titulo, atras }: { titulo: string; atras?: { href: string; texto: string } }) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div>
        {atras ? (
          <Link href={atras.href} className="text-sm text-logisalud-teal underline">
            &larr; {atras.texto}
          </Link>
        ) : (
          <a href="/" className="text-sm text-logisalud-teal underline">
            &larr; Módulos
          </a>
        )}
        <h1 className="font-heading mt-1 text-2xl">{titulo}</h1>
      </div>
      <BotonCerrarSesion />
    </header>
  )
}
