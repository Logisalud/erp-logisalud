import { describe, expect, it } from 'vitest'
import {
  estadoDocumento, evaluarRequisitos, motivoNoPuedeSubir, paqueteCompleto, relacionarCoa, validarArchivo, validarVigencia, type LoteParaRelacionar,
} from '@/domain/documentos'

const HOY = '2026-10-14'
const lote = (id: string, codigo: string, prod = 'P1', desc = 'Lizinopril 10 mg'): LoteParaRelacionar => ({ id, codigo, productoId: prod, productoCodigo: prod, productoDescripcion: desc })

describe('estado de un documento', () => {
  it('sin vencimiento siempre vigente; con vencimiento: por vencer a 30 días, vencido el día después; reemplazado pesa más', () => {
    expect(estadoDocumento({}, HOY)).toBe('VIGENTE')
    expect(estadoDocumento({ vigenteHasta: '2026-12-01' }, HOY)).toBe('VIGENTE')
    expect(estadoDocumento({ vigenteHasta: '2026-11-13' }, HOY)).toBe('POR_VENCER')
    expect(estadoDocumento({ vigenteHasta: HOY }, HOY)).toBe('POR_VENCER')
    expect(estadoDocumento({ vigenteHasta: '2026-10-13' }, HOY)).toBe('VENCIDO')
    expect(estadoDocumento({ vigenteHasta: '2030-01-01' }, HOY, true)).toBe('REEMPLAZADO')
  })
  it('la vigencia no puede terminar antes de empezar', () => {
    expect(validarVigencia('2026-10-10', '2026-10-01')).toMatch(/no puede vencer antes/)
    expect(validarVigencia('2026-10-10', undefined)).toBeNull()
  })
})

describe('quién puede subir qué (espejo de la base de datos)', () => {
  it('el COA lo adjunta quien recibe; reemplazarlo y el registro sanitario y el BPM, solo Dirección Técnica', () => {
    for (const r of ['jefe_almacen', 'auxiliar', 'asistente_dt', 'direccion_tecnica', 'admin_wms'] as const) expect(motivoNoPuedeSubir([r], 'COA', false), r).toBeNull()
    for (const r of ['jefe_transporte', 'auditoria_lectura'] as const) expect(motivoNoPuedeSubir([r], 'COA', false), r).toMatch(/No tienes permiso/)
    expect(motivoNoPuedeSubir(['jefe_almacen'], 'COA', true)).toMatch(/solo Dirección Técnica y el Administrador lo reemplazan/)
    expect(motivoNoPuedeSubir(['direccion_tecnica'], 'COA', true)).toBeNull()
    expect(motivoNoPuedeSubir(['admin_wms'], 'COA', true)).toBeNull() // D-196
    for (const t of ['REGISTRO_SANITARIO', 'BPM'] as const) {
      expect(motivoNoPuedeSubir(['asistente_dt', 'jefe_almacen'], t, false)).toMatch(/Solo Dirección Técnica/)
      expect(motivoNoPuedeSubir(['direccion_tecnica'], t, false)).toBeNull()
      expect(motivoNoPuedeSubir(['admin_wms'], t, false)).toBeNull() // D-196: el Administrador gestiona documentos
    }
  })
})

describe('requisitos de un paquete', () => {
  const coa = { id: 'c', nombreArchivo: 'coa.pdf' }
  const rs = { id: 'r', nombreArchivo: 'rs.pdf', vigenteHasta: '2027-06-01' }
  it('sin perfil se exigen COA y registro sanitario; el BPM no', () => {
    const r = evaluarRequisitos(undefined, {}, HOY)
    expect(r.map((x) => [x.tipo, x.exigido, x.estado])).toEqual([['COA', true, 'FALTA'], ['REGISTRO_SANITARIO', true, 'FALTA'], ['BPM', false, 'NO_EXIGIDO']])
    expect(paqueteCompleto(r)).toBe(false)
    expect(paqueteCompleto(evaluarRequisitos(undefined, { COA: coa, REGISTRO_SANITARIO: rs }, HOY))).toBe(true)
  })
  it('un documento vencido, o que vence antes de la entrega, no completa el paquete; el perfil del cliente cambia lo que se exige', () => {
    const vencido = { id: 'r', nombreArchivo: 'rs.pdf', vigenteHasta: '2026-10-01' }
    expect(evaluarRequisitos(undefined, { COA: coa, REGISTRO_SANITARIO: vencido }, HOY)[1].estado).toBe('VENCIDO')
    expect(evaluarRequisitos(undefined, { COA: coa, REGISTRO_SANITARIO: { ...rs, vigenteHasta: '2026-10-20' } }, HOY, '2026-10-25')[1].estado).toBe('VENCE_ANTES_DE_ENTREGA')
    const soloRs = evaluarRequisitos({ exigeCoa: false, exigeRegistroSanitario: true, exigeBpm: true }, { REGISTRO_SANITARIO: rs }, HOY)
    expect(soloRs.map((x) => x.estado)).toEqual(['NO_EXIGIDO', 'OK', 'FALTA'])
    expect(paqueteCompleto(soloRs)).toBe(false)
    expect(paqueteCompleto(evaluarRequisitos({ exigeCoa: false, exigeRegistroSanitario: false, exigeBpm: false }, {}, HOY))).toBe(true)
  })
})

describe('carga masiva: relacionar un archivo con su lote por el nombre', () => {
  const lotes = [lote('l1', 'L2501'), lote('l2', 'L2502'), lote('l3', 'AB-123', 'P2', 'Dapagliflozina 10 mg'), lote('l4', 'AB-123', 'P3', 'Omeprazol 20 mg'), lote('l5', 'L25')]
  it('un nombre con un solo lote conocido se relaciona solo (sin tildes ni mayúsculas, con guiones o pegado)', () => {
    expect(relacionarCoa('COA_L2501_Lizinopril.pdf', lotes)).toMatchObject({ estado: 'RELACIONADO', loteId: 'l1' })
    expect(relacionarCoa('coa lote l2502.PDF', lotes)).toMatchObject({ estado: 'RELACIONADO', loteId: 'l2' })
    expect(relacionarCoa('Certificado-Lote-L2501.pdf', lotes)).toMatchObject({ estado: 'RELACIONADO', loteId: 'l1' })
  })
  it('el lote más específico gana sobre uno cuyo código está dentro del otro', () => {
    expect(relacionarCoa('COA L2501.pdf', lotes)).toMatchObject({ estado: 'RELACIONADO', loteId: 'l1' })
    expect(relacionarCoa('COA L25.pdf', lotes)).toMatchObject({ estado: 'RELACIONADO', loteId: 'l5' })
  })
  it('el mismo código en dos productos se desempata por el nombre; si no alcanza, queda por revisar con sus candidatos', () => {
    expect(relacionarCoa('COA AB-123 Dapagliflozina.pdf', lotes)).toMatchObject({ estado: 'RELACIONADO', loteId: 'l3' })
    expect(relacionarCoa('AB123 omeprazol COA.pdf', lotes)).toMatchObject({ estado: 'RELACIONADO', loteId: 'l4' })
    const r = relacionarCoa('COA AB-123.pdf', lotes)
    expect(r).toMatchObject({ estado: 'POR_REVISAR', motivo: expect.stringMatching(/coincide con 2 lotes/) })
    expect(r.candidatos.map((c) => c.loteId).sort()).toEqual(['l3', 'l4'])
  })
  it('sin lote conocido en el nombre queda por revisar, sin adivinar', () => {
    expect(relacionarCoa('scan0001.pdf', lotes)).toMatchObject({ estado: 'POR_REVISAR', motivo: expect.stringMatching(/ningún lote conocido/), candidatos: [] })
    expect(relacionarCoa('COA X9.pdf', [lote('l9', 'X9')])).toMatchObject({ estado: 'POR_REVISAR' }) // códigos de menos de 3 letras no se usan
  })
})

describe('archivos aceptados', () => {
  it('solo PDF, no vacíos y de hasta 15 MB', () => {
    expect(validarArchivo('a.pdf', 100)).toBeNull()
    expect(validarArchivo('a.PDF', 100)).toBeNull()
    expect(validarArchivo('a.jpg', 100)).toMatch(/PDF/)
    expect(validarArchivo('a.pdf', 0)).toMatch(/vacío/)
    expect(validarArchivo('a.pdf', 16 * 1024 * 1024)).toMatch(/15 MB/)
  })
})
