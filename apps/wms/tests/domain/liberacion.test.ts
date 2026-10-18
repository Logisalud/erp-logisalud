// OS-5 · LS-POE.04.05: dictamen del DT del cliente, observación reversible y rol «DT de cliente».
import { describe, expect, it } from 'vitest'
import {
  MAX_BYTES_DICTAMEN, decisionTrasDictamenes, puedeMarcarAntecedentes, puedeObservar, puedeRegistrarDictamenCliente, validarDictamenCliente, validarDocumentoDictamen,
} from '@/domain/liberacion'
import { ETIQUETA_ROL, ROLES_DE_PERSONAL, esPersonal, puede } from '@/domain/permisos'

describe('dictamen del DT del cliente', () => {
  const ok = { liberada: 80, rechazada: 20, fechaDictamen: '2026-10-16' }
  it('acepta cantidades que caben en lo que espera decisión; puede cubrir solo una parte', () => {
    expect(validarDictamenCliente(ok, 100)).toEqual({ ok: true, liberada: 80, rechazada: 20 })
    expect(validarDictamenCliente({ ...ok, liberada: '30', rechazada: '' }, 100)).toEqual({ ok: true, liberada: 30, rechazada: 0 })
  })
  it('no libera ni rechaza más de lo que hay, ni cero, ni decimales', () => {
    expect(validarDictamenCliente({ ...ok, liberada: 90 }, 100)).toMatchObject({ ok: false, mensaje: expect.stringContaining('suman 110, pero solo hay 100') })
    expect(validarDictamenCliente({ ...ok, liberada: 0, rechazada: 0 }, 100)).toMatchObject({ ok: false, mensaje: expect.stringContaining('al menos una unidad') })
    expect(validarDictamenCliente({ ...ok, liberada: 1.5 }, 100)).toMatchObject({ ok: false })
    expect(validarDictamenCliente({ ...ok, rechazada: -2 }, 100)).toMatchObject({ ok: false })
  })
  it('pide la fecha del documento', () => expect(validarDictamenCliente({ ...ok, fechaDictamen: '' }, 100)).toMatchObject({ ok: false, errores: { fechaDictamen: expect.any(String) } }))
  it('el acta queda Aprobada si se liberó algo; si todo se rechazó, va a Bajas/Rechazados', () => {
    expect(decisionTrasDictamenes(80)).toBe('APROBADO')
    expect(decisionTrasDictamenes(0)).toBe('BAJAS_RECHAZADOS')
  })
})

describe('documento adjunto', () => {
  it('PDF o imagen de hasta 10 MB', () => {
    expect(validarDocumentoDictamen({ name: 'd.pdf', type: 'application/pdf', size: 2000 })).toBeNull()
    expect(validarDocumentoDictamen({ name: 'd.png', type: 'image/png', size: 2000 })).toBeNull()
    expect(validarDocumentoDictamen({ name: 'd.jpg', type: 'image/jpeg', size: 2000 })).toBeNull()
    expect(validarDocumentoDictamen(null)).toMatch(/Adjunta/)
    expect(validarDocumentoDictamen({ name: 'd.docx', type: 'application/msword', size: 10 })).toMatch(/PDF o una imagen/)
    expect(validarDocumentoDictamen({ name: 'd.pdf', type: 'application/pdf', size: MAX_BYTES_DICTAMEN + 1 })).toMatch(/10 MB/)
  })
})

describe('permisos de liberación', () => {
  it('Sandra y Katia registran el dictamen del cliente; nadie más del personal', () => {
    for (const r of ['asistente_dt', 'direccion_tecnica'] as const) expect(puedeRegistrarDictamenCliente([r]), r).toBe(true)
    for (const r of ['jefe_almacen', 'jefe_transporte', 'auxiliar', 'auditoria_lectura'] as const) expect(puedeRegistrarDictamenCliente([r]), r).toBe(false)
  })
  it('la observación de un producto de Logissa es de Katia; la de un producto de cliente la registran Sandra o Katia', () => {
    expect(puedeObservar(['direccion_tecnica'], false)).toBe(true)
    expect(puedeObservar(['asistente_dt'], false)).toBe(false)
    expect(puedeObservar(['asistente_dt'], true)).toBe(true)
  })
  it('marcar un producto con antecedentes de calidad es solo de Dirección Técnica', () => {
    expect(puedeMarcarAntecedentes(['direccion_tecnica'])).toBe(true)
    for (const r of ['asistente_dt', 'jefe_almacen', 'auxiliar'] as const) expect(puedeMarcarAntecedentes([r])).toBe(false)
  })
  it('«DT de cliente»: un único permiso, no es personal y no ve el inventario (deshabilitado hasta SEC1)', () => {
    expect(ETIQUETA_ROL.dt_cliente).toBe('DT de cliente')
    expect(puede(['dt_cliente'], 'liberar_stock_propietario')).toBe(true)
    for (const a of ['ver', 'ejecutar', 'verificar', 'aprobar', 'ajustar', 'registrar_dictamen_cliente', 'originar_retorno', 'reservar_lote'] as const) expect(puede(['dt_cliente'], a), a).toBe(false)
    expect(ROLES_DE_PERSONAL).not.toContain('dt_cliente')
    expect(esPersonal(['dt_cliente'])).toBe(false)
  })
})
