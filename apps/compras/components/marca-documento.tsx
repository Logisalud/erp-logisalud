import Image from 'next/image'

/**
 * El logo en la ficha de un documento que sale de la empresa (OC y OS).
 *
 * Hasta ahora la marca solo aparecía en la vista de impresión, así que la
 * pantalla que la persona mira todo el día no se parecía al papel que le
 * manda al proveedor. Mismo `next/image` y mismo asset que
 * app/ordenes-compra/[id]/imprimir — el `basePath` de `/compras` lo resuelve
 * next/image solo, por eso el src va sin prefijo (ver PR #50).
 */
export function MarcaDocumento({ etiqueta }: { etiqueta: string }) {
  return (
    <div className="mb-4 flex items-center gap-3 border-b border-gray-200 pb-3">
      <Image
        src="/brand/logisalud-color-horizontal.png"
        alt="Logisalud"
        width={1798}
        height={358}
        style={{ height: '26px', width: 'auto' }}
        priority
      />
      <span className="text-xs uppercase tracking-wide text-gray-500">{etiqueta}</span>
    </div>
  )
}
