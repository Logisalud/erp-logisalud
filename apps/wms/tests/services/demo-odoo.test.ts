// La demo con datos de Odoo (2026-10-14): lo que entra, lo que se excluye y que la demo completa arranca sobre estos datos.
// Las demás pruebas usan los datos sintéticos (WMS_DEMO_DATOS=sintetico en vitest.config.ts); aquí se pide 'odoo' de forma explícita.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { EXTRACTO_ODOO, PRODUCTOS_ODOO, SALDOS_ODOO } from '@/config/datos-demo-odoo'
import { areaAdmite, posicionAcepta } from '@/domain/zonas'
import { construirPanoramaDemo, datosDemoActivos } from '@/services/demo/datos'
import { InventarioDemo } from '@/services/demo/inventario-demo'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { construir, emitir, filasCsv, lotesDemoDiphasac } from '../../scripts/generar-datos-demo-odoo'

const HOY = '2026-10-14'
const suma = (xs: { cantidad: number }[]) => xs.reduce((t, x) => t + x.cantidad, 0)

describe('selección del juego de datos', () => {
  it("la demo usa Odoo salvo que se pida 'sintetico'", () => {
    expect(datosDemoActivos({})).toBe('odoo')
    expect(datosDemoActivos({ WMS_DEMO_DATOS: 'odoo' })).toBe('odoo')
    expect(datosDemoActivos({ WMS_DEMO_DATOS: 'sintetico' })).toBe('sintetico')
    // …y las pruebas corren con los sintéticos (casos fijos DEMO-…).
    expect(datosDemoActivos()).toBe('sintetico')
    expect(construirPanoramaDemo(HOY).productos[0].codigo).toBe('DEMO-001')
  })
})

describe('los datos generados salen de los extractos (sin ediciones a mano)', () => {
  it('config/datos-demo-odoo.ts es exactamente lo que produce el generador', () => {
    const actual = readFileSync(resolve(__dirname, '../../config/datos-demo-odoo.ts'), 'utf8')
    expect(emitir()).toBe(actual)
  })

  it('el cuadre de control se cumple: la suma de los quants por producto es la cantidad a mano de Odoo', () => {
    // construir() se detiene si algún producto no cuadra; aquí se verifica además el total.
    const { informe } = construir()
    expect(informe.unidadesQuants).toBe(35051)
    expect(informe.entran.unidades + informe.entranCuarentena.unidades + informe.entranBajas.unidades + informe.excluidoSinPosicion.unidades
      + informe.excluidoAjuste.unidades + informe.excluidoAjrPendiente.unidades + informe.excluidoPosicionInexistente.unidades).toBe(35051)
  })

  it('el lector de CSV entiende comillas, comas dentro de un nombre y miles', () => {
    expect(filasCsv('a,"b, c","5,941.00",d')).toEqual([['a', 'b, c', '5,941.00', 'd']])
  })
})

describe('qué entra y qué se excluye (reglas 1 a 9)', () => {
  const p = construirPanoramaDemo(HOY, 'odoo')
  const pos = new Map(p.posiciones.map((x) => [x.id, x]))
  const codigoPos = (id: string) => pos.get(id)!.codigo
  const saldosLogissa = p.saldos.filter((s) => s.propietarioId === 'prop:LOGISSA')
  const saldosDiphasac = p.saldos.filter((s) => s.propietarioId === 'prop:DIPHASAC')

  it('regla 2: nada sin posición exacta (todo saldo está en una posición que existe)', () => {
    expect(p.saldos.every((s) => pos.has(s.posicionId))).toBe(true)
    expect(EXTRACTO_ODOO.excluidoSinPosicion).toEqual({ filas: 31, unidades: 1330 })
  })

  it('regla 3: no se cargan Faltantes ni Sobrantes', () => {
    expect(EXTRACTO_ODOO.excluidoAjuste).toEqual({ filas: 5, unidades: 89 })
  })

  it('regla 4: ningún stock de Logissa en G-8.1, G-9.1 ni G-10.1 (son de AJR: pendiente)', () => {
    for (const s of p.saldos) expect(['G-8.1', 'G-9.1', 'G-10.1']).not.toContain(codigoPos(s.posicionId))
    expect(EXTRACTO_ODOO.excluidoAjrPendiente).toEqual({ filas: 48, unidades: 19478 })
  })

  it('regla 5: E-9.1 y E-10.1 tienen stock y ya no están por verificar', () => {
    for (const c of ['E-9.1', 'E-10.1']) {
      const posicion = p.posiciones.find((x) => x.codigo === c)!
      expect(posicion.porVerificar).toBe(false)
      expect(p.saldos.some((s) => s.posicionId === posicion.id && s.cantidad > 0), c).toBe(true)
    }
  })

  it('regla 6: parte sin reservas (la cantidad reservada de Odoo se ignora)', () => {
    expect(EXTRACTO_ODOO.reservadoIgnorado).toBe(1677)
    const cargados = suma(SALDOS_ODOO.filter((s) => s.propietario === 'LOGISSA'))
    expect(cargados).toBe(14105 + 25 + 24)
  })

  it('regla 7: cada saldo está en una posición que acepta a su propietario (Logissa en lo suyo, Diphasac en lo suyo)', () => {
    for (const s of p.saldos) {
      const posicion = pos.get(s.posicionId)!
      expect(posicionAcepta(posicion, s.propietarioId, p.asignaciones, p.hoy), `${s.propietarioId} en ${posicion.codigo}`).toBe(true)
    }
    expect(saldosDiphasac.every((s) => /^A-(1[4-9]|2[0-7])\.1$/.test(codigoPos(s.posicionId)))).toBe(true)
    expect(new Set(saldosLogissa.map((s) => codigoPos(s.posicionId))).has('A-14.1')).toBe(false)
  })

  it('regla 8: los códigos BO son productos aparte, con su propio código', () => {
    const bo = p.productos.filter((x) => x.codigo.startsWith('BO'))
    expect(bo).toHaveLength(EXTRACTO_ODOO.productosBo)
    expect(bo.length).toBeGreaterThan(20)
    expect(new Set(p.productos.map((x) => x.codigo)).size).toBe(p.productos.length) // sin códigos repetidos
    // BODHP108 y DHP108 llevan el mismo lote en Odoo pero son productos (y lotes) distintos
    const a = p.productos.find((x) => x.codigo === 'DHP108')!
    const b = p.productos.find((x) => x.codigo === 'BODHP108')!
    expect(a.id).not.toBe(b.id)
    expect(p.lotes.filter((l) => l.codigo === 'TL458BT25001').map((l) => l.productoId)).toEqual(expect.arrayContaining([a.id, b.id]))
  })

  it('regla 9: Cuarentena y Bajas entran con ese estado, en su zona', () => {
    const cuarentena = p.saldos.filter((s) => s.estado === 'CUARENTENA')
    const bajas = p.saldos.filter((s) => s.estado === 'BAJAS_RECHAZADOS')
    expect(suma(cuarentena)).toBe(25)
    expect(suma(bajas)).toBe(24)
    for (const s of cuarentena) expect(pos.get(s.posicionId)!.tipoArea).toBe('CUARENTENA')
    for (const s of bajas) expect(codigoPos(s.posicionId)).toBe('E-8.1.2')
  })

  it('cada saldo respeta la matriz de zonas BPA (el ledger real lo rechazaría si no)', () => {
    for (const s of p.saldos) {
      expect(areaAdmite(pos.get(s.posicionId)!.tipoArea, s.estado, 'CARGA_INICIAL'), `${codigoPos(s.posicionId)} ${s.estado}`).toBe(true)
    }
  })

  it('regla 1: vencimientos como fecha (sin hora); hay un lote vencido y otro por vencer para probar FEFO y los 60 días', () => {
    for (const l of p.lotes.filter((x) => x.propietarioId === 'prop:LOGISSA')) expect(l.vence, `${l.codigo}`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const dias = (v: string) => Math.round((Date.parse(`${v}T00:00:00Z`) - Date.parse(`${HOY}T00:00:00Z`)) / 86_400_000)
    const logissa = new Set(saldosLogissa.map((s) => s.loteId))
    const lotes = p.lotes.filter((l) => logissa.has(l.id))
    expect(lotes.filter((l) => dias(l.vence!) < 0)).toHaveLength(EXTRACTO_ODOO.vencidos)
    expect(lotes.filter((l) => dias(l.vence!) >= 0 && dias(l.vence!) < 60)).toHaveLength(EXTRACTO_ODOO.porVencer60)
    expect(EXTRACTO_ODOO.vencidos).toBeGreaterThan(0)
    // FEFO: hay productos con más de un lote
    const porProducto = new Map<string, Set<string>>()
    for (const s of saldosLogissa) porProducto.set(s.productoId, (porProducto.get(s.productoId) ?? new Set()).add(s.loteId))
    expect([...porProducto.values()].filter((v) => v.size >= 2).length).toBeGreaterThan(20)
  })

  it('Diphasac: sin stock sin lote; lotes y vencimientos de PRUEBA marcados DEMO, con variedad (D-75)', () => {
    const d = EXTRACTO_ODOO.diphasac
    expect(d.excluidosAjr).toBe(9) // los códigos AJR son de AJR Labs
    expect(saldosDiphasac).toHaveLength(d.lotes)
    expect(saldosDiphasac.reduce((t, s) => t + s.cantidad, 0)).toBe(d.unidades) // la suma por producto sigue siendo la cantidad a mano
    const lotesDip = p.lotes.filter((l) => l.propietarioId === 'prop:DIPHASAC')
    expect(lotesDip.length).toBeGreaterThan(0)
    for (const l of lotesDip) {
      expect(l.codigo, l.codigo).toMatch(/^DEMO-/)
      expect(l.vence, l.codigo).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
    expect(p.lotes.some((l) => l.codigo === 'SIN-LOTE-ODOO')).toBe(false)
    const dias = (v: string) => Math.round((Date.parse(`${v}T00:00:00Z`) - Date.parse(`${HOY}T00:00:00Z`)) / 86_400_000)
    expect(lotesDip.filter((l) => dias(l.vence!) < 0)).toHaveLength(d.vencidos)
    expect(lotesDip.filter((l) => dias(l.vence!) >= 0 && dias(l.vence!) < 60)).toHaveLength(d.porVencer60)
    expect(d.vencidos).toBeGreaterThan(0)
    expect(d.porVencer60).toBeGreaterThan(0)
    expect(d.productosConVariosLotes).toBeGreaterThan(20)
    expect(p.productos.some((x) => x.codigo.startsWith('AJR'))).toBe(false)
  })

  it('los lotes de prueba de Diphasac son deterministas, suman la cantidad a mano y vienen ordenados por vencimiento', () => {
    for (const [i, cant] of [[0, 2563], [1, 5], [7, 40], [11, 100], [3, 1]] as const) {
      const a = lotesDemoDiphasac('X', cant, i)
      expect(a).toEqual(lotesDemoDiphasac('X', cant, i))
      expect(a.reduce((t, l) => t + l.cantidad, 0)).toBe(cant)
      expect(a.every((l) => l.cantidad >= 1)).toBe(true)
      expect([...a].sort((x, y) => x.vence.localeCompare(y.vence))).toEqual(a)
    }
  })

  it('los lotes del panorama son únicos por producto, código y propietario', () => {
    const claves = p.lotes.map((l) => `${l.productoId}|${l.codigo}|${l.propietarioId}`)
    expect(new Set(claves).size).toBe(claves.length)
    expect(PRODUCTOS_ODOO.length).toBe(p.productos.length)
  })
})

describe('la demo completa arranca sobre los datos de Odoo', () => {
  const g = globalThis as { __wmsDemo?: unknown }
  const antes = process.env.WMS_DEMO_DATOS
  beforeAll(() => { process.env.WMS_DEMO_DATOS = 'odoo'; g.__wmsDemo = undefined })
  afterAll(() => { process.env.WMS_DEMO_DATOS = antes; g.__wmsDemo = undefined })

  it('panorama, entradas, inventario, alertas y reportes se arman sin errores', async () => {
    const repo = new InventarioDemo()
    const p = await new RepositorioDemo().panorama()
    expect(p.productos[0].codigo).toBe(PRODUCTOS_ODOO[0].codigo)
    expect(p.saldos.length).toBeGreaterThan(200)
    expect((await repo.listarSolicitudes()).length).toBeGreaterThan(5) // las solicitudes de ejemplo se sembraron sobre productos de Odoo
    expect((await repo.listarMovimientos()).length).toBeGreaterThan(0)
    expect(Array.isArray(await repo.listarAlertas())).toBe(true)
    expect(Array.isArray(await new InventarioDemo().listarCargasIniciales())).toBe(true)
  })

  it('el libro mayor arranca con una carga inicial por cada saldo y el Kardex cuadra con el stock', async () => {
    const repo = new InventarioDemo()
    const p = await new RepositorioDemo().panorama()
    const prod = p.productos.find((x) => x.codigo === 'DHP108')!
    const k = await repo.kardex({ productoId: prod.id })
    const stock = p.saldos.filter((s) => s.productoId === prod.id).reduce((n, s) => n + s.cantidad, 0)
    expect(k.length).toBeGreaterThan(0)
    expect(k[k.length - 1].saldo).toBe(stock)
  })
})
