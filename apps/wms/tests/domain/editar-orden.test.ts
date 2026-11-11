import { describe, expect, it } from 'vitest'
import { MOTIVO_CON_GUIA, MOTIVO_CON_PICKING, MOTIVO_DE_PEDIDO, puedeEditarOrden, reglasDeEdicion, validarCambiosOrden } from '@/domain/editar-orden'

const manual = { estado: 'ABIERTA' as const, creadaDesde: 'MANUAL' as const, origen: 'MANUAL' as const, conPedido: false, clienteManual: { ruc: '20123456789', razonSocial: 'Botica', direccion: 'Av. 1', ubigeo: '150101' } }

describe('editar la orden (reglas por origen y etapa)', () => {
  it('lo edita quien prepara salidas (jefes y administrador), no el auxiliar', () => {
    expect(puedeEditarOrden(['jefe_almacen'])).toBe(true); expect(puedeEditarOrden(['jefe_transporte'])).toBe(true); expect(puedeEditarOrden(['admin_wms'])).toBe(true)
    expect(puedeEditarOrden(['auxiliar'])).toBe(false); expect(puedeEditarOrden(['conductor'])).toBe(false)
  })
  it('una orden manual antes del picking admite todo: nota, destinatario y cantidades', () => {
    expect(reglasDeEdicion(manual, ['jefe_almacen'])).toEqual({ editable: true, nota: true, estructura: true, motivoSinEstructura: null })
  })
  it('una orden de un pedido (o manual con pedido unido) solo admite la nota; el motivo lo explica', () => {
    for (const s of [{ ...manual, creadaDesde: 'BANDEJA' as const }, { ...manual, creadaDesde: 'RUTA' as const }, { ...manual, conPedido: true }, { ...manual, clienteManual: undefined }])
      expect(reglasDeEdicion(s, ['jefe_almacen'])).toEqual({ editable: true, nota: true, estructura: false, motivoSinEstructura: MOTIVO_DE_PEDIDO })
  })
  it('con el picking empezado o con guía solo la nota; una orden cerrada o sin permiso, nada', () => {
    expect(reglasDeEdicion({ ...manual, ordenPickingId: 'o1' }, ['jefe_almacen'])).toMatchObject({ nota: true, estructura: false, motivoSinEstructura: MOTIVO_CON_PICKING })
    expect(reglasDeEdicion({ ...manual, guia: 'TTT1-00000001' }, ['jefe_almacen'])).toMatchObject({ nota: true, estructura: false, motivoSinEstructura: MOTIVO_CON_GUIA })
    expect(reglasDeEdicion({ ...manual, estado: 'CANCELADA' }, ['jefe_almacen'])).toEqual({ editable: false, nota: false, estructura: false, motivoSinEstructura: null })
    expect(reglasDeEdicion(manual, ['auxiliar'])).toMatchObject({ editable: false, nota: false, estructura: false })
  })
})

describe('validación de los cambios', () => {
  it('nota corta, cantidades enteras desde 1, RUC o DNI, ubigeo de 6 y motivo para destinatario o líneas', () => {
    expect(validarCambiosOrden({ nota: 'Llamar antes' }, undefined)).toEqual({})
    expect(validarCambiosOrden({ nota: 'x'.repeat(501) }, undefined)).toHaveProperty('nota')
    expect(validarCambiosOrden({ lineas: [{ lineaId: 'l1', cantidad: 0 }] }, 'Cambio de pedido')).toHaveProperty('lineas')
    expect(validarCambiosOrden({ lineas: [{ lineaId: 'l1', cantidad: 2.5 }] }, 'Cambio de pedido')).toHaveProperty('lineas')
    expect(validarCambiosOrden({ lineas: [{ lineaId: 'l1', cantidad: 5 }] }, ' ')).toHaveProperty('motivo')
    expect(validarCambiosOrden({ lineas: [{ lineaId: 'l1', cantidad: 5 }] }, 'El cliente pidió menos')).toEqual({})
    expect(validarCambiosOrden({ destinatario: { ruc: '123' } }, 'RUC corregido')).toHaveProperty('ruc')
    expect(validarCambiosOrden({ destinatario: { ruc: '12345678' } }, 'Es una persona')).toEqual({})
    expect(validarCambiosOrden({ destinatario: { ubigeo: '15' } }, 'Ubigeo corregido')).toHaveProperty('ubigeo')
    expect(validarCambiosOrden({ destinatario: { razonSocial: ' ', direccion: '' } }, 'Datos borrados')).toMatchObject({ razonSocial: expect.any(String), direccion: expect.any(String) })
  })
})
