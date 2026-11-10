// OS-5 · LS-TB.02.02 (migración 0025): la tabla de muestreo es un parámetro con código y vigencia; régimen por producto/proveedor nuevo, devolución, antecedentes de calidad y lote pequeño.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPropietario } from './helpers'
import { ayudasDeIngreso } from './ingreso-ayudas'
import { TABLA_LS_TB_02_02, tamanoDeMuestra, type RegimenMuestreo } from '@/domain/muestreo'

let base: BaseDePrueba
let a: ReturnType<typeof ayudasDeIngreso>
let logissa: string
beforeAll(async () => { base = await crearBaseDePrueba(); a = ayudasDeIngreso(base); logissa = await idPropietario(base.admin, 'LOGISSA') }, 120_000)
afterAll(async () => { await base?.cerrar() })

const muestraSql = async (n: number, r: string) => (await base.admin.query('select wms.tamano_muestra($1, $2) m', [n, r])).rows[0].m as number

describe('la tabla LS-TB.02.02 en la base de datos', () => {
  it('es un parámetro con su código y su vigencia (01-09-2026 al 01-09-2028), no código duro', async () => {
    const t = (await base.admin.query(`select codigo, vigente_desde::text d, vigente_hasta::text h, umbral_total from wms.tablas_muestreo`)).rows
    expect(t).toEqual([{ codigo: 'LS-TB.02.02', d: '2026-09-01', h: '2028-09-01', umbral_total: 100 }])
    const tr = (await base.admin.query(`select regimen, desde, hasta, muestra from wms.tablas_muestreo_tramos order by regimen desc, desde`)).rows
    expect(tr).toHaveLength(8)
    expect(tr.filter((x) => x.regimen === 'SIMPLIFICADA').map((x) => x.muestra)).toEqual([20, 30, 80, 150])
    expect(tr.filter((x) => x.regimen === 'NORMAL').map((x) => x.muestra)).toEqual([50, 150, 300, 500])
  })

  it('la base y el dominio dan la misma muestra en cada tramo y en cada borde', async () => {
    for (const r of ['SIMPLIFICADA', 'NORMAL', 'ESTRICTA', 'DEVOLUCION', 'LOTE_MENOR'] as RegimenMuestreo[]) {
      for (const n of [0, 1, 99, 100, 101, 1000, 1001, 10000, 10001, 100000, 100001, 250000]) {
        expect(await muestraSql(n, r), `${r} ${n}`).toBe(tamanoDeMuestra(n, r, TABLA_LS_TB_02_02))
      }
    }
  })

  it('un régimen desconocido falla; sin una tabla vigente no se inventa una muestra', async () => {
    expect((await falla(muestraSql(100, 'RARO'))).message).toMatch(/Régimen de muestreo desconocido/)
    await base.admin.query(`update wms.tablas_muestreo set vigente_hasta = '2026-09-30', vigente_desde = '2026-09-01'`)
    await base.admin.query(`update wms.tablas_muestreo set vigente_hasta = '2026-09-30'`)
    expect((await falla(muestraSql(500, 'SIMPLIFICADA'))).message).toMatch(/No hay una tabla de muestreo vigente/)
    await base.admin.query(`update wms.tablas_muestreo set vigente_hasta = '2028-09-01'`)
    expect(await muestraSql(500, 'SIMPLIFICADA')).toBe(20)
  })

  it('una versión nueva de la tabla es una fila nueva con su vigencia; rige la más reciente', async () => {
    await base.admin.query(`update wms.tablas_muestreo set vigente_hasta = '2028-09-01'`)
    const t = (await base.admin.query(`insert into wms.tablas_muestreo (codigo, vigente_desde, umbral_total) values ('LS-TB.02.02', '2026-10-01', 100) returning id`)).rows[0].id
    await base.admin.query(`insert into wms.tablas_muestreo_tramos (tabla_id, regimen, desde, hasta, muestra) values ($1, 'SIMPLIFICADA', 100, null, 13)`, [t])
    expect(await muestraSql(500, 'SIMPLIFICADA')).toBe(13)
    await base.admin.query(`delete from wms.tablas_muestreo_tramos where tabla_id = $1`, [t])
    await base.admin.query(`delete from wms.tablas_muestreo where id = $1`, [t])
    expect(await muestraSql(500, 'SIMPLIFICADA')).toBe(20)
  })

  it('solo el personal la lee y nadie la escribe desde la aplicación', async () => {
    expect((await base.como(base.personas.charlie.id, (c) => c.query('select count(*)::int n from wms.tablas_muestreo'))).rows[0].n).toBe(1)
    expect((await base.como(base.personas.sinRol.id, (c) => c.query('select count(*)::int n from wms.tablas_muestreo'))).rows[0].n).toBe(0)
    for (const sql of [`update wms.tablas_muestreo set umbral_total = 1`, `delete from wms.tablas_muestreo_tramos`, `insert into wms.tablas_muestreo (codigo, vigente_desde) values ('X', now())`]) {
      expect((await falla(base.como(base.personas.admin.id, (c) => c.query(sql)))).message, sql).toMatch(/permission denied|row-level security/)
    }
  })
})

describe('el acta organoléptica nace con su régimen y su muestra', () => {
  const del = async (org: string) => (await a.acta(org)) as { cantidad_lote: number; cantidad_muestra: number; regimen_muestreo: string; tabla_muestreo: string }

  it('producto nuevo (primera recepción): evaluación normal; la segunda recepción del mismo producto y proveedor: simplificada', async () => {
    const prod = await a.productoNuevo()
    const ruc = '20999999991'
    const primera = await a.compra({ producto: prod, cantidad: 480, lote: 'MU-1', ruc })
    expect(await del(primera.org)).toMatchObject({ cantidad_lote: 480, cantidad_muestra: 50, regimen_muestreo: 'NORMAL', tabla_muestreo: 'LS-TB.02.02' })
    const segunda = await a.compra({ producto: prod, cantidad: 480, lote: 'MU-2', ruc })
    expect(await del(segunda.org)).toMatchObject({ cantidad_muestra: 20, regimen_muestreo: 'SIMPLIFICADA' })
    expect((await a.acta(segunda.org)).cantidad_muestra).not.toBe(Math.ceil(Math.sqrt(480)) + 1) // ya no es techo(√n)+1
  })

  it('proveedor nuevo con un producto conocido: evaluación normal; el mismo proveedor después: simplificada', async () => {
    const prod = await a.productoNuevo()
    await a.compra({ producto: prod, cantidad: 300, lote: 'PV-1', ruc: '20999999992' })
    const nuevoProv = await a.compra({ producto: prod, cantidad: 2000, lote: 'PV-2', ruc: '20999999993' })
    expect(await del(nuevoProv.org)).toMatchObject({ cantidad_muestra: 150, regimen_muestreo: 'NORMAL' })
    const igual = await a.compra({ producto: prod, cantidad: 2000, lote: 'PV-3', ruc: '20999999993' })
    expect(await del(igual.org)).toMatchObject({ cantidad_muestra: 30, regimen_muestreo: 'SIMPLIFICADA' })
  })

  it('lotes de menos de 100 unidades: el 100 %; con exactamente 100 ya usa la tabla', async () => {
    const prod = await a.productoNuevo()
    const chico = await a.compra({ producto: prod, cantidad: 99, lote: 'LM-1', ruc: '20999999995' })
    expect(await del(chico.org)).toMatchObject({ cantidad_muestra: 99, regimen_muestreo: 'LOTE_MENOR' })
    const cien = await a.compra({ producto: prod, cantidad: 100, lote: 'LM-2', ruc: '20999999995' })
    expect(await del(cien.org)).toMatchObject({ cantidad_muestra: 20, regimen_muestreo: 'SIMPLIFICADA' })
  })

  it('devolución: siempre el 100 %, aunque el producto sea nuevo y el lote grande', async () => {
    const prod = await a.productoNuevo()
    const d = await a.ingresoDirecto({ tipo: 'DEVOLUCION', propietario: logissa, producto: prod, lote: 'DV-1', cantidad: 1200, posicion: 'E-8.1.1' })
    expect(await del(d.org)).toMatchObject({ cantidad_lote: 1200, cantidad_muestra: 1200, regimen_muestreo: 'DEVOLUCION' })
  })

  it('antecedentes de calidad (marca de Dirección Técnica): evaluación estricta, 100 %; al quitar la marca vuelve a la tabla; todo con motivo y sin borrar historia', async () => {
    const prod = await a.productoNuevo()
    await a.compra({ producto: prod, cantidad: 300, lote: 'AC-0', ruc: '20999999994' })
    // Solo Dirección Técnica la marca, con motivo
    expect((await falla(base.como(base.personas.sandra.id, (c) => c.query('select wms.marcar_muestreo_estricto($1, $2)', [prod, 'Reclamo']))) ).message).toMatch(/Solo Dirección Técnica/)
    expect((await falla(base.como(base.personas.katia.id, (c) => c.query('select wms.marcar_muestreo_estricto($1, $2)', [prod, ' '])))).message).toMatch(/Cuéntanos qué antecedentes/)
    const marca = await base.como(base.personas.katia.id, async (c) => (await c.query('select wms.marcar_muestreo_estricto($1, $2) id', [prod, 'Dos reclamos por envase roto en 2026'])).rows[0].id)
    expect((await falla(base.como(base.personas.katia.id, (c) => c.query('select wms.marcar_muestreo_estricto($1, $2)', [prod, 'otra vez'])))).message).toMatch(/ya está marcado/)
    const estricta = await a.compra({ producto: prod, cantidad: 5000, lote: 'AC-1', ruc: '20999999994' })
    expect(await del(estricta.org)).toMatchObject({ cantidad_muestra: 5000, regimen_muestreo: 'ESTRICTA' })
    // Quitar la marca: motivo obligatorio y la fila queda como historia
    expect((await falla(base.como(base.personas.katia.id, (c) => c.query('select wms.quitar_muestreo_estricto($1, null)', [prod])))).message).toMatch(/Cuéntanos por qué/)
    await base.como(base.personas.katia.id, (c) => c.query('select wms.quitar_muestreo_estricto($1, $2)', [prod, 'El proveedor corrigió su envase']))
    const hist = (await base.admin.query('select quitado_en is not null as cerrada, motivo_quita from wms.antecedentes_calidad where id = $1', [marca])).rows[0]
    expect(hist).toEqual({ cerrada: true, motivo_quita: 'El proveedor corrigió su envase' })
    const normal = await a.compra({ producto: prod, cantidad: 5000, lote: 'AC-2', ruc: '20999999994' })
    expect(await del(normal.org)).toMatchObject({ cantidad_muestra: 30, regimen_muestreo: 'SIMPLIFICADA' })
    expect((await falla(base.admin.query('delete from wms.antecedentes_calidad'))).message).toMatch(/no se borra/)
    expect((await falla(base.admin.query(`update wms.antecedentes_calidad set motivo = 'x'`))).message).toMatch(/ya se quitó/)
  })

  it('un acta firmada conserva el régimen y la tabla con que se calculó', async () => {
    const prod = await a.productoNuevo()
    const x = await a.compra({ producto: prod, cantidad: 480, lote: 'FI-1' })
    await a.llenar(x.org); await a.decidir(x.org, 'APROBADO')
    const f = await a.acta(x.org)
    expect(f).toMatchObject({ estado: 'FIRMADA', regimen_muestreo: 'NORMAL', cantidad_muestra: 50 })
    expect(f.contenido.cantidad_muestra).toBe(50)
  })
})
