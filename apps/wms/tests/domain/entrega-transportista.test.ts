// SA-6: la entrega al transportista del cliente (tipo B). Mismas palabras que `wms.registrar_entrega_transportista_cliente`.
import { describe, expect, it } from 'vitest'
import { puedeEntregarAlTransportistaCliente, tipoContenidoCargo, validarArchivoCargo, validarEntrega, type EntradaEntrega } from '@/domain/entrega-transportista'

const AHORA = '2026-10-20T15:00:00Z'
const base: EntradaEntrega = { salidaId: 's1', transportista: 'Transportes Andes SAC', placa: 'ABC-123', hora: '2026-10-20T14:30:00Z', entregaAlmacen: 'Charlie' }

describe('quién entrega al transportista del cliente', () => {
  it('el Jefe de Transporte y el Jefe de Almacén; nadie más', () => {
    expect(puedeEntregarAlTransportistaCliente(['jefe_transporte'])).toBe(true)
    expect(puedeEntregarAlTransportistaCliente(['jefe_almacen'])).toBe(true)
    for (const r of ['auxiliar', 'direccion_tecnica', 'asistente_dt', 'conformidad_despacho', 'autoriza_salidas_sin_venta', 'auditoria_lectura'] as const) expect(puedeEntregarAlTransportistaCliente([r]), r).toBe(false)
  })
})

describe('validar la entrega', () => {
  it('una entrega completa no tiene errores; basta la placa o el DNI', () => {
    expect(validarEntrega(base, AHORA)).toEqual({})
    expect(validarEntrega({ ...base, placa: undefined, documento: '40123456' }, AHORA)).toEqual({})
  })
  it('pide nombre, placa o DNI, DNI de 8 números, hora que no sea futura y quién entrega por el almacén', () => {
    expect(validarEntrega({ ...base, transportista: ' ' }, AHORA).transportista).toBe('Escribe el nombre del transportista (o de quien recoge)')
    expect(validarEntrega({ ...base, placa: ' ' }, AHORA).placa).toBe('Escribe la placa del vehículo o el DNI de quien recoge')
    expect(validarEntrega({ ...base, placa: undefined, documento: '1234' }, AHORA).documento).toBe('El DNI tiene 8 números')
    expect(validarEntrega({ ...base, hora: '' }, AHORA).hora).toBe('Indica la hora de la entrega')
    expect(validarEntrega({ ...base, hora: '2026-10-20T16:00:00Z' }, AHORA).hora).toBe('La hora de la entrega no puede ser futura')
    expect(validarEntrega({ ...base, hora: '2026-10-20T15:03:00Z' }, AHORA).hora).toBeUndefined()   // 5 minutos de tolerancia
    expect(validarEntrega({ ...base, entregaAlmacen: '' }, AHORA).entregaAlmacen).toBe('Escribe quién entrega por parte del almacén')
  })
})

describe('el cargo (foto o PDF, opcional)', () => {
  it('acepta PDF, JPG y PNG hasta 10 MB', () => {
    expect(validarArchivoCargo('cargo.pdf', 1000)).toBeNull()
    expect(validarArchivoCargo('FOTO.JPG', 1000)).toBeNull()
    expect(validarArchivoCargo('foto.png', 1000)).toBeNull()
    expect(validarArchivoCargo('cargo.doc', 1000)).toMatch(/foto \(JPG o PNG\) o PDF/)
    expect(validarArchivoCargo('cargo.pdf', 0)).toMatch(/vacío/)
    expect(validarArchivoCargo('cargo.pdf', 11 * 1024 * 1024)).toMatch(/10 MB/)
  })
  it('el tipo de contenido sale de la extensión', () => {
    expect([tipoContenidoCargo('a.pdf'), tipoContenidoCargo('a.PNG'), tipoContenidoCargo('a.jpeg')]).toEqual(['application/pdf', 'image/png', 'image/jpeg'])
  })
})
