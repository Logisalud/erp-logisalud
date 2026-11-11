// Aviso por correo «la guía de este pedido ya está lista: puede facturar» (decisión de Sebas, 11-nov-2026). Puro: arma el asunto y el cuerpo; el envío está en services/correo.

export interface DatosAvisoGuia {
  guiaNumero: string
  pedidoNumero?: string
  ordenNumero: string
  cliente?: string
  ruc?: string
  bultos?: number
  /** Se emitió desde el WMS (Nubefact) o se registró a mano desde el panel. */
  origen: 'WMS' | 'PANEL'
  /** En el piloto las guías son de prueba: el aviso lo dice en el asunto. */
  piloto: boolean
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function asuntoAvisoGuia(d: DatosAvisoGuia): string {
  const pedido = d.pedidoNumero ?? d.ordenNumero
  return `${d.piloto ? '[PILOTO] ' : ''}Guía ${d.guiaNumero} lista · pedido ${pedido}: ya puede facturar`
}

/** Las líneas del aviso (se usan en el texto y en el HTML). Lo que no se sabe no se escribe. */
export function lineasAvisoGuia(d: DatosAvisoGuia): { etiqueta: string; valor: string }[] {
  return [
    { etiqueta: 'Pedido', valor: d.pedidoNumero ?? '—' },
    { etiqueta: 'Orden de salida', valor: d.ordenNumero },
    { etiqueta: 'Cliente', valor: [d.cliente, d.ruc ? `RUC ${d.ruc}` : ''].filter(Boolean).join(' · ') || '—' },
    { etiqueta: 'Guía de remisión', valor: d.guiaNumero },
    ...(d.bultos ? [{ etiqueta: 'Bultos', valor: String(d.bultos) }] : []),
    { etiqueta: 'Cómo se emitió', valor: d.origen === 'WMS' ? 'Desde el WMS (Nubefact)' : 'Registrada a mano desde el panel de Nubefact' },
  ]
}

export function textoAvisoGuia(d: DatosAvisoGuia): string {
  return [
    d.piloto ? 'PILOTO: esta guía es de prueba, no factures.' : 'La guía de este pedido ya está lista: puedes facturar.',
    '',
    ...lineasAvisoGuia(d).map((l) => `${l.etiqueta}: ${l.valor}`),
    '',
    'Aviso automático del WMS de LOGISALUD.',
  ].join('\n')
}

export function htmlAvisoGuia(d: DatosAvisoGuia): string {
  const filas = lineasAvisoGuia(d).map((l) => `<tr><td style="padding:4px 12px 4px 0;color:#4b5563">${esc(l.etiqueta)}</td><td style="padding:4px 0;font-weight:600">${esc(l.valor)}</td></tr>`).join('')
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827"><p style="font-size:16px;font-weight:700;margin:0 0 12px">${d.piloto ? 'PILOTO: esta guía es de prueba, no factures.' : 'La guía de este pedido ya está lista: puedes facturar.'}</p><table style="border-collapse:collapse">${filas}</table><p style="margin-top:16px;color:#6b7280;font-size:12px">Aviso automático del WMS de LOGISALUD.</p></div>`
}

/** Los destinatarios de la lista de la configuración («a@x.com, b@y.com»): sin vacíos, sin repetidos y solo direcciones con forma de correo. */
export function destinatariosDeAviso(lista: string | undefined | null): string[] {
  const vistos = new Set<string>()
  for (const x of (lista ?? '').split(/[,;\s]+/)) { const c = x.trim().toLowerCase(); if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)) vistos.add(c) }
  return [...vistos]
}
