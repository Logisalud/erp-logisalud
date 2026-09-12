/**
 * Los valores guardados de una solicitud, con la forma exacta que necesita
 * el formulario (todo string, como vienen y van los inputs). Puro.
 *
 * Existe para que el formulario de alta sea TAMBIÉN el de edición sin
 * conocer la fila de la base: la pantalla de editar traduce una vez, acá,
 * y el formulario sigue sin saber de Supabase.
 */

import type { TipoSolicitud } from './gasto'

export type ValoresSolicitud = {
  tipo: TipoSolicitud
  categoriaId: string
  moneda: string
  descripcion: string
  montoAnticipo: string
  baseImponible: string
  igv: string
  destino: string
  fechaInicio: string
  fechaFin: string
  fechaRequerida: string
  asignadoA: string
  quienAutoriza: string
  fechaFactura: string
  tipoComprobante: string
}

type FilaSolicitud = {
  tipo: string
  categoria_id: string | null
  moneda: string | null
  descripcion: string | null
  monto_solicitado: number | string | null
  base_imponible: number | string | null
  igv: number | string | null
  destino: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  fecha_requerida: string | null
  asignado_a: string | null
  quien_autoriza: string | null
  fecha_factura: string | null
}

/**
 * `monto_solicitado` es el TOTAL guardado. En un anticipo eso es el monto
 * del anticipo; en los demás es base + IGV, y ahí el formulario pide las
 * dos partes por separado (ver montoTotalSolicitud en domain/gasto.ts).
 */
export function valoresDeSolicitud(fila: FilaSolicitud): ValoresSolicitud {
  const texto = (v: string | null | undefined) => v ?? ''
  const numero = (v: number | string | null | undefined) =>
    v === null || v === undefined || v === '' ? '' : String(v)

  return {
    tipo: fila.tipo as TipoSolicitud,
    categoriaId: texto(fila.categoria_id),
    moneda: fila.moneda ?? 'PEN',
    descripcion: texto(fila.descripcion),
    montoAnticipo: fila.tipo === 'anticipo' ? numero(fila.monto_solicitado) : '',
    baseImponible: fila.tipo === 'anticipo' ? '' : numero(fila.base_imponible),
    igv: fila.tipo === 'anticipo' ? '' : numero(fila.igv),
    destino: texto(fila.destino),
    fechaInicio: texto(fila.fecha_inicio),
    fechaFin: texto(fila.fecha_fin),
    fechaRequerida: texto(fila.fecha_requerida),
    asignadoA: texto(fila.asignado_a),
    quienAutoriza: texto(fila.quien_autoriza),
    fechaFactura: texto(fila.fecha_factura),
    // 'boleta' es el default del alta; una solicitud vieja sin el dato
    // guardado cae ahí igual que caería una nueva.
    tipoComprobante: 'boleta',
  }
}
