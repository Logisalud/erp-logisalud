import { ArrowDown, ArrowUp, Equal } from 'lucide-react'
import type { EfectoVariacion, PuntoSerie, Variacion } from '@/domain/indicadores'
import { LINEA_EMPEORO, LINEA_MEJORO, LINEA_NEUTRA, PUNTO_EMPEORO, PUNTO_MEJORO, PUNTO_NEUTRO, TENDENCIA_EMPEORO, TENDENCIA_MEJORO, TENDENCIA_NEUTRA } from '../estilos-opcion'

const CLASE_CHIP: Record<EfectoVariacion, string> = { mejoro: TENDENCIA_MEJORO, empeoro: TENDENCIA_EMPEORO, igual: TENDENCIA_NEUTRA, 'sin-juicio': TENDENCIA_NEUTRA }
const CLASE_LINEA: Record<EfectoVariacion, string> = { mejoro: LINEA_MEJORO, empeoro: LINEA_EMPEORO, igual: LINEA_NEUTRA, 'sin-juicio': LINEA_NEUTRA }
const CLASE_PUNTO: Record<EfectoVariacion, string> = { mejoro: PUNTO_MEJORO, empeoro: PUNTO_EMPEORO, igual: PUNTO_NEUTRO, 'sin-juicio': PUNTO_NEUTRO }

/** Hacia dónde va el indicador frente al periodo anterior: ícono + cambio + palabra («mejoró» o «empeoró»). El color acompaña, no es la señal. */
export function ChipVariacion({ v }: { v: Variacion }) {
  const Icono = v.sentido === 'sube' ? ArrowUp : v.sentido === 'baja' ? ArrowDown : Equal
  const texto = v.sentido === 'igual' ? 'Sin cambio' : v.palabra ? `${v.cantidad} · ${v.palabra}` : v.cantidad
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium md:text-[13px] ${CLASE_CHIP[v.efecto]}`} data-testid="kpi-variacion" data-efecto={v.efecto} data-sentido={v.sentido} title={`${v.texto} ${v.comparacion}`}>
      <Icono className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{texto}</span>
      <span className="sr-only"> {v.comparacion}</span>
    </span>
  )
}

const W = 96
const H = 28
const PAD = 3
const fmt = (n: number) => n.toLocaleString('es-PE', { maximumFractionDigits: 1 })

/**
 * Mini gráfico de los últimos 30 días, dibujado a mano en SVG (sin librería). Sin ejes ni números: solo la forma y el último punto;
 * el valor exacto está en la tarjeta y la lectura completa en el texto accesible. Los días sin dato dejan un hueco, no un cero inventado.
 */
export function Tendencia({ serie, efecto, nombre }: { serie: PuntoSerie[]; efecto: EfectoVariacion; nombre: string }) {
  const validos = serie.filter((p): p is { dia: string; valor: number } => p.valor !== null)
  if (validos.length < 2) return null
  const min = Math.min(...validos.map((p) => p.valor)); const max = Math.max(...validos.map((p) => p.valor))
  const x = (i: number) => PAD + (i / (serie.length - 1)) * (W - 2 * PAD)
  const y = (v: number) => (max === min ? H / 2 : H - PAD - ((v - min) / (max - min)) * (H - 2 * PAD))
  const tramos: string[] = []; let actual: string[] = []
  serie.forEach((p, i) => {
    if (p.valor === null) { if (actual.length) tramos.push(actual.join(' ')); actual = []; return }
    actual.push(`${actual.length ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.valor).toFixed(1)}`)
  })
  if (actual.length) tramos.push(actual.join(' '))
  const ultimoI = serie.map((p) => p.valor !== null).lastIndexOf(true)
  const ultimo = serie[ultimoI]
  const clase = CLASE_LINEA[efecto]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-8 w-24 shrink-0 md:w-28" role="img" data-testid="kpi-tendencia" data-puntos={validos.length}
      aria-label={`Tendencia de los últimos 30 días de ${nombre}: de ${fmt(validos[0].valor)} a ${fmt(validos[validos.length - 1].valor)}`}>
      {tramos.map((d, i) => <path key={i} d={d} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`${clase} fill-none`} />)}
      <circle cx={x(ultimoI)} cy={y(ultimo.valor as number)} r={2.75} className={CLASE_PUNTO[efecto]} />
    </svg>
  )
}
