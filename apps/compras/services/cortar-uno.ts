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
import { admiteCorte, motivoSinLugar, validarMotivo, type AccionCorte } from '@/domain/corte'
import { quienDecideCajaChica, type TipoPendiente } from '@/domain/pendientes-aprobar'
import { listarPendientesDeAprobar } from '@/services/pendientes-aprobar'

/**
 * Rechazar o anular UN registro desde la bandeja.
 *
 * De a uno, siempre. El lote existió unas horas el 2026-09-19 y se revirtió
 * el mismo día — el porqué está en domain/corte.ts y se resume en que un
 * motivo compartido deja de ser un motivo.
 *
 * Lo único que este servicio agrega sobre llamar a la función individual
 * directo es la RELECTURA DE LA BANDEJA: valida que la fila siga esperando
 * una decisión y que de verdad le toque a quien está decidiendo. La pantalla
 * pudo quedar abierta un rato y otra persona pudo decidir mientras tanto.
 * De ahí sale también el tipo real, así que un id manipulado no puede
 * afirmar de qué tipo es.
 *
 * Después de eso llama a la MISMA función que el botón de la ficha de cada
 * registro: el gate de permiso, la ventana de estado, "nadie aprueba lo
 * suyo" y el aviso por correo viven ahí y no se reimplementan acá.
 */
export async function cortarUno(
  id: string,
  accion: AccionCorte,
  motivo: string
): Promise<{ codigo: string; tipo: TipoPendiente }> {
  // Se valida acá además de en el formulario: la Server Action es la
  // frontera real y el navegador puede mandar lo que quiera.
  const problema = validarMotivo(motivo, accion)
  if (problema) throw new Error(problema)

  const fila = (await listarPendientesDeAprobar()).find((f) => f.id === id)
  if (!fila) throw new Error('Ese registro ya no está esperando tu decisión.')
  if (!admiteCorte(fila.tipo, accion)) throw new Error(motivoSinLugar(fila.tipo, accion))

  await ejecutar(fila.tipo, fila.id, fila.estado, accion, motivo.trim())
  return { codigo: fila.codigo, tipo: fila.tipo }
}

/**
 * El mismo camino que el botón individual de cada pantalla.
 *
 * Las que no reciben `motivo` no es un olvido: sus funciones nunca lo
 * pidieron. Está declarado en CORTE_POR_TIPO y la pantalla lo avisa antes
 * de enviar.
 */
async function ejecutar(
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
        // bandeja para la columna "Decide".
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
