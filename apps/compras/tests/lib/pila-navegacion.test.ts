import { describe, expect, it } from 'vitest'
import { agregarPaso, retroceder, pasoAnterior, type PasoNavegacion } from '@/lib/pila-navegacion'

const paso = (href: string, texto: string): PasoNavegacion => ({ href, texto })

describe('agregarPaso', () => {
  it('agrega un paso nuevo al final de la pila', () => {
    const pila = agregarPaso([paso('/a', 'A')], paso('/b', 'B'))
    expect(pila).toEqual([paso('/a', 'A'), paso('/b', 'B')])
  })

  it('no duplica el mismo href re-registrado (re-render)', () => {
    const original = [paso('/a', 'A'), paso('/b', 'B')]
    const pila = agregarPaso(original, paso('/b', 'B'))
    expect(pila).toBe(original)
  })

  it('actualiza el texto si el href re-registrado cambió de título', () => {
    const pila = agregarPaso([paso('/a', 'A'), paso('/b', 'B')], paso('/b', 'B nuevo'))
    expect(pila).toEqual([paso('/a', 'A'), paso('/b', 'B nuevo')])
  })

  it('parte de una pila vacía', () => {
    expect(agregarPaso([], paso('/a', 'A'))).toEqual([paso('/a', 'A')])
  })
})

describe('retroceder', () => {
  it('saca el último paso de la pila', () => {
    expect(retroceder([paso('/a', 'A'), paso('/b', 'B')])).toEqual([paso('/a', 'A')])
  })

  it('no hace nada si solo hay un paso', () => {
    const pila = [paso('/a', 'A')]
    expect(retroceder(pila)).toBe(pila)
  })

  it('no hace nada con la pila vacía', () => {
    expect(retroceder([])).toEqual([])
  })
})

describe('pasoAnterior', () => {
  it('es null con un solo paso', () => {
    expect(pasoAnterior([paso('/a', 'A')])).toBeNull()
  })

  it('es null con la pila vacía', () => {
    expect(pasoAnterior([])).toBeNull()
  })

  it('es el paso previo al tope con dos o más pasos', () => {
    expect(pasoAnterior([paso('/a', 'A'), paso('/b', 'B'), paso('/c', 'C')])).toEqual(paso('/b', 'B'))
  })
})
