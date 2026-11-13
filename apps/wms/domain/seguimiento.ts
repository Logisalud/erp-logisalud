// Seguimiento para el cliente (Fase 4 · P9, G.2): lo que ve quien escribe su número de pedido y su RUC (o abre su enlace). Dominio puro. Solo estados con fecha y hora:
// sin hora estimada, sin precios, lotes ni datos del personal. APAGADO en modo piloto. La base (`wms.seguimiento_consultar`, `wms.seguimiento_por_token`, migración 0047) aplica lo mismo y manda.
export type HitoSeguimiento = 'RECIBIDO' | 'PREPARANDO' | 'EN_CAMINO' | 'LLEGO' | 'ENTREGADO' | 'NO_ENTREGADO' | 'CANCELADO'
/** Los 5 pasos de la pantalla (0069), de lo que ya registra el WMS: Orden de Salida creada · picking/conformidad/pre-guía/embalaje · Salida confirmada · «Llegué» · «Entregado». */
export const ETIQUETA_HITO: Record<HitoSeguimiento, string> = {
  RECIBIDO: 'Pedido recibido', PREPARANDO: 'Preparando', EN_CAMINO: 'En camino', LLEGO: 'Llegó', ENTREGADO: 'Entregado', NO_ENTREGADO: 'No pudimos entregar', CANCELADO: 'Pedido cancelado',
}
export const ORDEN_HITOS: readonly HitoSeguimiento[] = ['RECIBIDO', 'PREPARANDO', 'EN_CAMINO', 'LLEGO', 'ENTREGADO']
export interface HitoVista { estado: HitoSeguimiento; en: string }

/** A quién escribe el botón «Escribir a mi vendedor»: solo el vendedor del pedido (sin número cargado no hay botón; no existe contacto público de Logisalud); en modo piloto, el número de prueba. */
export interface ContactoSeguimiento { nombre: string; telefono: string }
/** La carita de «¿Cómo fue tu entrega?»: 1 = Mal, 2 = Regular, 3 = Muy bien. */
export type ValorCarita = 1 | 2 | 3

/** Un documento vencido del cliente (0068): su número, cuándo venció, cuántos días de atraso lleva y cuánto falta pagar. */
export interface DocumentoVencido { documento: string; vence: string; dias: number; saldo: number }
/** El estado de pagos del cliente que consulta (0068). Sin esta información (Cobranzas no lo conoce o está apagado) no se dice nada: nunca «al día» sin datos. */
export type EstadoDePagos =
  | { estado: 'AL_DIA'; al: string }
  | { estado: 'MOROSO'; al: string; total: number; maxDias: number; cantidad: number; documentos: DocumentoVencido[] }

export type RespuestaSeguimiento =
  | {
      estado: 'OK'; pedido: string; cliente?: string; hitos: HitoVista[]
      /** ¿Va en una ruta de Logisalud? Sin parada (provincia por agencia) la línea de tiempo termina en «En camino». */
      tieneParada?: boolean
      /** «Van X de Y entregas de tu ruta»: solo cuentas, sin datos de otros clientes. Null si no corresponde mostrarlo. */
      ruta?: { atendidas: number; total: number } | null
      contacto?: ContactoSeguimiento | null
      /** El enlace de la guía de remisión (Nubefact), solo si fue aceptada y el parámetro «guía visible» lo permite. */
      guia?: { enlace: string } | null
      respuesta?: ValorCarita | null
      /** Modo piloto: la pantalla lleva el aviso «PRUEBA». */
      prueba?: boolean
      deuda?: EstadoDePagos | null
    }
  | { estado: 'NO_ENCONTRADO' }
  | { estado: 'ESPERA'; esperaSegundos: number }
  | { estado: 'NO_DISPONIBLE' }
  | { estado: 'LISTO' }   // solo al abrir la página sin datos: el seguimiento está disponible
  | { estado: 'ERROR' }

export const TEXTO_NO_DISPONIBLE = 'Seguimiento aún no disponible'
export const TEXTO_NO_ENCONTRADO = 'No encontramos un pedido con esos datos. Revisa el número de pedido y el RUC (11 números) y vuelve a intentar.'
export const TEXTO_ERROR = 'No pudimos consultar el seguimiento en este momento. Intenta de nuevo en unos minutos.'
export const TEXTO_ENLACE_INVALIDO = 'Este enlace no es válido o ya venció. Pide uno nuevo a tu vendedor, o consulta con tu número de pedido y tu RUC.'

/** «Espera 14 minutos» a partir de los segundos que dice la base. */
export function textoEspera(segundos: number): string {
  const min = Math.max(1, Math.ceil(segundos / 60))
  return `Hiciste demasiados intentos. Por seguridad, espera ${min} ${min === 1 ? 'minuto' : 'minutos'} y vuelve a intentar.`
}

export const normalizarPedido = (t: string) => t.trim().toUpperCase().replace(/\s+/g, '')
export const normalizarRuc = (t: string) => t.replace(/\s+/g, '')

/** Errores por campo de lo que se escribe (antes de preguntar). Vacío = vale. */
export function validarConsulta(pedido: string, ruc: string): { pedido?: string; ruc?: string } {
  const e: { pedido?: string; ruc?: string } = {}
  if (normalizarPedido(pedido).length < 3) e.pedido = 'Escribe el número de tu pedido.'
  if (!/^\d{11}$/.test(normalizarRuc(ruc))) e.ruc = 'El RUC tiene 11 números.'
  return e
}

/** La línea de tiempo completa: cada paso con su hora si ya ocurrió, o pendiente. Un pedido no entregado o cancelado cierra la línea con su estado. */
export interface PasoLinea { estado: HitoSeguimiento; etiqueta: string; en?: string; hecho: boolean; actual: boolean; problema?: boolean }
export function lineaDeTiempo(hitos: readonly HitoVista[], tieneParada = true): PasoLinea[] {
  const por = new Map<HitoSeguimiento, string>()
  for (const h of hitos) if (!por.has(h.estado) || h.en < por.get(h.estado)!) por.set(h.estado, h.en)
  const cierre: HitoSeguimiento | undefined = por.has('CANCELADO') ? 'CANCELADO' : por.has('NO_ENTREGADO') && !por.has('ENTREGADO') ? 'NO_ENTREGADO' : undefined
  let pasos = (cierre ? ORDEN_HITOS.filter((h) => h !== 'ENTREGADO') : [...ORDEN_HITOS]) as HitoSeguimiento[]
  // sin parada en una ruta de Logisalud (por ejemplo, provincia por agencia) la línea termina en «En camino»: no se inventan pasos
  if (!tieneParada && por.has('EN_CAMINO')) pasos = pasos.filter((p) => p === 'RECIBIDO' || p === 'PREPARANDO' || p === 'EN_CAMINO')
  if (cierre) pasos.push(cierre)
  const ultimoHecho = [...pasos].reverse().find((p) => por.has(p))
  return pasos.map((estado) => ({ estado, etiqueta: ETIQUETA_HITO[estado], en: por.get(estado), hecho: por.has(estado), actual: estado === ultimoHecho, problema: estado === 'NO_ENTREGADO' || estado === 'CANCELADO' }))
}

/** En qué va el pedido, en palabras humanas: el mensaje grande de la pantalla y la hora del último paso. Nunca motivos internos. */
export interface MensajeEstado { clave: HitoSeguimiento | 'REGISTRADO'; titulo: string; detalle?: string; hora?: string; final: boolean }
export function mensajeDelEstado(hitos: readonly HitoVista[], tieneParada = true): MensajeEstado {
  const por = new Map<HitoSeguimiento, string>()
  for (const h of hitos) if (!por.has(h.estado) || h.en < por.get(h.estado)!) por.set(h.estado, h.en)
  const dice = (clave: HitoSeguimiento, titulo: string, detalle?: string, final = false): MensajeEstado => ({ clave, titulo, detalle, hora: por.get(clave), final })
  if (por.has('CANCELADO')) return dice('CANCELADO', 'Este pedido ya no está en preparación', 'Tu vendedor te contactará.', true)
  if (por.has('ENTREGADO')) return dice('ENTREGADO', 'Entregado', undefined, true)
  if (por.has('NO_ENTREGADO')) return dice('NO_ENTREGADO', 'No pudimos completar la entrega', 'Tu vendedor te contactará.', true)
  if (por.has('LLEGO')) return dice('LLEGO', 'Tu pedido llegó a tu dirección')
  if (por.has('EN_CAMINO')) return dice('EN_CAMINO', 'Tu pedido va en camino', undefined, !tieneParada)
  if (por.has('PREPARANDO')) return dice('PREPARANDO', 'Estamos preparando tu pedido')
  if (por.has('RECIBIDO')) return dice('RECIBIDO', 'Recibimos tu pedido', 'Pronto empezamos a prepararlo.')
  return { clave: 'REGISTRADO', titulo: 'Tu pedido está registrado', detalle: 'Pronto empezamos a prepararlo.', final: false }
}

/** ¿Ya no cambiará? Entonces la pantalla deja de actualizarse sola. */
export const esEstadoFinal = (hitos: readonly HitoVista[], tieneParada = true) => mensajeDelEstado(hitos, tieneParada).final

/** Cada cuántos milisegundos se actualiza sola la pantalla (se pausa si la pestaña está oculta). */
export const INTERVALO_SEGUIMIENTO_MS = 15_000

/** «Van 2 de 5 entregas de tu ruta». */
export const textoVanDeRuta = (r: { atendidas: number; total: number }) => `Van ${r.atendidas} de ${r.total} entregas de tu ruta`

/** El primer nombre del vendedor, bonito: «JUAN PÉREZ GÓMEZ» → «Juan». */
export function primerNombre(nombre: string): string {
  const p = nombre.trim().split(/\s+/)[0] ?? ''
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : ''
}

/** El enlace de WhatsApp (wa.me) con el mensaje «Hola [vendedor], consulto por mi pedido [n.°]». El teléfono viene en formato +51. */
export function enlaceWhatsApp(contacto: ContactoSeguimiento, pedido: string): string {
  const nombre = primerNombre(contacto.nombre) || 'vendedor'
  return `https://wa.me/${contacto.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${nombre}, consulto por mi pedido ${pedido}`)}`
}

export const CARITAS: readonly { valor: ValorCarita; etiqueta: string }[] = [{ valor: 3, etiqueta: 'Muy bien' }, { valor: 2, etiqueta: 'Regular' }, { valor: 1, etiqueta: 'Mal' }]
export const TEXTO_CARITA_PREGUNTA = '¿Cómo fue tu entrega?'
export const TEXTO_CARITA_GRACIAS = '¡Gracias por contarnos!'
export const TEXTO_PRUEBA = 'PRUEBA: este seguimiento es solo para pruebas internas.'

/** La IP de quien consulta, tal como la ve el servidor detrás de Vercel (la primera de `x-forwarded-for`). Solo sirve para el límite de intentos. */
export const ipDe = (xForwardedFor: string | null | undefined, xRealIp?: string | null): string => (xForwardedFor?.split(',')[0] ?? xRealIp ?? '').trim()

// ── Estado de pagos (0068) ──────────────────────────────────────────────────

export const TITULO_AL_DIA = '¡Estás al día en tus pagos! 😊'
export const TEXTO_AL_DIA = 'Gracias por la confianza.'
export const TITULO_MOROSO = 'Tus pagos pendientes'
export const TEXTO_INTRO_MOROSO = 'Estos documentos ya pasaron su fecha de pago:'
export const TEXTO_MOROSO = 'Si ya pagaste, puede que aún no lo hayamos registrado: avísanos y lo actualizamos. Gracias por tu comprensión.'

/** «S/ 1,234.50» (los saldos vienen en soles). */
export const soles = (n: number) => `S/ ${new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`

/** «1 documento vencido», «3 documentos vencidos». */
export const textoCantidadVencidos = (n: number) => `${n} ${n === 1 ? 'documento vencido' : 'documentos vencidos'}`

/** «1 día», «95 días» (el atraso mínimo de un documento vencido es 1 día). */
export const textoAtraso = (dias: number) => `${dias} ${dias === 1 ? 'día' : 'días'}`

// ── Contactos de los vendedores y opciones (lo edita el Administrador) ─────────

export type RespuestaCarita =
  | { estado: 'OK' | 'YA_RESPONDIDA' | 'AUN_NO' | 'NO_ENCONTRADO' | 'NO_DISPONIBLE' | 'ERROR' }
  | { estado: 'ESPERA'; esperaSegundos: number }

export interface ContactoVendedorVista { id: string; nombre: string; telefono: string; actualizadoEn: string }
export type ClaveOpcionSeguimiento = 'seguimiento_ruta_visible' | 'seguimiento_guia_visible' | 'seguimiento_whatsapp_prueba' | 'seguimiento_base_url'
export interface OpcionesSeguimiento { rutaVisible: boolean; guiaVisible: 'SIEMPRE' | 'DESPUES_ENTREGA'; whatsappPrueba: string; baseUrl: string }
export const OPCIONES_POR_DEFECTO: OpcionesSeguimiento = { rutaVisible: true, guiaVisible: 'SIEMPRE', whatsappPrueba: '', baseUrl: '' }
export interface ErrorFilaContacto { fila: number; nombre: string; motivo: string }

/** «+51 987 654 321», «987654321» o «51987654321» → «+51987654321»; otra cosa → null (espejo de `wms._tel_pe`). */
export function telefonoPeruano(texto: string): string | null {
  const d = texto.replace(/\D/g, '')
  if (/^51\d{9}$/.test(d)) return `+${d}`
  if (/^\d{9}$/.test(d)) return `+51${d}`
  return null
}
/** «+51987654321» → «+51 987 654 321» para mostrarlo. */
export const telefonoBonito = (t: string) => (/^\+51\d{9}$/.test(t) ? `+51 ${t.slice(3, 6)} ${t.slice(6, 9)} ${t.slice(9)}` : t)

/** El nombre de un vendedor para compararlo: sin tildes, sin mayúsculas, sin espacios de más (espejo de `wms._norm_nombre`). */
export const normalizarNombre = (t: string) => t.toLowerCase().replace(/[áéíóúü]/g, (c) => ({ á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u' })[c] ?? c).replace(/ñ/g, 'n').replace(/\s+/g, ' ').trim()

/**
 * Lee un CSV de contactos: dos columnas (nombre, teléfono), con o sin encabezado, separadas por coma, punto y coma o tabulador, con comillas opcionales.
 * Devuelve las filas tal cual (la base valida el teléfono y dice cuáles no sirven).
 */
export function leerCsvContactos(texto: string): { nombre: string; telefono: string }[] {
  const filas: { nombre: string; telefono: string }[] = []
  for (const linea of texto.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!linea.trim()) continue
    const sep = linea.includes('\t') ? '\t' : linea.includes(';') ? ';' : ','
    const celdas = linea.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1').trim())
    if (celdas.length < 2) { filas.push({ nombre: celdas[0] ?? '', telefono: '' }); continue }
    filas.push({ nombre: celdas[0], telefono: celdas.slice(1).join(sep).trim() })
  }
  // un encabezado («nombre, teléfono») no es una fila
  if (filas.length && /^(nombre|vendedor)/i.test(filas[0].nombre) && !/\d{9}/.test(filas[0].telefono.replace(/\D/g, ''))) filas.shift()
  return filas
}
