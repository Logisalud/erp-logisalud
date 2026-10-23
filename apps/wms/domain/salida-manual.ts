// Nueva Orden de Salida manual (SA-2): los tres tipos que se inician a mano (A venta manual, B por cuenta de un cliente, C sin venta), quién puede crear cada uno, el número de
// pedido de la venta manual, los datos del cliente mientras no exista la conexión con Pedidos (D-80) y la validación inmediata de cada línea.
// Todo puro. Espejo de la función `wms.crear_orden_salida_manual` (migración 0028): la base de datos manda y dice lo mismo con las mismas palabras.
import { normalizar, puntaje } from './busqueda'
import { validarNumeroGre } from './documentacion'
import { asignarLinea, loteApto, origenDelStock, validarMotivoSalida, ETIQUETA_MOTIVO_SALIDA, type MotivoSalida, type PoliticaCanje, type TipoSalida, POLITICA_CANJE_INICIAL } from './salidas'
import { puede } from './permisos'
import type { Rol } from './tipos'

// ── Los tipos ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export type ClaseOrdenManual = 'A' | 'B' | 'C'
export const CLASES_ORDEN_MANUAL: readonly ClaseOrdenManual[] = ['A', 'B', 'C']

export const INFO_CLASE: Record<ClaseOrdenManual, { titulo: string; frase: string; quien: string }> = {
  A: {
    titulo: 'Venta a un cliente de distribución',
    frase: 'Para una venta a una botica, farmacia o droguería cuyo pedido existe en Pedidos pero no llegó por la bandeja. Lleva el número del pedido y guía de remisión.',
    quien: 'La crea solo el Jefe de Transporte.',
  },
  B: {
    titulo: 'Por cuenta de un cliente de almacenamiento',
    frase: 'Para sacar mercadería de un cliente (AJR, Diphasac, Medic Pharma, Triamed) con la guía de remisión que él mismo te da. Solo se usa su stock. No lleva guía del WMS.',
    quien: 'La crean el Jefe de Transporte y el Jefe de Almacén.',
  },
  C: {
    titulo: 'Salida sin venta de Logissa',
    frase: 'Para una muestra o para devolver mercadería a su proveedor. No hay venta. Lleva guía de remisión con el motivo que corresponde.',
    quien: 'La muestra la crea quien autoriza salidas sin venta; la devolución al proveedor, el Jefe de Transporte o el Jefe de Almacén.',
  },
}

export const MOTIVOS_C: readonly MotivoSalida[] = ['MUESTRA', 'DEVOLUCION_PROVEEDOR']
/** Los motivos que un cliente de almacenamiento puede elegir en la tabla de líneas (tipo B). */
export const MOTIVOS_B: readonly MotivoSalida[] = ['VENTA', 'MUESTRA', 'PESQUISA_DIGEMID', 'DESTRUCCION']

export const puedeCrearVentaManual = (roles: readonly Rol[]) => puede(roles, 'crear_orden_venta_manual')
export const puedeCrearPorCuentaDeCliente = (roles: readonly Rol[]) => puede(roles, 'preparar_salidas')
export const puedeCrearMuestra = (roles: readonly Rol[]) => puede(roles, 'autorizar_salida_sin_venta')
export const puedeCrearDevolucionProveedor = (roles: readonly Rol[]) => puede(roles, 'preparar_salidas')

/** Los motivos de tipo C que esta persona puede crear (vacío = ninguno). */
export const motivosDeCQuePuede = (roles: readonly Rol[]): MotivoSalida[] => [
  ...(puedeCrearMuestra(roles) ? (['MUESTRA'] as const) : []),
  ...(puedeCrearDevolucionProveedor(roles) ? (['DEVOLUCION_PROVEEDOR'] as const) : []),
]

/** Cada rol ve solo los tipos que puede crear. */
export function clasesQuePuede(roles: readonly Rol[]): ClaseOrdenManual[] {
  return CLASES_ORDEN_MANUAL.filter((c) => (c === 'A' ? puedeCrearVentaManual(roles) : c === 'B' ? puedeCrearPorCuentaDeCliente(roles) : motivosDeCQuePuede(roles).length > 0))
}
export const puedeCrearOrdenManual = (roles: readonly Rol[]) => clasesQuePuede(roles).length > 0

/** El tipo de salida (el de la base de datos) que corresponde a la clase y el motivo. */
export function tipoDeClase(clase: ClaseOrdenManual, motivoC?: MotivoSalida): TipoSalida {
  if (clase === 'A') return 'DISTRIBUCION'
  if (clase === 'B') return 'CLIENTE'
  return motivoC === 'DEVOLUCION_PROVEEDOR' ? 'PROVEEDOR' : 'MUESTRA'
}

/** Quién puede crear una orden manual de este tipo (la base de datos vuelve a exigirlo). Devuelve el motivo si no puede. */
export function motivoNoPuedeCrear(roles: readonly Rol[], clase: ClaseOrdenManual, motivoC?: MotivoSalida): string | null {
  if (clase === 'A') return puedeCrearVentaManual(roles) ? null : 'Solo el Jefe de Transporte crea una venta manual'
  if (clase === 'B') return puedeCrearPorCuentaDeCliente(roles) ? null : 'No tienes permiso para crear una salida por cuenta de un cliente'
  if (motivoC === 'MUESTRA') return puedeCrearMuestra(roles) ? null : 'Solo quien autoriza salidas sin venta registra una muestra'
  if (motivoC === 'DEVOLUCION_PROVEEDOR') return puedeCrearDevolucionProveedor(roles) ? null : 'No tienes permiso para preparar salidas'
  return 'En una salida sin venta el motivo es muestra o devolución al proveedor'
}

// ── Número de pedido (tipo A) ─────────────────────────────────────────────────────────────────────────────────────────

/** Mayúsculas y sin espacios: «ped 0012» y «PED0012» son el mismo pedido (espejo de `wms._numero_pedido_norm`). */
export const normalizarNumeroPedido = (n: string | null | undefined): string => (n ?? '').replace(/\s+/g, '').toUpperCase()

export const MENSAJE_PEDIDO_OBLIGATORIO = 'El número de pedido es obligatorio: la orden queda ligada a ese pedido'
export const mensajePedidoConOrden = (numeroPedido: string, orden: string) => `El pedido ${numeroPedido.trim()} ya tiene la Orden de Salida ${orden}. Un pedido no puede tener dos órdenes`
export const mensajePedidoEnBandeja = (numeroPedido: string) => `El pedido ${numeroPedido.trim()} ya llegó por la bandeja: créale la orden desde «Pedidos por despachar»`

// ── Cliente (tipo A, mientras no exista la conexión con Pedidos) ──────────────────────────────────────────────────────────

export interface ClienteManual { ruc: string; razonSocial: string; direccion: string; ubigeo: string; vendedor?: string }
export const AYUDA_UBIGEO = 'El ubigeo es el código de 6 números del distrito de entrega (por ejemplo 150101 es Lima). La guía de remisión lo exige y SUNAT la rechaza si falta.'
export const AYUDA_CONCILIAR = 'Cuando Pedidos y el WMS estén conectados, el WMS comprobará que el pedido existe y que el cliente coincide. Hasta entonces la orden queda «por conciliar con Pedidos».'

export const validarRuc = (ruc: string) => (/^\d{11}$/.test(ruc.trim()) ? null : 'El RUC tiene 11 números')
export const validarUbigeo = (u: string) => (/^\d{6}$/.test(u.trim()) ? null : 'El ubigeo tiene 6 números (el código del distrito de entrega)')

export function validarClienteManual(c: Partial<ClienteManual>): Record<string, string> {
  const e: Record<string, string> = {}
  const ruc = validarRuc(c.ruc ?? ''); if (ruc) e.ruc = ruc
  if (!(c.razonSocial ?? '').trim()) e.razonSocial = 'Escribe la razón social del cliente'
  if (!(c.direccion ?? '').trim()) e.direccion = 'Escribe la dirección de entrega'
  const ub = validarUbigeo(c.ubigeo ?? ''); if (ub) e.ubigeo = ub
  return e
}

/**
 * Tipo C (SA-6): a quién va la salida. En una muestra, el destinatario (botica, clínica, médico con RUC); en una devolución, el proveedor. La guía exige RUC, nombre, dirección y
 * ubigeo. Mismos mensajes que `wms.crear_orden_salida_manual`. Se guarda en el mismo lugar que el cliente de la venta manual.
 */
export function validarDestinatarioC(c: Partial<ClienteManual>, motivo?: MotivoSalida): Record<string, string> {
  const e: Record<string, string> = {}
  if (!(c.razonSocial ?? '').trim()) e.razonSocial = motivo === 'DEVOLUCION_PROVEEDOR' ? 'Escribe el nombre del proveedor' : 'Escribe a quién va la muestra'
  const ruc = validarRuc(c.ruc ?? ''); if (ruc) e.ruc = ruc
  if (!(c.direccion ?? '').trim()) e.direccion = 'Escribe la dirección de entrega'
  const ub = validarUbigeo(c.ubigeo ?? ''); if (ub) e.ubigeo = ub
  return e
}

// ── La GRE del cliente (tipo B) ─────────────────────────────────────────────────────────────────────────────────────────────

export const MAXIMO_GRE_BYTES = 10 * 1024 * 1024
/** El PDF de la guía del cliente: solo PDF y hasta 10 MB. */
export function validarPdfGre(nombre: string, bytes: number): string | null {
  if (!nombre.toLowerCase().endsWith('.pdf')) return 'La guía del cliente se adjunta en PDF.'
  if (bytes <= 0) return 'El archivo está vacío.'
  if (bytes > MAXIMO_GRE_BYTES) return 'El archivo pesa más de 10 MB. Reduce su tamaño y vuelve a subirlo.'
  return null
}

// ── Líneas con lote indicado (tipo B y devolución al proveedor) ─────────────────────────────────────────────────────────────

/** Un lote tal como lo ve quien crea la orden. `disponibleAprobado` = saldo Aprobado − comprometido; `enBajas` = lo que ya está en el área de Bajas. */
export interface LoteParaSalida {
  loteId: string
  codigo: string
  productoId: string
  propietarioId: string
  propietario: string
  vence: string | null
  disponibleAprobado: number
  enBajas: number
  enReserva: boolean
}

export interface EntradaValidacionLinea {
  tipo: TipoSalida
  motivo: MotivoSalida
  propietarioId: string
  productoId: string | undefined
  loteCodigo: string
  cantidad: number
  hoy: string
  /** Los lotes que tienen ese código (de cualquier propietario): así se distingue «no existe» de «es de otro propietario». */
  lotes: readonly LoteParaSalida[]
  /** Lo que ya piden otras líneas de esta misma orden del mismo lote (para no pasarse entre todas). */
  yaPedidoDelLote?: number
  canje?: PoliticaCanje
}

export type ResultadoLinea = { ok: true; lote: LoteParaSalida; vence: string | null } | { ok: false; campo: 'producto' | 'lote' | 'cantidad' | 'motivo'; mensaje: string }

/**
 * La validación inmediata de una línea con lote indicado (tipo B o devolución al proveedor): producto, lote existente, del propietario y del producto, apto para el
 * motivo (nunca vencido; la devolución, según la política de canje; la destrucción, solo lo que ya está en Bajas), sin Reserva y con cantidad suficiente.
 * Mismos mensajes que `wms.crear_orden_salida_manual`.
 */
export function validarLineaSalidaCliente(e: EntradaValidacionLinea): ResultadoLinea {
  const malo = (campo: 'producto' | 'lote' | 'cantidad' | 'motivo', mensaje: string): ResultadoLinea => ({ ok: false, campo, mensaje })
  const m = validarMotivoSalida(e.tipo, e.motivo)
  if (m) return malo('motivo', m)
  if (!e.productoId) return malo('producto', 'Elige el producto')
  if (!Number.isInteger(e.cantidad) || e.cantidad <= 0) return malo('cantidad', 'La cantidad de cada línea debe ser mayor que cero')
  const codigo = e.loteCodigo.trim()
  if (!codigo) return malo('lote', 'Indica el lote de cada línea')
  const mismos = e.lotes.filter((l) => normalizar(l.codigo) === normalizar(codigo))
  if (mismos.length === 0) return malo('lote', `No encontramos el lote ${codigo}`)
  const delPropietario = mismos.filter((l) => l.propietarioId === e.propietarioId)
  if (delPropietario.length === 0) return malo('lote', `El lote ${mismos[0].codigo} no es de este propietario`)
  const lt = delPropietario.find((l) => l.productoId === e.productoId)
  if (!lt) return malo('lote', `El lote ${delPropietario[0].codigo} no corresponde al producto de la línea`)
  const yaPedido = e.yaPedidoDelLote ?? 0
  if (origenDelStock(e.motivo) === 'BAJAS_RECHAZADOS') {
    const hay = Math.max(lt.enBajas - yaPedido, 0)
    if (hay < e.cantidad) return malo('cantidad', `La destrucción sale solo desde Bajas: del lote ${lt.codigo} hay ${hay} unidades en el área de Bajas y la línea pide ${e.cantidad}. Lo que no esté en Bajas se da de baja primero con una Orden de Baja`)
    return { ok: true, lote: lt, vence: lt.vence }
  }
  const apto = loteApto(lt.vence, e.tipo, e.motivo, e.hoy, 0, e.canje ?? POLITICA_CANJE_INICIAL)
  if (!apto.apto) return malo('lote', `Lote ${lt.codigo}: ${apto.razon}`)
  if (lt.enReserva) return malo('lote', `El lote ${lt.codigo} está en Reserva: no sale hasta que se quite la Reserva`)
  const hay = Math.max(lt.disponibleAprobado - yaPedido, 0)
  if (hay < e.cantidad) return malo('cantidad', `No hay en el lote ${lt.codigo} con ${e.cantidad} unidades disponibles (hay ${hay})`)
  return { ok: true, lote: lt, vence: lt.vence }
}

// ── La orden completa ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface LineaOrdenManual {
  productoId: string
  cantidad: number
  /** A: el lote que se eligió en lugar del que propone FEFO (opcional). B y devolución: el lote indicado (obligatorio). */
  loteId?: string
  /** Solo tipo B: cada línea trae su motivo; una guía con motivos mezclados se parte en una orden por motivo. */
  motivo?: MotivoSalida
}

export interface EntradaOrdenManual {
  clase: ClaseOrdenManual
  /** Tipo C: muestra o devolución al proveedor. */
  motivo?: MotivoSalida
  /** Tipo B: el cliente de almacenamiento. En A y C el propietario es Logissa (lo pone el sistema). */
  propietarioId?: string
  pedidoNumero?: string
  /** Tipo A: el cliente de la venta. Tipo C (SA-6): el destinatario de la muestra o el proveedor de la devolución. */
  cliente?: ClienteManual
  greNumero?: string
  /** La referencia del PDF de la GRE ya guardada en el almacenamiento de archivos. */
  greArchivo?: string
  lineas: LineaOrdenManual[]
  /** Evita crear dos veces la misma orden si se reintenta. */
  token?: string
}

/** Lo que se comprueba sin tocar la base: la pantalla lo usa antes de enviar y la demo antes de guardar. Devuelve errores por campo. */
export function validarOrdenManual(e: EntradaOrdenManual, esDeCliente?: (propietarioId: string) => boolean): Record<string, string> {
  const errores: Record<string, string> = {}
  if (e.lineas.length === 0) errores.lineas = 'Agrega al menos una línea'
  if (e.lineas.some((l) => !l.productoId)) errores.lineas = 'Elige el producto de cada línea'
  else if (e.lineas.some((l) => !Number.isInteger(l.cantidad) || l.cantidad <= 0)) errores.lineas = 'La cantidad de cada línea debe ser mayor que cero'
  if (e.clase === 'A') {
    if (!normalizarNumeroPedido(e.pedidoNumero)) errores.pedidoNumero = MENSAJE_PEDIDO_OBLIGATORIO
    Object.assign(errores, validarClienteManual(e.cliente ?? {}))
    const ids = e.lineas.map((l) => l.productoId)
    if (new Set(ids).size !== ids.length) errores.lineas = 'Un producto aparece una sola vez: junta sus cantidades'
  } else if (e.clase === 'B') {
    if (!e.propietarioId) errores.propietarioId = 'Elige el cliente de almacenamiento'
    else if (esDeCliente && !esDeCliente(e.propietarioId)) errores.propietarioId = 'Una salida por cuenta de un cliente es de un cliente de almacenamiento'
    const gre = validarNumeroGre(e.greNumero ?? '')
    if (gre) errores.greNumero = gre
    if (!e.greArchivo) errores.greArchivo = 'Adjunta el PDF de la guía de remisión del cliente'
    for (const l of e.lineas) {
      if (!l.motivo) { errores.lineas = 'Elige el motivo de cada línea'; break }
      const m = validarMotivoSalida('CLIENTE', l.motivo)
      if (m) { errores.lineas = m; break }
      if (!l.loteId) { errores.lineas = 'Indica el lote de cada línea'; break }
    }
  } else {
    if (!e.motivo || !MOTIVOS_C.includes(e.motivo)) errores.motivo = 'Elige si es una muestra o una devolución al proveedor'
    if (e.motivo === 'DEVOLUCION_PROVEEDOR' && e.lineas.some((l) => !l.loteId)) errores.lineas = 'Indica el lote de cada línea'
    Object.assign(errores, validarDestinatarioC(e.cliente ?? {}, e.motivo))
  }
  return errores
}

/** Una guía de cliente con motivos mezclados se parte en una orden por motivo (la base guarda UN motivo por orden). */
export function partirPorMotivo(lineas: readonly LineaOrdenManual[]): { motivo: MotivoSalida; lineas: LineaOrdenManual[] }[] {
  const por = new Map<MotivoSalida, LineaOrdenManual[]>()
  for (const l of lineas) if (l.motivo) por.set(l.motivo, [...(por.get(l.motivo) ?? []), l])
  return [...por].map(([motivo, ls]) => ({ motivo, lineas: ls }))
}

// ── Cómo se ve una orden manual ───────────────────────────────────────────────────────────────────────────────────────────

export type OrigenOrden = 'PEDIDO' | 'MANUAL'
export type CreadaDesde = 'BANDEJA' | 'RUTA' | 'MANUAL'
export const ETIQUETA_CREADA_DESDE: Record<CreadaDesde, string> = { BANDEJA: 'Creada desde la bandeja de pedidos', RUTA: 'Creada al armar la ruta', MANUAL: 'Creada a mano' }

export interface DatosOrigenOrden {
  tipo?: TipoSalida
  motivo?: MotivoSalida
  origen?: OrigenOrden
  creadaDesde?: CreadaDesde
  porConciliar?: boolean
  creadaPor?: string
  enNombreDe?: string
  /** SA-1: orden de ejemplo de la demostración. */
  ejemplo?: boolean
}

/** Las etiquetas cortas de la lista: «Manual», «Por conciliar», «Creada por X en nombre de Y» y «Ejemplo» (las órdenes sembradas de la demostración). */
export function etiquetasDeOrigen(d: DatosOrigenOrden): { clave: 'MANUAL' | 'POR_CONCILIAR' | 'EN_NOMBRE_DE' | 'EJEMPLO'; texto: string }[] {
  const out: { clave: 'MANUAL' | 'POR_CONCILIAR' | 'EN_NOMBRE_DE' | 'EJEMPLO'; texto: string }[] = []
  if (d.origen === 'MANUAL') out.push({ clave: 'MANUAL', texto: 'Manual' })
  if (d.porConciliar) out.push({ clave: 'POR_CONCILIAR', texto: 'Por conciliar con Pedidos' })
  if (d.enNombreDe) out.push({ clave: 'EN_NOMBRE_DE', texto: `Creada por ${d.creadaPor ?? 'el equipo'} en nombre de ${d.enNombreDe}` })
  if (d.ejemplo) out.push({ clave: 'EJEMPLO', texto: 'Ejemplo' })
  return out
}

export const ETIQUETA_TIPO_SALIDA: Record<TipoSalida, string> = {
  DISTRIBUCION: 'Venta de distribución', CLIENTE: 'Por cuenta de un cliente', MUESTRA: 'Muestra de Logissa', PROVEEDOR: 'Devolución al proveedor',
}

export const resumenMotivo = (m: MotivoSalida) => ETIQUETA_MOTIVO_SALIDA[m]

// ── Productos y sus códigos ───────────────────────────────────────────────────────────────────────────────────────────────

export type TipoCodigoProducto = 'BARRAS' | 'CLIENTE' | 'PROVEEDOR' | 'OTRO'
export const ETIQUETA_CODIGO: Record<TipoCodigoProducto, string> = { BARRAS: 'código de barras', CLIENTE: 'código del cliente', PROVEEDOR: 'código del proveedor', OTRO: 'otro código' }
export interface CodigoProducto { productoId: string; tipo: TipoCodigoProducto; codigo: string; propietarioId?: string }

/** Un producto hallado al escribir en la tabla de líneas: por su código interno, su nombre o cualquier otro de sus códigos (barras, del cliente, del proveedor). */
export interface ProductoHallado {
  id: string
  codigo: string
  descripcion: string
  presentacion?: string
  /** Por cuál código se encontró cuando no fue el interno: «código del cliente DIPH-0042». */
  coincidencia?: string
}

/**
 * Busca por nombre, código interno o cualquier otro código del producto. El código propio de un cliente de almacenamiento solo cuenta cuando la orden es de ese cliente
 * (con `propietarioId`); los demás códigos valen para todos.
 */
export function buscarProductosPorCodigos(
  productos: readonly { id: string; codigo: string; descripcion: string; presentacion?: string; principioActivo?: string; estado?: string }[],
  codigos: readonly CodigoProducto[], consulta: string, propietarioId?: string, limite = 12,
): ProductoHallado[] {
  const q = consulta.trim()
  if (q.length < 2) return []
  const porProducto = new Map<string, CodigoProducto[]>()
  for (const c of codigos) {
    if (c.tipo === 'CLIENTE' && c.propietarioId !== propietarioId) continue
    porProducto.set(c.productoId, [...(porProducto.get(c.productoId) ?? []), c])
  }
  const out: (ProductoHallado & { sc: number })[] = []
  for (const p of productos) {
    if (p.estado === 'inactivo') continue
    const propio = Math.max(puntaje(q, p.codigo) + 5, puntaje(q, p.descripcion), puntaje(q, `${p.descripcion} ${p.presentacion ?? ''}`), puntaje(q, p.principioActivo ?? ''))
    let mejor: CodigoProducto | undefined; let scAlt = 0
    for (const c of porProducto.get(p.id) ?? []) { const sc = puntaje(q, c.codigo) + 5; if (sc > scAlt) { scAlt = sc; mejor = c } }
    const sc = Math.max(propio > 5 ? propio : 0, scAlt > 5 ? scAlt : 0)
    if (sc === 0) continue
    out.push({ id: p.id, codigo: p.codigo, descripcion: p.descripcion, presentacion: p.presentacion, coincidencia: scAlt > 5 && scAlt >= propio && mejor ? `${ETIQUETA_CODIGO[mejor.tipo]} ${mejor.codigo}` : undefined, sc })
  }
  return out.sort((a, b) => b.sc - a.sc || a.descripcion.localeCompare(b.descripcion, 'es')).slice(0, limite).map(({ sc: _sc, ...x }) => x)
}

// ── La propuesta de lote (tipo A y muestra) ────────────────────────────────────────────────────────────────────────────────

export type PropuestaFefo =
  | { ok: true; asignaciones: { loteId: string; codigo: string; vence: string | null; cantidad: number }[] }
  | { ok: false; mensaje: string }

const aDisponible = (l: LoteParaSalida) => ({ loteId: l.loteId, codigo: l.codigo, vence: l.vence, disponible: l.disponibleAprobado, bloqueado: l.enReserva })

/** El lote y el vencimiento que propone el sistema por FEFO (las reglas de S2b: 60 días en una venta, Aprobado, sin Reserva, nunca más de lo disponible). */
export function propuestaFefo(tipo: 'DISTRIBUCION' | 'MUESTRA', cantidad: number, hoy: string, lotes: readonly LoteParaSalida[]): PropuestaFefo {
  if (!Number.isInteger(cantidad) || cantidad <= 0) return { ok: false, mensaje: 'Escribe la cantidad' }
  const r = asignarLinea({ tipo, motivo: tipo === 'DISTRIBUCION' ? 'VENTA' : 'MUESTRA', cantidad, hoy, lotes: lotes.map(aDisponible) })
  return r.ok ? { ok: true, asignaciones: r.asignaciones } : { ok: false, mensaje: r.mensaje }
}

/** Los lotes que se pueden preferir en una venta manual: aptos, sin Reserva y con la cantidad completa (un solo lote por línea), en orden FEFO. */
export function lotesPreferibles(cantidad: number, hoy: string, lotes: readonly LoteParaSalida[]): LoteParaSalida[] {
  return lotes
    .filter((l) => !l.enReserva && l.disponibleAprobado >= cantidad && loteApto(l.vence, 'DISTRIBUCION', 'VENTA', hoy).apto)
    .sort((a, b) => (a.vence ?? '9999-12-31').localeCompare(b.vence ?? '9999-12-31') || a.codigo.localeCompare(b.codigo))
}
