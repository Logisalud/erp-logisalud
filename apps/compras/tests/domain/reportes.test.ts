import { describe, expect, it } from 'vitest'
import {
  bucketAntiguedad,
  diasVencido,
  esObligacionAbierta,
  estadoPagoSabana,
  estadoYSaldoSabana,
  porcentajeRecibidoOC,
  saldoPendiente,
} from '@/domain/reportes'

describe('diasVencido', () => {
  it('es null sin fecha de vencimiento', () => {
    expect(diasVencido(null, '2026-08-29')).toBeNull()
  })
  it('es positivo cuando ya venció', () => {
    expect(diasVencido('2026-08-01', '2026-08-29')).toBe(28)
  })
  it('es negativo cuando todavía no vence', () => {
    expect(diasVencido('2026-09-10', '2026-08-29')).toBe(-12)
  })
  it('es 0 el día que vence', () => {
    expect(diasVencido('2026-08-29', '2026-08-29')).toBe(0)
  })
})

describe('bucketAntiguedad', () => {
  it('sin fecha o no vencida todavía cae en por_vencer', () => {
    expect(bucketAntiguedad(null)).toBe('por_vencer')
    expect(bucketAntiguedad(-5)).toBe('por_vencer')
    expect(bucketAntiguedad(0)).toBe('por_vencer')
  })
  it('clasifica los buckets 1-30/31-60/61-90/+90', () => {
    expect(bucketAntiguedad(1)).toBe('dias_1_30')
    expect(bucketAntiguedad(30)).toBe('dias_1_30')
    expect(bucketAntiguedad(31)).toBe('dias_31_60')
    expect(bucketAntiguedad(60)).toBe('dias_31_60')
    expect(bucketAntiguedad(61)).toBe('dias_61_90')
    expect(bucketAntiguedad(90)).toBe('dias_61_90')
    expect(bucketAntiguedad(91)).toBe('mas_90')
  })
})

describe('esObligacionAbierta', () => {
  it('registrada/observada/conforme/en_propuesta están abiertas', () => {
    expect(esObligacionAbierta('registrada')).toBe(true)
    expect(esObligacionAbierta('observada')).toBe(true)
    expect(esObligacionAbierta('conforme')).toBe(true)
    expect(esObligacionAbierta('en_propuesta')).toBe(true)
  })
  it('pagada/cerrada/canjeada_por_letra no están abiertas', () => {
    expect(esObligacionAbierta('pagada')).toBe(false)
    expect(esObligacionAbierta('cerrada')).toBe(false)
    expect(esObligacionAbierta('canjeada_por_letra')).toBe(false)
  })
})

describe('estadoPagoSabana / saldoPendiente', () => {
  it('sin nada pagado es pendiente', () => {
    expect(estadoPagoSabana(1000, 0)).toBe('pendiente')
    expect(saldoPendiente(1000, 0)).toBe(1000)
  })
  it('con algo pagado pero no todo es parcial', () => {
    expect(estadoPagoSabana(1000, 400)).toBe('parcial')
    expect(saldoPendiente(1000, 400)).toBe(600)
  })
  it('pagado completo (o de más) es pagado, saldo nunca negativo', () => {
    expect(estadoPagoSabana(1000, 1000)).toBe('pagado')
    expect(saldoPendiente(1000, 1000)).toBe(0)
    expect(estadoPagoSabana(1000, 1200)).toBe('pagado')
    expect(saldoPendiente(1000, 1200)).toBe(0)
  })
})

describe('estadoYSaldoSabana', () => {
  it('una obligación canjeada_por_letra es "canjeada" con saldo 0, aunque nunca se le aplicó un pago', () => {
    expect(estadoYSaldoSabana('canjeada_por_letra', 1000, 0)).toEqual({ estado: 'canjeada', saldo: 0 })
  })
  it('cualquier otro estado sigue el cálculo normal de estadoPagoSabana/saldoPendiente', () => {
    expect(estadoYSaldoSabana('registrada', 1000, 0)).toEqual({ estado: 'pendiente', saldo: 1000 })
    expect(estadoYSaldoSabana('conforme', 1000, 400)).toEqual({ estado: 'parcial', saldo: 600 })
    expect(estadoYSaldoSabana('pagada', 1000, 1000)).toEqual({ estado: 'pagado', saldo: 0 })
  })
})

describe('porcentajeRecibidoOC', () => {
  it('0% sin líneas o sin nada pedido', () => {
    expect(porcentajeRecibidoOC([])).toBe(0)
  })
  it('calcula el % sobre el total pedido de todas las líneas', () => {
    expect(
      porcentajeRecibidoOC([
        { cantidadPedida: 100, cantidadRecibida: 50 },
        { cantidadPedida: 100, cantidadRecibida: 100 },
      ])
    ).toBe(75)
  })
  it('no cuenta de más si llegó más de lo pedido en una línea', () => {
    expect(porcentajeRecibidoOC([{ cantidadPedida: 100, cantidadRecibida: 150 }])).toBe(100)
  })
})
