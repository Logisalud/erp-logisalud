import type { Rol } from './tipos'
import { esPersonal, puede } from './permisos'
import { puedeVerBandeja } from './pedidos-despacho'
import { puedeVerRutas } from './rutas'
import { puedeOriginarRetorno } from './retornos'
import { puedeDarConformidad, puedePickear, puedePrepararSalidas, puedeVerSalidas } from './despacho'
import { puedeEmbalar } from './embalaje'
import { puedeCargar } from './carga'

// Estructura del menú lateral (D-131 a D-133). Dominio puro: el layout solo le pasa los roles y las alertas.
// Es un ESPEJO de lo que cada rol ya puede hacer: no concede nada, solo decide qué enlaces se muestran.

export type IconoNav =
  | 'inicio' | 'almacen' | 'entradas' | 'productos' | 'calidad' | 'alertas' | 'expedientes' | 'propietarios' | 'auditoria' | 'movimientos'
  | 'conteos' | 'kardex' | 'vencimientos' | 'carga' | 'revision' | 'reportes' | 'pedidos' | 'rutas' | 'documentos' | 'salidas' | 'nuevasalida'
  | 'picking' | 'conformidad' | 'embalaje' | 'cargaunidad' | 'bajas' | 'retornos'

export interface ItemMenu {
  href: string
  etiqueta: string
  icono: IconoNav
  /** Cantidad que se muestra como insignia (alertas abiertas). */
  insignia?: number
  /** Nombre corto para la barra inferior del teléfono (cabe en una línea). */
  corta?: string
  /** Acción principal de la sección (se muestra destacada). */
  destacado?: boolean
}

export type IdSeccion = 'inicio' | 'entradas' | 'almacen' | 'salidas' | 'despacho' | 'control'

export interface SeccionMenu {
  id: IdSeccion
  /** Encabezado visible en la barra ancha y en «Más»; el bloque de Inicio no lleva. */
  titulo: string | null
  items: ItemMenu[]
}

/** Orden del trabajo: se entra, se guarda, se vende y sale, se despacha, se controla. */
export const ORDEN_SECCIONES: readonly IdSeccion[] = ['inicio', 'entradas', 'almacen', 'salidas', 'despacho', 'control']
export const TITULO_SECCION: Record<IdSeccion, string | null> = {
  inicio: null, entradas: 'Entradas', almacen: 'Almacén', salidas: 'Salidas', despacho: 'Despacho y transporte', control: 'Control',
}

/** Los nombres exactos que pidió la gerencia para el grupo Salidas, en este orden. */
export const SALIDAS_NOMBRES = ['Pedidos por despachar', 'Órdenes de salida', 'Nueva salida', 'Rutas'] as const

const gestion = (roles: readonly Rol[]) => roles.some((r) => ['direccion_tecnica', 'asistente_dt', 'jefe_almacen', 'jefe_transporte', 'admin_wms', 'auditoria_lectura'].includes(r))

/** ¿Ve «Nueva salida»? Quien prepara salidas (Jefes de Transporte y de Almacén) y quien autoriza las de Logissa sin venta (tipo C). */
export const puedeCrearSalida = (roles: readonly Rol[]) => puedePrepararSalidas(roles) || puede(roles, 'autorizar_salida_sin_venta')

/** Quién ve «Calidad», «Documentos regulatorios» y «Expedientes» (el auxiliar y los roles de una sola tarea no los usan). */
const veCalidadYDocumentos = (roles: readonly Rol[]) => gestion(roles)

export function construirMenu(roles: readonly Rol[], alertasAbiertas = 0): SeccionMenu[] {
  const inicio: ItemMenu = { href: '/', etiqueta: 'Inicio', icono: 'inicio' }
  // Quien no es personal (conductor, usuario de cliente) no lee el inventario: solo ve el Inicio.
  if (!esPersonal(roles)) return [{ id: 'inicio', titulo: null, items: [inicio] }]

  // Quien solo autoriza salidas sin venta no opera el almacén: ve el stock para elegir y su pantalla, no recepciones, movimientos, conteos ni bajas.
  const soloAutoriza = roles.every((r) => r === 'autoriza_salidas_sin_venta')
  const secciones: Record<IdSeccion, ItemMenu[]> = { inicio: [inicio], entradas: [], almacen: [], salidas: [], despacho: [], control: [] }
  const ponerSi = (id: IdSeccion, cond: boolean, item: ItemMenu) => { if (cond) secciones[id].push(item) }

  // Entradas: lo que llega
  ponerSi('entradas', !soloAutoriza, { href: '/entradas', etiqueta: 'Recepciones', icono: 'entradas' })
  ponerSi('entradas', puedeOriginarRetorno(roles), { href: '/retornos', etiqueta: 'Devoluciones', icono: 'retornos' })

  // Almacén: lo que hay y lo que se hace con ello
  ponerSi('almacen', true, { href: '/almacen', etiqueta: 'Mapa del almacén', icono: 'almacen', corta: 'Almacén' })
  ponerSi('almacen', true, { href: '/productos', etiqueta: 'Productos', icono: 'productos' })
  ponerSi('almacen', !soloAutoriza, { href: '/movimientos', etiqueta: 'Movimientos', icono: 'movimientos' })
  ponerSi('almacen', !soloAutoriza, { href: '/conteos', etiqueta: 'Conteos', icono: 'conteos' })
  ponerSi('almacen', !soloAutoriza, { href: '/revision-diaria', etiqueta: 'Revisión diaria', icono: 'revision' })
  ponerSi('almacen', !soloAutoriza, { href: '/bajas', etiqueta: 'Dar de baja', icono: 'bajas' })

  // Salidas: cómo empieza y se sigue una salida
  ponerSi('salidas', puedeVerBandeja(roles), { href: '/pedidos', etiqueta: SALIDAS_NOMBRES[0], icono: 'pedidos' })
  ponerSi('salidas', puedeVerSalidas(roles), { href: '/salidas', etiqueta: SALIDAS_NOMBRES[1], icono: 'salidas', corta: 'Órdenes' })
  ponerSi('salidas', puedeCrearSalida(roles), { href: '/salidas/nueva', etiqueta: SALIDAS_NOMBRES[2], icono: 'nuevasalida', destacado: true, corta: 'Nueva salida' })
  ponerSi('salidas', puedeVerRutas(roles), { href: '/rutas', etiqueta: SALIDAS_NOMBRES[3], icono: 'rutas' })

  // Despacho y transporte: los pasos de piso, solo para quien puede hacer ese paso (la lectura está en «Órdenes de salida»)
  const salidas = puedeVerSalidas(roles)
  ponerSi('despacho', salidas && puedePickear(roles), { href: '/picking', etiqueta: 'Preparar pedidos (picking)', icono: 'picking', corta: 'Picking' })
  ponerSi('despacho', salidas && puedeDarConformidad(roles), { href: '/conformidad', etiqueta: 'Dar conformidad', icono: 'conformidad', corta: 'Conformidad' })
  ponerSi('despacho', salidas && puedeEmbalar(roles), { href: '/embalaje', etiqueta: 'Embalar', icono: 'embalaje' })
  ponerSi('despacho', salidas && puedeCargar(roles), { href: '/carga', etiqueta: 'Cargar la unidad', icono: 'cargaunidad' })

  // Control: avisos, historia, calidad y papeles
  ponerSi('control', true, { href: '/alertas', etiqueta: 'Alertas', icono: 'alertas', insignia: alertasAbiertas })
  ponerSi('control', true, { href: '/kardex', etiqueta: 'Kardex (historial)', icono: 'kardex' })
  ponerSi('control', veCalidadYDocumentos(roles), { href: '/calidad', etiqueta: 'Calidad', icono: 'calidad' })
  ponerSi('control', veCalidadYDocumentos(roles), { href: '/documentos', etiqueta: 'Documentos regulatorios', icono: 'documentos' })
  ponerSi('control', veCalidadYDocumentos(roles), { href: '/expedientes', etiqueta: 'Expedientes', icono: 'expedientes' })
  ponerSi('control', true, { href: '/reportes', etiqueta: 'Reportes', icono: 'reportes' })
  ponerSi('control', !soloAutoriza && roles.some((r) => r !== 'auxiliar'), { href: '/propietarios', etiqueta: 'Propietarios', icono: 'propietarios' })
  ponerSi('control', puede(roles, 'auditar'), { href: '/auditoria', etiqueta: 'Auditoría', icono: 'auditoria' })
  ponerSi('control', roles.includes('admin_wms') || roles.includes('direccion_tecnica'), { href: '/carga-inicial', etiqueta: 'Carga inicial', icono: 'carga' })

  // Nadie ve un grupo vacío
  return ORDEN_SECCIONES.map((id) => ({ id, titulo: TITULO_SECCION[id], items: secciones[id] })).filter((s) => s.items.length > 0)
}

/**
 * Lo principal para la barra inferior del teléfono (3 lugares; Buscar y Más completan los cinco).
 * Cada rol ve primero lo que más usa; si algo no está visible se completa con lo que sí.
 */
export function principalesTelefono(roles: readonly Rol[], secciones: readonly SeccionMenu[]): string[] {
  const visibles = new Set(secciones.flatMap((s) => s.items.map((i) => i.href)))
  const prioridad: string[] = roles.includes('jefe_transporte') ? ['/', '/salidas', '/rutas']
    : roles.includes('jefe_almacen') || roles.includes('auxiliar') ? ['/', '/picking', '/almacen']
    : roles.includes('conformidad_despacho') ? ['/', '/conformidad', '/almacen']
    : roles.includes('autoriza_salidas_sin_venta') ? ['/', '/salidas/nueva', '/almacen']
    : roles.includes('auditoria_lectura') ? ['/', '/auditoria', '/reportes']
    : roles.includes('admin_wms') ? ['/', '/propietarios', '/reportes']
    : ['/', '/entradas', '/almacen']
  const elegidos = prioridad.filter((h) => visibles.has(h))
  for (const h of ['/', '/almacen', '/entradas', '/reportes']) if (elegidos.length < 3 && visibles.has(h) && !elegidos.includes(h)) elegidos.push(h)
  return elegidos.slice(0, 3)
}

/** El enlace que corresponde a la pantalla actual: el más específico (así «Nueva salida» no enciende también «Órdenes de salida»). */
export function hrefActivo(pathname: string, hrefs: readonly string[]): string | null {
  let mejor: string | null = null
  for (const h of hrefs) {
    const coincide = h === '/' ? pathname === '/' : pathname === h || pathname.startsWith(`${h}/`)
    if (coincide && (mejor === null || h.length > mejor.length)) mejor = h
  }
  return mejor
}

/**
 * Secciones que arrancan cerradas (se abren con un toque y se recuerda la elección; la de la pantalla actual nunca se oculta).
 * Así lo que cada rol usa a diario cabe sin desplazarse: Control (con su insignia de alertas) para casi todos, y Almacén para quien
 * planifica salidas. Auditoría y Administración trabajan en Control: ahí queda abierto.
 */
export function cerradasPorDefecto(roles: readonly Rol[], secciones: readonly SeccionMenu[]): IdSeccion[] {
  const hay = new Set(secciones.map((s) => s.id))
  const cerradas: IdSeccion[] = []
  const trabajaEnControl = roles.includes('auditoria_lectura') || roles.includes('admin_wms')
  if (hay.has('control') && !trabajaEnControl) cerradas.push('control')
  if (hay.has('almacen') && hay.has('salidas') && roles.includes('jefe_transporte')) cerradas.push('almacen')
  return cerradas
}
