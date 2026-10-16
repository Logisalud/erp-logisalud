import { describe, expect, it } from 'vitest'
import {
  documentosDelPaquete, faltantesDelPaquete, motivoNoPuedeRegistrarGuia, paqueteDeItemsCompleto, validarNumeroGre, type ItemPaquete,
} from '@/domain/documentacion'
import { etapaConAvance, etapaDeSalida } from '@/domain/despacho'

const req = (tipo: 'COA' | 'REGISTRO_SANITARIO' | 'BPM', estado: 'OK' | 'FALTA' | 'VENCIDO' | 'VENCE_ANTES_DE_ENTREGA' | 'NO_EXIGIDO', id?: string, exigido = true) => ({ tipo, exigido, estado, documentoId: id, nombreArchivo: id ? `${id}.pdf` : undefined })
const item = (lote: string, requisitos: ItemPaquete['requisitos'], producto = 'P1'): ItemPaquete => ({ lineaId: `l-${lote}`, productoId: producto, productoCodigo: producto, producto: `Producto ${producto}`, loteId: lote, lote, cantidad: 5, requisitos })

describe('número de guía', () => {
  it('serie de 4 caracteres, guion y correlativo (se acepta en minúsculas)', () => {
    for (const ok of ['T001-00001234', 'EG07-00002031', 't001-1']) expect(validarNumeroGre(ok), ok).toBeNull()
    for (const mal of ['', '1234', 'T001', 'T0-1', 'T001-123456789', '001-0001', 'T001 00001']) expect(validarNumeroGre(mal), mal).toMatch(/serie, guion y número/)
  })
})

describe('paquete documental', () => {
  const items = [item('L1', [req('COA', 'FALTA'), req('REGISTRO_SANITARIO', 'OK', 'rs1'), req('BPM', 'NO_EXIGIDO', undefined, false)]), item('L2', [req('COA', 'VENCE_ANTES_DE_ENTREGA', 'c2'), req('REGISTRO_SANITARIO', 'OK', 'rs1'), req('BPM', 'VENCIDO', 'b1')])]

  it('los faltantes salen en palabras, con el mismo texto que la alerta', () => {
    expect(faltantesDelPaquete(items)).toEqual(['COA del lote L1 (falta)', 'COA del lote L2 (vence antes de la entrega)', 'BPM de P1 (vencido)'])
    expect(paqueteDeItemsCompleto(items)).toBe(false)
    expect(paqueteDeItemsCompleto([item('L3', [req('COA', 'OK', 'c3'), req('REGISTRO_SANITARIO', 'OK', 'rs1'), req('BPM', 'NO_EXIGIDO', undefined, false)])])).toBe(true)
  })

  it('lo que se imprime: sin repetir el registro del mismo producto, sin vencidos ni lo que el cliente no pide; en orden producto → lote', () => {
    expect(documentosDelPaquete(items).map((d) => d.documentoId)).toEqual(['rs1', 'c2'])
  })

  it('la guía: quién, cuándo y por qué no', () => {
    expect(motivoNoPuedeRegistrarGuia(['auxiliar'], { conforme: true })).toMatch(/No tienes permiso/)
    expect(motivoNoPuedeRegistrarGuia(['jefe_transporte'], { conforme: false })).toMatch(/cuando todo el pedido tiene la conformidad/)
    expect(motivoNoPuedeRegistrarGuia(['jefe_transporte'], { conforme: true, guia: { id: 'g' } as never })).toMatch(/ya tiene una guía/)
    expect(motivoNoPuedeRegistrarGuia(['jefe_transporte'], { conforme: true })).toBeNull()
  })
})

describe('etapa después de la conformidad', () => {
  const conforme = { estado: 'ABIERTA' as const, lineas: [{ estado: 'CONFORME' as const }], orden: { lineas: [{ picking: 'PICKEADA' as const, conformidad: 'CONFORME' as const }] } }
  it('«Lista para carga» exige guía, paquete completo y embalaje a la vez', () => {
    expect(etapaDeSalida(conforme)).toBe('CONFORME')
    expect(etapaDeSalida(conforme, { guia: true })).toBe('CONFORME')
    expect(etapaDeSalida(conforme, { guia: true, paquete: true })).toBe('DOCUMENTACION_COMPLETA')
    expect(etapaDeSalida(conforme, { embalada: true })).toBe('EMBALADA')
    expect(etapaDeSalida(conforme, { guia: true, paquete: true, embalada: true })).toBe('LISTA_PARA_CARGA')
    expect(etapaDeSalida(conforme, { guia: true, paquete: true, embalada: true, cargada: true })).toBe('CARGADA')
  })
  it('antes de la conformidad el avance no cambia la etapa', () => {
    expect(etapaConAvance('EN_PICKING', { guia: true, paquete: true, embalada: true })).toBe('EN_PICKING')
    expect(etapaConAvance('PENDIENTE_CONFORMIDAD', { guia: true })).toBe('PENDIENTE_CONFORMIDAD')
  })
})
