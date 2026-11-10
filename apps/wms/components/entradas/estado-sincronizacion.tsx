import { Clock, TriangleAlert } from 'lucide-react'
import { textoUltimaSincronizacion, type ResultadoSincronizacionAuto } from '@/domain/oc-versiones'
import { formatoFechaHora } from '@/domain/fechas'

/** «Última sincronización con Compras: hace X min» y, si el último intento falló, un mensaje en palabras llanas. Ícono + texto. Sin lógica de negocio. */
export function EstadoSincronizacion({ r, ahora }: { r: ResultadoSincronizacionAuto; ahora?: Date }) {
  const { actual } = r
  const falla = r.estado === 'ERROR' ? (r.mensaje ?? actual.ultimoError) : undefined
  const resumen = r.estado === 'SINCRONIZADA' && r.resumen && (r.resumen.nuevas + r.resumen.cambiadas + r.resumen.eliminadas > 0)
    ? `Recién revisamos Compras: ${[r.resumen.nuevas && `${r.resumen.nuevas} ${r.resumen.nuevas === 1 ? 'orden nueva' : 'órdenes nuevas'}`, r.resumen.cambiadas && `${r.resumen.cambiadas} ${r.resumen.cambiadas === 1 ? 'cambió' : 'cambiaron'}`, r.resumen.eliminadas && `${r.resumen.eliminadas} ya no ${r.resumen.eliminadas === 1 ? 'existe' : 'existen'}`].filter(Boolean).join(', ')}.` : null
  return (
    <div className="space-y-2" data-testid="estado-sincronizacion">
      <p className="flex flex-wrap items-center gap-x-2 text-sm text-gray-700">
        <Clock className="h-4 w-4 text-gray-500" aria-hidden />
        <span data-testid="sincronizacion-hace">{textoUltimaSincronizacion(actual.ultimaEn, ahora)}</span>
        {actual.ultimaEn && <span className="tabular text-xs text-gray-500">({formatoFechaHora(actual.ultimaEn)})</span>}
        {r.estado === 'EN_CURSO' && <span className="text-xs text-gray-600" data-testid="sincronizacion-en-curso">· otra persona la está revisando ahora</span>}
      </p>
      {resumen && <p className="text-sm text-green-900" role="status" data-testid="sincronizacion-resumen">{resumen}</p>}
      {falla && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-testid="sincronizacion-error">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><p>{falla}</p>
        </div>
      )}
    </div>
  )
}
