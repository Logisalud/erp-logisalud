import { describe, expect, it } from 'vitest'
import { puede, puedeCrearProducto, puedeValidarProducto, rolesDesdeTexto } from '@/domain/permisos'

describe('permisos por rol', () => {
  it('solo Dirección Técnica aprueba y ajusta', () => {
    expect(puede(['direccion_tecnica'], 'aprobar')).toBe(true)
    expect(puede(['direccion_tecnica'], 'ajustar')).toBe(true)
    for (const r of ['asistente_dt', 'jefe_almacen', 'reemplazo_jefe', 'auxiliar'] as const) {
      expect(puede([r], 'aprobar')).toBe(false)
      expect(puede([r], 'ajustar')).toBe(false)
    }
  })
  it('el Jefe de Almacén ejecuta y verifica, pero no aprueba estados', () => {
    expect(puede(['jefe_almacen'], 'ejecutar')).toBe(true)
    expect(puede(['jefe_almacen'], 'verificar')).toBe(true)
    expect(puede(['jefe_almacen'], 'aprobar')).toBe(false)
  })
  it('Sandra crea productos; Katia los valida; nadie más', () => {
    expect(puedeCrearProducto(['asistente_dt'])).toBe(true)
    expect(puedeValidarProducto(['asistente_dt'])).toBe(false)
    expect(puedeValidarProducto(['direccion_tecnica'])).toBe(true)
    expect(puedeCrearProducto(['auxiliar'])).toBe(false)
  })
  it('auditoría solo lee', () => {
    expect(puede(['auditoria_lectura'], 'ejecutar')).toBe(false)
    expect(puede(['auditoria_lectura'], 'auditar')).toBe(true)
  })
  it('ignora roles desconocidos al leer el texto', () => {
    expect(rolesDesdeTexto('jefe_almacen, inventado')).toEqual(['jefe_almacen'])
    expect(rolesDesdeTexto(undefined)).toEqual([])
  })
})
