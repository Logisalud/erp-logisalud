import { describe, expect, it } from 'vitest'
import {
  admiteAprobacionEnLote, estadoDelCheckbox, etiquetaBotonLote, MAXIMO_POR_LOTE,
  resumirLote,
} from '@/domain/aprobacion-en-lote'
describe('qué tipos admiten lote', () => {
  it('las cuatro fuentes con aprobación simple, sí', () => {
    for (const t of ['pago_directo', 'anticipo', 'reembolso', 'caja_chica', 'os'] as const) {
      expect(admiteAprobacionEnLote(t)).toBe(true)
    }
  })

  it('una propuesta NUNCA: libera el desembolso de todo su lote', () => {
    expect(admiteAprobacionEnLote('propuesta')).toBe(false)
  })
})

describe('el checkbox nunca deja llegar a una selección inválida', () => {
  const vacia = { tipoActivo: null, elegidas: new Set<string>() }

  it('con nada tildado, cualquier tipo loteable se puede tildar', () => {
    expect(estadoDelCheckbox({ tipo: 'pago_directo', id: 'a' }, vacia).habilitado).toBe(true)
  })

  it('una propuesta está deshabilitada incluso sin nada tildado, con su motivo', () => {
    const r = estadoDelCheckbox({ tipo: 'propuesta', id: 'p' }, vacia)
    expect(r.habilitado).toBe(false)
    if (!r.habilitado) expect(r.motivo).toContain('su propia pantalla')
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
