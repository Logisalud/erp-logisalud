// La bandeja de pedidos (S3): los pedidos que Pedidos deja listos para operaciones (READY_FOR_OPERATIONS), tal como estaban al importarse.
// Todo puro (sin Next ni Supabase): valida el contrato de Pedidos, decide si un pedido es nuevo / igual / una nueva versión / una versión vieja,
// resume lo que cambió y arma la vista de la bandeja. La base de datos (`wms.importar_pedidos`) aplica las mismas reglas.
import { normalizar } from './busqueda'

export const ESTADO_PEDIDO_LISTO = 'READY_FOR_OPERATIONS'

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
  /** Tipo de vehículo calificado para entregarle (texto). */
  vehiculoCalificado?: string
}

/** Lo que Pedidos entrega por cada pedido listo (el snapshot): el WMS lo guarda tal cual, para que el historial no cambie si el maestro cambia. */
export interface PedidoSnapshot {
  pedidoId: string
  numero: string
  /** Sube cada vez que el pedido se modifica en Pedidos después de quedar listo. */
  version: number
  estado: typeof ESTADO_PEDIDO_LISTO
  /** AAAA-MM-DD del pedido. */
  fecha: string
  modificadoEn: string
  cliente: ClientePedido
  vendedor?: string
  condicionPago?: string
  factura?: string
  observaciones?: string
  lineas: LineaPedido[]
}

export interface PedidoDescartado { indice: number; referencia?: string; motivo: string }

/** Prefijos de ubigeo que se entregan en Lima Metropolitana y Callao: no necesitan embalaje (parámetro `ubigeos_lima_metropolitana`). */
export const PREFIJOS_LIMA = ['1501', '0701'] as const
/** Un pedido a provincia se embala; uno a Lima queda con los bultos de la conformidad. Sin ubigeo se embala (lo más prudente). Espejo de `wms._requiere_embalaje`. */
export function requiereEmbalaje(ubigeo: string | undefined | null, prefijosLima: readonly string[] = PREFIJOS_LIMA): boolean {
  const u = ubigeo?.trim()
  if (!u) return true
  return !prefijosLima.some((p) => u.startsWith(p))
}

const texto = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const esFecha = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v))

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
    if (crudo.estado !== ESTADO_PEDIDO_LISTO) return malo(`Solo se importan pedidos ${ESTADO_PEDIDO_LISTO}.`, ref)
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
      pedidoId, numero, version, estado: ESTADO_PEDIDO_LISTO, fecha: String(crudo.fecha).slice(0, 10),
      modificadoEn: esFecha(crudo.modificadoEn) ? String(crudo.modificadoEn) : String(crudo.fecha).slice(0, 10) + 'T00:00:00Z',
      cliente: {
        id: texto(c.id)!, nombre: texto(c.nombre)!, ruc: texto(c.ruc), direccion: texto(c.direccion), distrito: texto(c.distrito), ubigeo: texto(c.ubigeo), coordenadas: coord,
        ventanaCita: texto(c.ventanaCita), vehiculoCalificado: texto(c.vehiculoCalificado),
      },
      vendedor: texto(crudo.vendedor), condicionPago: texto(crudo.condicionPago), factura: texto(crudo.factura), observaciones: texto(crudo.observaciones), lineas,
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
  if ((anterior.cliente.vehiculoCalificado ?? '') !== (nuevo.cliente.vehiculoCalificado ?? '')) cambios.push('Cambió el vehículo calificado')
  if ((anterior.condicionPago ?? '') !== (nuevo.condicionPago ?? '')) cambios.push('Cambió la condición de pago')
  return cambios
}

export interface ResumenImportacion {
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
export type EstadoBandeja = 'POR_PLANIFICAR' | 'EN_SALIDA' | 'CAMBIO_POR_REVISAR'

export const ETIQUETA_ESTADO_BANDEJA: Record<EstadoBandeja, string> = {
  POR_PLANIFICAR: 'Por planificar',
  EN_SALIDA: 'Con salida',
  CAMBIO_POR_REVISAR: 'Cambió: revisar',
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
  vehiculoCalificado?: string
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
  texto: string
}

export function armarBandeja(p: Omit<PedidoBandeja, 'texto' | 'unidades'>): PedidoBandeja {
  return {
    ...p,
    unidades: p.lineas.reduce((n, l) => n + l.cantidad, 0),
    texto: normalizar([p.numero, p.cliente, p.ruc ?? '', p.distrito ?? '', p.direccion ?? '', p.vendedor ?? '', ...p.lineas.flatMap((l) => [l.productoCodigo, l.descripcion])].join(' ')),
  }
}

export interface FiltrosBandeja { q: string; estado: '' | EstadoBandeja }
export const FILTROS_BANDEJA_VACIOS: FiltrosBandeja = { q: '', estado: '' }

export function filtrarBandeja(pedidos: readonly PedidoBandeja[], f: FiltrosBandeja): PedidoBandeja[] {
  const q = normalizar(f.q.trim())
  return pedidos
    .filter((p) => (!f.estado || p.estado === f.estado) && (!q || q.split(/\s+/).every((t) => p.texto.includes(t))))
    // lo que hay que mirar primero: los que cambiaron, luego los más viejos por planificar
    .sort((a, b) => Number(b.estado === 'CAMBIO_POR_REVISAR') - Number(a.estado === 'CAMBIO_POR_REVISAR') || a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero))
}

export const contarPorEstado = (pedidos: readonly PedidoBandeja[]): Record<EstadoBandeja, number> => ({
  POR_PLANIFICAR: pedidos.filter((p) => p.estado === 'POR_PLANIFICAR').length,
  EN_SALIDA: pedidos.filter((p) => p.estado === 'EN_SALIDA').length,
  CAMBIO_POR_REVISAR: pedidos.filter((p) => p.estado === 'CAMBIO_POR_REVISAR').length,
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

/** Arma la fila de la bandeja desde lo guardado (la usan la demo y el adaptador de Supabase, para que digan lo mismo). */
export function bandejaDeFila(f: {
  id: string; snapshot: PedidoSnapshot; cambios: string[]; cambioPendiente: boolean; salida?: string; importadoEn: string; codigosEnCatalogo: ReadonlySet<string>
}): PedidoBandeja {
  const p = f.snapshot
  return armarBandeja({
    id: f.id, pedidoId: p.pedidoId, numero: p.numero, version: p.version, fecha: p.fecha, clienteId: p.cliente.id, cliente: p.cliente.nombre, ruc: p.cliente.ruc,
    direccion: p.cliente.direccion, distrito: p.cliente.distrito, ventanaCita: p.cliente.ventanaCita, vehiculoCalificado: p.cliente.vehiculoCalificado,
    vendedor: p.vendedor, condicionPago: p.condicionPago, factura: p.factura, observaciones: p.observaciones,
    lineas: p.lineas.map((l) => ({ ...l, enCatalogo: f.codigosEnCatalogo.has(l.productoCodigo) })),
    estado: f.cambioPendiente ? 'CAMBIO_POR_REVISAR' : f.salida ? 'EN_SALIDA' : 'POR_PLANIFICAR',
    cambios: f.cambios, importadoEn: f.importadoEn, salida: f.salida,
  })
}
