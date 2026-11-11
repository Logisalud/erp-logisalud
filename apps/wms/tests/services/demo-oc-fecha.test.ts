// La demo da a cada OC su fecha de emisión (como la vista de Compras), para ver y buscar por fecha en «Nueva solicitud de ingreso».
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'

let repo: RepositorioDemo
beforeEach(() => { ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined; repo = new RepositorioDemo() })

describe('las OC de la demo traen su fecha de emisión', () => {
  it('todas la traen (AAAA-MM-DD) y la de cada OC es de días atrás, no de hoy', async () => {
    const ocs = await repo.ocsPendientes()
    expect(ocs.length).toBeGreaterThan(3)
    const hoy = (await repo.panorama()).hoy
    for (const o of ocs) {
      expect(o.fechaEmision, o.codigo).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(o.fechaEmision! < hoy, o.codigo).toBe(true)
    }
    const f = (c: string) => ocs.find((o) => o.codigo === c)?.fechaEmision
    expect(f('OC-DEMO-0004')! > f('OC-DEMO-0002')!).toBe(false)   // la 2 es más reciente que la 4: se numeran hacia atrás en el tiempo
  })
})
