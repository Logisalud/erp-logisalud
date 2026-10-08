// Topología del almacén Lurín como DATOS (no como código de negocio).
//
// Fuente: docs/wms/topologia.md, planos 2026 (docs/wms/layouts/) y la 3ra adenda
// de AJR Labs. Si el almacén cambia, se cambia este archivo (o, en producción,
// las tablas wms.posiciones / wms.asignaciones_posicion) — no las reglas.
//
// Las "porVerificar" son lo que topologia.md pide no inventar: se cargan
// marcadas hasta que Charlie las confirme en sitio.

import type { FormaPosicion, TipoArea } from '@/domain/tipos'

export type CodigoPropietario = 'LOGISSA' | 'DIPHASAC' | 'TRIAMED' | 'MEDIC_PHARMA_LAB' | 'AJR_LABS'
export type CodigoDocumento = 'PLANO_LOGISSA' | 'PLANO_DIPHASAC' | 'PLANO_TRIAMED' | 'PLANO_MPL' | 'ADENDA_AJR'

export const PROPIETARIOS_CONFIG: {
  codigo: CodigoPropietario
  razonSocial: string
  ruc?: string
  esDuenoAlmacen: boolean
}[] = [
  { codigo: 'LOGISSA', razonSocial: 'LOGISSA S.A.C.', ruc: '20610284508', esDuenoAlmacen: true },
  { codigo: 'DIPHASAC', razonSocial: 'DIPHASAC', ruc: '20546207219', esDuenoAlmacen: false },
  { codigo: 'TRIAMED', razonSocial: 'TRIAMED', esDuenoAlmacen: false },
  { codigo: 'MEDIC_PHARMA_LAB', razonSocial: 'MEDIC PHARMA LAB', esDuenoAlmacen: false },
  { codigo: 'AJR_LABS', razonSocial: 'AJR LABS S.A.C.', ruc: '20604984140', esDuenoAlmacen: false },
]

export const DOCUMENTOS_CONFIG: {
  codigo: CodigoDocumento
  tipo: 'PLANO' | 'ADENDA'
  titulo: string
  vigenteDesde: string
  archivoRef: string
  estadoConfirmacion: 'CONFIRMADO' | 'POR_CONFIRMAR'
  nota?: string
}[] = [
  { codigo: 'PLANO_LOGISSA', tipo: 'PLANO', titulo: 'Plano 2026 — Logissa', vigenteDesde: '2026-08-12', archivoRef: 'docs/wms/layouts/LOGISSA .pdf', estadoConfirmacion: 'CONFIRMADO', nota: 'El contrato original no está en el repo: la vigencia parte de la fecha del plano.' },
  { codigo: 'PLANO_DIPHASAC', tipo: 'PLANO', titulo: 'Plano 2026 — Diphasac', vigenteDesde: '2026-08-12', archivoRef: 'docs/wms/layouts/DIPHASAC .pdf', estadoConfirmacion: 'CONFIRMADO', nota: 'El contrato original no está en el repo: la vigencia parte de la fecha del plano.' },
  { codigo: 'PLANO_TRIAMED', tipo: 'PLANO', titulo: 'Plano 2026 — Triamed', vigenteDesde: '2026-08-12', archivoRef: 'docs/wms/layouts/TRIAMED.pdf', estadoConfirmacion: 'CONFIRMADO', nota: 'El contrato original no está en el repo: la vigencia parte de la fecha del plano.' },
  { codigo: 'PLANO_MPL', tipo: 'PLANO', titulo: 'Plano 2026 — Medic Pharma Lab', vigenteDesde: '2026-08-12', archivoRef: 'docs/wms/layouts/MEDIC PHARMA LAB.pdf', estadoConfirmacion: 'CONFIRMADO', nota: 'El contrato original no está en el repo: la vigencia parte de la fecha del plano.' },
  { codigo: 'ADENDA_AJR', tipo: 'ADENDA', titulo: '3ra adenda — AJR Labs', vigenteDesde: '2026-05-01', archivoRef: 'docs/wms/layouts/3RA_ADENDA_ContratoArrendamientoAJR_FIRMADO.pdf', estadoConfirmacion: 'POR_CONFIRMAR', nota: 'En la imagen solo se ve la firma de Logissa; falta confirmar la firma de AJR Labs (D-10).' },
]

export interface PosicionConfig {
  codigo: string
  rack: string
  posicion: number | null
  nivel: number | null
  subnivel: number | null
  forma: FormaPosicion
  tipoArea: TipoArea
  /** Propietario de la asignación (null = libre o área compartida). */
  propietario: CodigoPropietario | null
  documento: CodigoDocumento | null
  porVerificar?: string
}

const DOC_DE: Record<CodigoPropietario, CodigoDocumento> = {
  LOGISSA: 'PLANO_LOGISSA',
  DIPHASAC: 'PLANO_DIPHASAC',
  TRIAMED: 'PLANO_TRIAMED',
  MEDIC_PHARMA_LAB: 'PLANO_MPL',
  AJR_LABS: 'ADENDA_AJR',
}

export function generarPosiciones(): PosicionConfig[] {
  const out: PosicionConfig[] = []
  const add = (
    codigo: string,
    rack: string,
    posicion: number | null,
    nivel: number | null,
    subnivel: number | null,
    forma: FormaPosicion,
    tipoArea: TipoArea,
    propietario: CodigoPropietario | null,
    porVerificar?: string,
  ) =>
    out.push({
      codigo, rack, posicion, nivel, subnivel, forma, tipoArea, propietario,
      documento: propietario ? DOC_DE[propietario] : null,
      porVerificar,
    })
  const niv = (rack: string, pos: number, n: number, area: TipoArea, prop: CodigoPropietario | null, pv?: string) =>
    add(`${rack}-${pos}.${n}`, rack, pos, n, null, 'RACK', area, prop, pv)
  const sub = (rack: string, pos: number, n: number, s: number, area: TipoArea, prop: CodigoPropietario) =>
    add(`${rack}-${pos}.${n}.${s}`, rack, pos, n, s, 'SUBRACK', area, prop)

  // Áreas compartidas (varios propietarios por posición).
  for (let n = 1; n <= 5; n++) add(`A-${n}`, 'A', n, null, null, 'PISO', 'RECEPCION', null)
  add('A-M1', 'A', null, null, null, 'MESA', 'RECEPCION', null)
  for (let n = 6; n <= 9; n++) add(`A-${n}`, 'A', n, null, null, 'PISO', 'CUARENTENA', null)
  for (let k = 1; k <= 7; k++) add(`K-${k}`, 'K', k, null, null, 'PISO', 'DESPACHO', null)
  add('K-M2', 'K', null, null, null, 'MESA', 'EMBALAJE', null)

  // Rack A (10–27): Diphasac aprobados; en el nivel 1 de A-10..A-13, devoluciones.
  for (let p = 10; p <= 27; p++) {
    for (let n = 1; n <= 4; n++) {
      if (n === 1 && p === 10) niv('A', p, n, 'DEVOLUCIONES', 'DIPHASAC')
      else if (n === 1 && p === 11) niv('A', p, n, 'DEVOLUCIONES', 'AJR_LABS')
      else if (n === 1 && p === 12) niv('A', p, n, 'DEVOLUCIONES', 'DIPHASAC')
      else if (n === 1 && p === 13) niv('A', p, n, 'DEVOLUCIONES', 'MEDIC_PHARMA_LAB')
      else niv('A', p, n, 'APROBADOS', 'DIPHASAC')
    }
  }

  // Piso B, C, D, E (1–7): Logissa aprobados.
  for (const r of ['B', 'C', 'D', 'E']) {
    for (let p = 1; p <= 7; p++) add(`${r}-${p}`, r, p, null, null, 'PISO', 'APROBADOS', 'LOGISSA')
  }

  // E-8 a E-10: Logissa. E-8.1 se divide en subracks; E-9.1 y E-10.1 no figuran en la tabla 2026.
  sub('E', 8, 1, 1, 'DEVOLUCIONES', 'LOGISSA')
  sub('E', 8, 1, 2, 'BAJAS_RECHAZADOS', 'LOGISSA')
  sub('E', 8, 1, 3, 'CONTRAMUESTRA', 'LOGISSA')
  sub('E', 8, 1, 4, 'APROBADOS', 'LOGISSA')
  for (let n = 2; n <= 4; n++) niv('E', 8, n, 'APROBADOS', 'LOGISSA')
  for (const p of [9, 10]) {
    niv('E', p, 1, 'APROBADOS', 'LOGISSA', 'No figura en la tabla de Logissa 2026; el plano la dibuja, Odoo la tiene y el total de pallets solo cuadra si se cuenta.')
    for (let n = 2; n <= 4; n++) niv('E', p, n, 'APROBADOS', 'LOGISSA')
  }

  // F (1–10) y H (1–10): Logissa. G (1–6): Logissa; G (7–10): AJR Labs (adenda).
  for (let p = 1; p <= 10; p++) for (let n = 1; n <= 4; n++) niv('F', p, n, 'APROBADOS', 'LOGISSA')
  for (let p = 1; p <= 10; p++) for (let n = 1; n <= 4; n++) niv('H', p, n, 'APROBADOS', 'LOGISSA')
  for (let p = 1; p <= 10; p++) for (let n = 1; n <= 4; n++) niv('G', p, n, 'APROBADOS', p <= 6 ? 'LOGISSA' : 'AJR_LABS')

  // I: I-1.1 → Triamed (subracks); I-1 niveles 2–4 y I-2..I-7 → Medic Pharma Lab;
  // I-8 sin propietario (libre); I-9..I-10 → Logissa.
  sub('I', 1, 1, 1, 'DEVOLUCIONES', 'TRIAMED')
  sub('I', 1, 1, 2, 'BAJAS_RECHAZADOS', 'TRIAMED')
  sub('I', 1, 1, 3, 'CONTRAMUESTRA', 'TRIAMED')
  sub('I', 1, 1, 4, 'APROBADOS', 'TRIAMED')
  for (let n = 2; n <= 4; n++) niv('I', 1, n, 'APROBADOS', 'MEDIC_PHARMA_LAB')
  for (let p = 2; p <= 7; p++) for (let n = 1; n <= 4; n++) niv('I', p, n, 'APROBADOS', 'MEDIC_PHARMA_LAB')
  for (let n = 1; n <= 4; n++) niv('I', 8, n, 'APROBADOS', null, 'Dibujada en los planos y presente en Odoo, sin propietario asignado: queda libre (D-07).')
  for (const p of [9, 10]) for (let n = 1; n <= 4; n++) niv('I', p, n, 'APROBADOS', 'LOGISSA')

  // J: Diphasac (J-1..J-10 todos los niveles; J-11 niveles 2 y 4), con las posiciones
  // especiales de Medic Pharma Lab, Diphasac y AJR en J-11..J-13.
  for (let p = 1; p <= 10; p++) for (let n = 1; n <= 4; n++) niv('J', p, n, 'APROBADOS', 'DIPHASAC')
  niv('J', 11, 1, 'CONTRAMUESTRA', 'MEDIC_PHARMA_LAB')
  niv('J', 11, 2, 'APROBADOS', 'DIPHASAC')
  niv('J', 11, 3, 'BAJAS_RECHAZADOS', 'MEDIC_PHARMA_LAB')
  niv('J', 11, 4, 'APROBADOS', 'DIPHASAC')
  niv('J', 12, 1, 'BAJAS_RECHAZADOS', 'DIPHASAC')
  niv('J', 12, 2, 'BAJAS_RECHAZADOS', 'DIPHASAC')
  niv('J', 12, 3, 'CONTRAMUESTRA', 'DIPHASAC')
  niv('J', 12, 4, 'APROBADOS', null, 'Dibujada en los planos y presente en Odoo, sin propietario asignado: queda libre (D-07).')
  niv('J', 13, 1, 'BAJAS_RECHAZADOS', 'AJR_LABS')
  niv('J', 13, 2, 'BAJAS_RECHAZADOS', 'DIPHASAC')
  niv('J', 13, 3, 'CONTRAMUESTRA', 'AJR_LABS')
  niv('J', 13, 4, 'CONTRAMUESTRA', 'DIPHASAC')

  return out
}
