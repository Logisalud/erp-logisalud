/**
 * Contenido del correo de notificación de un Anticipo recién creado
 * (Pieza 3, sesión 2026-09-04) — puro: sin Next ni Supabase, testeable
 * solo. Se dispara al CREAR la solicitud, no en ninguna aprobación (el
 * anticipo no tiene un paso de aprobación real hasta Contabilidad, y ese
 * ya tiene su propia bandeja dentro del ERP).
 */

export type DatosEmailAnticipo = {
  codigo: string
  solicitanteNombre: string
  monto: number
  moneda: string
  descripcion: string
  quienAutoriza: string | null
  tieneCotizacion: boolean
  urlSolicitud: string
}

export function asuntoEmailAnticipo(d: Pick<DatosEmailAnticipo, 'codigo'>): string {
  return `Nuevo anticipo solicitado — ${d.codigo}`
}

export function renderAnticipoEmailHtml(d: DatosEmailAnticipo): string {
  const monto = `${d.moneda} ${d.monto.toFixed(2)}`
  return `
    <div style="font-family: sans-serif; font-size: 14px; color: #111827;">
      <p>Se registró un nuevo anticipo en el ERP de Compras y Pagos.</p>
      <table cellpadding="4" cellspacing="0">
        <tr><td><strong>Código</strong></td><td>${escapeHtml(d.codigo)}</td></tr>
        <tr><td><strong>Solicitado por</strong></td><td>${escapeHtml(d.solicitanteNombre)}</td></tr>
        <tr><td><strong>Monto</strong></td><td>${escapeHtml(monto)}</td></tr>
        <tr><td><strong>Motivo</strong></td><td>${escapeHtml(d.descripcion)}</td></tr>
        <tr><td><strong>Quién autoriza</strong></td><td>${escapeHtml(d.quienAutoriza || 'No informado')}</td></tr>
        <tr><td><strong>Cotización adjunta</strong></td><td>${d.tieneCotizacion ? 'Sí' : 'No'}</td></tr>
      </table>
      <p><a href="${d.urlSolicitud}">Ver el anticipo en el ERP</a></p>
    </div>
  `.trim()
}

export function renderAnticipoEmailText(d: DatosEmailAnticipo): string {
  const monto = `${d.moneda} ${d.monto.toFixed(2)}`
  return [
    'Se registró un nuevo anticipo en el ERP de Compras y Pagos.',
    '',
    `Código: ${d.codigo}`,
    `Solicitado por: ${d.solicitanteNombre}`,
    `Monto: ${monto}`,
    `Motivo: ${d.descripcion}`,
    `Quién autoriza: ${d.quienAutoriza || 'No informado'}`,
    `Cotización adjunta: ${d.tieneCotizacion ? 'Sí' : 'No'}`,
    '',
    `Ver el anticipo en el ERP: ${d.urlSolicitud}`,
  ].join('\n')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
