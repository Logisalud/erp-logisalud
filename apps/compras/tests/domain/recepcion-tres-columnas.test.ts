import { describe, expect, it } from 'vitest'
import {
  clasificarTresColumnas, mensajeDeLinea, mensajePendienteDeCierre,
  pendienteDeCierre, puedeCerrarseAhora, totalizarRecepcion,
  validarRecepcionTresColumnas, type LineaTresColumnas,
} from '@/domain/recepcion-tres-columnas'

const linea = (over: Partial<LineaTresColumnas> = {}): LineaTresColumnas => ({
  ocItemId: 'i1',
  cantidadPedida: 100,
  precioUnitario: 10,
  cantidadFactura: 100,
  cantidadFisica: 100,
  observaciones: null,
  ...over,
})

describe('los dos ejes son distintos y no se confunden', () => {
  it('todo igual: conforme, sin discrepancia', () => {
    const c = clasificarTresColumnas(linea())
    expect(c.caso).toBe('conforme')
    expect(c.hayDiscrepanciaFacturaFisico).toBe(false)
    expect(c.baseLinea).toBe(1000)
  })

  it('entrega parcial NO es discrepancia: la factura cubre menos que la OC', () => {
    // OC pide 100, factura 30, llegaron las 30. El resto llega en otra guía.
    const c = clasificarTresColumnas(linea({ cantidadFactura: 30, cantidadFisica: 30 }))
    expect(c.caso).toBe('entrega_parcial')
    expect(c.hayDiscrepanciaFacturaFisico).toBe(false)
    expect(c.saldoPorRecibir).toBe(70)
    // Y la base es lo FACTURADO, no lo pedido.
    expect(c.baseLinea).toBe(300)
  })

  it('CASO A: llegó menos de lo facturado → nota de crédito', () => {
    const c = clasificarTresColumnas(linea({ cantidadFactura: 100, cantidadFisica: 98 }))
    expect(c.caso).toBe('caso_a')
    expect(c.hayDiscrepanciaFacturaFisico).toBe(true)
    expect(c.unidadesPorNotaCredito).toBe(2)
    // La base sigue siendo lo FACTURADO: se debe 100 hasta que llegue la NC.
    expect(c.baseLinea).toBe(1000)
  })

  it('CASO B: llegó más de lo facturado → el proveedor debe facturar', () => {
    const c = clasificarTresColumnas(linea({ cantidadFactura: 100, cantidadFisica: 105 }))
    expect(c.caso).toBe('caso_b')
    expect(c.excedenteSinFacturar).toBe(5)
    // Se paga lo facturado, que es correcto.
    expect(c.baseLinea).toBe(1000)
  })

  it('parcial Y faltante a la vez: manda el faltante, que es el que cuesta plata', () => {
    // OC 100, factura 30, llegaron 28.
    const c = clasificarTresColumnas(linea({ cantidadFactura: 30, cantidadFisica: 28 }))
    expect(c.caso).toBe('caso_a')
    expect(c.unidadesPorNotaCredito).toBe(2)
    // El saldo de la OC se sigue informando igual.
    expect(c.saldoPorRecibir).toBe(70)
  })

  it('una línea bonificada aporta 0 a la base sin ser discrepancia', () => {
    const c = clasificarTresColumnas(linea({ precioUnitario: 0 }))
    expect(c.caso).toBe('conforme')
    expect(c.baseLinea).toBe(0)
  })
})

describe('totales: IGV automático, nunca transcrito', () => {
  it('suma las bases y aplica 18%', () => {
    const t = totalizarRecepcion([
      linea({ ocItemId: 'a', cantidadFactura: 10, cantidadFisica: 10, precioUnitario: 100 }),
      linea({ ocItemId: 'b', cantidadFactura: 5, cantidadFisica: 5, precioUnitario: 200 }),
    ])
    expect(t.base).toBe(2000)
    expect(t.igv).toBe(360)
    expect(t.total).toBe(2360)
  })

  it('cuenta las líneas con discrepancia — el número que va al lado del botón', () => {
    const t = totalizarRecepcion([
      linea({ ocItemId: 'ok' }),
      linea({ ocItemId: 'falta', cantidadFisica: 98, observaciones: 'roto' }),
      linea({ ocItemId: 'parcial', cantidadFactura: 30, cantidadFisica: 30 }),
    ])
    expect(t.lineasConDiscrepancia).toBe(1)
    expect(t.lineasConEntregaParcial).toBe(1)
  })

  it('un solo Caso A bloquea la obligación entera esperando NC', () => {
    const t = totalizarRecepcion([
      linea({ ocItemId: 'a' }), linea({ ocItemId: 'b' }),
      linea({ ocItemId: 'c', cantidadFisica: 99, observaciones: 'x' }),
    ])
    expect(t.esperaNotaCredito).toBe(true)
  })

  it('Caso B NO bloquea: marca excedente pero la obligación es pagable', () => {
    const t = totalizarRecepcion([linea({ cantidadFisica: 105, observaciones: 'x' })])
    expect(t.esperaNotaCredito).toBe(false)
    expect(t.tieneExcedenteSinFacturar).toBe(true)
  })

  it('una recepción vacía no revienta', () => {
    expect(totalizarRecepcion([]).total).toBe(0)
  })
})

describe('validación', () => {
  const base = {
    fechaRecepcion: '2026-09-18',
    guias: [{ numero: 'G-001', storagePath: 'ruta/guia.pdf' }],
    numeroFactura: 'F001-123',
    storagePathFactura: 'ruta/factura.pdf',
    lineas: [linea()],
  }

  it('un borrador completo y conforme pasa', () => {
    expect(validarRecepcionTresColumnas(base)).toEqual([])
  })

  it('la factura es obligatoria: llega junto con las guías', () => {
    const sinFactura = validarRecepcionTresColumnas({ ...base, storagePathFactura: null })
    expect(sinFactura.map((e) => e.campo)).toContain('archivoFactura')
  })

  it('exige el número de factura', () => {
    expect(validarRecepcionTresColumnas({ ...base, numeroFactura: '' })
      .map((e) => e.campo)).toContain('numeroFactura')
  })

  it('sin ninguna guía completa no pasa', () => {
    expect(validarRecepcionTresColumnas({ ...base, guias: [] })
      .map((e) => e.campo)).toContain('guias')
    expect(validarRecepcionTresColumnas({ ...base, guias: [{ numero: '  ', storagePath: null }] })
      .map((e) => e.campo)).toContain('guias')
  })

  it('una guía con número pero SIN archivo se reclama, no se ignora', () => {
    const errores = validarRecepcionTresColumnas({
      ...base,
      guias: [{ numero: 'G-001', storagePath: 'ruta/1.pdf' }, { numero: 'G-002', storagePath: null }],
    })
    expect(errores.map((e) => e.campo)).toContain('guia-1-archivo')
    expect(errores[0].mensaje).toContain('G-002')
  })

  it('un archivo subido SIN número también se reclama', () => {
    const errores = validarRecepcionTresColumnas({
      ...base,
      guias: [{ numero: 'G-001', storagePath: 'ruta/1.pdf' }, { numero: '', storagePath: 'ruta/2.pdf' }],
    })
    expect(errores.map((e) => e.campo)).toContain('guia-1-numero')
  })

  it('dos guías con el mismo número es un error de tipeo, no un caso real', () => {
    const errores = validarRecepcionTresColumnas({
      ...base,
      guias: [
        { numero: 'G-001', storagePath: 'ruta/1.pdf' },
        { numero: 'G-001', storagePath: 'ruta/2.pdf' },
      ],
    })
    expect(errores.map((e) => e.campo)).toContain('guias')
  })

  it('varias guías, cada una con SU archivo, y una sola factura es válido', () => {
    expect(validarRecepcionTresColumnas({
      ...base,
      guias: [
        { numero: 'G-001', storagePath: 'ruta/1.pdf' },
        { numero: 'G-002', storagePath: 'ruta/2.pdf' },
      ],
    })).toEqual([])
  })

  it('observaciones OBLIGATORIA cuando hay discrepancia factura↔físico', () => {
    const errores = validarRecepcionTresColumnas({
      ...base, lineas: [linea({ cantidadFisica: 98 })],
    })
    expect(errores.map((e) => e.campo)).toContain('observaciones-i1')
  })

  it('pero NO se pide en una entrega parcial: no hay nada que explicar', () => {
    expect(validarRecepcionTresColumnas({
      ...base, lineas: [linea({ cantidadFactura: 30, cantidadFisica: 30 })],
    })).toEqual([])
  })

  it('facturar más de lo que pidió la OC se rechaza: la factura no corresponde', () => {
    const errores = validarRecepcionTresColumnas({
      ...base, lineas: [linea({ cantidadFactura: 150, cantidadFisica: 150, observaciones: 'x' })],
    })
    expect(errores[0].mensaje).toContain('No se puede facturar más de lo pedido')
  })

  it('cantidades negativas se rechazan', () => {
    const errores = validarRecepcionTresColumnas({
      ...base, lineas: [linea({ cantidadFisica: -1, observaciones: 'x' })],
    })
    expect(errores.map((e) => e.campo)).toContain('linea-i1')
  })

  it('sin ninguna cantidad no hay nada que recibir', () => {
    const errores = validarRecepcionTresColumnas({
      ...base, lineas: [linea({ cantidadFactura: 0, cantidadFisica: 0 })],
    })
    expect(errores.map((e) => e.campo)).toContain('lineas')
  })
})

describe('el mensaje de la fila dice la CONSECUENCIA, no solo el número', () => {
  it('Caso A nombra la nota de crédito', () => {
    const m = mensajeDeLinea(linea({ cantidadFisica: 98 }))
    expect(m?.tono).toBe('alerta')
    expect(m?.texto).toContain('nota de crédito')
  })

  it('Caso B dice que el proveedor tiene que facturar', () => {
    const m = mensajeDeLinea(linea({ cantidadFisica: 105 }))
    expect(m?.tono).toBe('alerta')
    expect(m?.texto).toContain('facturar la diferencia')
  })

  it('la entrega parcial es INFO, no alerta — el tono las distingue', () => {
    const m = mensajeDeLinea(linea({ cantidadFactura: 30, cantidadFisica: 30 }))
    expect(m?.tono).toBe('info')
    expect(m?.texto).toContain('No bloquea nada')
  })

  it('una línea conforme no dice nada', () => {
    expect(mensajeDeLinea(linea())).toBeNull()
  })
})

describe('qué falta para cerrar la OC (después de recibir, nunca antes)', () => {
  it('todo recibido y sin diferencias → cerrable', () => {
    const p = pendienteDeCierre([linea()])
    expect(p.estado).toBe('cerrable_sin_saldo')
    expect(puedeCerrarseAhora(p)).toBe(true)
  })

  it('entrega parcial → pendiente de cerrar, con el saldo exacto', () => {
    const p = pendienteDeCierre([
      linea({ ocItemId: 'a', cantidadPedida: 100, cantidadFactura: 30, cantidadFisica: 30 }),
      linea({ ocItemId: 'b', cantidadPedida: 50, cantidadFactura: 20, cantidadFisica: 20 }),
    ])
    expect(p.estado).toBe('pendiente_de_cerrar')
    if (p.estado !== 'pendiente_de_cerrar') return
    expect(p.unidadesPorRecibir).toBe(100)  // 70 + 30
    expect(p.lineasConSaldo).toBe(2)
    // Charlie SÍ puede cerrarla: el proveedor no siempre completa.
    expect(puedeCerrarseAhora(p)).toBe(true)
  })

  it('Caso A tiene PRECEDENCIA sobre el saldo: primero la NC', () => {
    const p = pendienteDeCierre([
      linea({ ocItemId: 'a', cantidadPedida: 100, cantidadFactura: 30, cantidadFisica: 28 }),
    ])
    expect(p.estado).toBe('espera_nota_credito')
    // Y NO se puede cerrar hasta que Contabilidad la suba: cerrarla dejaría
    // la obligación colgada sin nadie mirándola.
    expect(puedeCerrarseAhora(p)).toBe(false)
  })

  it('el mensaje dice QUIÉN tiene que hacer qué', () => {
    expect(mensajePendienteDeCierre(pendienteDeCierre([linea({ cantidadFisica: 98 })])))
      .toContain('Contabilidad')
    expect(mensajePendienteDeCierre(pendienteDeCierre([
      linea({ cantidadPedida: 100, cantidadFactura: 30, cantidadFisica: 30 }),
    ]))).toContain('quedan 70 unidades')
  })

  it('Caso B no impide cerrar: lo facturado es correcto', () => {
    const p = pendienteDeCierre([linea({ cantidadFisica: 105 })])
    expect(puedeCerrarseAhora(p)).toBe(true)
  })
})
