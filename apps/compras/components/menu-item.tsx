import Link from 'next/link'

/** Tarjeta de menú reutilizable — mismo look que las de app/page.tsx (que
 * mantiene su propia copia local por ser la portada, no vale la pena
 * importar de acá para una sola pantalla), para cualquier otro índice de
 * sección dentro del módulo. */
export function MenuItem({
  href, emoji, titulo, descripcion,
}: { href: string; emoji: string; titulo: string; descripcion: string }) {
  return (
    <Link
      href={href}
      className="flex items-start gap-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md"
    >
      <span aria-hidden className="mt-0.5 text-2xl">{emoji}</span>
      <span>
        <span className="font-heading block text-base">{titulo}</span>
        <span className="mt-1 block text-sm text-gray-600">{descripcion}</span>
      </span>
    </Link>
  )
}
