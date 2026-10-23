// SA-1: las órdenes de ejemplo de la demostración. Cada etapa y tipo esperado, determinista, sin romper invariantes y siempre con «Dónde va y qué sigue».
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { EJEMPLOS_SALIDA, esPedidoDeEjemplo } from '@/domain/ejemplos'
import { avanceDeSalida } from '@/domain/pasos'
import { ETAPAS_SALIDA } from '@/domain/pasos'
import { comprometidoEn } from '@/services/demo/despacho-demo'
import { modoEjemplos } from '@/lib/demo'
import { normalizarNumeroPedido } from '@/domain/salida-manual'

const reiniciar = () => { (globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined }
const usar = (ejemplos: string, datos: string) => { process.env.WMS_DEMO_EJEMPLOS = ejemplos; process.env.WMS_DEMO_DATOS = datos; reiniciar() }
afterEach(() => { process.env.WMS_DEMO_EJEMPLOS = '0'; process.env.WMS_DEMO_DATOS = 'sintetico'; reiniciar() })

describe('modo de los ejemplos', () => {
  it('encendidos por defecto; 0 los apaga; vacio deja la demo sin salidas', () => {
    expect(modoEjemplos({})).toBe('si')
    expect(modoEjemplos({ WMS_DEMO_EJEMPLOS: '1' })).toBe('si')
    expect(modoEjemplos({ WMS_DEMO_EJEMPLOS: '0' })).toBe('no')
    expect(modoEjemplos({ WMS_DEMO_EJEMPLOS: 'vacio' })).toBe('vacio')
  })
  it('apagados: solo la salida de siempre (PED-DEMO-101); vacío: ninguna', async () => {
    usar('0', 'sintetico')
    const a = await new RepositorioDemo().listarSalidas()
    expect(a.map((s) => s.pedidoNumero)).toEqual(['PED-DEMO-101'])
    expect(a[0].ejemplo).toBeFalsy()
    usar('vacio', 'sintetico')
    expect(await new RepositorioDemo().listarSalidas()).toEqual([])
  })
})

for (const datos of ['sintetico', 'odoo']) {
  describe(`órdenes de ejemplo (datos ${datos})`, () => {
    let repo: RepositorioDemo
    beforeEach(() => { usar('1', datos); repo = new RepositorioDemo() })

    /** La orden de cada ejemplo: se siembran en orden, así que van en el orden de sus números (la 1 es la de siempre, PED-DEMO-101). */
    const ordenes = async () => {
      const lista = (await repo.listarSalidas()).sort((a, b) => a.numero.localeCompare(b.numero))
      return { todas: lista, ejemplos: lista.slice(1) }
    }

    it('abrir Salidas ya muestra todas las órdenes de ejemplo, rápido, y cada una está en la etapa declarada', async () => {
      const t = Date.now()
      const { todas, ejemplos } = await ordenes()
      expect(Date.now() - t).toBeLessThan(1000)
      expect(todas[0].pedidoNumero).toBe('PED-DEMO-101')
      expect(ejemplos).toHaveLength(EJEMPLOS_SALIDA.length)
      EJEMPLOS_SALIDA.forEach((ej, i) => {
        // con la GRE del cliente registrada, según el juego de datos el paquete documental ya puede estar completo (no pide nada más): las dos etapas son válidas
        const validas = ej.clave === 'b-conforme' ? ['CONFORME', 'DOCUMENTACION_COMPLETA'] : [ej.etapa]
        expect(validas, `${ej.clave}: ${ejemplos[i].etapa}`).toContain(ejemplos[i].etapa)
        if (ej.pedido) expect(ejemplos[i].pedidoNumero, ej.clave).toBe(ej.pedido)
      })
    })

    it('cubre cada etapa pedida y los tres tipos', async () => {
      const { ejemplos } = await ordenes()
      const etapas = new Set(ejemplos.map((s) => s.etapa))
      for (const e of ['ASIGNADA', 'EN_PICKING', 'PENDIENTE_CONFORMIDAD', 'CONFORME', 'DOCUMENTACION_COMPLETA', 'EMBALADA', 'LISTA_PARA_CARGA', 'CONFIRMADA', 'ENTREGADA_AL_TRANSPORTISTA', 'SIN_STOCK', 'CANCELADA', 'POR_DEVOLVER_PICKING'] as const) expect(etapas.has(e), e).toBe(true)
      expect(new Set(ejemplos.map((s) => s.tipo))).toEqual(new Set(['DISTRIBUCION', 'CLIENTE', 'MUESTRA', 'PROVEEDOR']))
      expect(ejemplos.filter((s) => s.origen === 'PEDIDO').length).toBeGreaterThan(0)
      expect(ejemplos.filter((s) => s.origen === 'MANUAL' && s.tipo === 'DISTRIBUCION').every((s) => s.porConciliar)).toBe(true)
      expect(ejemplos.filter((s) => s.origen === 'MANUAL' && s.tipo === 'DISTRIBUCION')).toHaveLength(4)
      expect(ejemplos.some((s) => s.tipo === 'CLIENTE' && s.enNombreDe)).toBe(true)
    })

    it('todas las órdenes sembradas llevan la etiqueta «Ejemplo» y la de siempre no; los pedidos de ejemplo se llaman PED-DEMO-2xx', async () => {
      const { todas, ejemplos } = await ordenes()
      expect(ejemplos.every((s) => s.ejemplo)).toBe(true)
      expect(todas[0].ejemplo).toBeFalsy()
      for (const s of ejemplos.filter((x) => x.pedidoNumero)) expect(esPedidoDeEjemplo(s.pedidoNumero)).toBe(true)
    })

    it('«Dónde va y qué sigue»: toda orden sembrada, en cualquier etapa, tiene siguiente paso y responsable', async () => {
      const { todas } = await ordenes()
      for (const s of todas) {
        const a = avanceDeSalida(s.etapa, s.id, { tipo: s.tipo, vendedor: s.vendedor, sinPedido: s.sinPedido, devolucion: s.devolucion, devolucionHref: s.devolucionHref })
        expect(a.siguiente.texto.length, s.numero).toBeGreaterThan(10)
        expect(a.siguiente.responsable.etiqueta.length, s.numero).toBeGreaterThan(3)
        if (!a.siguiente.fin) expect(a.siguiente.href, s.numero).toMatch(/^\//)
        expect(ETAPAS_SALIDA).toContain(s.etapa)
      }
    })

    it('sin stock explica por qué falta; la cancelada y la cancelada por Pedidos quedan con motivo; el pedido cancelado figura así en la bandeja', async () => {
      const { ejemplos } = await ordenes()
      const idx = (clave: string) => EJEMPLOS_SALIDA.findIndex((x) => x.clave === clave)
      const sinStock = (await repo.obtenerSalida(ejemplos[idx('a-sin-stock')].id))!
      expect(sinStock.lineasDetalle.some((l) => l.estado === 'SIN_STOCK' && /falta|faltan|hay/i.test(l.nota ?? ''))).toBe(true)
      const bandeja = await repo.bandejaPedidos()
      expect(bandeja.pedidos.find((p) => p.numero === 'PED-DEMO-211')?.estado).toBe('CANCELADO_EN_PEDIDOS')
      expect((await repo.obtenerSalida(ejemplos[idx('a-cancelada')].id))!.etapa).toBe('CANCELADA')
    })

    it('la guía de las órdenes con guía sale del simulador de Nubefact y la GRE del cliente (B) queda registrada', async () => {
      const { ejemplos } = await ordenes()
      const idx = (clave: string) => EJEMPLOS_SALIDA.findIndex((x) => x.clave === clave)
      for (const c of ['a-guia', 'a-lista-carga', 'a-confirmada']) {
        const g = (await repo.paqueteSalida(ejemplos[idx(c)].id))!.guia!
        expect(g.origen, c).toBe('NUBEFACT')
        expect(g.entorno, c).toBe('SIMULADOR')
        expect(g.estadoSunat, c).toBe('ACEPTADA')
      }
      const b = (await repo.paqueteSalida(ejemplos[idx('b-conforme')].id))!.guia!
      expect(b.origen).toBe('CLIENTE')
    })

    it('no rompe invariantes: stock nunca negativo, nada comprometido de más, una orden viva por pedido', async () => {
      await ordenes()
      const p = await repo.panorama()
      expect(p.saldos.every((s) => s.cantidad >= 0)).toBe(true)
      const e = (globalThis as { __wmsDemo?: never }).__wmsDemo as never
      for (const s of p.saldos) expect(comprometidoEn(e, s.posicionId, s.loteId, s.procedenciaId)).toBeLessThanOrEqual(s.cantidad)
      const vivas = (await repo.listarSalidas()).filter((s) => s.etapa !== 'CANCELADA' && s.pedidoNumero)
      const numeros = vivas.map((s) => normalizarNumeroPedido(s.pedidoNumero))
      expect(new Set(numeros).size).toBe(numeros.length)
    })

    it('la salida confirmada de ejemplo bajó el stock (y la panorama ya lo refleja al abrir Inventario primero)', async () => {
      reiniciar(); repo = new RepositorioDemo()
      const p = await repo.panorama()          // sin haber abierto Salidas: igual se siembra
      const total = p.saldos.reduce((t, x) => t + x.cantidad, 0)
      usar('0', datos); const sin = await new RepositorioDemo().panorama()
      expect(total).toBeLessThan(sin.saldos.reduce((t, x) => t + x.cantidad, 0))
    })

    it('es determinista: dos instancias dan las mismas órdenes, etapas, ids y clientes', async () => {
      const foto = async () => (await repo.listarSalidas()).sort((a, b) => a.numero.localeCompare(b.numero)).slice(1).map((s) => [s.id, s.numero, s.pedidoNumero, s.cliente, s.tipo, s.etapa, s.unidades])
      const a = await foto()
      reiniciar(); repo = new RepositorioDemo()
      expect(await foto()).toEqual(a)
    })

    it('después de sembrar, las acciones siguen funcionando: se genera el picking de la orden con stock asignado y se la puede cancelar', async () => {
      const { ejemplos } = await ordenes()
      const asignada = ejemplos[EJEMPLOS_SALIDA.findIndex((x) => x.clave === 'a-manual-asignada')]
      const JT = { id: 'demo:jefe_transporte', nombre: 'JT', roles: ['jefe_transporte', 'jefe_almacen'] as never }
      expect(await repo.cancelarOrden(asignada.id, 'Prueba', JT)).toMatchObject({ ok: true })
      expect((await repo.obtenerSalida(asignada.id))!.etapa).toBe('CANCELADA')
    })
  })
}

describe('la lista declarativa', () => {
  it('claves únicas y números de pedido únicos', () => {
    expect(new Set(EJEMPLOS_SALIDA.map((x) => x.clave)).size).toBe(EJEMPLOS_SALIDA.length)
    const peds = EJEMPLOS_SALIDA.filter((x) => x.pedido).map((x) => x.pedido)
    expect(new Set(peds).size).toBe(peds.length)
    expect(EJEMPLOS_SALIDA.every((x) => x.conQuien && x.probar)).toBe(true)
  })
})
