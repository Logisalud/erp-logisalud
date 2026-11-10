// 1b (reunión del equipo): columna Distrito con filtro y orden en «Pedidos por planificar».
import { describe, expect, it } from 'vitest'
import { distritosDePedidos, filtrarYOrdenarPorDistrito } from '@/domain/rutas'

const P = [{ n: 1, distrito: 'San Isidro' }, { n: 2, distrito: 'Ate' }, { n: 3 }, { n: 4, distrito: 'san isidro' }, { n: 5, distrito: 'Breña' }]

describe('distrito de los pedidos por planificar', () => {
  it('lista los distritos sin repetir (sin importar mayúsculas) y en orden alfabético', () => {
    expect(distritosDePedidos(P)).toEqual(['Ate', 'Breña', 'San Isidro'])
  })
  it('filtra por distrito sin importar tildes ni mayúsculas; vacío = todos', () => {
    expect(filtrarYOrdenarPorDistrito(P, 'SAN ISIDRO', 'ninguno').map((p) => p.n)).toEqual([1, 4])
    expect(filtrarYOrdenarPorDistrito(P, '', 'ninguno')).toHaveLength(5)
    expect(filtrarYOrdenarPorDistrito(P, 'Brena', 'ninguno').map((p) => p.n)).toEqual([5])
  })
  it('ordena por distrito (A→Z o Z→A), estable, y lo que no trae distrito va siempre al final', () => {
    expect(filtrarYOrdenarPorDistrito(P, '', 'asc').map((p) => p.n)).toEqual([2, 5, 1, 4, 3])
    expect(filtrarYOrdenarPorDistrito(P, '', 'desc').map((p) => p.n)).toEqual([1, 4, 5, 2, 3])
  })
})
