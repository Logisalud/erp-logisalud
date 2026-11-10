/**
 * Corregir los papeles de una recepción YA registrada (0088). Puro.
 *
 * Pedido de Sebas (2026-11-04) con la OC-2026-0050 de DIMEXA: Charlie subió
 * la segunda factura en el espacio de las guías y, una vez guardada, la
 * recepción no se podía tocar. Ahora, desde su ficha y aunque la OC ya esté
 * cerrada, se puede:
 *
 *  - agregar una guía o una factura que faltó;
 *  - quitar una que no era de esta entrega;
 *  - reclasificar una subida en el lugar equivocado (guía ↔ factura).
 *
 * Solo los PAPELES: las cantidades y el monto de la obligación no cambian
 * por acá. Quitar y reclasificar piden motivo; todo queda en
 * `almacen.recepciones_documentos_cambios`.
 */

import type { TipoPapel } from '@/domain/recepcion-tres-columnas'

/** Almacén, que registra; Contabilidad, que detecta lo que falta al revisar. */
export const AREAS_CORRIGEN_PAPELES = ['almacen', 'contabilidad', 'admin'] as const

export function puedeCorregirPapeles(area: string | null | undefined): boolean {
  return (AREAS_CORRIGEN_PAPELES as readonly string[]).includes(area ?? '')
}

export type AccionPapel = 'agregar' | 'quitar' | 'reclasificar'

export const ETIQUETA_TIPO_PAPEL: Record<TipoPapel, string> = { guia: 'guía', factura: 'factura' }

export type PapelesActuales = {
  guias: readonly { id: string; numero: string }[]
  facturas: readonly { id: string; numero: string }[]
}

function lista(p: PapelesActuales, tipo: TipoPapel) {
  return tipo === 'guia' ? p.guias : p.facturas
}

/** El error que impide el cambio, o null si se puede. */
export function validarCorreccionPapel(
  actuales: PapelesActuales,
  cambio:
    | { accion: 'agregar'; tipo: TipoPapel; numero: string; storagePath: string | null }
    | { accion: 'quitar' | 'reclasificar'; tipo: TipoPapel; id: string; motivo: string },
): string | null {
  if (cambio.accion === 'agregar') {
    const numero = cambio.numero.trim()
    if (!numero) return `Pon el número de la ${ETIQUETA_TIPO_PAPEL[cambio.tipo]}.`
    if (!cambio.storagePath) return `Sube el archivo de la ${ETIQUETA_TIPO_PAPEL[cambio.tipo]}.`
    if (lista(actuales, cambio.tipo).some((d) => d.numero.trim().toUpperCase() === numero.toUpperCase())) {
      return `Esta recepción ya tiene la ${ETIQUETA_TIPO_PAPEL[cambio.tipo]} ${numero}.`
    }
    return null
  }

  // `tipo` es lo que el papel ES hoy.
  const papel = lista(actuales, cambio.tipo).find((d) => d.id === cambio.id)
  if (!papel) return 'Ese papel ya no está en la recepción. Recarga la página.'
  if (!cambio.motivo.trim()) {
    return cambio.accion === 'quitar' ? 'Cuenta por qué se quita.' : 'Cuenta por qué se cambia.'
  }
  // Una recepción nunca queda sin guía ni sin factura: es el mismo mínimo
  // que se exige al registrarla. Para corregir la única, primero se agrega
  // la buena y después se quita la mala.
  if (lista(actuales, cambio.tipo).length === 1) {
    return `Es la única ${ETIQUETA_TIPO_PAPEL[cambio.tipo]} de la recepción. Agrega primero la correcta.`
  }
  if (cambio.accion === 'reclasificar') {
    const destino: TipoPapel = cambio.tipo === 'guia' ? 'factura' : 'guia'
    if (lista(actuales, destino).some((d) => d.numero.trim().toUpperCase() === papel.numero.trim().toUpperCase())) {
      return `Ya hay una ${ETIQUETA_TIPO_PAPEL[destino]} con el número ${papel.numero}.`
    }
  }
  return null
}
