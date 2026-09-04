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
