import { describe, expect, it } from 'vitest'
import {
  autoridadYaDecidioOS, autoridadYaDecidioPagoDirecto, autoridadYaDecidioSolicitud,
  esAutoridadFinal, puedeAnular, puedeDecidirSobre,
} from '@/domain/auto-aprobacion'

const mariela = { area: 'contabilidad', rol: 'admin' }
const beatriz = { area: 'contabilidad', rol: 'operativo' }
const sebas = { area: 'admin', rol: 'admin' }
const vendedor = { area: 'ventas', rol: 'operativo' }

describe('nadie aprueba lo suyo', () => {
  it('bloquea a quien decide sobre su propio registro', () => {
    expect(puedeDecidirSobre(beatriz, 'u1', 'u1')).toBe(false)
  })

  it('deja decidir sobre lo de otro', () => {
    expect(puedeDecidirSobre(beatriz, 'u1', 'u2')).toBe(true)
  })

  it('la autoridad final SÍ puede aprobar lo suyo — no hay nadie por encima', () => {
    expect(puedeDecidirSobre(mariela, 'u1', 'u1')).toBe(true)
    expect(puedeDecidirSobre(sebas, 'u1', 'u1')).toBe(true)
  })

  it('un registro sin creador conocido no bloquea a nadie', () => {
    expect(puedeDecidirSobre(vendedor, 'u1', null)).toBe(true)
  })

  it('Beatriz no es autoridad final aunque sea de contabilidad', () => {
    expect(esAutoridadFinal(beatriz)).toBe(false)
    expect(esAutoridadFinal(mariela)).toBe(true)
    expect(esAutoridadFinal(null)).toBe(false)
  })
})

describe('anular: creador antes, autoridad siempre', () => {
  it('el creador puede anular mientras nadie decidió', () => {
    expect(puedeAnular(false, 'u1', 'u1', false)).toBe(true)
  })

  it('el creador YA NO puede una vez que la autoridad decidió', () => {
    expect(puedeAnular(false, 'u1', 'u1', true)).toBe(false)
  })

  it('la autoridad puede en cualquier momento', () => {
    expect(puedeAnular(true, 'u9', 'u1', true)).toBe(true)
  })

  it('un tercero no puede anular lo ajeno ni antes de la decisión', () => {
    expect(puedeAnular(false, 'u2', 'u1', false)).toBe(false)
  })
})

describe('cuándo decidió la autoridad, por tipo', () => {
  it('OS: el jefe decide en pendiente_jefe', () => {
    expect(autoridadYaDecidioOS('pendiente_jefe')).toBe(false)
    expect(autoridadYaDecidioOS('aprobada')).toBe(true)
    expect(autoridadYaDecidioOS('en_ejecucion')).toBe(true)
    expect(autoridadYaDecidioOS('factura_adjunta')).toBe(true)
  })

  it('Anticipo/Reembolso: Contabilidad decide en pendiente_contabilidad', () => {
    expect(autoridadYaDecidioSolicitud('pendiente_contabilidad')).toBe(false)
    expect(autoridadYaDecidioSolicitud('aprobada')).toBe(true)
    expect(autoridadYaDecidioSolicitud('rechazada_contabilidad')).toBe(true)
  })

  it('Pago Directo: decide al dar conformidad', () => {
    expect(autoridadYaDecidioPagoDirecto('pendiente_factura')).toBe(false)
    expect(autoridadYaDecidioPagoDirecto('registrada')).toBe(false)
    expect(autoridadYaDecidioPagoDirecto('conforme')).toBe(true)
    expect(autoridadYaDecidioPagoDirecto('pagada')).toBe(true)
  })
})
