import { describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'

// «Abrir» una orden daba «No encontramos eso» en la Preview: cada instancia de Vercel arma su propia demo y una orden tenía un id al azar.
const ID_FIJO = /^00000000-0000-4000-8000-\d{12}$/

describe('ids de la demo iguales en todas las instancias', () => {
  it('con las órdenes de ejemplo, todas las salidas sembradas tienen id determinista', async () => {
    const antes = process.env.WMS_DEMO_EJEMPLOS
    process.env.WMS_DEMO_EJEMPLOS = 'si'
    try {
      const lista = await new RepositorioDemo().listarSalidas()
      expect(lista.length).toBeGreaterThan(20)
      expect(lista.filter((s) => !ID_FIJO.test(s.id)).map((s) => s.numero)).toEqual([])
    } finally {
      if (antes === undefined) delete process.env.WMS_DEMO_EJEMPLOS; else process.env.WMS_DEMO_EJEMPLOS = antes
    }
  })
  it('sin las de ejemplo, la orden de siempre también tiene id determinista', async () => {
    const lista = await new RepositorioDemo().listarSalidas()
    expect(lista.length).toBeGreaterThan(0)
    expect(lista.filter((s) => !ID_FIJO.test(s.id)).map((s) => s.numero)).toEqual([])
  })
})
