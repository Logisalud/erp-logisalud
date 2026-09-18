import { describe, it, expect } from 'vitest'
import {
  esUrgente, etiquetaDiasParaVencer, ordenarProyeccion, resolverOrden, resumenPorVentana,
  totalesPorMoneda, type FilaProyeccion,
} from '@/domain/proyeccion-pagos'

const base: FilaProyeccion = {
  id: '1',
  codigo: 'OB-0001',
  origen: 'compra',
  quien: 'Dare Nutrition',
  numeroFactura: 'F001-1',
  fechaVencimiento: '2026-09-20',
  diasVencido: -2,
  moneda: 'PEN',
  netoAPagar: 100,
  ventana: 'esta_semana',
  href: '/cuentas-por-pagar/1',
}
const fila = (p: Partial<FilaProyeccion>): FilaProyeccion => ({ ...base, ...p })

describe('etiquetaDiasParaVencer', () => {
  it('lee el signo al revés de como lo guarda diasVencido', () => {
    // diasVencido es hoy MENOS el vencimiento: positivo = ya venció.
    expect(etiquetaDiasParaVencer(-5)).toBe('En 5 días')
    expect(etiquetaDiasParaVencer(5)).toBe('Vencido hace 5 días')
  })

  it('el día de vencimiento no es "en 0 días"', () => {
    expect(etiquetaDiasParaVencer(0)).toBe('Vence hoy')
  })

  it('singulariza el día', () => {
    expect(etiquetaDiasParaVencer(-1)).toBe('En 1 día')
    expect(etiquetaDiasParaVencer(1)).toBe('Vencido hace 1 día')
  })

  it('sin fecha lo dice, no inventa un número', () => {
    expect(etiquetaDiasParaVencer(null)).toBe('sin fecha')
  })
})

describe('esUrgente', () => {
  it('vencido y vence hoy son urgentes; por vencer y sin fecha no', () => {
    expect(esUrgente(3)).toBe(true)
    expect(esUrgente(0)).toBe(true)
    expect(esUrgente(-1)).toBe(false)
    expect(esUrgente(null)).toBe(false)
  })
})

describe('resolverOrden', () => {
  it('sin parámetros ordena por vencimiento ascendente', () => {
    expect(resolverOrden(undefined, undefined)).toEqual({ columna: 'vencimiento', direccion: 'asc' })
  })

  it('una columna inventada no rompe nada: cae al orden natural', () => {
    expect(resolverOrden('lo_que_sea', 'desc')).toEqual({ columna: 'vencimiento', direccion: 'asc' })
  })

  it('respeta columna y dirección válidas', () => {
    expect(resolverOrden('monto', 'desc')).toEqual({ columna: 'monto', direccion: 'desc' })
  })
})

describe('ordenarProyeccion', () => {
  it('por vencimiento pone primero lo que vence antes', () => {
    const filas = [
      fila({ id: 'b', codigo: 'OB-B', fechaVencimiento: '2026-10-01' }),
      fila({ id: 'a', codigo: 'OB-A', fechaVencimiento: '2026-09-01' }),
    ]
    expect(ordenarProyeccion(filas, 'vencimiento', 'asc').map((f) => f.id)).toEqual(['a', 'b'])
    expect(ordenarProyeccion(filas, 'vencimiento', 'desc').map((f) => f.id)).toEqual(['b', 'a'])
  })

  it('las filas SIN fecha quedan al final en las dos direcciones', () => {
    const filas = [
      fila({ id: 'sin', codigo: 'OB-SIN', fechaVencimiento: null }),
      fila({ id: 'con', codigo: 'OB-CON', fechaVencimiento: '2026-09-01' }),
    ]
    expect(ordenarProyeccion(filas, 'vencimiento', 'asc').map((f) => f.id)).toEqual(['con', 'sin'])
    expect(ordenarProyeccion(filas, 'vencimiento', 'desc').map((f) => f.id)).toEqual(['con', 'sin'])
  })

  it('por periodo usa el orden cronológico de las ventanas, no el alfabético', () => {
    const filas = [
      fila({ id: 'd', ventana: 'despues' }),
      fila({ id: 'p', ventana: 'proximo_mes' }),
      fila({ id: 's', ventana: 'esta_semana' }),
      fila({ id: 'm', ventana: 'este_mes' }),
    ]
    expect(ordenarProyeccion(filas, 'periodo', 'asc').map((f) => f.id)).toEqual(['s', 'm', 'p', 'd'])
  })

  it('por monto agrupa primero por moneda: no compara soles contra dólares', () => {
    const filas = [
      fila({ id: 'usd-chico', moneda: 'USD', netoAPagar: 5 }),
      fila({ id: 'pen-grande', moneda: 'PEN', netoAPagar: 9000 }),
      fila({ id: 'pen-chico', moneda: 'PEN', netoAPagar: 10 }),
    ]
    const r = ordenarProyeccion(filas, 'monto', 'asc').map((f) => f.id)
    expect(r).toEqual(['pen-chico', 'pen-grande', 'usd-chico'])
  })

  it('no muta el arreglo que recibe', () => {
    const filas = [fila({ id: 'b', codigo: 'B' }), fila({ id: 'a', codigo: 'A' })]
    ordenarProyeccion(filas, 'codigo', 'asc')
    expect(filas.map((f) => f.id)).toEqual(['b', 'a'])
  })
})

describe('totalesPorMoneda', () => {
  it('no mezcla PEN con USD', () => {
    const filas = [
      fila({ moneda: 'PEN', netoAPagar: 100 }),
      fila({ moneda: 'USD', netoAPagar: 50 }),
      fila({ moneda: 'PEN', netoAPagar: 25.5 }),
    ]
    expect(totalesPorMoneda(filas)).toEqual([
      { moneda: 'PEN', total: 125.5 },
      { moneda: 'USD', total: 50 },
    ])
  })

  it('redondea a centavos en vez de arrastrar el error del punto flotante', () => {
    const filas = [fila({ netoAPagar: 0.1 }), fila({ netoAPagar: 0.2 })]
    expect(totalesPorMoneda(filas)).toEqual([{ moneda: 'PEN', total: 0.3 }])
  })

  it('sin filas no devuelve nada, no un cero inventado', () => {
    expect(totalesPorMoneda([])).toEqual([])
  })
})

describe('resumenPorVentana', () => {
  it('devuelve siempre las cuatro ventanas, incluso las vacías', () => {
    const r = resumenPorVentana([fila({ ventana: 'este_mes', netoAPagar: 300 })])
    expect(r.map((x) => x.ventana)).toEqual(['esta_semana', 'este_mes', 'proximo_mes', 'despues'])
    expect(r.find((x) => x.ventana === 'este_mes')).toEqual({
      ventana: 'este_mes',
      cantidad: 1,
      totales: [{ moneda: 'PEN', total: 300 }],
    })
    expect(r.find((x) => x.ventana === 'despues')).toEqual({
      ventana: 'despues',
      cantidad: 0,
      totales: [],
    })
  })

  it('cada ventana suma solo lo suyo y sin mezclar monedas', () => {
    const r = resumenPorVentana([
      fila({ ventana: 'esta_semana', moneda: 'PEN', netoAPagar: 100 }),
      fila({ ventana: 'esta_semana', moneda: 'USD', netoAPagar: 20 }),
      fila({ ventana: 'proximo_mes', moneda: 'PEN', netoAPagar: 7 }),
    ])
    expect(r.find((x) => x.ventana === 'esta_semana')!.totales).toEqual([
      { moneda: 'PEN', total: 100 },
      { moneda: 'USD', total: 20 },
    ])
    expect(r.find((x) => x.ventana === 'proximo_mes')!.totales).toEqual([{ moneda: 'PEN', total: 7 }])
  })
})

describe('cuotas que todavía no son obligación', () => {
  it('ordenan y suman igual que el resto: la plata se debe lo mismo', () => {
    const cuota = fila({
      id: 'cuota-letra-abc',
      codigo: 'Letra 2 — Diphasac',
      origen: 'letra_por_pagar',
      fechaVencimiento: '2026-10-09',
      netoAPagar: 1622.08,
      href: '/financiamiento/vencimientos',
      sinObligacion: true,
    })
    const obligacion = fila({ id: 'ob-1', fechaVencimiento: '2026-09-20', netoAPagar: 100 })

    expect(ordenarProyeccion([cuota, obligacion], 'vencimiento', 'asc').map((f) => f.id))
      .toEqual(['ob-1', 'cuota-letra-abc'])
    expect(totalesPorMoneda([cuota, obligacion])).toEqual([{ moneda: 'PEN', total: 1722.08 }])
  })

  it('llevan a la bandeja y no a una ficha que no existe', () => {
    const cuota = fila({ href: '/financiamiento/vencimientos', sinObligacion: true })
    expect(cuota.href).toBe('/financiamiento/vencimientos')
    expect(cuota.sinObligacion).toBe(true)
  })
})
