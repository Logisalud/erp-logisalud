import { describe, expect, it } from 'vitest'
import {
  colorEstadoOC,
  ordenPendiente,
  pasoAlcanzadoOC,
  pasoAlcanzadoOS,
  siguientePasoOC,
  siguientePasoOS,
} from '@/domain/ordenes-unificadas'

describe('pasoAlcanzadoOC', () => {
  it('borrador está en el primer paso', () => {
    expect(pasoAlcanzadoOC('borrador')).toBe(0)
  })
  it('parcialmente_recibida y recibida_completa caen en el mismo paso "Recepción"', () => {
    expect(pasoAlcanzadoOC('parcialmente_recibida')).toBe(3)
    expect(pasoAlcanzadoOC('recibida_completa')).toBe(3)
  })
  it('cerrada llega al último paso', () => {
    expect(pasoAlcanzadoOC('cerrada')).toBe(5)
  })
  it('anulada no tiene progreso (callejón sin salida)', () => {
    expect(pasoAlcanzadoOC('anulada')).toBe(-1)
  })
})

describe('pasoAlcanzadoOS', () => {
  it('pendiente_jefe está en el primer paso', () => {
    expect(pasoAlcanzadoOS('pendiente_jefe')).toBe(0)
  })
  it('rechazada_jefe no tiene progreso', () => {
    expect(pasoAlcanzadoOS('rechazada_jefe')).toBe(-1)
  })
  it('conformada llega al penúltimo paso', () => {
    expect(pasoAlcanzadoOS('conformada')).toBe(3)
  })
})

describe('siguientePasoOC / siguientePasoOS', () => {
  it('da un texto de negocio, no el valor técnico del estado', () => {
    expect(siguientePasoOC('borrador')).toBe('Enviar al proveedor')
    expect(siguientePasoOS('facturada')).toBe('Dar conformidad de que el servicio se cumplió')
  })
})

describe('ordenPendiente', () => {
  it('cerrada, anulada y rechazada_jefe no son pendientes', () => {
    expect(ordenPendiente('cerrada')).toBe(false)
    expect(ordenPendiente('anulada')).toBe(false)
    expect(ordenPendiente('rechazada_jefe')).toBe(false)
  })
  it('cualquier otro estado sí es pendiente', () => {
    expect(ordenPendiente('borrador')).toBe(true)
    expect(ordenPendiente('confirmada')).toBe(true)
  })
})

describe('colorEstadoOC', () => {
  it('borrador es gris, cerrada es verde, anulada es rojo', () => {
    expect(colorEstadoOC('borrador')).toBe('gris')
    expect(colorEstadoOC('cerrada')).toBe('verde')
    expect(colorEstadoOC('anulada')).toBe('rojo')
  })
})
