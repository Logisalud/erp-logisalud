// Inspecciones de la unidad de transporte (migración 0058): LS-FR.49.03 «Inspección de la unidad de transporte (vehículo)» y LS-FR.52.03 «Control de limpieza de la unidad vehicular».
// Una por vehículo, por tipo y por día. La hace un conductor o auxiliar de transporte (Sí / No / No aplica en cada punto) y OTRO conductor la supervisa. No bloquea la salida de ninguna ruta.
// Puro: lo usan la demo, las acciones, la pantalla y el Word. La base (`wms.registrar_inspeccion_unidad`) aplica las mismas reglas y manda.
import { puede } from './permisos'
import type { Rol } from './tipos'

export type TipoInspeccion = 'VEHICULO' | 'LIMPIEZA'
export const TIPOS_INSPECCION: readonly TipoInspeccion[] = ['VEHICULO', 'LIMPIEZA']
export type Marca = 'SI' | 'NO' | 'NA'
export const MARCAS: readonly Marca[] = ['SI', 'NO', 'NA']
export const ETIQUETA_MARCA: Record<Marca, string> = { SI: 'Sí', NO: 'No', NA: 'No aplica' }

export interface PuntoInspeccion { clave: string; etiqueta: string; grupo: string }
export interface FormatoInspeccion {
  tipo: TipoInspeccion; codigo: string; titulo: string; corto: string; poe?: string; vigencia?: string; puntos: readonly PuntoInspeccion[]; leyenda?: string
}

const p = (grupo: string, ...xs: [string, string][]): PuntoInspeccion[] => xs.map(([clave, etiqueta]) => ({ clave, etiqueta, grupo }))

export const FORMATO_VEHICULO: FormatoInspeccion = {
  tipo: 'VEHICULO', codigo: 'LS-FR.49.03', titulo: 'Inspección de la unidad de transporte (vehículo)', corto: 'Inspección del vehículo',
  puntos: [
    ...p('Puntos de inspección',
      ['cabina_cerrada', 'Cabina de carga/furgón cerrado (o metálica)'], ['sin_olores', 'Vehículo sin olores fétidos penetrantes'],
      ['sin_objetos_daninos', 'Cabina de carga/furgón sin objetos que dañen el producto (clavos, revestimiento dañado, etc.)'],
      ['cabina_limpia', 'Cabina de carga/furgón limpio sin residuos (pisos, techos, paredes y equipos)'], ['sin_agujeros', 'Sin agujeros ni daños dentro de la cabina de carga/furgón'],
      ['conservacion_externa', 'Buen estado de conservación externo del vehículo'], ['conservacion_interna', 'Buen estado de conservación interna del vehículo'],
      ['embalaje_protegido', 'Embalaje de productos protegido e identificado'], ['kit_antiderrame', 'Cuenta con un kit antiderrame (productos rotos, rajados o derramados)'],
      ['climatizado', 'Cabina climatizada, con aislamiento o acondicionamiento para transportar en óptimas condiciones'], ['botiquin', 'Botiquín de primeros auxilios'],
      ['kit_seguridad', 'Kit de seguridad (extintor, triángulo, tacos, gata y cono de emergencia)'], ['nivel_aceite', 'Óptimo nivel de aceite de motor'],
      ['nivel_agua', 'Óptimo nivel de agua del radiador o refrigerante'], ['presion_llantas', 'Presión de llantas'], ['combustible', 'Combustible']),
    ...p('Documentos y condiciones físicas',
      ['licencia', 'Licencia de conducir'], ['tarjeta_propiedad', 'Tarjeta de propiedad'], ['soat', 'SOAT'], ['tarjeta_circulacion', 'Tarjeta de circulación'],
      ['certificado_inspeccion', 'Certificado de inspección vehicular'], ['certificado_fumigacion', 'Certificado de fumigación/saneamiento'], ['programa_mantenimiento', 'Programa de mantenimiento'],
      ['instructivos', 'Instructivos (plan de contingencia y limpieza)'], ['luces', 'Luces operativas'], ['herramientas_linterna', 'Caja o estuche de herramientas y linterna'],
      ['claxon', 'Claxon'], ['limpiaparabrisas', 'Limpiaparabrisas y plumillas'], ['llanta_repuesto', 'Llanta de repuesto'], ['cinturon', 'Cinturón de seguridad'], ['faros', 'Faros'],
      ['llaves_candados', 'Llaves y candados de puertas'], ['espejos', 'Espejos'], ['datalogger', 'Equipo datalogger']),
  ],
}

export const FORMATO_LIMPIEZA: FormatoInspeccion = {
  tipo: 'LIMPIEZA', codigo: 'LS-FR.52.03', titulo: 'Control de limpieza de la unidad de transporte', corto: 'Limpieza de la unidad', poe: 'LS-POE.36.03', vigencia: 'Desde 01-09-2026 hasta 01-09-2028',
  leyenda: 'Lejía (L): 1.ª y 3.ª semana · Glutaraldehído (G): 2.ª y 4.ª semana · Diario (D) · Semanal (S): agua y detergente · Luminarias con paño seco',
  puntos: [
    ...p('Interna (diaria)', ['piso', 'Piso (D)'], ['paredes', 'Paredes (D)'], ['techos', 'Techos (D)'], ['luminarias', 'Luminarias (D)']),
    ...p('Externa (semanal)', ['llantas', 'Llantas (S)'], ['aros', 'Aros (S)'], ['tapices', 'Tapices (S)'], ['faros', 'Faros (S)'], ['lunas', 'Lunas (S)'], ['puertas', 'Puertas (S)'], ['chasis', 'Chasis (S)']),
    ...p('Derrame', ['derrame', 'Derrame (Sí = hubo un derrame y se limpió)']),
  ],
}
export const FORMATOS: Record<TipoInspeccion, FormatoInspeccion> = { VEHICULO: FORMATO_VEHICULO, LIMPIEZA: FORMATO_LIMPIEZA }
/** En la limpieza, «derrame» no cuenta para la conformidad: solo registra que hubo y se limpió. */
const noCuenta = (tipo: TipoInspeccion, clave: string) => tipo === 'LIMPIEZA' && clave === 'derrame'

export const puedeVerInspecciones = (roles: readonly Rol[]) => puede(roles, 'inspeccion_unidad')
export const MAXIMO_DIAS_ATRAS = 3

export type Items = Record<string, Marca>
/** Lo normal: todo en «Sí» (y «derrame» en «No»: no hubo). Quien inspecciona cambia solo lo que no es así. */
export const itemsTodoSi = (tipo: TipoInspeccion): Items => Object.fromEntries(FORMATOS[tipo].puntos.map((x) => [x.clave, (noCuenta(tipo, x.clave) ? 'NO' : 'SI') as Marca]))

/** ¿Es conforme? Ningún punto en «No» (el derrame de la limpieza no cuenta). */
export const esConforme = (tipo: TipoInspeccion, items: Items): boolean => FORMATOS[tipo].puntos.every((x) => noCuenta(tipo, x.clave) || items[x.clave] !== 'NO')
export const puntosNoConformes = (tipo: TipoInspeccion, items: Items): PuntoInspeccion[] => FORMATOS[tipo].puntos.filter((x) => !noCuenta(tipo, x.clave) && items[x.clave] === 'NO')

/** Errores para registrar (mismos textos que la base). Vacío = vale. */
export function validarInspeccion(e: { tipo: TipoInspeccion; vehiculoId?: string; fecha: string; hoy: string; items: Items; observaciones?: string }): string[] {
  const errores: string[] = []
  if (!e.vehiculoId) errores.push('Elige un vehículo disponible')
  if (e.fecha > e.hoy) errores.push('La fecha de la inspección no puede ser futura')
  else if (e.fecha < sumarDias(e.hoy, -MAXIMO_DIAS_ATRAS)) errores.push('Solo se registran inspecciones de hoy y de los últimos 3 días')
  if (FORMATOS[e.tipo].puntos.some((x) => !MARCAS.includes(e.items[x.clave]))) errores.push('Falta marcar un punto de la inspección (Sí, No o No aplica)')
  if (!esConforme(e.tipo, e.items) && (e.observaciones ?? '').trim().length < 5) errores.push('Hay puntos no conformes: cuéntanos qué pasó (al menos 5 letras)')
  return errores
}

export function sumarDias(fecha: string, n: number): string { return new Date(Date.parse(`${fecha}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10) }
export const diasDelMes = (mes: string): number => { const [a, m] = mes.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate() }
/** «2026-11-15» → «2026-11» */
export const mesDe = (fecha: string) => fecha.slice(0, 7)
const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const mesLargo = (mes: string) => { const [a, m] = mes.split('-').map(Number); return `${NOMBRES_MES[m - 1]} ${a}` }

/** Lejía en la 1.ª y 3.ª semana del mes, glutaraldehído en la 2.ª y 4.ª (la 5.ª sigue a la 4.ª): lo que dice la leyenda del formato. */
export function productoDeLimpieza(fecha: string): 'L' | 'G' {
  const dia = Number(fecha.slice(8, 10))
  const semana = Math.min(4, Math.floor((dia - 1) / 7) + 1)
  return semana % 2 === 1 ? 'L' : 'G'
}

export interface InspeccionVista {
  id: string; tipo: TipoInspeccion; vehiculoId: string; fecha: string; items: Items; conforme: boolean; observaciones?: string
  realizadaPor: string; realizadaNombre: string; realizadaEn: string; supervisadaPor?: string; supervisadaNombre?: string; supervisadaEn?: string
}
export interface DiaDelMes { dia: number; fecha: string; inspeccion?: InspeccionVista }
/** Los días del mes con su inspección (si la hay). */
export function armarMes(mes: string, inspecciones: readonly InspeccionVista[]): DiaDelMes[] {
  const n = diasDelMes(mes)
  return Array.from({ length: n }, (_, i) => { const dia = i + 1; const fecha = `${mes}-${String(dia).padStart(2, '0')}`; return { dia, fecha, inspeccion: inspecciones.find((x) => x.fecha === fecha) } })
}
/** Quien puede supervisar una inspección: otra persona con permiso, nunca quien la hizo, y una sola vez. */
export function motivoNoPuedeSupervisar(roles: readonly Rol[], personaId: string, i: Pick<InspeccionVista, 'realizadaPor' | 'supervisadaPor'>): string | null {
  if (!puedeVerInspecciones(roles)) return 'No tienes permiso para supervisar inspecciones'
  if (i.supervisadaPor) return 'Ya fue supervisada'
  if (i.realizadaPor === personaId) return 'La supervisa otra persona, no quien la hizo'
  return null
}

/** La marca que lleva una celda del formato impreso: ✓ / ✗ / N.A.; en la limpieza interna, L o G según la semana. */
export function marcaImpresa(tipo: TipoInspeccion, clave: string, marca: Marca | undefined, fecha: string): string {
  if (!marca) return ''
  if (marca === 'NA' && !(tipo === 'LIMPIEZA' && clave === 'derrame')) return 'N.A.'
  if (tipo === 'LIMPIEZA' && clave === 'derrame') return marca === 'SI' ? '✓' : ''
  if (marca === 'NO') return '✗'
  if (tipo === 'LIMPIEZA' && ['piso', 'paredes', 'techos'].includes(clave)) return productoDeLimpieza(fecha)
  return '✓'
}
