// La bandeja de pedidos (S3): los pedidos que Pedidos deja listos para operaciones (READY_FOR_OPERATIONS), tal como estaban al importarse.
// Todo puro (sin Next ni Supabase): valida el contrato de Pedidos, decide si un pedido es nuevo / igual / una nueva versión / una versión vieja,
// resume lo que cambió y arma la vista de la bandeja. La base de datos (`wms.importar_pedidos`) aplica las mismas reglas.
import { normalizar } from './busqueda'

export const ESTADO_PEDIDO_LISTO = 'READY_FOR_OPERATIONS'
/** Pedidos avisa que el pedido se canceló (SA-3, D-128): llega como una versión nueva, con su motivo; la Orden de Salida se cancela y libera todo. */
export const ESTADO_PEDIDO_CANCELADO = 'CANCELLED'

export interface LineaPedido { lineaId: string; productoCodigo: string; descripcion: string; cantidad: number }

export interface ClientePedido {
  id: string
  nombre: string
  ruc?: string
  direccion?: string
  distrito?: string
  /** Ubigeo de entrega (6 dígitos): decide si el pedido va a Lima Metropolitana o a provincia (y entonces se embala). */
  ubigeo?: string
  coordenadas?: { lat: number; lng: number }
  /** Ventana de cita de entrega, tal como la dio el cliente (texto: «L-V 8:00–12:00»). */
  ventanaCita?: string
  /** Teléfono del contacto principal del cliente (Pedidos): lo que el transportista llama al llegar. */
  telefono?: string
  // «Vehículo calificado» ya no se trae de Pedidos (D-153): el Jefe de Transporte decide el vehículo por experiencia. Si un pedido viejo trae el dato, se ignora.
}

/** Lo que Pedidos entrega por cada pedido listo (el snapshot): el WMS lo guarda tal cual, para que el historial no cambie si el maestro cambia. */
export interface PedidoSnapshot {
  pedidoId: string
  numero: string
  /** Sube cada vez que el pedido se modifica en Pedidos después de quedar listo. */
  version: number
  estado: typeof ESTADO_PEDIDO_LISTO | typeof ESTADO_PEDIDO_CANCELADO
  /** AAAA-MM-DD del pedido. */
  fecha: string
  modificadoEn: string
  cliente: ClientePedido
  vendedor?: string
  condicionPago?: string
  factura?: string
  observaciones?: string
  /** Solo en un pedido cancelado: por qué se canceló y quién lo hizo en Pedidos (SA-3). */
  motivoCancelacion?: string
  canceladoPor?: string
  lineas: LineaPedido[]
  /** P8: el ruteo que ya hizo Pedidos (no se rehace aquí). Todos faltan si el pedido no tiene zona de reparto. */
  zonaReparto?: ZonaReparto
  ordenDistrito?: number
  /** Día de la semana planificado para la zona (1 = lunes … 7 = domingo, ISO) y la fecha concreta de ese día. */
  diaPlanificado?: number
  fechaPlanificada?: string
}

/** Una zona de reparto de Pedidos: `ordenRuta` ordena las zonas entre sí. */
export interface ZonaReparto { codigo: string; nombre: string; ordenRuta: number }
export const NOMBRE_DIA_ISO: Record<number, string> = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado', 7: 'Domingo' }

export interface PedidoDescartado { indice: number; referencia?: string; motivo: string }

/** Prefijos de ubigeo de LIMA: el departamento de Lima (15) y Callao (07). Sus pedidos no llevan etiquetas (parámetro `ubigeos_lima_metropolitana`, decisión de Sebas, 11-nov-2026). Lo demás es provincia. */
export const PREFIJOS_LIMA = ['15', '07'] as const
/** ¿Es un pedido a Lima? Sin ubigeo no se sabe (se trata como provincia, lo más prudente). */
export function esLima(ubigeo: string | undefined | null, prefijosLima: readonly string[] = PREFIJOS_LIMA): boolean {
  const u = ubigeo?.trim()
  return !!u && prefijosLima.some((p) => u.startsWith(p))
}
/** La etiqueta de bulto es para provincia; Lima no lleva. Espejo de `wms.salida_lleva_etiqueta`. */
export const llevaEtiqueta = (ubigeo: string | undefined | null, prefijosLima: readonly string[] = PREFIJOS_LIMA) => !esLima(ubigeo, prefijosLima)
/**
 * ¿Pasa por «Embalar»? Con el embalaje apagado (parámetro `embalaje_activo` = NO, el piloto) ninguno: los bultos quedan en la conformidad. Encendido: provincia se embala y Lima queda con
 * los bultos de la conformidad; sin ubigeo se embala. Espejo de `wms._requiere_embalaje`.
 */
export function requiereEmbalaje(ubigeo: string | undefined | null, prefijosLima: readonly string[] = PREFIJOS_LIMA, embalajeActivo = true): boolean {
  if (!embalajeActivo) return false
  const u = ubigeo?.trim()
  if (!u) return true
  return !esLima(u, prefijosLima)
}

const texto = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const esFecha = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v))

/** El ruteo que trae el pedido (`zona_reparto {codigo, nombre, orden_ruta}`, `orden_distrito`, `dia_planificado` 1..7, `fecha_planificada`); todo opcional: lo que viene mal se ignora sin descartar el pedido. */
export function ruteoDe(crudo: Record<string, unknown>): Pick<PedidoSnapshot, 'zonaReparto' | 'ordenDistrito' | 'diaPlanificado' | 'fechaPlanificada'> {
  const z = crudo.zonaReparto ?? crudo.zona_reparto
  const n = (v: unknown) => (v === null || v === undefined || v === '' ? NaN : Number(v))
  const out: Pick<PedidoSnapshot, 'zonaReparto' | 'ordenDistrito' | 'diaPlanificado' | 'fechaPlanificada'> = {}
  if (esObjeto(z) && texto(z.codigo)) {
    const orden = n(z.ordenRuta ?? z.orden_ruta)
    out.zonaReparto = { codigo: texto(z.codigo)!, nombre: texto(z.nombre) ?? texto(z.codigo)!, ordenRuta: Number.isFinite(orden) ? orden : 9999 }
  }
  const od = n(crudo.ordenDistrito ?? crudo.orden_distrito)
  if (Number.isFinite(od)) out.ordenDistrito = od
  const dia = n(crudo.diaPlanificado ?? crudo.dia_planificado)
  if (Number.isInteger(dia) && dia >= 1 && dia <= 7) out.diaPlanificado = dia
  const f = crudo.fechaPlanificada ?? crudo.fecha_planificada
  if (esFecha(f)) out.fechaPlanificada = String(f).slice(0, 10)
  return out
}

/** Valida el JSON de Pedidos. Un pedido mal formado se descarta con su motivo; no tumba a los demás. */
export function validarPedidos(entrada: unknown): { pedidos: PedidoSnapshot[]; descartados: PedidoDescartado[] } {
  const pedidos: PedidoSnapshot[] = []
  const descartados: PedidoDescartado[] = []
  if (!Array.isArray(entrada)) return { pedidos, descartados: [{ indice: -1, motivo: 'La respuesta de Pedidos no trae una lista de pedidos.' }] }
  entrada.forEach((crudo, indice) => {
    const malo = (motivo: string, referencia?: string) => descartados.push({ indice, referencia, motivo })
    if (!esObjeto(crudo)) return malo('El pedido no es un objeto.')
    const pedidoId = texto(crudo.pedidoId) ?? texto(crudo.pedido_id)
    const numero = texto(crudo.numero)
    const ref = numero ?? pedidoId
    if (!pedidoId) return malo('Falta el identificador del pedido.', ref)
    if (!numero) return malo('Falta el número del pedido.', ref)
    const version = Number(crudo.version)
    if (!Number.isInteger(version) || version < 1) return malo('La versión debe ser un entero desde 1.', ref)
    if (crudo.estado !== ESTADO_PEDIDO_LISTO && crudo.estado !== ESTADO_PEDIDO_CANCELADO) return malo(`Solo se importan pedidos ${ESTADO_PEDIDO_LISTO} o ${ESTADO_PEDIDO_CANCELADO}.`, ref)
    const motivoCancelacion = texto(crudo.motivoCancelacion) ?? texto(crudo.motivo_cancelacion)
    if (crudo.estado === ESTADO_PEDIDO_CANCELADO && !motivoCancelacion) return malo('Un pedido cancelado trae el motivo de la cancelación (motivoCancelacion).', ref)
    if (!esFecha(crudo.fecha)) return malo('Falta la fecha del pedido (AAAA-MM-DD).', ref)
    const c = crudo.cliente
    if (!esObjeto(c) || !texto(c.id) || !texto(c.nombre)) return malo('Falta el cliente (id y nombre).', ref)
    if (!Array.isArray(crudo.lineas) || crudo.lineas.length === 0) return malo('El pedido no trae líneas.', ref)
    const lineas: LineaPedido[] = []
    for (const l of crudo.lineas) {
      if (!esObjeto(l)) return malo('Una línea no es un objeto.', ref)
      const lineaId = texto(l.lineaId) ?? texto(l.linea_id)
      const productoCodigo = texto(l.productoCodigo) ?? texto(l.producto_codigo)
      const cantidad = Number(l.cantidad)
      if (!lineaId || !productoCodigo) return malo('Una línea no trae su id o el código del producto.', ref)
      if (!Number.isInteger(cantidad) || cantidad <= 0) return malo(`La línea de ${productoCodigo} debe pedir una cantidad entera mayor que cero.`, ref)
      lineas.push({ lineaId, productoCodigo, descripcion: texto(l.descripcion) ?? productoCodigo, cantidad })
    }
    if (new Set(lineas.map((l) => l.lineaId)).size !== lineas.length) return malo('Hay líneas repetidas.', ref)
    const coord = esObjeto(c.coordenadas) && Number.isFinite(Number(c.coordenadas.lat)) && Number.isFinite(Number(c.coordenadas.lng))
      ? { lat: Number(c.coordenadas.lat), lng: Number(c.coordenadas.lng) } : undefined
    pedidos.push({
      pedidoId, numero, version, estado: crudo.estado, fecha: String(crudo.fecha).slice(0, 10),
      modificadoEn: esFecha(crudo.modificadoEn) ? String(crudo.modificadoEn) : String(crudo.fecha).slice(0, 10) + 'T00:00:00Z',
      cliente: {
        id: texto(c.id)!, nombre: texto(c.nombre)!, ruc: texto(c.ruc), direccion: texto(c.direccion), distrito: texto(c.distrito), ubigeo: texto(c.ubigeo), coordenadas: coord,
        ventanaCita: texto(c.ventanaCita), telefono: texto(c.telefono),
      },
      vendedor: texto(crudo.vendedor), condicionPago: texto(crudo.condicionPago), factura: texto(crudo.factura), observaciones: texto(crudo.observaciones),
      ...ruteoDe(crudo),
      ...(crudo.estado === ESTADO_PEDIDO_CANCELADO ? { motivoCancelacion, canceladoPor: texto(crudo.canceladoPor) ?? texto(crudo.cancelado_por) } : {}), lineas,
    })
  })
  const vistos = new Set<string>()
  return {
    pedidos: pedidos.filter((p) => { const k = `${p.pedidoId}#${p.version}`; if (vistos.has(k)) { descartados.push({ indice: -1, referencia: p.numero, motivo: 'Viene repetido en la misma respuesta.' }); return false } vistos.add(k); return true }),
    descartados,
  }
}

export type ComparacionVersion = 'NUEVO' | 'IGUAL' | 'NUEVA_VERSION' | 'ANTIGUA'

/** Importar es idempotente: la misma versión no duplica y una versión más vieja que la vigente no pisa nada. */
export function compararVersion(vigente: number | undefined, recibida: number): ComparacionVersion {
  if (vigente === undefined) return 'NUEVO'
  if (recibida === vigente) return 'IGUAL'
  return recibida > vigente ? 'NUEVA_VERSION' : 'ANTIGUA'
}

/** Lo que cambió entre dos versiones del mismo pedido, en palabras (para la alerta y para la bandeja). */
export function resumirCambios(anterior: PedidoSnapshot, nuevo: PedidoSnapshot): string[] {
  const cambios: string[] = []
  if (nuevo.estado === ESTADO_PEDIDO_CANCELADO && anterior.estado !== ESTADO_PEDIDO_CANCELADO) return [`El pedido se canceló en Pedidos: ${nuevo.motivoCancelacion ?? 'sin motivo'}`]
  const antes = new Map(anterior.lineas.map((l) => [l.lineaId, l]))
  const despues = new Map(nuevo.lineas.map((l) => [l.lineaId, l]))
  for (const l of nuevo.lineas) {
    const a = antes.get(l.lineaId)
    if (!a) cambios.push(`Se agregó ${l.descripcion} (${l.cantidad} u.)`)
    else if (a.cantidad !== l.cantidad) cambios.push(`${l.descripcion}: la cantidad pasó de ${a.cantidad} a ${l.cantidad}`)
  }
  for (const a of anterior.lineas) if (!despues.has(a.lineaId)) cambios.push(`Se quitó ${a.descripcion} (${a.cantidad} u.)`)
  if (anterior.cliente.nombre !== nuevo.cliente.nombre) cambios.push('Cambió el nombre del cliente')
  if ((anterior.cliente.direccion ?? '') !== (nuevo.cliente.direccion ?? '')) cambios.push('Cambió la dirección de entrega')
  if ((anterior.cliente.ventanaCita ?? '') !== (nuevo.cliente.ventanaCita ?? '')) cambios.push('Cambió la ventana de cita')
  if ((anterior.zonaReparto?.codigo ?? '') !== (nuevo.zonaReparto?.codigo ?? '')) cambios.push(`Cambió la zona de reparto${nuevo.zonaReparto ? ` (ahora ${nuevo.zonaReparto.nombre})` : ' (ya no tiene zona)'}`)
  if ((anterior.diaPlanificado ?? 0) !== (nuevo.diaPlanificado ?? 0) || (anterior.fechaPlanificada ?? '') !== (nuevo.fechaPlanificada ?? '')) cambios.push('Cambió el día planificado de reparto')
  if ((anterior.condicionPago ?? '') !== (nuevo.condicionPago ?? '')) cambios.push('Cambió la condición de pago')
  if (nuevo.factura && (anterior.factura ?? '') !== nuevo.factura) cambios.push(`Pedidos registró la factura ${nuevo.factura}`)
  return cambios
}

export interface ResumenImportacion {
  /** Lo que Pedidos entregó en esta actualización, su último número y cuántos listos dice tener (si algo no cuadra, se avisa). */
  entregados?: number
  ultimoNumero?: string
  totalEnPedidos?: number
  nuevos: number
  nuevasVersiones: number
  iguales: number
  antiguas: number
  descartados: PedidoDescartado[]
}

/** Qué hace una importación con lo que ya hay (el mismo cálculo que la base de datos): vigentes por pedido → qué se inserta. */
export function planificarImportacion(vigentes: ReadonlyMap<string, PedidoSnapshot>, recibidos: readonly PedidoSnapshot[]): {
  insertar: { pedido: PedidoSnapshot; anterior?: PedidoSnapshot; cambios: string[] }[]
  resumen: Omit<ResumenImportacion, 'descartados'>
} {
  const resumen = { nuevos: 0, nuevasVersiones: 0, iguales: 0, antiguas: 0 }
  const insertar: { pedido: PedidoSnapshot; anterior?: PedidoSnapshot; cambios: string[] }[] = []
  const vigente = new Map(vigentes)
  // dentro de una misma respuesta, primero las versiones más bajas: así la más alta queda como vigente
  for (const p of [...recibidos].sort((a, b) => a.pedidoId.localeCompare(b.pedidoId) || a.version - b.version)) {
    const actual = vigente.get(p.pedidoId)
    switch (compararVersion(actual?.version, p.version)) {
      case 'NUEVO': resumen.nuevos++; insertar.push({ pedido: p, cambios: [] }); vigente.set(p.pedidoId, p); break
      case 'NUEVA_VERSION': resumen.nuevasVersiones++; insertar.push({ pedido: p, anterior: actual, cambios: resumirCambios(actual!, p) }); vigente.set(p.pedidoId, p); break
      case 'IGUAL': resumen.iguales++; break
      case 'ANTIGUA': resumen.antiguas++; break
    }
  }
  return { insertar, resumen }
}

// ── La bandeja ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Por planificar: nadie lo ha llevado a una ruta. En salida: ya se creó su salida. Cambió: llegó una versión nueva después de importarse. */
export type EstadoBandeja = 'POR_PLANIFICAR' | 'EN_SALIDA' | 'CAMBIO_POR_REVISAR' | 'CANCELADO_EN_PEDIDOS'

export const ETIQUETA_ESTADO_BANDEJA: Record<EstadoBandeja, string> = {
  POR_PLANIFICAR: 'Por planificar',
  EN_SALIDA: 'Con salida',
  CAMBIO_POR_REVISAR: 'Cambió: revisar',
  CANCELADO_EN_PEDIDOS: 'Cancelado en Pedidos',
}

export interface PedidoBandeja {
  /** Id de la fila vigente en el WMS. */
  id: string
  pedidoId: string
  numero: string
  version: number
  fecha: string
  clienteId: string
  cliente: string
  ruc?: string
  direccion?: string
  distrito?: string
  ventanaCita?: string
  telefono?: string
  vendedor?: string
  condicionPago?: string
  factura?: string
  observaciones?: string
  lineas: (LineaPedido & { enCatalogo: boolean })[]
  unidades: number
  estado: EstadoBandeja
  /** Qué cambió respecto de la versión anterior (vacío en la primera versión). */
  cambios: string[]
  importadoEn: string
  /** Número de la salida que lo tomó, si la hay. */
  salida?: string
  /** Id de esa salida (para abrirla). */
  salidaId?: string
  /** Solo si Pedidos lo canceló: el motivo y quién (SA-3). */
  motivoCancelacion?: string
  canceladoPor?: string
  /** Si su orden de salida tiene falta de stock: el aviso listo para copiar y mandárselo al vendedor por WhatsApp (SA-3, D-126). */
  avisoVendedor?: string
  /** P8: zona de reparto, orden dentro de la zona y día planificado, tal como los calculó Pedidos (vacíos = «sin zona»). */
  zonaReparto?: ZonaReparto
  ordenDistrito?: number
  diaPlanificado?: number
  fechaPlanificada?: string
  texto: string
}

export function armarBandeja(p: Omit<PedidoBandeja, 'texto' | 'unidades'>): PedidoBandeja {
  return {
    ...p,
    unidades: p.lineas.reduce((n, l) => n + l.cantidad, 0),
    texto: normalizar([p.numero, p.cliente, p.ruc ?? '', p.distrito ?? '', p.direccion ?? '', p.vendedor ?? '', p.zonaReparto?.nombre ?? '', ...p.lineas.flatMap((l) => [l.productoCodigo, l.descripcion])].join(' ')),
  }
}

/** Valor especial de los filtros de zona y día: los pedidos que no tienen zona (o día) planificado. */
export const SIN_VALOR = '__sin__'
export interface FiltrosBandeja { q: string; estado: '' | EstadoBandeja; /** Código de zona de reparto; '' = sin filtro; SIN_VALOR = sin zona. */ zona: string; /** Día planificado ISO 1..7 como texto; '' = sin filtro; SIN_VALOR = sin día. */ dia: string }
export const FILTROS_BANDEJA_VACIOS: FiltrosBandeja = { q: '', estado: '', zona: '', dia: '' }

export function filtrarBandeja(pedidos: readonly PedidoBandeja[], f: Partial<FiltrosBandeja> & Pick<FiltrosBandeja, 'q' | 'estado'>): PedidoBandeja[] {
  const q = normalizar(f.q.trim())
  const ok = (valor: string | undefined, filtro: string | undefined) => !filtro || (filtro === SIN_VALOR ? !valor : valor === filtro)
  return pedidos
    .filter((p) => (!f.estado || p.estado === f.estado) && ok(p.zonaReparto?.codigo, f.zona) && ok(p.diaPlanificado ? String(p.diaPlanificado) : undefined, f.dia) && (!q || q.split(/\s+/).every((t) => p.texto.includes(t))))
    // lo que hay que mirar primero: los que cambiaron, luego los más viejos por planificar
    .sort((a, b) => Number(b.estado === 'CAMBIO_POR_REVISAR') - Number(a.estado === 'CAMBIO_POR_REVISAR') || Number(a.estado === 'CANCELADO_EN_PEDIDOS') - Number(b.estado === 'CANCELADO_EN_PEDIDOS') || a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero))
}

export interface OpcionFiltro { valor: string; etiqueta: string; cantidad: number }
/** Las zonas de reparto que hay en la bandeja (en el orden de ruta de Pedidos), con cuántos pedidos tiene cada una, y «Sin zona» al final si corresponde. */
export function opcionesZona(pedidos: readonly PedidoBandeja[]): OpcionFiltro[] {
  const zonas = new Map<string, { z: ZonaReparto; n: number }>()
  let sin = 0
  for (const p of pedidos) { const z = p.zonaReparto; if (z) { const x = zonas.get(z.codigo); if (x) x.n += 1; else zonas.set(z.codigo, { z, n: 1 }) } else sin += 1 }
  const lista = [...zonas.values()].sort((a, b) => a.z.ordenRuta - b.z.ordenRuta || a.z.nombre.localeCompare(b.z.nombre, 'es')).map(({ z, n }) => ({ valor: z.codigo, etiqueta: z.nombre, cantidad: n }))
  return sin ? [...lista, { valor: SIN_VALOR, etiqueta: 'Sin zona', cantidad: sin }] : lista
}
/** Los días planificados (lunes a domingo) que hay en la bandeja, con su cantidad, y «Sin día» al final si corresponde. */
export function opcionesDia(pedidos: readonly PedidoBandeja[]): OpcionFiltro[] {
  const dias = new Map<number, number>()
  let sin = 0
  for (const p of pedidos) { if (p.diaPlanificado) dias.set(p.diaPlanificado, (dias.get(p.diaPlanificado) ?? 0) + 1); else sin += 1 }
  const lista = [...dias].sort((a, b) => a[0] - b[0]).map(([d, cantidad]) => ({ valor: String(d), etiqueta: NOMBRE_DIA_ISO[d] ?? `Día ${d}`, cantidad }))
  return sin ? [...lista, { valor: SIN_VALOR, etiqueta: 'Sin día', cantidad: sin }] : lista
}

/** El orden de ruta de Pedidos: primero la zona (`orden_ruta`), luego el distrito dentro de la zona (`orden_distrito`); lo que no tiene zona va al final, por número. Para precargar las paradas de una ruta del WMS. */
export function ordenarPorRuteo<T extends { zonaReparto?: ZonaReparto; ordenDistrito?: number; numero: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) =>
    (a.zonaReparto?.ordenRuta ?? Infinity) - (b.zonaReparto?.ordenRuta ?? Infinity) || (a.ordenDistrito ?? Infinity) - (b.ordenDistrito ?? Infinity) || a.numero.localeCompare(b.numero, 'es', { numeric: true }))
}

/** Los pedidos de los que se pueden crear órdenes ahora: importados sin procesar (sin orden), sin cambio por revisar ni cancelación. */
export const pedidosSinProcesar = (pedidos: readonly PedidoBandeja[]) => pedidos.filter((p) => p.estado === 'POR_PLANIFICAR')

export const contarPorEstado = (pedidos: readonly PedidoBandeja[]): Record<EstadoBandeja, number> => ({
  POR_PLANIFICAR: pedidos.filter((p) => p.estado === 'POR_PLANIFICAR').length,
  EN_SALIDA: pedidos.filter((p) => p.estado === 'EN_SALIDA').length,
  CAMBIO_POR_REVISAR: pedidos.filter((p) => p.estado === 'CAMBIO_POR_REVISAR').length,
  CANCELADO_EN_PEDIDOS: pedidos.filter((p) => p.estado === 'CANCELADO_EN_PEDIDOS').length,
})

/** «hace 5 min», «hace 3 h», «hace 2 días». */
export function hace(iso: string, ahora: Date = new Date()): string {
  const min = Math.max(0, Math.round((ahora.getTime() - Date.parse(iso)) / 60000))
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  if (min < 60 * 24) return `hace ${Math.round(min / 60)} h`
  const d = Math.round(min / 1440)
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`
}

export interface ImportacionVista { id: string; en: string; por: string; origen: string; ok: boolean; mensaje?: string; resumen?: Omit<ResumenImportacion, 'descartados'> & { descartados: number } }

/** Quién ve y actualiza la bandeja (espejo de la política y de la función de la base de datos). */
export const puedeVerBandeja = (roles: readonly string[]) => roles.some((r) => ['jefe_transporte', 'jefe_almacen', 'direccion_tecnica', 'admin_wms', 'auditoria_lectura'].includes(r))
export const puedeActualizarBandeja = (roles: readonly string[]) => roles.some((r) => ['jefe_transporte', 'jefe_almacen'].includes(r))

/** 1e: ¿toca traer los pedidos solos al abrir la bandeja? Sí si nunca se intentó o si el último intento (bueno o malo) tiene más de `minutos` minutos: un intento fallido también frena el siguiente, para no insistir en cada pantalla. */
export function tocaTraerPedidos(ultimoIntentoEn: string | undefined | null, ahoraMs: number, minutos = 15): boolean {
  if (!ultimoIntentoEn) return true
  const t = Date.parse(ultimoIntentoEn)
  return Number.isNaN(t) || ahoraMs - t >= minutos * 60_000
}

/** Arma la fila de la bandeja desde lo guardado (la usan la demo y el adaptador de Supabase, para que digan lo mismo). */
export function bandejaDeFila(f: {
  id: string; snapshot: PedidoSnapshot; cambios: string[]; cambioPendiente: boolean; salida?: string; salidaId?: string; importadoEn: string; codigosEnCatalogo: ReadonlySet<string>; avisoVendedor?: string
}): PedidoBandeja {
  const p = f.snapshot
  return armarBandeja({
    id: f.id, pedidoId: p.pedidoId, numero: p.numero, version: p.version, fecha: p.fecha, clienteId: p.cliente.id, cliente: p.cliente.nombre, ruc: p.cliente.ruc,
    direccion: p.cliente.direccion, distrito: p.cliente.distrito, ventanaCita: p.cliente.ventanaCita, telefono: p.cliente.telefono,
    vendedor: p.vendedor, condicionPago: p.condicionPago, factura: p.factura, observaciones: p.observaciones,
    lineas: p.lineas.map((l) => ({ ...l, enCatalogo: f.codigosEnCatalogo.has(l.productoCodigo) })),
    estado: p.estado === ESTADO_PEDIDO_CANCELADO ? 'CANCELADO_EN_PEDIDOS' : f.cambioPendiente ? 'CAMBIO_POR_REVISAR' : f.salida ? 'EN_SALIDA' : 'POR_PLANIFICAR',
    cambios: f.cambios, importadoEn: f.importadoEn, salida: f.salida, salidaId: f.salidaId, avisoVendedor: f.avisoVendedor,
    zonaReparto: p.zonaReparto, ordenDistrito: p.ordenDistrito, diaPlanificado: p.diaPlanificado, fechaPlanificada: p.fechaPlanificada,
    ...(p.estado === ESTADO_PEDIDO_CANCELADO ? { motivoCancelacion: p.motivoCancelacion, canceladoPor: p.canceladoPor } : {}),
  })
}
