// Rankings mensuales: puntos, mínimo, meta de calidad, puestos y «Cómo voy».
import { describe, expect, it } from 'vitest'
import { armarRanking, categoriaDePedido, comoVoy, minimoDePedidos, pedidosParaVolverALaMeta, puntosDePedido, tamanoDePedido, type HechoPedido } from '@/domain/ranking'

const h = (o: Partial<HechoPedido>): HechoPedido => ({ salidaId: crypto.randomUUID(), productos: 1, bultos: 1, provincia: false, errorPicking: false, errorPosterior: false, pickerEsJefe: false, conformadorEsJefe: false, ...o })
const muchos = (n: number, base: Partial<HechoPedido>, conError = 0) => Array.from({ length: n }, (_, i) => h({ ...base, errorPicking: i < conError }))

describe('puntos de un pedido', () => {
  it('categoría por productos y tamaño por bultos', () => {
    expect([1, 2, 5, 6, 9, 10, 30].map(categoriaDePedido)).toEqual(['A', 'B', 'B', 'C', 'C', 'D', 'D'])
    expect([1, 2, 5, 6, 19, 20].map(tamanoDePedido)).toEqual(['S', 'M', 'M', 'L', 'L', 'XL'])
  })
  it('suma categoría y tamaño; a provincia vale el doble (ejemplo del equipo: B, M, provincia = 10; A, S, Lima = 2)', () => {
    expect(puntosDePedido({ productos: 3, bultos: 3, provincia: true })).toBe(10)
    expect(puntosDePedido({ productos: 1, bultos: 1, provincia: false })).toBe(2)
  })
})

describe('mínimo de pedidos', () => {
  it('la mitad del promedio del equipo y nunca menos de 20', () => {
    expect(minimoDePedidos([])).toBe(20)
    expect(minimoDePedidos([10, 20])).toBe(20)
    expect(minimoDePedidos([100, 200, 300])).toBe(100)
  })
})

describe('armar el ranking', () => {
  const A = 'a', B = 'b', C = 'c', D = 'd', JEFE = 'jefe'
  const hechos = [
    ...muchos(100, { pickerId: A, productos: 3, bultos: 3 }, 1),      // 1 % con error: cumple
    ...muchos(80, { pickerId: B, productos: 3, bultos: 3 }),           // 0 %: cumple, menos carga
    ...muchos(120, { pickerId: C, productos: 3, bultos: 3 }, 6),       // 5 %: pasa de la meta
    ...muchos(10, { pickerId: D, productos: 3, bultos: 3 }),           // no llega al mínimo
    ...muchos(90, { pickerId: JEFE, pickerEsJefe: true }),
  ]
  const r = armarRanking(hechos, 'PICKING')
  it('gana quien cumple la meta y más carga hizo; los demás aparecen sin puesto; el jefe no entra', () => {
    expect(r.filas.map((f) => [f.personaId, f.estado, f.puesto])).toEqual([[A, 'EN_CARRERA', 1], [B, 'EN_CARRERA', 2], [C, 'SOBRE_LA_META', undefined], [D, 'SIN_MINIMO', undefined]])
    expect(r.filas.find((f) => f.personaId === JEFE)).toBeUndefined()
    expect(r.minimo).toBe(Math.round(((100 + 80 + 120 + 10) / 4) / 2))
  })
  it('el porcentaje es de pedidos con error (un pedido con varios errores cuenta una vez) y el semáforo avisa', () => {
    expect(r.filas.find((f) => f.personaId === A)).toMatchObject({ pedidos: 100, conError: 1, pctError: 1, semaforo: 'VERDE', carga: 500 })
    expect(r.filas.find((f) => f.personaId === C)).toMatchObject({ pctError: 5, semaforo: 'ROJO' })
  })
  it('el error posterior a la conformidad cuenta contra quien picó y contra quien conformó; el de picking, solo contra quien picó', () => {
    const x = [h({ pickerId: A, conformadorId: B, errorPicking: true }), h({ pickerId: A, conformadorId: B, errorPosterior: true })]
    expect(armarRanking(x, 'PICKING').filas[0]).toMatchObject({ personaId: A, conError: 2 })
    expect(armarRanking(x, 'CONFORMIDAD').filas[0]).toMatchObject({ personaId: B, conError: 1 })
  })
  it('el empate en carga lo gana quien tiene menos errores', () => {
    const x = [...muchos(30, { pickerId: A }, 1), ...muchos(30, { pickerId: B }, 0)]
    expect(armarRanking(x, 'PICKING').filas.map((f) => f.personaId)).toEqual([B, A])
  })
})

describe('«Cómo voy»', () => {
  const r = armarRanking([...muchos(100, { pickerId: 'a', productos: 3, bultos: 3 }, 1), ...muchos(80, { pickerId: 'b', productos: 3, bultos: 3 }), ...muchos(100, { pickerId: 'c', productos: 3, bultos: 3 }, 6), ...muchos(5, { pickerId: 'd' })], 'PICKING')
  it('quien va ganando lo sabe; el segundo ve cuánto le falta', () => {
    expect(comoVoy(r, 'a').texto).toMatch(/^Vas 1\.º\..*Eres el 1\.º/)
    expect(comoVoy(r, 'b').texto).toMatch(/Vas 2\.º\..*El 1\.º lleva 500 de carga: te faltan 101 para pasarlo/)
  })
  it('quien pasó la meta ve cuántos pedidos sin error necesita; quien no llega al mínimo, cuántos le faltan; quien no tiene pedidos, nada', () => {
    expect(pedidosParaVolverALaMeta({ pedidos: 100, conError: 6 })).toBe(100)
    expect(comoVoy(r, 'c')).toMatchObject({ semaforo: 'ROJO' })
    expect(comoVoy(r, 'c').texto).toMatch(/fuera del premio: 6 % de pedidos con error.*Necesitas 100 pedidos más sin error/)
    expect(comoVoy(r, 'd').texto).toMatch(/Te faltan \d+ pedidos para entrar/)
    expect(comoVoy(r, 'z')).toEqual({ texto: 'Todavía no tienes pedidos este mes en este ranking.', semaforo: null })
  })
})
