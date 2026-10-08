// Datos de PRUEBA para el modo demostración. Todo es sintético: no hay ninguna
// conexión a una base real. Los nombres de medicamentos son genéricos y los códigos
// llevan el prefijo DEMO-.

import {
  DOCUMENTOS_CONFIG, generarPosiciones, PROPIETARIOS_CONFIG, type CodigoPropietario,
} from '@/config/topologia'
import type {
  Asignacion, DocumentoSustento, Estado, Lote, Posicion, Propietario, Regulatorio, Saldo,
} from '@/domain/tipos'
import type { Panorama, ProductoConReg } from '@/domain/panorama'
import { AREAS_COMPARTIDAS } from '@/domain/zonas'

/** Generador pseudoaleatorio determinista (el mismo resultado siempre). */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const sumarDias = (iso: string, dias: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10)

const PRODUCTOS: { desc: string; pres: string; marca: string; pa: string; um: string }[] = [
  { desc: 'Dapagliflozina 10 mg', pres: 'Caja x 30 tabletas', marca: 'Genérico', pa: 'Dapagliflozina', um: 'TABLETA' },
  { desc: 'Metformina 850 mg', pres: 'Caja x 100 tabletas', marca: 'Genérico', pa: 'Metformina', um: 'TABLETA' },
  { desc: 'Losartán 50 mg', pres: 'Caja x 30 tabletas', marca: 'Genérico', pa: 'Losartán potásico', um: 'TABLETA' },
  { desc: 'Amoxicilina 500 mg', pres: 'Caja x 100 cápsulas', marca: 'Genérico', pa: 'Amoxicilina', um: 'CAPSULA' },
  { desc: 'Ibuprofeno 400 mg', pres: 'Caja x 100 tabletas', marca: 'Genérico', pa: 'Ibuprofeno', um: 'TABLETA' },
  { desc: 'Omeprazol 20 mg', pres: 'Caja x 28 cápsulas', marca: 'Genérico', pa: 'Omeprazol', um: 'CAPSULA' },
  { desc: 'Atorvastatina 20 mg', pres: 'Caja x 30 tabletas', marca: 'Genérico', pa: 'Atorvastatina', um: 'TABLETA' },
  { desc: 'Paracetamol 500 mg', pres: 'Caja x 100 tabletas', marca: 'Genérico', pa: 'Paracetamol', um: 'TABLETA' },
  { desc: 'Loratadina 10 mg', pres: 'Caja x 10 tabletas', marca: 'Genérico', pa: 'Loratadina', um: 'TABLETA' },
  { desc: 'Ciprofloxacino 500 mg', pres: 'Caja x 10 tabletas', marca: 'Genérico', pa: 'Ciprofloxacino', um: 'TABLETA' },
  { desc: 'Diclofenaco gel 1%', pres: 'Tubo x 60 g', marca: 'Genérico', pa: 'Diclofenaco', um: 'TUBO' },
  { desc: 'Salbutamol inhalador 100 mcg', pres: 'Frasco x 200 dosis', marca: 'Genérico', pa: 'Salbutamol', um: 'FRASCO' },
  { desc: 'Cloruro de sodio 0.9 % solución', pres: 'Bolsa x 500 ml', marca: 'Genérico', pa: 'Cloruro de sodio', um: 'BOLSA' },
  { desc: 'Complejo B ampollas', pres: 'Caja x 6 ampollas', marca: 'Genérico', pa: 'Vitaminas del complejo B', um: 'AMPOLLA' },
  { desc: 'Azitromicina 500 mg', pres: 'Caja x 3 tabletas', marca: 'Genérico', pa: 'Azitromicina', um: 'TABLETA' },
  { desc: 'Clonazepam 2 mg', pres: 'Caja x 30 tabletas', marca: 'Genérico', pa: 'Clonazepam', um: 'TABLETA' },
  { desc: 'Enalapril 10 mg', pres: 'Caja x 30 tabletas', marca: 'Genérico', pa: 'Enalapril', um: 'TABLETA' },
  { desc: 'Ranitidina 150 mg', pres: 'Caja x 20 tabletas', marca: 'Genérico', pa: 'Ranitidina', um: 'TABLETA' },
  { desc: 'Dexametasona 4 mg/ml', pres: 'Caja x 10 ampollas', marca: 'Genérico', pa: 'Dexametasona', um: 'AMPOLLA' },
  { desc: 'Sertralina 50 mg', pres: 'Caja x 30 tabletas', marca: 'Genérico', pa: 'Sertralina', um: 'TABLETA' },
  { desc: 'Ketorolaco 30 mg/ml', pres: 'Caja x 5 ampollas', marca: 'Genérico', pa: 'Ketorolaco', um: 'AMPOLLA' },
  { desc: 'Povidona yodada 10 %', pres: 'Frasco x 120 ml', marca: 'Genérico', pa: 'Povidona yodada', um: 'FRASCO' },
  { desc: 'Vitamina C 1 g efervescente', pres: 'Tubo x 10 tabletas', marca: 'Genérico', pa: 'Ácido ascórbico', um: 'TUBO' },
  { desc: 'Hisopos estériles (dispositivo)', pres: 'Caja x 100', marca: 'Genérico', pa: '—', um: 'CAJA' },
]

export function construirPanoramaDemo(hoy: string): Panorama {
  const azar = mulberry32(20261007)
  const entre = (a: number, b: number) => Math.floor(a + azar() * (b - a + 1))

  const propietarios: Propietario[] = PROPIETARIOS_CONFIG.map((p) => ({
    id: `prop:${p.codigo}`, codigo: p.codigo, razonSocial: p.razonSocial, ruc: p.ruc, esDuenoAlmacen: p.esDuenoAlmacen,
  }))
  const documentos: DocumentoSustento[] = DOCUMENTOS_CONFIG.map((d) => ({
    id: `doc:${d.codigo}`, codigo: d.codigo, tipo: d.tipo, titulo: d.titulo, vigenteDesde: d.vigenteDesde,
    archivoRef: d.archivoRef, estadoConfirmacion: d.estadoConfirmacion, nota: d.nota,
  }))
  const cfg = generarPosiciones()
  const posiciones: Posicion[] = cfg.map((p) => ({
    id: `pos:${p.codigo}`, codigo: p.codigo, rack: p.rack, posicion: p.posicion, nivel: p.nivel, subnivel: p.subnivel,
    forma: p.forma, tipoArea: p.tipoArea, activa: true, porVerificar: !!p.porVerificar, notaVerificacion: p.porVerificar,
  }))
  const docPorCodigo = new Map(DOCUMENTOS_CONFIG.map((d) => [d.codigo, d]))
  const asignaciones: Asignacion[] = cfg
    .filter((p) => p.propietario && p.documento)
    .map((p) => ({
      id: `asig:${p.codigo}`, posicionId: `pos:${p.codigo}`, propietarioId: `prop:${p.propietario}`,
      desde: docPorCodigo.get(p.documento!)!.vigenteDesde, documentoId: `doc:${p.documento}`,
    }))

  // Productos con su situación regulatoria (varios casos para que las alertas se vean).
  const productos: ProductoConReg[] = PRODUCTOS.map((x, i) => {
    const n = i + 1
    let reg: Regulatorio | undefined
    const base: Regulatorio = {
      productoId: `prod:${n}`, registroSanitario: `EG-${String(10000 + n * 37)}`, rsVence: sumarDias(hoy, 365 + n * 40),
      fabricante: 'Laboratorio de demostración', formaPresentacion: x.um === 'TABLETA' ? 'Tableta' : x.um === 'AMPOLLA' ? 'Solución inyectable' : 'Según presentación',
      concentracion: x.um === 'TABLETA' ? '500 mg' : undefined, condicionAlmacenamiento: 'Conservar a menos de 30 °C', creadoPor: 'demo:sandra',
    }
    if (n === 4) reg = { ...base, rsVence: sumarDias(hoy, 45) } // por vencer
    else if (n === 9) reg = { ...base, rsVence: sumarDias(hoy, 78) } // por vencer
    else if (n === 15) reg = { ...base, rsVence: sumarDias(hoy, -12) } // vencido
    else if (n === 23) reg = { ...base, registroSanitario: undefined, rsVence: undefined } // sin registro cargado (Dirección Técnica debe completarlo)
    else reg = base
    return {
      id: `prod:${n}`, codigo: `DEMO-${String(n).padStart(3, '0')}`, descripcion: x.desc, presentacion: x.pres,
      marca: x.marca, principioActivo: x.pa, unidadMedida: x.um, estado: 'activo' as const, reg,
    }
  })

  // Stock de prueba.
  const lotes: Lote[] = []
  const saldos: Saldo[] = []
  let nLote = 0
  const porPropietario: Record<CodigoPropietario, number[]> = {
    LOGISSA: [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15],
    DIPHASAC: [1, 2, 3, 5, 7, 9, 12, 14, 16, 17, 18, 19],
    TRIAMED: [6, 8, 10, 13, 24],
    MEDIC_PHARMA_LAB: [2, 4, 7, 9, 11, 14, 16],
    AJR_LABS: [3, 5, 8, 12, 17, 19],
  }
  const nuevoLote = (productoN: number, propietario: CodigoPropietario, codigo?: string, vence?: string): Lote => {
    nLote += 1
    const l: Lote = {
      id: `lote:${nLote}`, productoId: `prod:${productoN}`, codigo: codigo ?? `L${String(2400 + nLote)}`,
      vence: vence ?? sumarDias(hoy, entre(150, 900)), propietarioId: `prop:${propietario}`,
    }
    lotes.push(l)
    return l
  }
  const poner = (posCodigo: string, l: Lote, estado: Estado, cantidad: number, procedencia: string) =>
    saldos.push({
      posicionId: `pos:${posCodigo}`, productoId: l.productoId, loteId: l.id, propietarioId: l.propietarioId,
      estado, procedenciaId: procedencia, cantidad,
    })

  for (const p of cfg) {
    if (!p.propietario || AREAS_COMPARTIDAS.has(p.tipoArea)) continue
    const prod = porPropietario[p.propietario]
    if (p.tipoArea === 'APROBADOS' && azar() < 0.58) {
      const n = prod[entre(0, prod.length - 1)]
      const l = nuevoLote(n, p.propietario)
      poner(p.codigo, l, 'APROBADO', entre(24, 480), `entrega:${l.id}`)
      if (azar() < 0.22) { // un segundo lote en la misma posición
        const l2 = nuevoLote(prod[entre(0, prod.length - 1)], p.propietario)
        poner(p.codigo, l2, 'APROBADO', entre(12, 160), `entrega:${l2.id}`)
      }
    } else if (p.tipoArea === 'BAJAS_RECHAZADOS' && azar() < 0.7) {
      const l = nuevoLote(prod[entre(0, prod.length - 1)], p.propietario)
      poner(p.codigo, l, 'BAJAS_RECHAZADOS', entre(2, 36), `entrega:${l.id}`)
    } else if (p.tipoArea === 'DEVOLUCIONES' && azar() < 0.65) {
      const l = nuevoLote(prod[entre(0, prod.length - 1)], p.propietario)
      poner(p.codigo, l, 'DEVOLUCIONES', entre(2, 40), `devolucion:${l.id}`)
    }
  }

  // Cuarentena (A-6..A-9): entregas recientes de varios propietarios.
  const entregas: [string, CodigoPropietario, number, number][] = [
    ['A-6', 'LOGISSA', 2, 240], ['A-6', 'LOGISSA', 5, 120], ['A-7', 'DIPHASAC', 3, 96],
    ['A-8', 'MEDIC_PHARMA_LAB', 7, 60], ['A-9', 'TRIAMED', 10, 36],
  ]
  for (const [pos, prop, n, cant] of entregas) {
    const l = nuevoLote(n, prop)
    poner(pos, l, 'CUARENTENA', cant, `entrega:${l.id}`)
  }
  // Aprobado que espera su traslado a un rack (sigue en la zona de Cuarentena).
  const porTrasladar = nuevoLote(1, 'LOGISSA', 'L-TRASLADO')
  poner('A-9', porTrasladar, 'APROBADO', 60, `entrega:${porTrasladar.id}`)

  // Vencimientos (D-30): un lote que vence pronto y uno que ya venció siguen en el inventario.
  const rackLogissa = cfg.find((p) => p.propietario === 'LOGISSA' && p.tipoArea === 'APROBADOS')!.codigo
  const porVencer = nuevoLote(3, 'LOGISSA', 'L-VENCE-PRONTO', sumarDias(hoy, 38))
  poner(rackLogissa, porVencer, 'APROBADO', 90, `entrega:${porVencer.id}`)
  const yaVencido = nuevoLote(5, 'LOGISSA', 'L-VENCIDO', sumarDias(hoy, -12))
  poner(rackLogissa, yaVencido, 'APROBADO', 36, `entrega:${yaVencido.id}`)

  // El lote ABC: una entrega ya Aprobada y otra nueva en Cuarentena (cada una con su procedencia).
  const abc = nuevoLote(1, 'DIPHASAC', 'ABC', sumarDias(hoy, 420))
  poner('A-21.1', abc, 'APROBADO', 120, 'entrega:ABC-1')
  poner('A-8', abc, 'CUARENTENA', 48, 'entrega:ABC-2')

  return { hoy, propietarios, posiciones, asignaciones, documentos, productos, lotes, saldos }
}
