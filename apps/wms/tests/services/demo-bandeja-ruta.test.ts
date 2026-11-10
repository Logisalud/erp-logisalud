// Fase 4 · P8: en la demo la bandeja trae el ruteo de Pedidos (zonas sintéticas) y la ruta del WMS precarga las paradas por zona.
import { beforeEach, describe, expect, it } from 'vitest'
import { opcionesDia, opcionesZona } from '@/domain/pedidos-despacho'
import { paradasDeZona, zonasConPedidos } from '@/domain/rutas'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'

let repo: RepositorioDemo
beforeEach(() => { ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined; process.env.WMS_DEMO_LOCAL = '1'; repo = new RepositorioDemo() })

describe('bandeja demo: zona de reparto y día planificado', () => {
  it('cada pedido trae su zona, el orden del distrito y el día planificado (con su fecha); el filtro ofrece las zonas y los días que hay', async () => {
    const { pedidos } = await repo.bandejaPedidos()
    const p101 = pedidos.find((p) => p.numero === 'PED-DEMO-101')!
    expect(p101).toMatchObject({ zonaReparto: { codigo: 'LIMA-CENTRO', nombre: 'Lima Centro', ordenRuta: 1 }, ordenDistrito: 2, diaPlanificado: 2 })
    expect(p101.fechaPlanificada).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(new Date(`${p101.fechaPlanificada}T12:00:00Z`).getUTCDay()).toBe(2)   // martes
    expect(opcionesZona(pedidos).map((o) => o.valor)).toEqual(['LIMA-CENTRO', 'LIMA-NORTE'])
    expect(opcionesDia(pedidos).map((o) => o.etiqueta)).toEqual(['Martes', 'Jueves'])
  })
  it('al armar una ruta del WMS, las paradas de una zona se precargan por orden_ruta y orden_distrito (la ruta del WMS sigue siendo el despacho físico)', async () => {
    const pan = await repo.panoramaRutas()
    const centro = zonasConPedidos(pan.pedidos).find((z) => z.codigo === 'LIMA-CENTRO')
    expect(centro).toBeTruthy()
    const ids = paradasDeZona(pan.pedidos, 'LIMA-CENTRO').map((x) => pan.pedidos.find((p) => p.pedidoId === x.pedidoId)!)
    expect(ids.map((p) => p.ordenDistrito)).toEqual([...ids.map((p) => p.ordenDistrito)].sort((a, b) => a! - b!))
    expect(ids.every((p) => p.zonaReparto?.codigo === 'LIMA-CENTRO' && !p.enRuta && p.sinCatalogo.length === 0)).toBe(true)
  })
})
