// Devolución al proveedor (D-161): el correo que el WMS deja listo para que quien prepara la salida lo mande a mano. El WMS no envía correos: arma el texto con lo que
// el proveedor necesita para recibir la devolución (producto, lote, vencimiento y cantidad) y la persona lo copia y lo pega en su correo. Sin precios, sin RUC.

export interface LineaCorreoProveedor { producto: string; productoCodigo: string; lote: string; vence: string | null; cantidad: number }

export interface DatosCorreoProveedor {
  ordenNumero: string
  proveedor: string
  lineas: readonly LineaCorreoProveedor[]
  /** Si ya tiene guía, se cita su número (el proveedor la recibe con la mercadería). */
  guiaNumero?: string
}

const ddmmaaaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/** Una línea del correo: «• Paracetamol 500 mg (P-1001) · lote L-24A · vence 30/06/2027 · 120 unidades». */
export const lineaDeCorreo = (l: LineaCorreoProveedor): string =>
  `• ${l.producto} (${l.productoCodigo}) · lote ${l.lote} · vence ${l.vence ? ddmmaaaa(l.vence) : 'sin fecha'} · ${l.cantidad.toLocaleString('es-PE')} ${l.cantidad === 1 ? 'unidad' : 'unidades'}`

/** El correo completo, con asunto y cuerpo, y el texto junto para copiarlo de una vez. Vacío si no hay nada que devolver. */
export function correoAlProveedor(d: DatosCorreoProveedor): { asunto: string; cuerpo: string; texto: string } {
  if (d.lineas.length === 0) return { asunto: '', cuerpo: '', texto: '' }
  const asunto = `Devolución de producto · Orden ${d.ordenNumero} · LOGISALUD`
  const cuerpo = [
    `Estimados ${d.proveedor || 'señores'}:`,
    '',
    'Les solicitamos recibir la devolución de los siguientes productos:',
    '',
    ...d.lineas.map(lineaDeCorreo),
    '',
    d.guiaNumero ? `Irá acompañada de la guía de remisión ${d.guiaNumero}.` : 'Les enviaremos la guía de remisión con la mercadería.',
    'Quedamos atentos a su confirmación para coordinar la entrega.',
    '',
    'Gracias. — Almacén LOGISALUD',
  ].join('\n')
  return { asunto, cuerpo, texto: `Asunto: ${asunto}\n\n${cuerpo}` }
}
