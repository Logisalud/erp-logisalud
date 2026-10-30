/**
 * Aviso por correo cuando Tesorería PAGA una obligación (pedido de Sebas,
 * 2026-10-30): quien subió el pedido de pago se enteraba recién preguntando.
 * Puro: sin Next ni Supabase, testeable solo.
 *
 * Va a quien registró el pedido —no a Contabilidad, que ya lo ve en su
 * bandeja—: el `creador_correo` de la obligación (Pago Directo, planilla) o
 * el de la solicitud de gasto de la que nació (anticipo, reembolso).
 */

import { formatoMonto, type FilaAviso } from '@/domain/aviso-email'

export type DatosAvisoPago = {
  codigo: string
  origen: string
  /** Lo que se transfirió: el neto, ya sin detracción ni retención. */
  montoPagado: number
  moneda: string
  /** Proveedor o beneficiario — cierra el asunto. */
  aQuien: string
  numeroComprobante: string | null
  fechaPago: string
  numeroVoucher: string | null
  url: string
  /** El voucher va adjunto al correo; si no se pudo adjuntar, se dice. */
  voucherAdjunto: boolean
}

const ANCHO_ETIQUETA = 16

/** A quién avisar: los correos de quien pidió, sin repetir ni vacíos. */
export function destinatariosAvisoPago(correos: readonly (string | null | undefined)[]): string[] {
  const vistos = new Set<string>()
  const salida: string[] = []
  for (const c of correos) {
    const limpio = (c ?? '').trim()
    if (!limpio.includes('@')) continue
    const clave = limpio.toLowerCase()
    if (vistos.has(clave)) continue
    vistos.add(clave)
    salida.push(limpio)
  }
  return salida
}

export function asuntoAvisoPago(d: Pick<DatosAvisoPago, 'codigo' | 'montoPagado' | 'moneda' | 'aQuien'>): string {
  return `[Pagado] ${d.codigo} — ${formatoMonto(d.montoPagado, d.moneda)} — ${d.aQuien}`
}

/** Un anticipo pagado todavía no cierra: falta rendirlo. */
function recordatorio(d: DatosAvisoPago): string | null {
  return d.origen === 'anticipo' ? 'Recuerda rendir el anticipo con tus comprobantes cuando termines de usarlo.' : null
}

function filas(d: DatosAvisoPago): FilaAviso[] {
  return [
    { etiqueta: 'Código', valor: d.codigo },
    { etiqueta: 'A quién', valor: d.aQuien },
    { etiqueta: 'Comprobante', valor: d.numeroComprobante },
    { etiqueta: 'Monto pagado', valor: formatoMonto(d.montoPagado, d.moneda) },
    { etiqueta: 'Fecha de pago', valor: fechaLegible(d.fechaPago) },
    { etiqueta: 'N° de voucher', valor: d.numeroVoucher },
  ].filter((f) => f.valor != null && f.valor.trim() !== '')
}

function lineaVoucher(d: DatosAvisoPago): string {
  return d.voucherAdjunto ? 'Te adjuntamos el voucher.' : 'El voucher lo puedes ver en el ERP.'
}

export function renderAvisoPagoHtml(d: DatosAvisoPago): string {
  const tabla = filas(d)
    .map((f) => `<tr><td><strong>${escapeHtml(f.etiqueta)}</strong></td><td>${escapeHtml(f.valor!)}</td></tr>`)
    .join('\n        ')
  const extra = recordatorio(d)
  return `
    <div style="font-family: sans-serif; font-size: 14px; color: #111827;">
      <p>Tesorería ya pagó tu pedido en el ERP de Compras y Pagos. ${lineaVoucher(d)}</p>
      <table cellpadding="4" cellspacing="0">
        ${tabla}
      </table>
      ${extra ? `<p>${escapeHtml(extra)}</p>` : ''}
      <p><a href="${d.url}">Ver en el ERP</a></p>
    </div>
  `.trim()
}

export function renderAvisoPagoTexto(d: DatosAvisoPago): string {
  const extra = recordatorio(d)
  return [
    `Tesorería ya pagó tu pedido en el ERP de Compras y Pagos. ${lineaVoucher(d)}`,
    '',
    ...filas(d).map((f) => `${f.etiqueta.padEnd(ANCHO_ETIQUETA)}${f.valor}`),
    ...(extra ? ['', extra] : []),
    '',
    `Ver en el ERP: ${d.url}`,
  ].join('\n')
}

/** YYYY-MM-DD → DD/MM/YYYY, como se lee en Perú. */
function fechaLegible(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : fecha
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
