// Entradas y calidad (Batch 2) contra Postgres 16 local: ingresos, lotes, actas, firmas,
// confirmación en Cuarentena, acta organoléptica, alertas y expediente.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPosicion, idPropietario } from './helpers'

let base: BaseDePrueba
beforeAll(async () => { base = await crearBaseDePrueba() }, 60_000)
afterAll(async () => { await base?.cerrar() })
const P = () => base.personas
const IMG = 'data:image/png;base64,' + 'A'.repeat(200)

/** Una recepción de Compras (stub) con una línea de `cantidad` unidades del producto. */
async function recepcionDeCompras(producto: string, cantidad: number, guia = 'T001-0001') {
  const prov = (await base.admin.query(
    `insert into compras.proveedores (ruc, razon_social) values ($1, 'Proveedor de prueba') returning id`,
    [String(Math.floor(Math.random() * 1e11)).padStart(11, '2')])).rows[0].id
  const oc = (await base.admin.query(
    `insert into compras.ordenes_compra (codigo, proveedor_id) values ($1, $2) returning id`,
    ['OC-T-' + randomUUID().slice(0, 6), prov])).rows[0].id
  const oi = (await base.admin.query(
    `insert into compras.ordenes_compra_items (oc_id, producto_id, cantidad_pedida) values ($1, $2, $3) returning id`,
    [oc, producto, cantidad])).rows[0].id
  const rec = (await base.admin.query(`insert into almacen.recepciones (oc_id) values ($1) returning id`, [oc])).rows[0].id
  await base.admin.query(`insert into almacen.recepciones_items (recepcion_id, oc_item_id, cantidad_fisica) values ($1, $2, $3)`, [rec, oi, cantidad])
  await base.admin.query(`insert into almacen.recepciones_guias (recepcion_id, numero) values ($1, $2)`, [rec, guia])
  return rec as string
}

async function crearCompra(producto: string, cantidad: number) {
  const rec = await recepcionDeCompras(producto, cantidad)
  const logissa = await idPropietario(base.admin, 'LOGISSA')
  return base.como(P().charlie.id, async (c) => {
    const id = (await c.query(`select wms.crear_ingreso('COMPRA_LOCAL', $1, $2::jsonb, '[]'::jsonb) id`,
      [logissa, JSON.stringify({ compra_recepcion_id: rec })])).rows[0].id as string
    const linea = (await c.query('select id from wms.ingreso_lineas where ingreso_id = $1', [id])).rows[0].id as string
    return { id, linea, rec }
  })
}

const lotes = async (ingreso: string, linea: string, partes: Array<[string, number]>, vence = '2028-06-30') => {
  const pos = await idPosicion(base.admin, 'A-6')
  await base.como(P().charlie.id, (c) =>
    c.query('select wms.guardar_lotes($1, $2, $3::jsonb)', [ingreso, linea,
      JSON.stringify(partes.map(([codigo, cantidad]) => ({ codigo, cantidad, vence, posicion_id: pos })))]))
}

const datosDeRecepcion = (ingreso: string, temp = 20) =>
  base.como(P().charlie.id, (c) => c.query('select wms.editar_ingreso($1, $2::jsonb)', [ingreso,
    JSON.stringify({ temperatura_c: temp, bultos: 3, paletas: 1, placa: 'ABC-123', marca_vehiculo: 'Hyundai', tipo_conteo: 'TOTAL' })]))

/** Genera el acta y la firman las cuatro partes. */
async function firmarTodo(ingreso: string) {
  const acta = await base.como(P().charlie.id, async (c) => (await c.query('select wms.generar_acta_recepcion($1) id', [ingreso])).rows[0].id as string)
  await base.como(P().charlie.id, (c) => c.query(`select wms.firmar_acta_recepcion($1, 'JEFE_ALMACEN', 'Charlie Chancco')`, [acta]))
  await base.como(P().katia.id, (c) => c.query(`select wms.firmar_acta_recepcion($1, 'DIRECCION_TECNICA', 'Katia Zapata')`, [acta]))
  await base.como(P().aux.id, (c) => c.query(`select wms.firmar_acta_recepcion($1, 'RESPONSABLE_CONTEO', 'Christians')`, [acta]))
  const r = await base.como(P().charlie.id, (c) => c.query(
    `select wms.firmar_acta_recepcion($1, 'TRANSPORTISTA', 'Pedro Quispe', '45678912', 'ABC-123', $2) r`, [acta, IMG]))
  return { acta, completa: r.rows[0].r.completa as boolean }
}

const confirmar = (ingreso: string) =>
  base.como(P().charlie.id, async (c) => (await c.query('select wms.confirmar_ingreso($1) id', [ingreso])).rows[0].id as string)

async function ingresoCompletoCompra(producto: string, cantidad: number, partes: Array<[string, number]>) {
  const x = await crearCompra(producto, cantidad)
  await lotes(x.id, x.linea, partes)
  await datosDeRecepcion(x.id)
  const f = await firmarTodo(x.id)
  await confirmar(x.id)
  return { ...x, acta: f.acta }
}

const saldos = (ingreso: string) => base.admin.query(
  `select ps.codigo as posicion, s.estado, s.cantidad::int, lt.codigo as lote, o.codigo as propietario
     from wms.saldos s join wms.ingreso_lotes il on il.id = s.procedencia_id
     join wms.posiciones ps on ps.id = s.posicion_id join wms.lotes lt on lt.id = s.lote_id
     join wms.propietarios o on o.id = s.propietario_id where il.ingreso_id = $1 and s.cantidad > 0 order by lt.codigo`, [ingreso]).then((r) => r.rows)

/** Katia/Sandra: llena y decide el acta organoléptica de un lote. */
async function decidirOrg(ingreso: string, lote: string, decision: 'APROBADO' | 'BAJAS_RECHAZADOS', conclusion = 'CONFORME') {
  const org = (await base.admin.query(
    `select ao.id from wms.actas_organolepticas ao join wms.ingreso_lotes il on il.id = ao.ingreso_lote_id
       join wms.lotes lt on lt.id = il.lote_id where ao.ingreso_id = $1 and lt.codigo = $2`, [ingreso, lote])).rows[0].id as string
  await base.como(P().sandra.id, (c) => c.query('select wms.guardar_acta_organoleptica($1, $2::jsonb, true)', [org,
    JSON.stringify({ cert_analisis: true, checklist: { embalaje_cerrado: 'C', envase_ok: 'C' }, destino_sugerido: 'APROBADO', conclusion })]))
  return { org, decidir: () => base.como(P().katia.id, (c) => c.query('select wms.decidir_acta_organoleptica($1, $2, null)', [org, decision])) }
}

describe('ingreso de compra local → Cuarentena', () => {
  it('(1) compra 6; lotes 4 + 2 → confirma y nace en Cuarentena en A-6..A-9', async () => {
    const x = await ingresoCompletoCompra(base.productos.dapa, 6, [['L-0001', 4], ['L-0002', 2]])
    const s = await saldos(x.id)
    expect(s.map((r) => r.cantidad)).toEqual([4, 2])
    for (const f of s) {
      expect(f.estado).toBe('CUARENTENA')
      expect(['A-6', 'A-7', 'A-8', 'A-9']).toContain(f.posicion)
      expect(f.propietario).toBe('LOGISSA')
    }
    expect((await base.admin.query(`select estado from wms.ingresos where id = $1`, [x.id])).rows[0].estado).toBe('CONFIRMADO')
    // El saldo es exactamente la suma del ledger.
    expect((await base.admin.query('select * from wms.verificar_saldos()')).rows).toHaveLength(0)
  })

  it('(2) compra 6; lotes 4 + 3 → no confirma, con mensaje humano', async () => {
    const x = await crearCompra(base.productos.dapa, 6)
    await lotes(x.id, x.linea, [['L-0010', 4], ['L-0011', 3]])
    await datosDeRecepcion(x.id)
    const e = await falla(base.como(P().charlie.id, (c) => c.query('select wms.generar_acta_recepcion($1)', [x.id])))
    expect(e.message).toMatch(/suman 7 y la referencia es 6/)
    const e2 = await falla(confirmar(x.id))
    expect(e2.message).toMatch(/suman 7 y la referencia es 6/)
    expect(await saldos(x.id)).toHaveLength(0)
  })

  it('la referencia sale de Compras: una recepción es un ingreso, y no se repite', async () => {
    const x = await crearCompra(base.productos.dapa, 6)
    const r = await base.admin.query('select cantidad_referencia, snapshot_compras from wms.ingresos i join wms.ingreso_lineas l on l.ingreso_id = i.id where i.id = $1', [x.id])
    expect(r.rows[0].cantidad_referencia).toBe(6)
    expect(r.rows[0].snapshot_compras).toHaveLength(1)
    const logissa = await idPropietario(base.admin, 'LOGISSA')
    const e = await falla(base.como(P().charlie.id, (c) => c.query(`select wms.crear_ingreso('COMPRA_LOCAL', $1, $2::jsonb)`, [logissa, JSON.stringify({ compra_recepcion_id: x.rec })])))
    expect(e.message).toMatch(/ya tiene su ingreso/)
  })

  it('sin temperatura o sin acta firmada no se confirma', async () => {
    const x = await crearCompra(base.productos.dapa, 3)
    await lotes(x.id, x.linea, [['L-0020', 3]])
    expect((await falla(confirmar(x.id))).message).toMatch(/temperatura/i)
    await datosDeRecepcion(x.id)
    expect((await falla(confirmar(x.id))).message).toMatch(/firmada por las cuatro partes/)
  })

  it('el inventario solo nace en Cuarentena: otra zona se rechaza', async () => {
    const x = await crearCompra(base.productos.dapa, 3)
    const rack = await idPosicion(base.admin, 'A-10.2')
    const e = await falla(base.como(P().charlie.id, (c) => c.query('select wms.guardar_lotes($1, $2, $3::jsonb)', [x.id, x.linea,
      JSON.stringify([{ codigo: 'L-0030', cantidad: 3, vence: '2028-01-31', posicion_id: rack }])])))
    expect(e.message).toMatch(/nace en Cuarentena/)
  })

  it('un mismo lote no puede tener dos vencimientos', async () => {
    const a = await crearCompra(base.productos.dapa, 2)
    await lotes(a.id, a.linea, [['L-DUP', 2]], '2028-06-30')
    const b = await crearCompra(base.productos.dapa, 2)
    const e = await falla(lotes(b.id, b.linea, [['L-DUP', 2]], '2029-01-31'))
    expect(e.message).toMatch(/otro vencimiento/)
  })
})

describe('devolución e ingreso de cliente', () => {
  it('(3) devolución sin factura o boleta de referencia → no se registra', async () => {
    const tri = await idPropietario(base.admin, 'TRIAMED')
    const e = await falla(base.como(P().charlie.id, (c) => c.query(
      `select wms.crear_ingreso('DEVOLUCION', $1, $2::jsonb, $3::jsonb)`,
      [tri, JSON.stringify({ guia_numero: 'G-1', motivo: 'Vencido' }), JSON.stringify([{ producto_id: base.productos.dapa, cantidad_referencia: 5 }])])))
    expect(e.message).toMatch(/factura o boleta original/)
    // Y la base misma lo impide aunque se evite la función.
    const e2 = await falla(base.admin.query(
      `insert into wms.ingresos (tipo, propietario_id, guia_numero) values ('DEVOLUCION', $1, 'G-1')`, [tri]))
    expect(e2.message).toMatch(/check/i)
  })

  it('devolución con factura original: nace en Cuarentena con origen DEVOLUCION', async () => {
    const tri = await idPropietario(base.admin, 'TRIAMED')
    const id = await base.como(P().charlie.id, async (c) => (await c.query(
      `select wms.crear_ingreso('DEVOLUCION', $1, $2::jsonb, $3::jsonb) id`,
      [tri, JSON.stringify({ guia_numero: 'G-2', doc_original_tipo: 'FACTURA', doc_original_numero: 'F001-123', motivo: 'Cliente devolvió' }),
        JSON.stringify([{ producto_id: base.productos.dapa, cantidad_referencia: 5 }])])).rows[0].id as string)
    const linea = (await base.admin.query('select id from wms.ingreso_lineas where ingreso_id = $1', [id])).rows[0].id
    await lotes(id, linea, [['L-DEV1', 5]])
    await datosDeRecepcion(id)
    await firmarTodo(id)
    await confirmar(id)
    const s = await saldos(id)
    expect(s[0]).toMatchObject({ estado: 'CUARENTENA', cantidad: 5, propietario: 'TRIAMED' })
    const o = await base.admin.query(`select distinct origen from wms.partidas where movimiento_id = (select movimiento_id from wms.ingresos where id = $1)`, [id])
    expect(o.rows.map((r) => r.origen)).toEqual(['DEVOLUCION'])
  })

  it('(4) ingreso de cliente cuadra contra la guía y queda a nombre del cliente', async () => {
    const dip = await idPropietario(base.admin, 'DIPHASAC')
    const logissa = await idPropietario(base.admin, 'LOGISSA')
    const datos = JSON.stringify({ guia_numero: 'G-CLI-9', contraparte_nombre: 'Diphasac' })
    const lineas = JSON.stringify([{ producto_id: base.productos.dapa, cantidad_referencia: 10 }])
    const e = await falla(base.como(P().charlie.id, (c) => c.query(`select wms.crear_ingreso('INGRESO_CLIENTE', $1, $2::jsonb, $3::jsonb)`, [logissa, datos, lineas])))
    expect(e.message).toMatch(/a nombre del cliente/)
    const id = await base.como(P().charlie.id, async (c) =>
      (await c.query(`select wms.crear_ingreso('INGRESO_CLIENTE', $1, $2::jsonb, $3::jsonb) id`, [dip, datos, lineas])).rows[0].id as string)
    const linea = (await base.admin.query('select id from wms.ingreso_lineas where ingreso_id = $1', [id])).rows[0].id
    await lotes(id, linea, [['L-CLI1', 6], ['L-CLI2', 3]])
    await datosDeRecepcion(id)
    expect((await falla(base.como(P().charlie.id, (c) => c.query('select wms.generar_acta_recepcion($1)', [id])))).message).toMatch(/suman 9 y la referencia es 10/)
    await lotes(id, linea, [['L-CLI1', 6], ['L-CLI2', 4]])
    await firmarTodo(id)
    await confirmar(id)
    expect((await saldos(id)).map((r) => [r.propietario, r.cantidad])).toEqual([['DIPHASAC', 6], ['DIPHASAC', 4]])
    expect((await falla(base.como(P().charlie.id, (c) => c.query(`select wms.crear_ingreso('INGRESO_CLIENTE', $1, '{}'::jsonb, $2::jsonb)`, [dip, lineas])))).message).toMatch(/guía del cliente/)
  })
})

describe('acta de recepción', () => {
  it('numera I-AAAAMM-correlativo y guarda el hash de cada firma', async () => {
    const x = await ingresoCompletoCompra(base.productos.dapa, 2, [['L-ACTA1', 2]])
    const a = (await base.admin.query('select numero, estado, hash_contenido from wms.actas_recepcion where id = $1', [x.acta])).rows[0]
    expect(a.numero).toMatch(/^I-\d{6}-\d{4}$/)
    expect(a.estado).toBe('FIRMADA')
    const f = (await base.admin.query('select rol_firma, hash_contenido, user_id, dni, placa from wms.acta_firmas where acta_id = $1 order by rol_firma', [x.acta])).rows
    expect(f.map((r) => r.rol_firma)).toEqual(['DIRECCION_TECNICA', 'JEFE_ALMACEN', 'RESPONSABLE_CONTEO', 'TRANSPORTISTA'])
    expect(new Set(f.map((r) => r.hash_contenido))).toEqual(new Set([a.hash_contenido]))
    const t = f.find((r) => r.rol_firma === 'TRANSPORTISTA')
    expect(t).toMatchObject({ user_id: null, dni: '45678912', placa: 'ABC-123' })
  })

  it('cada rol firma con su rol, y el transportista exige DNI, placa y firma', async () => {
    const x = await crearCompra(base.productos.dapa, 2)
    await lotes(x.id, x.linea, [['L-F1', 2]])
    await datosDeRecepcion(x.id)
    const acta = await base.como(P().charlie.id, async (c) => (await c.query('select wms.generar_acta_recepcion($1) id', [x.id])).rows[0].id as string)
    const firma = (quien: string, ...args: unknown[]) => falla(base.como(quien, (c) => c.query('select wms.firmar_acta_recepcion($1, $2, $3, $4, $5, $6)', [acta, ...args, ...Array(5 - args.length).fill(null)].slice(0, 6))))
    expect((await firma(P().aux.id, 'JEFE_ALMACEN', 'Christians')).message).toMatch(/Jefe de Almacén/)
    expect((await firma(P().charlie.id, 'DIRECCION_TECNICA', 'Charlie')).message).toMatch(/Dirección Técnica/)
    expect((await firma(P().charlie.id, 'TRANSPORTISTA', 'Pedro', '123', 'ABC-1', IMG)).message).toMatch(/8 dígitos/)
    expect((await firma(P().charlie.id, 'TRANSPORTISTA', 'Pedro', '45678912', '', IMG)).message).toMatch(/placa/)
    expect((await firma(P().charlie.id, 'TRANSPORTISTA', 'Pedro', '45678912', 'ABC-1', 'x')).message).toMatch(/firma del transportista/)
    expect((await firma(P().sinRol.id, 'RESPONSABLE_CONTEO', 'Nadie')).message).toMatch(/personal de almacén/)
    await base.como(P().charlie.id, (c) => c.query(`select wms.firmar_acta_recepcion($1, 'JEFE_ALMACEN', 'Charlie')`, [acta]))
    expect((await firma(P().charlie.id, 'JEFE_ALMACEN', 'Charlie')).message).toMatch(/ya firmó/)
  })

  it('(5) acta firmada no se edita; anular y reemitir conserva ambas', async () => {
    const x = await ingresoCompletoCompra(base.productos.dapa, 2, [['L-ACTA2', 2]])
    for (const sql of [
      `update wms.actas_recepcion set contenido = '{}'::jsonb where id = $1`,
      `update wms.actas_recepcion set estado = 'BORRADOR' where id = $1`,
      `delete from wms.actas_recepcion where id = $1`,
    ]) expect((await falla(base.admin.query(sql, [x.acta]))).message).toMatch(/firmada no se edita|no se borra/)
    expect((await falla(base.admin.query(`update wms.acta_firmas set nombre = 'otro' where acta_id = $1`, [x.acta]))).message).toMatch(/inmutable/i)
    // Cambiar datos del ingreso con el acta firmada: bloqueado.
    expect((await falla(datosDeRecepcion(x.id, 21))).message).toMatch(/anúlala con motivo/)
    // Anular exige motivo y rol.
    expect((await falla(base.como(P().charlie.id, (c) => c.query('select wms.anular_acta_recepcion($1, $2)', [x.acta, ' '])))).message).toMatch(/motivo/)
    expect((await falla(base.como(P().aux.id, (c) => c.query('select wms.anular_acta_recepcion($1, $2)', [x.acta, 'error'])))).message).toMatch(/Jefe de Almacén/)
    await base.como(P().charlie.id, (c) => c.query('select wms.anular_acta_recepcion($1, $2)', [x.acta, 'Placa mal escrita']))
    // Ya anulada: no se vuelve a tocar.
    expect((await falla(base.admin.query(`update wms.actas_recepcion set motivo_anulacion = 'x' where id = $1`, [x.acta]))).message).toMatch(/ya está anulada/)
    // Reemisión: acta nueva, vinculada, con otro número; la anterior queda.
    await base.como(P().charlie.id, (c) => c.query(`select wms.editar_ingreso($1, '{"placa":"XYZ-999"}'::jsonb)`, [x.id]))
    const nueva = await base.como(P().charlie.id, async (c) => (await c.query('select wms.reemitir_acta_recepcion($1) id', [x.acta])).rows[0].id as string)
    const r = (await base.admin.query('select id, numero, estado, reemplaza_a, contenido->\'ingreso\'->>\'placa\' as placa from wms.actas_recepcion where ingreso_id = $1 order by generada_en', [x.id])).rows
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ id: x.acta, estado: 'ANULADA', placa: 'ABC-123' })
    expect(r[1]).toMatchObject({ id: nueva, estado: 'BORRADOR', reemplaza_a: x.acta, placa: 'XYZ-999' })
    expect(r[1].numero).not.toBe(r[0].numero)
    // El inventario ya confirmado no se re-publica.
    expect((await saldos(x.id)).map((s) => s.cantidad)).toEqual([2])
    // Una acta anulada solo se reemite una vez.
    expect((await falla(base.como(P().charlie.id, (c) => c.query('select wms.reemitir_acta_recepcion($1)', [x.acta])))).message).toMatch(/ya fue reemitida/)
  })

  it('la solicitud de ingreso es editable y cada versión queda guardada', async () => {
    const x = await crearCompra(base.productos.dapa, 4)
    await base.como(P().charlie.id, (c) => c.query('select wms.editar_solicitud($1, $2::jsonb, $3)', [x.id, JSON.stringify({ observaciones: 'Llegó con retraso' }), 'Se añadió la observación']))
    const v = (await base.admin.query(`select version, motivo, datos from wms.solicitud_ingreso_versiones v join wms.solicitudes_ingreso s on s.id = v.solicitud_id where s.ingreso_id = $1 order by version`, [x.id])).rows
    expect(v.map((r) => r.version)).toEqual([1, 2])
    expect(v[0].datos.lineas[0].cantidad_referencia).toBe(4)
    expect(v[1].motivo).toBe('Se añadió la observación')
    expect((await falla(base.admin.query(`update wms.solicitud_ingreso_versiones set motivo = 'x'`))).message).toMatch(/inmutable/i)
  })
})

describe('alertas', () => {
  it('temperatura fuera de 15–25 °C: se recibe y se alerta a Katia', async () => {
    const x = await crearCompra(base.productos.dapa, 2)
    await lotes(x.id, x.linea, [['L-T1', 2]])
    await datosDeRecepcion(x.id, 31.5)
    const a = (await base.admin.query(`select tipo, destinatario_rol, estado, mensaje from wms.alertas where clave = $1`, ['temp:' + x.id])).rows
    expect(a).toEqual([expect.objectContaining({ tipo: 'TEMPERATURA', destinatario_rol: 'direccion_tecnica', estado: 'ABIERTA' })])
    expect(a[0].mensaje).toMatch(/31\.5/)
    // Se recibe igual: el acta se firma y el ingreso se confirma.
    await firmarTodo(x.id)
    await confirmar(x.id)
    expect((await saldos(x.id))[0].cantidad).toBe(2)
    // En rango: sin alerta.
    const y = await crearCompra(base.productos.dapa, 2)
    await lotes(y.id, y.linea, [['L-T2', 2]])
    await datosDeRecepcion(y.id, 18)
    expect((await base.admin.query(`select 1 from wms.alertas where clave = $1`, ['temp:' + y.id])).rows).toHaveLength(0)
  })

  it('solo el destinatario atiende la alerta', async () => {
    const x = await crearCompra(base.productos.dapa, 2)
    await lotes(x.id, x.linea, [['L-T3', 2]])
    await datosDeRecepcion(x.id, 3)
    const id = (await base.admin.query(`select id from wms.alertas where clave = $1`, ['temp:' + x.id])).rows[0].id
    expect((await falla(base.como(P().aux.id, (c) => c.query('select wms.atender_alerta($1, $2)', [id, 'ok'])))).message).toMatch(/Dirección Técnica/)
    await base.como(P().katia.id, (c) => c.query('select wms.atender_alerta($1, $2)', [id, 'Revisado: producto no termolábil']))
    expect((await base.admin.query('select estado, nota_atencion from wms.alertas where id = $1', [id])).rows[0]).toMatchObject({ estado: 'ATENDIDA' })
  })

  it('(7) registro sanitario vencido: alerta al crear el ingreso y aprobación bloqueada', async () => {
    const x = await crearCompra(base.productos.lizi, 5)
    const al = (await base.admin.query(`select tipo, destinatario_rol from wms.alertas where clave = $1`, ['rs:' + base.productos.lizi])).rows
    expect(al).toEqual([{ tipo: 'RS_VENCIDO', destinatario_rol: 'direccion_tecnica' }])
    await lotes(x.id, x.linea, [['L-RSV', 5]])
    await datosDeRecepcion(x.id)
    await firmarTodo(x.id)
    await confirmar(x.id)
    const o = await decidirOrg(x.id, 'L-RSV', 'APROBADO')
    const e = await falla(o.decidir())
    expect(e.message).toMatch(/registro sanitario está vencido/)
    // El acta no quedó firmada y el estado no cambió.
    expect((await base.admin.query('select estado from wms.actas_organolepticas where id = $1', [o.org])).rows[0].estado).toBe('PENDIENTE_DT')
    expect((await saldos(x.id))[0].estado).toBe('CUARENTENA')
  })
})

describe('acta organoléptica', () => {
  it('(6) muestra = techo(raíz(unidades)) + 1', async () => {
    const m = async (n: number) => (await base.admin.query('select wms.muestra_organoleptica($1) m', [n])).rows[0].m
    expect([await m(1), await m(4), await m(5), await m(9), await m(10), await m(100), await m(101)]).toEqual([2, 3, 4, 4, 5, 11, 12])
    const x = await ingresoCompletoCompra(base.productos.dapa, 6, [['L-M1', 4], ['L-M2', 2]])
    const r = await base.admin.query('select cantidad_lote, cantidad_muestra from wms.actas_organolepticas where ingreso_id = $1 order by cantidad_lote desc', [x.id])
    expect(r.rows).toEqual([{ cantidad_lote: 4, cantidad_muestra: 3 }, { cantidad_lote: 2, cantidad_muestra: 3 }])
  })

  it('hay un acta organoléptica por producto y lote, con su correlativo', async () => {
    const x = await ingresoCompletoCompra(base.productos.dapa, 6, [['L-N1', 4], ['L-N2', 2]])
    const r = (await base.admin.query('select numero from wms.actas_organolepticas where ingreso_id = $1 order by numero', [x.id])).rows
    expect(r).toHaveLength(2)
    expect(r[0].numero).toMatch(/^O-\d{6}-\d{4}$/)
  })

  it('(8) Cuarentena → Aprobado con acta firmada por Katia (en su lugar: queda por trasladar)', async () => {
    const x = await ingresoCompletoCompra(base.productos.dapa, 4, [['L-AP1', 4]])
    const o = await decidirOrg(x.id, 'L-AP1', 'APROBADO')
    const posAntes = (await saldos(x.id))[0].posicion
    await o.decidir()
    const s = await saldos(x.id)
    expect(s).toEqual([expect.objectContaining({ estado: 'APROBADO', cantidad: 4, posicion: posAntes })])
    const a = (await base.admin.query('select estado, decision, hash_contenido, decidido_por from wms.actas_organolepticas where id = $1', [o.org])).rows[0]
    expect(a).toMatchObject({ estado: 'FIRMADA', decision: 'APROBADO', decidido_por: P().katia.id })
    expect(a.hash_contenido).toMatch(/^[0-9a-f]{64}$/)
    // El cambio de estado quedó sustentado por el acta.
    const m = (await base.admin.query(`select tipo, sustento_tipo, sustento_id from wms.movimientos where referencia_id = $1`, [o.org])).rows[0]
    expect(m).toEqual({ tipo: 'CAMBIO_ESTADO', sustento_tipo: 'ACTA_ORGANOLEPTICA', sustento_id: o.org })
    // Firmada: no se edita, y no se firma dos veces.
    expect((await falla(base.admin.query(`update wms.actas_organolepticas set observacion = 'x' where id = $1`, [o.org]))).message).toMatch(/no se edita/)
    expect((await falla(o.decidir())).message).toMatch(/ya está firmada/)
  })

  it('solo Katia decide; Sandra la llena pero no decide; no se aprueba lo no conforme', async () => {
    const x = await ingresoCompletoCompra(base.productos.dapa, 4, [['L-AP2', 4]])
    const o = await decidirOrg(x.id, 'L-AP2', 'APROBADO', 'NO_CONFORME')
    for (const quien of [P().sandra.id, P().charlie.id, P().aux.id]) {
      expect((await falla(base.como(quien, (c) => c.query('select wms.decidir_acta_organoleptica($1, $2, null)', [o.org, 'APROBADO'])))).message).toMatch(/Solo Dirección Técnica/)
    }
    expect((await falla(o.decidir())).message).toMatch(/NO CONFORME/)
    // Pero sí puede rechazarlo.
    await base.como(P().katia.id, (c) => c.query(`select wms.decidir_acta_organoleptica($1, 'BAJAS_RECHAZADOS', 'Envase roto')`, [o.org]))
    expect((await saldos(x.id))[0].estado).toBe('BAJAS_RECHAZADOS')
  })

  it('el acta no llega a Katia sin estar completa', async () => {
    const x = await ingresoCompletoCompra(base.productos.dapa, 4, [['L-AP3', 4]])
    const org = (await base.admin.query('select id from wms.actas_organolepticas where ingreso_id = $1', [x.id])).rows[0].id
    expect((await falla(base.como(P().sandra.id, (c) => c.query(`select wms.guardar_acta_organoleptica($1, '{}'::jsonb, true)`, [org])))).message).toMatch(/completa el checklist/)
    expect((await falla(base.como(P().katia.id, (c) => c.query(`select wms.decidir_acta_organoleptica($1, 'APROBADO', null)`, [org])))).message).toMatch(/todavía no está completa/)
    expect((await falla(base.como(P().aux.id, (c) => c.query(`select wms.guardar_acta_organoleptica($1, '{}'::jsonb)`, [org])))).message).toMatch(/asistente/)
  })

  it('el lote ABC aprobado y una nueva entrega del mismo lote: la nueva nace en Cuarentena y no hereda', async () => {
    const x1 = await ingresoCompletoCompra(base.productos.dapa, 4, [['L-ABC', 4]])
    await (await decidirOrg(x1.id, 'L-ABC', 'APROBADO')).decidir()
    const x2 = await ingresoCompletoCompra(base.productos.dapa, 3, [['L-ABC', 3]])
    expect((await saldos(x2.id)).map((s) => [s.estado, s.cantidad])).toEqual([['CUARENTENA', 3]])
    expect((await saldos(x1.id)).map((s) => [s.estado, s.cantidad])).toEqual([['APROBADO', 4]])
    // Aprobar la segunda solo mueve las 3 unidades suyas.
    await (await decidirOrg(x2.id, 'L-ABC', 'APROBADO')).decidir()
    expect((await saldos(x2.id)).map((s) => [s.estado, s.cantidad])).toEqual([['APROBADO', 3]])
    expect((await saldos(x1.id)).map((s) => [s.estado, s.cantidad])).toEqual([['APROBADO', 4]])
  })

  it('(9) Aprobado → Cuarentena sigue prohibido por la base', async () => {
    const x = await ingresoCompletoCompra(base.productos.dapa, 4, [['L-AP9', 4]])
    await (await decidirOrg(x.id, 'L-AP9', 'APROBADO')).decidir()
    const s = (await base.admin.query(
      `select posicion_id, producto_id, lote_id, propietario_id, procedencia_id from wms.saldos s
        where procedencia_id = (select id from wms.ingreso_lotes where ingreso_id = $1)`, [x.id])).rows[0]
    const p = (estado: string, delta: number) => ({ ...s, estado, origen: 'COMPRA_LOCAL', delta })
    const e = await falla(base.como(P().katia.id, (c) => c.query(
      `select wms.postear_movimiento('CAMBIO_ESTADO', 'x', $1::jsonb, null, null, 'ACTA', 'X', null)`,
      [JSON.stringify([p('APROBADO', -4), p('CUARENTENA', 4)])])))
    expect(e.message).toMatch(/Transición no permitida/)
  })
})

describe('"por trasladar" y divergencias', () => {
  it('(D-28) Aprobado en Cuarentena más allá del plazo → alerta al Jefe de Almacén', async () => {
    const x = await ingresoCompletoCompra(base.productos.dapa, 4, [['L-PT1', 4]])
    await (await decidirOrg(x.id, 'L-PT1', 'APROBADO')).decidir()
    expect((await base.como(P().charlie.id, async (c) => (await c.query('select wms.revisar_por_trasladar() n')).rows[0].n))).toBe(0)
    await base.admin.query(`update wms.parametros set valor = '0' where clave = 'plazo_por_trasladar_horas'`)
    const n = await base.como(P().charlie.id, async (c) => (await c.query('select wms.revisar_por_trasladar() n')).rows[0].n)
    expect(n).toBeGreaterThan(0)
    const a = (await base.admin.query(`select destinatario_rol, mensaje from wms.alertas where tipo = 'POR_TRASLADAR_VENCIDO' and mensaje like '%L-PT1%'`)).rows
    expect(a[0].destinatario_rol).toBe('jefe_almacen')
    // Idempotente: no se duplica.
    await base.como(P().charlie.id, (c) => c.query('select wms.revisar_por_trasladar()'))
    expect((await base.admin.query(`select count(*)::int n from wms.alertas where tipo = 'POR_TRASLADAR_VENCIDO' and mensaje like '%L-PT1%'`)).rows[0].n).toBe(1)
    await base.admin.query(`update wms.parametros set valor = '24' where clave = 'plazo_por_trasladar_horas'`)
  })

  it('(D-19) si Compras cambia la cantidad después, el WMS alerta y no cambia solo', async () => {
    const x = await ingresoCompletoCompra(base.productos.dapa, 6, [['L-DV1', 6]])
    await base.admin.query(`update almacen.recepciones_items set cantidad_fisica = 5 where recepcion_id = $1`, [x.rec])
    await base.como(P().charlie.id, (c) => c.query('select wms.revisar_divergencias()'))
    const a = (await base.admin.query(`select tipo, mensaje from wms.alertas where clave like $1`, ['div:' + x.id + '%'])).rows
    expect(a).toHaveLength(1)
    expect(a[0].mensaje).toMatch(/recibió 6 y Compras ahora dice 5/)
    expect((await saldos(x.id))[0].cantidad).toBe(6)
  })
})

describe('expediente', () => {
  it('se arma al confirmar, con los faltantes, y Sandra lo cierra solo sin faltantes', async () => {
    const x = await ingresoCompletoCompra(base.productos.dapa, 4, [['L-EX1', 4]])
    const exp = (await base.admin.query('select e.* from wms.expedientes e join wms.ingresos i on i.expediente_id = e.id where i.id = $1', [x.id])).rows[0]
    expect(exp.tipo).toBe('OC')
    expect(exp.clave).toMatch(/^OC-T-/)
    const docs = (await base.admin.query('select tipo from wms.expediente_documentos where expediente_id = $1 order by tipo', [exp.id])).rows.map((r) => r.tipo)
    expect(docs).toEqual(expect.arrayContaining(['ACTA_RECEPCION', 'SOLICITUD_INGRESO', 'GUIA_REMISION']))
    const faltan = (await base.admin.query(`select tipo, responsable from wms.expediente_faltantes where expediente_id = $1 and estado = 'ABIERTO' order by tipo`, [exp.id])).rows
    expect(faltan.map((f) => f.tipo)).toEqual(['ACTA_ORGANOLEPTICA', 'FACTURA'])
    expect((await falla(base.como(P().sandra.id, (c) => c.query('select wms.cerrar_expediente($1)', [exp.id])))).message).toMatch(/2 faltante/)
    expect((await falla(base.como(P().charlie.id, (c) => c.query('select wms.cerrar_expediente($1)', [exp.id])))).message).toMatch(/Sandra/)
    // La factura se enlaza (no se duplica) y la organoléptica firmada resuelve su faltante.
    await base.como(P().sandra.id, (c) => c.query(`select wms.agregar_documento_expediente($1, 'FACTURA', 'Factura F001-55', 'factura', 'F001-55')`, [exp.id]))
    await (await decidirOrg(x.id, 'L-EX1', 'APROBADO')).decidir()
    await base.como(P().sandra.id, (c) => c.query('select wms.cerrar_expediente($1)', [exp.id]))
    expect((await base.admin.query('select estado from wms.expedientes where id = $1', [exp.id])).rows[0].estado).toBe('CERRADO')
    // Un faltante nuevo lo reabre.
    const f = await base.como(P().sandra.id, async (c) => (await c.query(`select wms.agregar_faltante($1, 'OTRO', 'Certificado de análisis', 'Proveedor') id`, [exp.id])).rows[0].id)
    expect((await base.admin.query('select estado from wms.expedientes where id = $1', [exp.id])).rows[0].estado).toBe('ABIERTO')
    await base.como(P().sandra.id, (c) => c.query('select wms.resolver_faltante($1, $2)', [f, 'Llegó por correo']))
  })

  it('una OC con varias recepciones comparte un solo expediente', async () => {
    const a = await ingresoCompletoCompra(base.productos.dapa, 2, [['L-EX2', 2]])
    const oc = (await base.admin.query('select oc_codigo from wms.ingresos where id = $1', [a.id])).rows[0].oc_codigo
    expect((await base.admin.query('select count(*)::int n from wms.expedientes where clave = $1', [oc])).rows[0].n).toBe(1)
  })
})

describe('permisos y RLS de las entradas', () => {
  it('(18) sin rol no se lee ni se escribe; el auditor solo lee', async () => {
    const x = await crearCompra(base.productos.dapa, 2)
    expect((await base.como(P().sinRol.id, (c) => c.query('select * from wms.ingresos'))).rows).toHaveLength(0)
    expect((await base.como(P().auditor.id, (c) => c.query('select * from wms.ingresos where id = $1', [x.id]))).rows).toHaveLength(1)
    for (const quien of [P().sinRol.id, P().auditor.id, P().katia.id]) {
      expect((await falla(base.como(quien, (c) => c.query(`select wms.editar_ingreso($1, '{"bultos":1}'::jsonb)`, [x.id])))).message).toMatch(/No tienes permiso/)
    }
    // DML directo: nadie.
    expect((await falla(base.como(P().charlie.id, (c) => c.query(`update wms.ingresos set estado = 'CONFIRMADO' where id = $1`, [x.id])))).message).toMatch(/permission denied/i)
    expect((await falla(base.como(P().charlie.id, (c) => c.query(`insert into wms.alertas (tipo, destinatario_rol, mensaje, clave) values ('TEMPERATURA','jefe_almacen','x','y')`)))).message).toMatch(/permission denied/i)
  })

  it('(20) la auditoría responde quién, qué, cuándo y por qué en el flujo de entradas', async () => {
    const x = await ingresoCompletoCompra(base.productos.dapa, 2, [['L-AU1', 2]])
    const ev = (await base.admin.query(`select evento, actor from wms.audit_events where entidad_id = any($1) order by id`,
      [[x.id, x.acta, x.linea]])).rows
    expect(ev.map((e) => e.evento)).toEqual(expect.arrayContaining(['ingreso_creado', 'ingreso_lotes_guardados', 'ingreso_editado', 'acta_recepcion_generada', 'acta_recepcion_firmada', 'ingreso_confirmado']))
    expect(ev.every((e) => e.actor)).toBe(true)
  })
})
