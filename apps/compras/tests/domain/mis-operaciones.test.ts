import { describe, expect, it } from 'vitest'
import {
  estadoDeOC,
  estadoDeOS,
  estadoDePagoDirecto,
  estadoDeSolicitud,
  estadoPagoDeObligaciones,
  ordenarPorFechaDesc,
  voucherDeOperacion,
  type FilaOperacion,
} from '@/domain/mis-operaciones'

describe('estadoPagoDeObligaciones', () => {
  it('sin obligaciones todavía (nadie facturó) es "no", nunca "parcial"', () => {
    expect(estadoPagoDeObligaciones([])).toBe('no')
  })

  it('una sola obligación pagada es "si"', () => {
    expect(estadoPagoDeObligaciones(['pagada'])).toBe('si')
  })

  it('cerrada cuenta como pagada — viene después de pagada, no antes', () => {
    expect(estadoPagoDeObligaciones(['cerrada'])).toBe('si')
  })

  it('una OC con dos facturas, una pagada y otra no, es "parcial"', () => {
    expect(estadoPagoDeObligaciones(['pagada', 'conforme'])).toBe('parcial')
  })

  it('todas las facturas pagadas es "si" aunque sean varias', () => {
    expect(estadoPagoDeObligaciones(['pagada', 'cerrada'])).toBe('si')
  })

  it('ninguna pagada es "no"', () => {
    expect(estadoPagoDeObligaciones(['registrada', 'conforme'])).toBe('no')
  })
})

describe('voucherDeOperacion', () => {
  it('sin pagos no ofrece nada', () => {
    expect(voucherDeOperacion([], '/ordenes-compra/1')).toEqual({ tipo: 'ninguno' })
  })

  it('un pago con archivo enlaza el archivo real', () => {
    expect(voucherDeOperacion([{ storagePath: '2026/09/OC-1/v.pdf' }], '/ordenes-compra/1')).toEqual({
      tipo: 'archivo',
      storagePath: '2026/09/OC-1/v.pdf',
    })
  })

  it('pagado pero sin archivo (la subida es best-effort) lo dice, no muestra un link muerto', () => {
    expect(voucherDeOperacion([{ storagePath: null }], '/ordenes-compra/1')).toEqual({ tipo: 'sin_adjunto' })
  })

  it('con varios pagos manda al detalle en vez de elegir un voucher "principal"', () => {
    const varios = [{ storagePath: 'a.pdf' }, { storagePath: 'b.pdf' }]
    expect(voucherDeOperacion(varios, '/ordenes-compra/1')).toEqual({
      tipo: 'varios',
      href: '/ordenes-compra/1',
    })
  })
})

describe('estadoDeOC', () => {
  it('muestra los estados reales de la OC, no el vocabulario de aprobación', () => {
    expect(estadoDeOC('borrador')).toEqual({ texto: 'Borrador', tono: 'neutro' })
    expect(estadoDeOC('enviada')).toEqual({ texto: 'Enviada al proveedor', tono: 'neutro' })
  })

  it('nunca dice "Rechazado" — una OC no tiene ese desenlace en su modelo', () => {
    const todas = (['borrador', 'enviada', 'confirmada', 'parcialmente_recibida',
      'recibida_completa', 'facturada', 'cerrada', 'anulada'] as const)
      .map((e) => estadoDeOC(e))
    expect(todas.some((r) => r.tono === 'rechazado')).toBe(false)
    expect(todas.some((r) => r.texto.toLowerCase().includes('rechaz'))).toBe(false)
  })

  it('anulada sí es un desenlace real de una OC', () => {
    expect(estadoDeOC('anulada')).toEqual({ texto: 'Anulada', tono: 'anulado' })
  })
})

describe('estadoDeOS', () => {
  it('pendiente_jefe es lo único "pendiente de aprobación"', () => {
    expect(estadoDeOS('pendiente_jefe')).toEqual({ texto: 'Pendiente de aprobación', tono: 'pendiente' })
  })
  it('el rechazo del jefe se muestra como rechazo', () => {
    expect(estadoDeOS('rechazada_jefe')).toEqual({ texto: 'Rechazada', tono: 'rechazado' })
  })
  it('anulada y aprobada son desenlaces distintos', () => {
    expect(estadoDeOS('anulada').tono).toBe('anulado')
    expect(estadoDeOS('conformada').tono).toBe('aprobado')
  })
})

describe('estadoDePagoDirecto', () => {
  it('antes de la conformidad está pendiente de aprobación', () => {
    expect(estadoDePagoDirecto('pendiente_factura').tono).toBe('pendiente')
    expect(estadoDePagoDirecto('registrada').tono).toBe('pendiente')
    expect(estadoDePagoDirecto('observada').tono).toBe('pendiente')
  })
  it('desde la conformidad en adelante está aprobado', () => {
    expect(estadoDePagoDirecto('conforme').tono).toBe('aprobado')
    expect(estadoDePagoDirecto('pagada').tono).toBe('aprobado')
  })
  it('rechazado y anulado son desenlaces distintos entre sí (0043)', () => {
    expect(estadoDePagoDirecto('rechazada')).toEqual({ texto: 'Rechazado', tono: 'rechazado' })
    expect(estadoDePagoDirecto('anulada')).toEqual({ texto: 'Anulado', tono: 'anulado' })
  })
})

describe('estadoDeSolicitud', () => {
  it('un anticipo/reembolso rechazado por Contabilidad se ve como rechazado', () => {
    expect(estadoDeSolicitud('rechazada_contabilidad')).toEqual({ texto: 'Rechazada', tono: 'rechazado' })
  })

  it('nunca dice "Anulado" — en solicitudes_gasto no existe ese estado, cortar es rechazar', () => {
    const todas = (['pendiente_jefe', 'rechazada_jefe', 'pendiente_contabilidad',
      'rechazada_contabilidad', 'aprobada', 'pagada', 'pendiente_rendicion',
      'rendida', 'cerrada'] as const).map((e) => estadoDeSolicitud(e))
    expect(todas.some((r) => r.tono === 'anulado')).toBe(false)
  })

  it('pagada y pendiente de rendir siguen siendo "aprobada" — lo pagado lo dice la columna ¿Pagado?', () => {
    expect(estadoDeSolicitud('pagada').tono).toBe('aprobado')
    expect(estadoDeSolicitud('pendiente_rendicion').tono).toBe('aprobado')
  })
})

describe('ordenarPorFechaDesc', () => {
  it('mezcla los cuatro orígenes por fecha, más reciente primero', () => {
    const fila = (codigo: string, fechaCreacion: string): FilaOperacion => ({
      id: codigo, tipo: 'os', codigo, fechaCreacion, referencia: null, monto: 0, moneda: 'PEN',
      estadoTexto: 'Aprobada', estadoTono: 'aprobado', motivoCorte: null, proximoPaso: '',
      pagado: 'no', voucher: { tipo: 'ninguno' }, href: '/',
    })
    const ordenadas = ordenarPorFechaDesc([
      fila('B', '2026-09-01T10:00:00Z'),
      fila('A', '2026-09-10T10:00:00Z'),
      fila('C', '2026-08-01T10:00:00Z'),
    ])
    expect(ordenadas.map((f) => f.codigo)).toEqual(['A', 'B', 'C'])
  })
})
