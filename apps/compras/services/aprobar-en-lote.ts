import 'server-only'
import { darConformidad } from '@/services/obligaciones'
import { aprobarPorContabilidad as aprobarGasto } from '@/services/solicitudes-gasto'
import {
  aprobarPorContabilidad as aprobarReposicionContabilidad,
  aprobarPorJefe as aprobarReposicionJefe,
} from '@/services/caja-chica'
import { aprobarOS } from '@/services/servicios'
import { aprobarPropuesta } from '@/services/propuestas'
import {
  admiteAprobacionEnLote, MAXIMO_POR_LOTE, type ResultadoFila,
} from '@/domain/aprobacion-en-lote'
import { quienDecideCajaChica, type TipoPendiente } from '@/domain/pendientes-aprobar'
import { listarPendientesDeAprobar } from '@/services/pendientes-aprobar'

/**
 * Aprobar varios registros del MISMO tipo de una sola vez.
 *
 * NO es una transacción y no pretende serlo: el módulo entero no usa
 * transacciones (cero `supabase.rpc`), así que esto recorre la selección
 * llamando a la MISMA función de aprobar que usa el botón individual, una
 * por una, y devuelve qué entró y qué no.
 *
 * Reusar esas funciones y no reimplementar el UPDATE es lo que garantiza
 * que el lote respete exactamente las mismas reglas que el camino de a uno:
 * el gate de permiso, la ventana de estado, "nadie aprueba lo suyo"
 * (ERROR_AUTO_APROBACION) y —en Gastos y Caja Chica— la creación de la
 * obligación. Un lote que escribiera el estado por su cuenta se saltearía
 * todo eso sin que nada avise.
 *
 * Por eso tampoco corta al primer error: si la cuarta falla, las otras
 * cinco son decisiones válidas que no hay razón para negarle a nadie. Lo
 * que sí hace es DECIRLO — ver `resumirLote` en el dominio.
 */
export async function aprobarEnLote(
  tipo: TipoPendiente,
  ids: readonly string[]
): Promise<ResultadoFila[]> {
  if (!admiteAprobacionEnLote(tipo)) {
    throw new Error('Este tipo no se aprueba en lote.')
  }
  if (ids.length === 0) throw new Error('No hay nada seleccionado.')
  if (ids.length > MAXIMO_POR_LOTE) {
    throw new Error(`Máximo ${MAXIMO_POR_LOTE} por lote.`)
  }

  // Se relee la bandeja en vez de confiar en lo que mandó el navegador: es
  // lo que valida que las filas SIGAN pendientes y que de verdad le toquen
  // a quien está aprobando (la pantalla pudo quedar abierta un rato, y otra
  // persona pudo decidir mientras tanto). También da el código real para el
  // resumen, sin confiar en un valor del formulario.
  const bandeja = await listarPendientesDeAprobar()
  const porId = new Map(bandeja.map((f) => [f.id, f]))

  const resultados: ResultadoFila[] = []
  for (const id of ids) {
    const fila = porId.get(id)
    if (!fila) {
      resultados.push({
        codigo: id.slice(0, 8),
        ok: false,
        motivo: 'ya no está esperando tu decisión',
      })
      continue
    }
    if (fila.tipo !== tipo) {
      resultados.push({ codigo: fila.codigo, ok: false, motivo: 'no es del tipo seleccionado' })
      continue
    }

    try {
      await aprobarUna(fila.tipo, fila.id, fila.estado)
      resultados.push({ codigo: fila.codigo, ok: true })
    } catch (e) {
      resultados.push({ codigo: fila.codigo, ok: false, motivo: mensajeCorto(e) })
    }
  }
  return resultados
}

/** El mismo camino que el botón individual de cada pantalla. */
async function aprobarUna(tipo: TipoPendiente, id: string, estado: string): Promise<void> {
  switch (tipo) {
    case 'pago_directo':
      return darConformidad(id)
    case 'anticipo':
    case 'reembolso':
      return aprobarGasto(id)
    case 'os':
      return aprobarOS(id)
    case 'propuesta':
      // Cada una libera el desembolso de su lote entero. Va por la misma
      // función que el botón individual, así que valida el permiso
      // (puedeAprobarPropuesta) y la transición igual que siempre.
      return aprobarPropuesta(id)
    case 'caja_chica': {
      // Dos decisores distintos según el paso — mismo criterio que usa la
      // bandeja para la columna "Decide".
      const quien = quienDecideCajaChica(estado)
      if (quien === 'jefe') return aprobarReposicionJefe(id)
      if (quien === 'contabilidad') return aprobarReposicionContabilidad(id)
      throw new Error('no está esperando una decisión')
    }
    default:
      throw new Error('este tipo no se aprueba en lote')
  }
}

/** El motivo cabe en una oración: el resumen nombra varias filas a la vez. */
function mensajeCorto(e: unknown): string {
  const mensaje = e instanceof Error ? e.message : 'error desconocido'
  return mensaje.length > 120 ? `${mensaje.slice(0, 117)}…` : mensaje
}
