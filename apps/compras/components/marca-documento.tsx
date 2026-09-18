import { LogoLogisalud } from '@/components/logo-logisalud'

/**
 * El logo en la ficha de un documento que sale de la empresa (OC y OS).
 *
 * Hasta ahora la marca solo aparecía en la vista de impresión, así que la
 * pantalla que la persona mira todo el día no se parecía al papel que le
 * manda al proveedor. Usa el mismo componente que la vista de impresión —
 * ahí vive la explicación de por qué la ruta lleva el basePath a mano.
 */
export function MarcaDocumento({ etiqueta }: { etiqueta: string }) {
  return (
    <div className="mb-4 flex items-center gap-3 border-b border-gray-200 pb-3">
      <LogoLogisalud alto={26} />
      <span className="text-xs uppercase tracking-wide text-gray-500">{etiqueta}</span>
    </div>
  )
}
