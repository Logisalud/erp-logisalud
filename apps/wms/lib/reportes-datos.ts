import 'server-only'
import { repositorio } from '@/services/repositorio-actual'
import {
  filasAuditoria, filasCalidad, filasExactitud, filasInventario, filasMovimientos, filasOcupacion, filasRecepciones, type FilaReporte, type IdReporte,
} from '@/domain/reportes'
import type { Actor } from '@/services/repositorio'

/** Las filas de un reporte, leídas con la sesión de la persona (la base de datos aplica sus permisos). */
export async function cargarFilas(id: IdReporte, actor: Actor): Promise<FilaReporte[]> {
  const repo = repositorio()
  switch (id) {
    case 'INVENTARIO': return filasInventario(await repo.panorama())
    case 'OCUPACION': return filasOcupacion(await repo.panorama())
    case 'RECEPCIONES': return filasRecepciones(await repo.listarSolicitudes())
    case 'CALIDAD': return filasCalidad(await repo.panorama())
    case 'MOVIMIENTOS': return filasMovimientos(await repo.listarMovimientos())
    case 'EXACTITUD': return filasExactitud(await repo.exactitudConteos(undefined, undefined, actor))
    case 'AUDITORIA': return filasAuditoria(await repo.auditoria(2000))
  }
}
