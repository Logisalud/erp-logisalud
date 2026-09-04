import { describe, expect, it } from 'vitest'
import { recepcionEsFacturable, osEsFacturable, saldoDisponibleLinea } from '@/domain/facturas-elegibles'

describe('recepcionEsFacturable', () => {
  it('conforme y sin obligación: facturable', () => {
    expect(recepcionEsFacturable('conforme', false)).toBe(true)
  })
  it('conforme pero ya tiene obligación: no facturable (evita duplicar)', () => {
    expect(recepcionEsFacturable('conforme', true)).toBe(false)
  })
  it('no conforme todavía: no facturable aunque no tenga obligación', () => {
    expect(recepcionEsFacturable('parcial', false)).toBe(false)
    expect(recepcionEsFacturable('pendiente', false)).toBe(false)
  })
})

describe('osEsFacturable', () => {
  it('aprobada: facturable (falta subir el documento)', () => {
    expect(osEsFacturable('aprobada')).toBe(true)
  })
  it('en_ejecucion: facturable (falta subir el documento)', () => {
    expect(osEsFacturable('en_ejecucion')).toBe(true)
  })
  it('factura_adjunta: sigue facturable (documento subido, faltan los datos reales — hallazgo de Mariela, punto 2)', () => {
    expect(osEsFacturable('factura_adjunta')).toBe(true)
  })
  it('estado que no admite facturar (borrador, rechazada, facturada, conformada): no facturable', () => {
    expect(osEsFacturable('borrador')).toBe(false)
    expect(osEsFacturable('rechazada')).toBe(false)
    expect(osEsFacturable('facturada')).toBe(false)
    expect(osEsFacturable('conformada')).toBe(false)
  })
})

describe('saldoDisponibleLinea', () => {
  it('resta lo ya facturado del total', () => {
    expect(saldoDisponibleLinea(1000, 400)).toBe(600)
  })
  it('nunca negativo aunque lo facturado supere el total (dato inconsistente)', () => {
    expect(saldoDisponibleLinea(1000, 1500)).toBe(0)
  })
  it('sin nada facturado: saldo es el total', () => {
    expect(saldoDisponibleLinea(1000, 0)).toBe(1000)
  })
  it('evita drift de punto flotante', () => {
    expect(saldoDisponibleLinea(0.3, 0.1)).toBe(0.2)
  })
})
