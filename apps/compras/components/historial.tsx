import type { EventoHistorial } from '@/services/historial-orden'

/**
 * Timeline construido solo con fechas reales — ver services/historial-orden.ts.
 * No hay usuario/comentario en la mayoría de estos eventos porque las columnas
 * de origen no lo guardan (excepto la conformidad de servicio, que sí trae
 * observaciones) — no se inventa lo que no existe.
 */
export function Historial({ eventos }: { eventos: EventoHistorial[] }) {
  if (eventos.length === 0) {
    return <p className="text-sm text-gray-500">Todavía no hay eventos registrados con fecha.</p>
  }
  return (
    <ol className="space-y-3">
      {eventos.map((e, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-logisalud-teal" aria-hidden />
          <div>
            <p className="font-medium">{e.evento}</p>
            <p className="text-gray-500">{formatearFechaHora(e.fecha)}</p>
            {e.detalle ? <p className="text-gray-600">{e.detalle}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  )
}

function formatearFechaHora(iso: string): string {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return iso
  return fecha.toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })
}
