// traerTodo pagina de a 1.000 filas (tope de PostgREST). Sin un orden determinista, las páginas
// pueden repetir o saltarse filas (el error que ya se midió en Cobranzas): aquí se prueba que el
// orden por clave única siempre se aplica y que no se puede paginar una tabla sin clave registrada.
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Fila = Record<string, unknown>
const estado = vi.hoisted(() => ({ tabla: [] as Fila[], pedidos: [] as { orden: string[]; desde: number; hasta: number }[] }))

// Simula el comportamiento de Postgres: con un orden que termina en la clave única la página es estable;
// sin él, cada consulta devuelve las filas en otro orden (como un plan distinto o un VACUUM entre medias).
vi.mock('@logisalud/auth/server', () => ({
  crearClienteServidor: () => ({
    schema: () => ({
      from: () => {
        const orden: string[] = []
        const q = {
          select: () => q,
          order: (columna: string) => { orden.push(columna); return q },
          range: async (desde: number, hasta: number) => {
            estado.pedidos.push({ orden: [...orden], desde, hasta })
            const filas = [...estado.tabla]
            const clave = orden[orden.length - 1]
            if (clave) filas.sort((a, b) => (a[clave] as number) - (b[clave] as number))
            else filas.sort(() => Math.random() - 0.5)
            return { data: filas.slice(desde, hasta + 1), error: null }
          },
        }
        return q
      },
    }),
  }),
}))

import { traerTodo } from '@/services/supabase/util'
import { CLAVES_UNICAS, ordenPaginado } from '@/services/supabase/claves'

beforeEach(() => {
  estado.pedidos = []
  estado.tabla = Array.from({ length: 2573 }, (_, i) => ({ id: i + 1, creado_en: i % 3 }))
})

describe('traerTodo', () => {
  it('trae las 2.573 filas en 3 páginas, sin duplicadas ni perdidas', async () => {
    const filas = await traerTodo('lotes', 'wms')
    expect(filas).toHaveLength(2573)
    expect(new Set(filas.map((f) => f.id)).size).toBe(2573)
    expect(estado.pedidos.map((p) => [p.desde, p.hasta])).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('ordena siempre por la clave única en todas las páginas', async () => {
    await traerTodo('lotes', 'wms')
    expect(estado.pedidos.every((p) => p.orden.join() === 'id')).toBe(true)
  })

  it('un orden pedido va primero y la clave única cierra', async () => {
    await traerTodo('alertas', 'wms', '*', ['creada_en'])
    expect(estado.pedidos[0].orden).toEqual(['creada_en', 'id'])
  })

  it('una tabla con clave compuesta ordena por todas sus columnas', () => {
    expect(ordenPaginado('saldos', 'wms')).toEqual(CLAVES_UNICAS['wms.saldos'])
    expect(ordenPaginado('saldos', 'wms', ['cantidad'])[0]).toBe('cantidad')
  })

  it('no repite la clave si ya venía en el orden pedido', () => {
    expect(ordenPaginado('lotes', 'wms', ['id'])).toEqual(['id'])
  })

  it('se niega a paginar una tabla sin clave registrada', async () => {
    await expect(traerTodo('tabla_nueva', 'wms')).rejects.toThrow(/claves\.ts/)
    expect(estado.pedidos).toHaveLength(0)
  })

  it('sin la clave (consulta sin orden) las páginas sí se corrompen: la prueba detecta el error que se evita', async () => {
    // Control del simulador: la misma lectura SIN orden pierde y repite filas.
    const out: Fila[] = []
    const cliente = (await import('@logisalud/auth/server')).crearClienteServidor() as never as {
      schema: () => { from: () => { select: () => { range: (a: number, b: number) => Promise<{ data: Fila[] }> } } }
    }
    for (let d = 0; d < 3000; d += 1000) out.push(...(await cliente.schema().from().select().range(d, d + 999)).data)
    expect(new Set(out.map((f) => f.id)).size).toBeLessThan(2573)
  })
})
