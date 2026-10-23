import { FlaskConical, Hand, Link2Off, UserRound } from 'lucide-react'
import { etiquetasDeOrigen, ETIQUETA_TIPO_SALIDA, type DatosOrigenOrden } from '@/domain/salida-manual'
import { ETIQUETA_MOTIVO_SALIDA } from '@/domain/salidas'
import { CHIP_AVISO, CHIP_NEUTRO } from '../estilos-opcion'

const base = 'inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-medium leading-tight'
const ICONO = { MANUAL: Hand, POR_CONCILIAR: Link2Off, EN_NOMBRE_DE: UserRound, EJEMPLO: FlaskConical }

/**
 * De dónde nació la orden, siempre con texto e ícono: «Manual», «Por conciliar con Pedidos» y «Creada por X en nombre de Y». Una venta de un pedido de la bandeja no lleva etiquetas.
 * `conTipo` agrega qué clase de salida es cuando no es una venta de distribución.
 */
export function EtiquetasOrigen({ datos, conTipo = false }: { datos: DatosOrigenOrden; conTipo?: boolean }) {
  const et = etiquetasDeOrigen(datos)
  const tipo = conTipo && datos.tipo && datos.tipo !== 'DISTRIBUCION' ? `${ETIQUETA_TIPO_SALIDA[datos.tipo]}${datos.motivo && datos.tipo === 'CLIENTE' ? ` · ${ETIQUETA_MOTIVO_SALIDA[datos.motivo]}` : ''}` : null
  if (et.length === 0 && !tipo) return null
  return (
    <span className="flex flex-wrap items-center gap-1.5" data-testid="etiquetas-origen">
      {tipo && <span className={`${base} ${CHIP_NEUTRO}`} data-testid="etiqueta-tipo">{tipo}</span>}
      {et.map((x) => {
        const I = ICONO[x.clave]
        return <span key={x.clave} className={`${base} ${x.clave === 'POR_CONCILIAR' ? CHIP_AVISO : CHIP_NEUTRO}`} data-testid={`etiqueta-${x.clave}`}><I className="h-3.5 w-3.5" aria-hidden />{x.texto}</span>
      })}
    </span>
  )
}
