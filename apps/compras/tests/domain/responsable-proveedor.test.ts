import { describe, expect, it } from 'vitest'
import { desenlaceDe, esHallazgo, ordenarHallazgos, type FilaProveedorResponsable } from '@/domain/responsable-proveedor'

describe('desenlace de cada proveedor', () => {
  it('sin responsable asignado es un hallazgo, haya o no actividad', () => {
    expect(desenlaceDe(null, null)).toBe('sin_responsable')
    expect(desenlaceDe(null, 'u2')).toBe('sin_responsable')
  })

  it('responsable que NO generó la última actividad es un hallazgo', () => {
    expect(desenlaceDe('u1', 'u2')).toBe('responsable_desactualizado')
    expect(esHallazgo('responsable_desactualizado')).toBe(true)
  })

  it('responsable que sí la generó está al día', () => {
    expect(desenlaceDe('u1', 'u1')).toBe('ok')
    expect(esHallazgo('ok')).toBe(false)
  })

  it('con responsable y sin movimientos NO es un hallazgo', () => {
    expect(desenlaceDe('u1', null)).toBe('sin_actividad')
    expect(esHallazgo('sin_actividad')).toBe(false)
  })
})

describe('orden', () => {
  it('los sin responsable van primero', () => {
    const fila = (razonSocial: string, desenlace: any): FilaProveedorResponsable => ({
      id: razonSocial, fuente: 'compra', razonSocial, ruc: null, responsable: null,
      responsableId: null, ultimaActividadPor: null, ultimaActividadPorId: null,
      ultimaActividadFecha: null, ultimaActividadCodigo: null, desenlace, href: '/',
    })
    const orden = ordenarHallazgos([
      fila('Zeta', 'responsable_desactualizado'),
      fila('Beta', 'sin_responsable'),
      fila('Alfa', 'responsable_desactualizado'),
    ]).map((f) => f.razonSocial)
    expect(orden).toEqual(['Beta', 'Alfa', 'Zeta'])
  })
})
