import { describe, expect, it } from 'vitest'
import {
  admiteAprobacionEnLote, cuantasEntranAlLote, estadoDelCheckbox,
  estadoDelSeleccionarTodos, etiquetaBotonLote, exigeTotalDestacado,
  MAXIMO_POR_LOTE, ordenarParaEjecutar, ORDEN_DE_EJECUCION, resumenDeLaSeleccion,
  resumirLote, totalDeLaSeleccion,
} from '@/domain/aprobacion-en-lote'
describe('qué tipos admiten lote', () => {
  it('las cuatro fuentes con aprobación simple, sí', () => {
    for (const t of ['pago_directo', 'anticipo', 'reembolso', 'caja_chica', 'os'] as const) {
      expect(admiteAprobacionEnLote(t)).toBe(true)
    }
  })

  it('las propuestas también, desde el cambio de decisión de 2026-09-14', () => {
    expect(admiteAprobacionEnLote('propuesta')).toBe(true)
  })
})

describe('el total destacado — la salvaguarda de las propuestas', () => {
  it('se destaca si hay AL MENOS UNA propuesta, aunque venga mezclada', () => {
    expect(exigeTotalDestacado([{ tipo: 'propuesta' }])).toBe(true)
    expect(exigeTotalDestacado([{ tipo: 'pago_directo' }])).toBe(false)
    expect(exigeTotalDestacado([])).toBe(false)
    // El caso peligroso del lote mezclado: UNA propuesta perdida entre
    // filas chicas es donde está casi toda la plata y la más fácil de no
    // mirar. Tiene que destacar igual.
    expect(
      exigeTotalDestacado([
        { tipo: 'pago_directo' }, { tipo: 'pago_directo' },
        { tipo: 'os' }, { tipo: 'propuesta' },
      ])
    ).toBe(true)
  })

  it('suma por moneda y NUNCA mezcla dos entre sí', () => {
    expect(
      totalDeLaSeleccion([
        { totalPorMoneda: [{ moneda: 'PEN', monto: 1000 }] },
        { totalPorMoneda: [{ moneda: 'USD', monto: 250 }] },
        { totalPorMoneda: [{ moneda: 'PEN', monto: 500.5 }] },
      ])
    ).toEqual([
      { moneda: 'PEN', monto: 1500.5 },
      { moneda: 'USD', monto: 250 },
    ])
  })

  it('un lote que mezcla monedas aporta LAS DOS, no solo la primera', () => {
    // Este es el caso que se perdía al sumar la columna Monto: una
    // propuesta con PEN y USD adentro solo muestra la primera en la fila.
    expect(
      totalDeLaSeleccion([
        { totalPorMoneda: [{ moneda: 'PEN', monto: 50000 }, { moneda: 'USD', monto: 12000 }] },
      ])
    ).toEqual([
      { moneda: 'PEN', monto: 50000 },
      { moneda: 'USD', monto: 12000 },
    ])
  })

  it('sin selección no inventa un cero', () => {
    expect(totalDeLaSeleccion([])).toEqual([])
  })
})

describe('el checkbox nunca deja llegar a una selección inválida', () => {
  const vacia = { elegidas: new Set<string>() }

  it('con nada tildado, cualquier tipo loteable se puede tildar', () => {
    expect(estadoDelCheckbox({ tipo: 'pago_directo', id: 'a' }, vacia).habilitado).toBe(true)
  })

  it('una propuesta ya se puede tildar como cualquier otro tipo', () => {
    expect(estadoDelCheckbox({ tipo: 'propuesta', id: 'p' }, vacia).habilitado).toBe(true)
  })

  it('YA SE PUEDE mezclar: con una propuesta tildada, un reembolso también entra', () => {
    // Esto es lo que cambió el 2026-09-15. Antes devolvía habilitado:false
    // con el motivo "un tipo por vez".
    const sel = { elegidas: new Set(['p']) }
    expect(estadoDelCheckbox({ tipo: 'reembolso', id: 'r' }, sel).habilitado).toBe(true)
  })

  it('ningún tipo apaga a otro, en ninguna combinación', () => {
    const sel = { elegidas: new Set(['a']) }
    for (const t of ['pago_directo', 'anticipo', 'reembolso', 'caja_chica', 'os', 'propuesta'] as const) {
      expect(estadoDelCheckbox({ tipo: t, id: `x-${t}` }, sel).habilitado).toBe(true)
    }
  })

  it('una fila YA tildada siempre se puede destildar', () => {
    const sel = { elegidas: new Set(['a']) }
    expect(estadoDelCheckbox({ tipo: 'pago_directo', id: 'a' }, sel).habilitado).toBe(true)
  })

  it('en el tope, no se puede sumar más — pero sí destildar', () => {
    const llena = new Set(Array.from({ length: MAXIMO_POR_LOTE }, (_, i) => `id-${i}`))
    const sel = { elegidas: llena }
    const r = estadoDelCheckbox({ tipo: 'pago_directo', id: 'nueva' }, sel)
    expect(r.habilitado).toBe(false)
    if (!r.habilitado) expect(r.motivo).toContain(String(MAXIMO_POR_LOTE))
    expect(estadoDelCheckbox({ tipo: 'pago_directo', id: 'id-0' }, sel).habilitado).toBe(true)
  })
})

describe('el botón dice qué va a hacer', () => {
  const n = (tipo: any, veces: number) => Array.from({ length: veces }, () => ({ tipo }))

  it('con un solo tipo lo nombra, con la cantidad', () => {
    expect(etiquetaBotonLote(n('pago_directo', 4))).toBe('Aprobar 4 Pagos Directos')
    expect(etiquetaBotonLote(n('pago_directo', 1))).toBe('Aprobar 1 Pago Directo')
    // El plural va en el sustantivo, no al final de la frase.
    expect(etiquetaBotonLote(n('os', 3))).toBe('Aprobar 3 Órdenes de Servicio')
    expect(etiquetaBotonLote(n('caja_chica', 2))).toBe('Aprobar 2 Reposiciones de Caja Chica')
  })

  it('con tipos mezclados no inventa un nombre: dice la cantidad', () => {
    expect(
      etiquetaBotonLote([{ tipo: 'pago_directo' }, { tipo: 'os' }, { tipo: 'propuesta' }])
    ).toBe('Aprobar 3 registros')
  })

  it('sin selección cae en el genérico', () => {
    expect(etiquetaBotonLote([])).toBe('Aprobar seleccionados')
  })
})

describe('resumirLote — sin transacciones, el resultado se dice como es', () => {
  it('todo bien', () => {
    expect(resumirLote([{ codigo: 'C-1', ok: true }, { codigo: 'C-2', ok: true }]))
      .toBe('Se aprobaron los 2 registros.')
  })

  it('NUNCA dice "listo" cuando fue parcial: da los números y nombra los que no', () => {
    const resumen = resumirLote([
      { codigo: 'C-1', ok: true },
      { codigo: 'C-2', ok: false, motivo: 'ya no está en espera' },
      { codigo: 'C-3', ok: true },
    ])
    expect(resumen).toContain('Se aprobaron 2 de 3')
    expect(resumen).toContain('C-2')
    expect(resumen).toContain('ya no está en espera')
  })

  it('nombra varios fallidos con "ni con"', () => {
    const resumen = resumirLote([
      { codigo: 'C-1', ok: true },
      { codigo: 'C-2', ok: false, motivo: 'x' },
      { codigo: 'C-3', ok: false, motivo: 'y' },
    ])
    expect(resumen).toContain('ni con C-3')
  })

  it('si no entró ninguno lo dice sin rodeos', () => {
    expect(resumirLote([{ codigo: 'C-1', ok: false, motivo: 'sin permiso' }]))
      .toContain('No se pudo aprobar ninguno')
  })
})


describe('"Seleccionar todos" ya no depende del filtro', () => {
  it('con "Todos" activo se habilita: tildar todo lo que hay es el caso pedido', () => {
    // Antes esto estaba APAGADO y el motivo pedía filtrar por un tipo.
    expect(estadoDelSeleccionarTodos(9).habilitado).toBe(true)
  })

  it('con filas, se habilita', () => {
    expect(estadoDelSeleccionarTodos(7).habilitado).toBe(true)
  })

  it('sin filas, no tiene nada que tildar', () => {
    const r = estadoDelSeleccionarTodos(0)
    expect(r.habilitado).toBe(false)
    if (!r.habilitado) expect(r.motivo).toContain('No hay nada')
  })

  it('el tope manda: con más visibles que el máximo, entran los primeros', () => {
    expect(cuantasEntranAlLote(7)).toBe(7)
    expect(cuantasEntranAlLote(MAXIMO_POR_LOTE)).toBe(MAXIMO_POR_LOTE)
    expect(cuantasEntranAlLote(MAXIMO_POR_LOTE + 5)).toBe(MAXIMO_POR_LOTE)
  })
})

describe('el orden de ejecución de un lote mezclado', () => {
  it('las propuestas van SIEMPRE al final', () => {
    const filas = [
      { tipo: 'propuesta' as const, id: 'p1' },
      { tipo: 'pago_directo' as const, id: 'pd1' },
      { tipo: 'propuesta' as const, id: 'p2' },
      { tipo: 'os' as const, id: 'os1' },
    ]
    expect(ordenarParaEjecutar(filas).map((f) => f.id)).toEqual(['pd1', 'os1', 'p1', 'p2'])
  })

  it('es estable dentro de cada tipo: conserva el orden de la bandeja', () => {
    const filas = [
      { tipo: 'pago_directo' as const, id: 'pd-viejo' },
      { tipo: 'pago_directo' as const, id: 'pd-nuevo' },
    ]
    expect(ordenarParaEjecutar(filas).map((f) => f.id)).toEqual(['pd-viejo', 'pd-nuevo'])
  })

  it('el orden cubre los seis tipos: ninguno queda sin posición', () => {
    for (const t of ['pago_directo', 'anticipo', 'reembolso', 'caja_chica', 'os', 'propuesta'] as const) {
      expect(ORDEN_DE_EJECUCION).toContain(t)
    }
    expect(ORDEN_DE_EJECUCION[ORDEN_DE_EJECUCION.length - 1]).toBe('propuesta')
  })
})

describe('resumenDeLaSeleccion — lo que se lee antes de confirmar', () => {
  const pd = (monto: number) => ({
    tipo: 'pago_directo' as const, totalPorMoneda: [{ moneda: 'PEN', monto }],
  })
  const prop = (pen: number, usd?: number) => ({
    tipo: 'propuesta' as const,
    totalPorMoneda: usd
      ? [{ moneda: 'PEN', monto: pen }, { moneda: 'USD', monto: usd }]
      : [{ moneda: 'PEN', monto: pen }],
  })

  it('desglosa cuánto sale de Propuestas — el pedido explícito de Mariela', () => {
    const r = resumenDeLaSeleccion([pd(5000), pd(3420), prop(41900, 3200)])

    expect(r.cantidad).toBe(3)
    expect(r.mezclaTipos).toBe(true)
    expect(r.total).toEqual([
      { moneda: 'PEN', monto: 50320 },
      { moneda: 'USD', monto: 3200 },
    ])
    expect(r.dePropuestas).toEqual({
      cantidad: 1,
      totalPorMoneda: [{ moneda: 'PEN', monto: 41900 }, { moneda: 'USD', monto: 3200 }],
    })
    expect(r.delResto).toEqual({
      cantidad: 2,
      totalPorMoneda: [{ moneda: 'PEN', monto: 8420 }],
    })
  })

  it('el desglose por tipo sale en el ORDEN DE EJECUCIÓN, no en el de tildado', () => {
    const r = resumenDeLaSeleccion([prop(100), pd(50)])
    expect(r.porTipo.map((t) => t.tipo)).toEqual(['pago_directo', 'propuesta'])
  })

  it('sin propuestas no hay desglose: el "resto" ES el total y repetirlo es ruido', () => {
    const r = resumenDeLaSeleccion([pd(100), pd(200)])
    expect(r.dePropuestas).toBeNull()
    expect(r.delResto).toBeNull()
    expect(r.mezclaTipos).toBe(false)
    expect(r.total).toEqual([{ moneda: 'PEN', monto: 300 }])
  })

  it('solo propuestas: hay desglose pero no hay resto', () => {
    const r = resumenDeLaSeleccion([prop(100), prop(200)])
    expect(r.dePropuestas?.cantidad).toBe(2)
    expect(r.delResto).toBeNull()
  })

  it('nunca mezcla monedas entre sí, ni en el total ni en el desglose', () => {
    const r = resumenDeLaSeleccion([prop(0, 1000), pd(500)])
    expect(r.total).toEqual([
      { moneda: 'PEN', monto: 500 },
      { moneda: 'USD', monto: 1000 },
    ])
  })

  it('selección vacía no revienta', () => {
    const r = resumenDeLaSeleccion([])
    expect(r.cantidad).toBe(0)
    expect(r.porTipo).toEqual([])
    expect(r.dePropuestas).toBeNull()
  })
})

describe('resumirLote con tipos mezclados', () => {
  it('nombra el TIPO además del código: en un lote mixto el código solo no ubica nada', () => {
    const resumen = resumirLote([
      { codigo: 'C-0045', tipo: 'pago_directo', ok: true },
      { codigo: 'PP-2026-0004', tipo: 'propuesta', ok: false, motivo: 'no podés aprobar lo tuyo' },
    ])
    expect(resumen).toContain('Propuesta de pago PP-2026-0004')
    expect(resumen).toContain('no podés aprobar lo tuyo')
  })

  it('sin tipo sigue funcionando (filas que ya no están en la bandeja)', () => {
    const resumen = resumirLote([
      { codigo: 'C-1', ok: true },
      { codigo: 'ab12cd34', ok: false, motivo: 'ya no está esperando tu decisión' },
    ])
    expect(resumen).toContain('ab12cd34')
  })
})
