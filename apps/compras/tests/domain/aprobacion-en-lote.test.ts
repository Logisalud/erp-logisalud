import { describe, expect, it } from 'vitest'
import {
  admiteAprobacionEnLote, cuantasEntranAlLote, estadoDelCheckbox,
  estadoDelSeleccionarTodos, etiquetaBotonLote, exigeTotalDestacado,
  MAXIMO_POR_LOTE, resumirLote, totalDeLaSeleccion,
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
  it('se destaca solo con propuestas: son las que liberan un lote entero', () => {
    expect(exigeTotalDestacado('propuesta')).toBe(true)
    expect(exigeTotalDestacado('pago_directo')).toBe(false)
    expect(exigeTotalDestacado(null)).toBe(false)
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
  const vacia = { tipoActivo: null, elegidas: new Set<string>() }

  it('con nada tildado, cualquier tipo loteable se puede tildar', () => {
    expect(estadoDelCheckbox({ tipo: 'pago_directo', id: 'a' }, vacia).habilitado).toBe(true)
  })

  it('una propuesta ya se puede tildar como cualquier otro tipo', () => {
    expect(estadoDelCheckbox({ tipo: 'propuesta', id: 'p' }, vacia).habilitado).toBe(true)
  })

  it('pero sigue sin poder mezclarse con otro tipo', () => {
    const sel = { tipoActivo: 'propuesta' as const, elegidas: new Set(['p']) }
    const r = estadoDelCheckbox({ tipo: 'reembolso', id: 'r' }, sel)
    expect(r.habilitado).toBe(false)
    if (!r.habilitado) expect(r.motivo).toContain('un tipo por vez')
  })

  it('con un tipo activo, los demás se apagan y dicen por qué', () => {
    const sel = { tipoActivo: 'pago_directo' as const, elegidas: new Set(['a']) }
    const r = estadoDelCheckbox({ tipo: 'anticipo', id: 'b' }, sel)
    expect(r.habilitado).toBe(false)
    if (!r.habilitado) expect(r.motivo).toContain('un tipo por vez')
  })

  it('una fila YA tildada siempre se puede destildar', () => {
    const sel = { tipoActivo: 'pago_directo' as const, elegidas: new Set(['a']) }
    expect(estadoDelCheckbox({ tipo: 'pago_directo', id: 'a' }, sel).habilitado).toBe(true)
  })

  it('en el tope, no se puede sumar más — pero sí destildar', () => {
    const llena = new Set(Array.from({ length: MAXIMO_POR_LOTE }, (_, i) => `id-${i}`))
    const sel = { tipoActivo: 'pago_directo' as const, elegidas: llena }
    const r = estadoDelCheckbox({ tipo: 'pago_directo', id: 'nueva' }, sel)
    expect(r.habilitado).toBe(false)
    if (!r.habilitado) expect(r.motivo).toContain(String(MAXIMO_POR_LOTE))
    expect(estadoDelCheckbox({ tipo: 'pago_directo', id: 'id-0' }, sel).habilitado).toBe(true)
  })
})

describe('el botón dice qué va a hacer', () => {
  it('nombra tipo y cantidad', () => {
    expect(etiquetaBotonLote('pago_directo', 4)).toBe('Aprobar 4 Pagos Directos')
    expect(etiquetaBotonLote('pago_directo', 1)).toBe('Aprobar 1 Pago Directo')
    // El plural va en el sustantivo, no al final de la frase.
    expect(etiquetaBotonLote('os', 3)).toBe('Aprobar 3 Órdenes de Servicio')
    expect(etiquetaBotonLote('caja_chica', 2)).toBe('Aprobar 2 Reposiciones de Caja Chica')
  })

  it('sin selección cae en el genérico', () => {
    expect(etiquetaBotonLote(null, 0)).toBe('Aprobar seleccionados')
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


describe('"Seleccionar todos" y el filtro por tipo', () => {
  it('con "Todos" activo está apagado, y el motivo dice qué hacer', () => {
    const r = estadoDelSeleccionarTodos(null, 9)
    expect(r.habilitado).toBe(false)
    // No basta con decir que no se puede: la salida está a un clic en los
    // chips de arriba, así que el motivo tiene que señalarla.
    if (!r.habilitado) expect(r.motivo).toContain('Filtra por un tipo')
  })

  it('filtrado por un tipo con filas, se habilita', () => {
    expect(estadoDelSeleccionarTodos('pago_directo', 7).habilitado).toBe(true)
  })

  it('filtrado por un tipo sin filas, no tiene nada que tildar', () => {
    const r = estadoDelSeleccionarTodos('os', 0)
    expect(r.habilitado).toBe(false)
    if (!r.habilitado) expect(r.motivo).toContain('No hay filas')
  })

  it('el tope manda: con más visibles que el máximo, entran los primeros', () => {
    expect(cuantasEntranAlLote(7)).toBe(7)
    expect(cuantasEntranAlLote(MAXIMO_POR_LOTE)).toBe(MAXIMO_POR_LOTE)
    expect(cuantasEntranAlLote(MAXIMO_POR_LOTE + 5)).toBe(MAXIMO_POR_LOTE)
  })
})
