// Aviso por correo a quien factura (decisión de Sebas, 11-nov-2026): «la guía de este pedido ya está lista, puedes facturar» cuando se crea la pre-guía (con su número reservado) y
// «NO factures» si esa pre-guía se cancela porque el pedido ya no sale. Puro: arma el asunto y el cuerpo; el envío está en services/correo.

export type EventoAvisoGuia = 'PRE_GUIA' | 'GUIA_REGISTRADA' | 'CANCELADA'

export interface LineaAvisoGuia { producto: string; lote: string; cantidad: number }

export interface DatosAvisoGuia {
  evento: EventoAvisoGuia
  /** El serie-número: el de la pre-guía o el de la guía registrada. */
  guiaNumero: string
  pedidoNumero?: string
  ordenNumero: string
  cliente?: string
  ruc?: string
  bultos?: number
  /** Los productos y lotes de la orden (lo que Contabilidad factura). */
  lineas?: LineaAvisoGuia[]
  /** Solo al cancelar: por qué ya no sale. */
  motivo?: string
  /** En el piloto las guías son de prueba: el aviso lo dice en el asunto. */
  piloto: boolean
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function asuntoAvisoGuia(d: DatosAvisoGuia): string {
  const pedido = d.pedidoNumero ?? d.ordenNumero
  const marca = d.piloto ? '[PILOTO] ' : ''
  if (d.evento === 'CANCELADA') return `${marca}Guía ${d.guiaNumero} cancelada · pedido ${pedido}: NO factures`
  return `${marca}Guía ${d.guiaNumero} lista · pedido ${pedido}: ya puede facturar`
}

/** La frase principal del aviso. */
export function titularAvisoGuia(d: DatosAvisoGuia): string {
  if (d.piloto) return d.evento === 'CANCELADA' ? 'PILOTO: aviso de prueba, no hay nada que cancelar.' : 'PILOTO: esta guía es de prueba, no factures.'
  if (d.evento === 'CANCELADA') return 'Este pedido ya no sale: NO factures. La guía quedó cancelada.'
  if (d.evento === 'GUIA_REGISTRADA') return 'La guía de este pedido ya está registrada: puedes facturar.'
  return 'La guía de este pedido ya tiene su número: puedes facturar. Todavía no se envía a Nubefact: sale cuando el pedido tenga ruta, vehículo y conductor.'
}

/** Las líneas del aviso (se usan en el texto y en el HTML). Lo que no se sabe no se escribe. */
export function lineasDeDatos(d: DatosAvisoGuia): { etiqueta: string; valor: string }[] {
  return [
    { etiqueta: 'Pedido', valor: d.pedidoNumero ?? '—' },
    { etiqueta: 'Orden de salida', valor: d.ordenNumero },
    { etiqueta: 'Cliente', valor: [d.cliente, d.ruc ? `RUC ${d.ruc}` : ''].filter(Boolean).join(' · ') || '—' },
    { etiqueta: 'Guía de remisión', valor: d.guiaNumero },
    ...(d.bultos ? [{ etiqueta: 'Bultos', valor: String(d.bultos) }] : []),
    ...(d.evento === 'CANCELADA' && d.motivo ? [{ etiqueta: 'Motivo', valor: d.motivo }] : []),
  ]
}

const textoLinea = (l: LineaAvisoGuia) => `${l.cantidad.toLocaleString('es-PE')} × ${l.producto} (lote ${l.lote})`

export function textoAvisoGuia(d: DatosAvisoGuia): string {
  return [
    titularAvisoGuia(d), '',
    ...lineasDeDatos(d).map((l) => `${l.etiqueta}: ${l.valor}`),
    ...(d.evento !== 'CANCELADA' && d.lineas?.length ? ['', 'Productos y lotes:', ...d.lineas.map((l) => `- ${textoLinea(l)}`)] : []),
    '', 'Aviso automático del WMS de LOGISALUD.',
  ].join('\n')
}

export function htmlAvisoGuia(d: DatosAvisoGuia): string {
  const filas = lineasDeDatos(d).map((l) => `<tr><td style="padding:4px 12px 4px 0;color:#4b5563">${esc(l.etiqueta)}</td><td style="padding:4px 0;font-weight:600">${esc(l.valor)}</td></tr>`).join('')
  const productos = d.evento !== 'CANCELADA' && d.lineas?.length ? `<p style="margin:12px 0 4px;color:#4b5563">Productos y lotes</p><ul style="margin:0;padding-left:18px">${d.lineas.map((l) => `<li>${esc(textoLinea(l))}</li>`).join('')}</ul>` : ''
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827"><p style="font-size:16px;font-weight:700;margin:0 0 12px">${esc(titularAvisoGuia(d))}</p><table style="border-collapse:collapse">${filas}</table>${productos}<p style="margin-top:16px;color:#6b7280;font-size:12px">Aviso automático del WMS de LOGISALUD.</p></div>`
}

/** Los destinatarios de la lista de la configuración («a@x.com, b@y.com»): sin vacíos, sin repetidos y solo direcciones con forma de correo. */
export function destinatariosDeAviso(lista: string | undefined | null): string[] {
  const vistos = new Set<string>()
  for (const x of (lista ?? '').split(/[,;\s]+/)) { const c = x.trim().toLowerCase(); if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)) vistos.add(c) }
  return [...vistos]
}
