import 'server-only'
import { anularPagoDirecto, rechazarPagoDirecto } from '@/services/obligaciones'
import {
  anularSolicitud, rechazarPorContabilidad as rechazarGasto,
} from '@/services/solicitudes-gasto'
import {
  rechazarPorContabilidad as rechazarReposicionContabilidad,
  rechazarPorJefe as rechazarReposicionJefe,
} from '@/services/caja-chica'
import { anularOS, rechazarOS } from '@/services/servicios'
import { rechazarPropuesta } from '@/services/propuestas'
import { anularPagoPlanilla } from '@/services/planilla'
import { MAXIMO_POR_LOTE, ordenarParaEjecutar, type ResultadoFila } from '@/domain/aprobacion-en-lote'
import {
  admiteCorte, motivoSinLugar, validarMotivo, type AccionCorte,
} from '@/domain/corte-en-lote'
import { quienDecideCajaChica, type TipoPendiente } from '@/domain/pendientes-aprobar'
import { listarPendientesDeAprobar } from '@/services/pendientes-aprobar'

/**
 * Rechazar o anular varios registros de una sola vez, mezclando tipos.
 *
 * Es el espejo exacto de `aprobarEnLote` y comparte su contrato, a propósito:
 * no es una transacción, recorre la selección llamando a la MISMA función que
 * usa el botón individual de cada pantalla, no corta al primer error, y
 * devuelve fila por fila qué entró y qué no.
 *
 * Reusar las funciones individuales es lo que garantiza que el lote respete
 * las mismas reglas que el camino de a uno: el gate de permiso, la ventana de
 * estado, "nadie aprueba lo suyo", el aviso por correo a quien registró el
 * documento, y —en anular— la regla de que el creador solo puede anular
 * mientras la autoridad no haya decidido. Un lote que escribiera el estado
 * por su cuenta se saltearía todo eso en silencio.
 *
 * EL MOTIVO ES COMPARTIDO por todas las filas. Decisión consciente de Sebas
 * (2026-09-19), con el canje entendido: velocidad a cambio de precisión, el
 * mismo que ya se aceptó al permitir lotes de tipos mezclados. Ojo con una
 * consecuencia que no es obvia: hay tipos cuya función individual NO recibe
 * motivo (OS, Propuesta y Caja Chica al rechazar), así que ahí el texto no se
 * guarda en ningún lado — ver CORTE_POR_TIPO en domain/corte-en-lote.ts. La
 * pantalla lo advierte antes de ejecutar.
 */
export async function cortarEnLote(
  ids: readonly string[],
  accion: AccionCorte,
  motivo: string
): Promise<ResultadoFila[]> {
  if (ids.length === 0) throw new Error('No hay nada seleccionado.')
  if (ids.length > MAXIMO_POR_LOTE) throw new Error(`Máximo ${MAXIMO_POR_LOTE} por lote.`)

  // Se valida acá además de en el formulario: la Server Action es la frontera
  // real, y el navegador puede mandar lo que quiera.
  const problema = validarMotivo(motivo, accion)
  if (problema) throw new Error(problema)
  const limpio = motivo.trim()

  // Se relee la bandeja en vez de confiar en lo que mandó el navegador —
  // misma razón que en aprobar: valida que las filas SIGAN pendientes, que de
  // verdad le toquen a quien decide, y da el código real para el resumen.
  const bandeja = await listarPendientesDeAprobar()
  const porId = new Map(bandeja.map((f) => [f.id, f]))

  const resultados: ResultadoFila[] = []
  const vivas = []

  for (const id of ids) {
    const fila = porId.get(id)
    if (!fila) {
      resultados.push({ codigo: id.slice(0, 8), ok: false, motivo: 'ya no está esperando tu decisión' })
      continue
    }
    if (!admiteCorte(fila.tipo, accion)) {
      resultados.push({
        codigo: fila.codigo, tipo: fila.tipo, ok: false,
        motivo: motivoSinLugar(fila.tipo, accion),
      })
      continue
    }
    vivas.push(fila)
  }

  // Mismo orden que aprobar, y por la misma razón de fondo: sin
  // transacciones, el orden decide qué queda a medias, y lo impone el
  // servidor sobre la bandeja releída, nunca el navegador.
  for (const fila of ordenarParaEjecutar(vivas)) {
    try {
      await cortarUna(fila.tipo, fila.id, fila.estado, accion, limpio)
      resultados.push({ codigo: fila.codigo, tipo: fila.tipo, ok: true })
    } catch (e) {
      resultados.push({ codigo: fila.codigo, tipo: fila.tipo, ok: false, motivo: mensajeCorto(e) })
    }
  }
  return resultados
}

/**
 * El mismo camino que el botón individual de cada pantalla.
 *
 * Las que no reciben `motivo` no es un olvido: sus funciones nunca lo
 * pidieron. Está declarado en CORTE_POR_TIPO y la pantalla lo avisa.
 */
async function cortarUna(
  tipo: TipoPendiente,
  id: string,
  estado: string,
  accion: AccionCorte,
  motivo: string
): Promise<void> {
  if (accion === 'rechazar') {
    switch (tipo) {
      case 'pago_directo':
        return rechazarPagoDirecto(id, motivo)
      case 'anticipo':
      case 'reembolso':
        return rechazarGasto(id, motivo)
      case 'os':
        return rechazarOS(id)
      case 'propuesta':
        return rechazarPropuesta(id)
      case 'caja_chica': {
        // Dos decisores distintos según el paso — mismo criterio que usa la
        // bandeja para la columna "Decide", y que aprobarEnLote.
        const quien = quienDecideCajaChica(estado)
        if (quien === 'jefe') return rechazarReposicionJefe(id)
        if (quien === 'contabilidad') return rechazarReposicionContabilidad(id)
        throw new Error('no está esperando una decisión')
      }
      default:
        throw new Error('este tipo no se rechaza desde la bandeja')
    }
  }

  switch (tipo) {
    case 'pago_directo':
      return anularPagoDirecto(id, motivo)
    case 'anticipo':
    case 'reembolso':
      return anularSolicitud(id, motivo)
    case 'os':
      return anularOS(id, motivo)
    case 'planilla':
      return anularPagoPlanilla(id, motivo)
    default:
      throw new Error('este tipo no se anula desde la bandeja')
  }
}

/** El motivo cabe en una oración: el resumen nombra varias filas a la vez. */
function mensajeCorto(e: unknown): string {
  const mensaje = e instanceof Error ? e.message : 'error desconocido'
  return mensaje.length > 120 ? `${mensaje.slice(0, 117)}…` : mensaje
}
