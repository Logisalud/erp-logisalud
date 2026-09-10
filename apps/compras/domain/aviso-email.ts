/**
 * Aviso por correo al CREAR cualquier registro que compromete plata de la
 * empresa (Piezas D y K, sesión 2026-09-04). Puro: sin Next ni Supabase,
 * testeable solo.
 *
 * Un solo render parametrizado por tipo en vez de una copia por flujo: los
 * seis avisos dicen lo mismo con distinto encabezado, y seis plantillas
 * separadas se desincronizan en la primera corrección de wording.
 *
 * Se dispara al CREAR, no en ninguna aprobación: es un aviso, no un paso del
 * flujo. En Pago Directo convive con "Dar conformidad", que sigue siendo un
 * paso posterior y separado — el correo no lo reemplaza ni lo adelanta.
 */

export const TIPOS_AVISO = [
  'oc_mercaderia',
  'oc_bien',
  'os',
  'pago_directo',
  'anticipo',
  'reembolso',
] as const
export type TipoAviso = (typeof TIPOS_AVISO)[number]

/** Lo que va entre corchetes en el asunto. */
export const ETIQUETA_TIPO_AVISO: Record<TipoAviso, string> = {
  oc_mercaderia: 'OC Mercadería',
  oc_bien: 'OC Bien',
  os: 'OS',
  pago_directo: 'Pago Directo',
  anticipo: 'Anticipo',
  reembolso: 'Reembolso',
}

/** Cómo se nombra el registro en la primera línea del cuerpo. */
const NOMBRE_REGISTRO: Record<TipoAviso, string> = {
  oc_mercaderia: 'una nueva orden de compra de mercadería',
  oc_bien: 'una nueva orden de compra de un bien',
  os: 'una nueva orden de servicio',
  pago_directo: 'un nuevo pago directo',
  anticipo: 'un nuevo anticipo',
  reembolso: 'un nuevo reembolso',
}

/**
 * Una fila del cuerpo. Se arman en el servicio que dispara el aviso, porque
 * qué datos existen depende del flujo (una OC tiene proveedor y no tiene
 * "quién autoriza"; un anticipo es al revés). Las filas con valor vacío se
 * omiten solas — así el llamador no tiene que condicionar cada una.
 */
export type FilaAviso = { etiqueta: string; valor: string | null }

export type DatosAviso = {
  tipo: TipoAviso
  codigo: string
  /** Monto total comprometido, ya con IGV si corresponde. */
  monto: number
  moneda: string
  /** Lo que va al final del asunto: categoría (gastos) o proveedor (OC/OS). */
  referencia: string
  filas: FilaAviso[]
  url: string
}

const ANCHO_ETIQUETA = 16

export function asuntoAviso(d: Pick<DatosAviso, 'tipo' | 'codigo' | 'monto' | 'moneda' | 'referencia'>): string {
  return `[${ETIQUETA_TIPO_AVISO[d.tipo]}] ${d.codigo} — ${formatoMonto(d.monto, d.moneda)} — ${d.referencia}`
}

export function renderAvisoHtml(d: DatosAviso): string {
  const filas = filasVisibles(d)
    .map((f) => `<tr><td><strong>${escapeHtml(f.etiqueta)}</strong></td><td>${escapeHtml(f.valor!)}</td></tr>`)
    .join('\n        ')

  return `
    <div style="font-family: sans-serif; font-size: 14px; color: #111827;">
      <p>Se registró ${NOMBRE_REGISTRO[d.tipo]} en el ERP de Compras y Pagos.</p>
      <table cellpadding="4" cellspacing="0">
        <tr><td><strong>Código</strong></td><td>${escapeHtml(d.codigo)}</td></tr>
        ${filas}
      </table>
      <p><a href="${d.url}">Ver en el ERP</a></p>
    </div>
  `.trim()
}

export function renderAvisoTexto(d: DatosAviso): string {
  const filas = filasVisibles(d).map((f) => `${f.etiqueta.padEnd(ANCHO_ETIQUETA)}${f.valor}`)
  return [
    `Se registró ${NOMBRE_REGISTRO[d.tipo]} en el ERP de Compras y Pagos.`,
    '',
    `${'Código'.padEnd(ANCHO_ETIQUETA)}${d.codigo}`,
    ...filas,
    '',
    `Ver en el ERP: ${d.url}`,
  ].join('\n')
}

function filasVisibles(d: DatosAviso): FilaAviso[] {
  return d.filas.filter((f) => f.valor != null && f.valor.trim() !== '')
}

export function formatoMonto(monto: number, moneda: string): string {
  const simbolo = moneda === 'USD' ? 'US$' : 'S/'
  return `${simbolo} ${monto.toFixed(2)}`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Aviso de ANULACIÓN (Piezas D y K, sesión 2026-09-09): quien creó un
 * registro por error tiene que poder anularlo, pero si ya salió el correo de
 * creación, Contabilidad ya lo tiene en su radar — así que anularlo dispara
 * un segundo correo, "Este registro fue anulado", a los mismos
 * destinatarios. Reusa `DatosAviso`/`FilaAviso` en vez de un tipo aparte: el
 * motivo y quién anuló son una fila más, no una estructura distinta.
 */
export type DatosAnulacion = Omit<DatosAviso, 'filas'> & {
  motivo: string
  anuladoPor: string
  filas: FilaAviso[]
  /**
   * Dos cosas distintas que cortan un registro y mandan este mismo correo:
   * 'anulacion' es corregir algo que no debió existir; 'rechazo' es
   * Contabilidad devolviéndolo al revisarlo. Default 'anulacion' para no
   * romper a los llamadores que solo anulan.
   */
  accion?: AccionAviso
}

export const ACCIONES_AVISO = ['anulacion', 'rechazo'] as const
export type AccionAviso = (typeof ACCIONES_AVISO)[number]

/** Cómo se nombra el registro cuando YA existía (a diferencia de
 * NOMBRE_REGISTRO, que lo presenta como nuevo al crearlo). */
const NOMBRE_REGISTRO_EXISTENTE: Record<TipoAviso, string> = {
  oc_mercaderia: 'la orden de compra de mercadería',
  oc_bien: 'la orden de compra de un bien',
  os: 'la orden de servicio',
  pago_directo: 'el pago directo',
  anticipo: 'el anticipo',
  reembolso: 'el reembolso',
}

const VERBO_ACCION: Record<AccionAviso, string> = {
  anulacion: 'Se anuló',
  rechazo: 'Se rechazó',
}

const ETIQUETA_ASUNTO_ACCION: Record<AccionAviso, string> = {
  anulacion: 'ANULADO',
  rechazo: 'RECHAZADO',
}

const ETIQUETA_QUIEN: Record<AccionAviso, string> = {
  anulacion: 'Anulado por',
  rechazo: 'Rechazado por',
}

export function asuntoAnulacion(
  d: Pick<DatosAnulacion, 'tipo' | 'codigo' | 'monto' | 'moneda' | 'referencia' | 'accion'>
): string {
  return `[${ETIQUETA_ASUNTO_ACCION[d.accion ?? 'anulacion']}] ${asuntoAviso(d)}`
}

export function renderAnulacionHtml(d: DatosAnulacion): string {
  const filas = filasVisibles(d)
    .map((f) => `<tr><td><strong>${escapeHtml(f.etiqueta)}</strong></td><td>${escapeHtml(f.valor!)}</td></tr>`)
    .join('\n        ')

  const accion = d.accion ?? 'anulacion'
  return `
    <div style="font-family: sans-serif; font-size: 14px; color: #111827;">
      <p>${VERBO_ACCION[accion]} ${NOMBRE_REGISTRO_EXISTENTE[d.tipo]} en el ERP de Compras y Pagos.</p>
      <table cellpadding="4" cellspacing="0">
        <tr><td><strong>Código</strong></td><td>${escapeHtml(d.codigo)}</td></tr>
        <tr><td><strong>${ETIQUETA_QUIEN[accion]}</strong></td><td>${escapeHtml(d.anuladoPor)}</td></tr>
        <tr><td><strong>Motivo</strong></td><td>${escapeHtml(d.motivo)}</td></tr>
        ${filas}
      </table>
      <p><a href="${d.url}">Ver en el ERP</a></p>
    </div>
  `.trim()
}

export function renderAnulacionTexto(d: DatosAnulacion): string {
  const accion = d.accion ?? 'anulacion'
  const filas = filasVisibles(d).map((f) => `${f.etiqueta.padEnd(ANCHO_ETIQUETA)}${f.valor}`)
  return [
    `${VERBO_ACCION[accion]} ${NOMBRE_REGISTRO_EXISTENTE[d.tipo]} en el ERP de Compras y Pagos.`,
    '',
    `${'Código'.padEnd(ANCHO_ETIQUETA)}${d.codigo}`,
    `${ETIQUETA_QUIEN[accion].padEnd(ANCHO_ETIQUETA)}${d.anuladoPor}`,
    `${'Motivo'.padEnd(ANCHO_ETIQUETA)}${d.motivo}`,
    ...filas,
    '',
    `Ver en el ERP: ${d.url}`,
  ].join('\n')
}
