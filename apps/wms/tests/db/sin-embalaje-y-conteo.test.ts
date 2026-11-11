// Migración 0061: sin embalaje (los bultos quedan en la conformidad), etiqueta solo para provincia (Lima = ubigeo 15 y 07) y carga por CONTEO de bultos.
import { createHash, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPosicion, idPropietario, postear } from './helpers'

let base: BaseDePrueba
let logissa: string
let jt: string
let aux1: string
let sandra: string
let dt: string
let n = 0
let nPed = 0

const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
const en = (dias: number) => { const d = new Date(`${hoy}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10) }
const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
const como = <T>(id: string, fn: (c: import('pg').Client) => Promise<T>) => base.como(id, fn)
const sha = (s: string) => createHash('sha256').update(s).digest('hex')

async function persona(rol: string | string[]): Promise<string> {
  const id = randomUUID()
  await base.admin.query('insert into auth.users (id) values ($1)', [id])
  for (const r of Array.isArray(rol) ? rol : [rol]) await base.admin.query('insert into wms.usuario_roles (user_id, rol) values ($1, $2)', [id, r])
  return id
}
const subir = (tipo: string, alcance: string) => como(dt, (c) => c.query('select wms.subir_documento_regulatorio($1, $2, $3, $4, $5, $6, null, null, null, null)', [tipo, alcance, 'doc.pdf', `docs/${randomUUID()}.pdf`, sha(randomUUID()), 1234]))
async function producto(): Promise<string> {
  n += 1
  const id = (await uno(`insert into catalogo.productos (codigo, descripcion, unidad_medida) values ($1, $2, 'TABLETA') returning id`, [`CG-${n}-${randomUUID().slice(0, 4)}`, `Producto carga ${n}`])).id as string
  await base.admin.query(`insert into wms.producto_regulatorio (producto_id, registro_sanitario, rs_vence, estado_validacion, creado_por, validado_por, validado_en) values ($1, 'EG-9', '2031-01-01', 'VALIDADO', $2, $2, now())`, [id, dt])
  await subir('REGISTRO_SANITARIO', id)
  return id
}
async function sembrar(prod: string, pos: string, lote: string, cantidad: number) {
  const posId = await idPosicion(base.admin, pos)
  const loteId = (await uno(`insert into wms.lotes (producto_id, codigo, vence, propietario_id) values ($1, $2, $3, $4) returning id`, [prod, lote, en(300), logissa])).id as string
  await como(base.personas.admin.id, (c) => postear(c, 'CARGA_INICIAL', [{ posicion_id: posId, producto_id: prod, lote_id: loteId, propietario_id: logissa, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: randomUUID(), delta: cantidad }]))
  await subir('COA', loteId)
  return loteId
}
/** Un pedido «listo para carga» SIN embalaje: conformado con `bultos` bultos (quedan registrados en la conformidad), con guía y paquete completo. */
async function pedidoListo(pos: string, cantidad: number, bultos = 1) {
  const prod = await producto()
  const lote = await sembrar(prod, pos, `L-${randomUUID().slice(0, 6)}`, 100)
  const id = await como(jt, async (c) => (await c.query(`select wms.crear_salida('DISTRIBUCION', 'VENTA', $1, $2::jsonb) id`, [logissa, JSON.stringify([{ producto_id: prod, cantidad }])])).rows[0].id as string)
  await como(jt, (c) => c.query('select * from wms.asignar_salida($1)', [id]))
  const orden = await como(jt, async (c) => (await c.query('select wms.generar_orden_picking($1) id', [id])).rows[0].id as string)
  const lineas = await q('select id, cantidad from wms.ordenes_picking_lineas where orden_id = $1 order by id', [orden])
  for (const l of lineas) await como(aux1, (c) => c.query('select wms.registrar_picking($1, $2, $3, $4)', [l.id, 'PICKEADA', l.cantidad, null]))
  await como(sandra, (c) => c.query('select wms.conformar_orden($1, null, $2, null)', [orden, bultos]))
  await como(jt, (c) => c.query('select wms.registrar_gre($1, $2, null)', [id, `T${String(100 + nPed).padStart(3, '0')}-${String(++nPed).padStart(8, '0')}`]))
  const numero = (await uno('select numero from wms.salidas where id = $1', [id])).numero as string
  return { id, numero, prod, lote }
}
/** Una ruta PLANIFICADA con estos pedidos (en ese orden de parada). */
async function ruta(salidas: { id: string }[]) {
  const veh = (await uno(`insert into wms.vehiculos (placa, calificado) values ($1, true) returning id`, [`R${randomUUID().slice(0, 5)}`.toUpperCase()])).id as string
  const cond = (await uno(`insert into wms.personal_transporte (nombre, funcion) values ($1, 'CONDUCTOR') returning id`, [`Conductor ${randomUUID().slice(0, 6)}`])).id as string
  const r = (await uno(`insert into wms.rutas (numero, fecha, estado, vehiculo_id, conductor_id, creada_por) values ($1, current_date, 'PLANIFICADA', $2, $3, $4) returning id`, [`RUT-T-${randomUUID().slice(0, 6)}`, veh, cond, jt])).id as string
  let sec = 0
  for (const s of salidas) {
    nPed += 1
    const ped = `PED-C-${nPed}`
    const pd = (await uno(`insert into wms.pedidos_despacho (pedido_id, version, numero, fecha, cliente_id, cliente_nombre, cliente_ruc, snapshot, cambios, vigente, importado_por, salida_id) values ($1, 1, $1, current_date, 'c1', 'Cliente ' || $1, null, '{}'::jsonb, '{}', true, $2, $3) returning id`, [ped, jt, s.id])).id as string
    await base.admin.query(`insert into wms.ruta_paradas (ruta_id, secuencia, pedido_id, pedido_despacho_id, salida_id) values ($1, $2, $3, $4, $5)`, [r, ++sec, ped, pd, s.id])
  }
  return r
}
const checklist = (ok = true) => [{ item: 'Vehículo limpio', ok, nota: ok ? '' : 'Huele a combustible' }, { item: 'Termómetro operativo', ok: true, nota: '' }]
const cargar = (quien: string, r: string, codigo: string) => como(quien, async (c) => (await c.query('select wms.cargar_bulto($1, $2) r', [r, codigo])).rows[0].r as string)
const codigos = async (salida: string) => (await q(`select codigo from wms.bultos where salida_id = $1 and estado = 'EMBALADO' order by secuencia`, [salida])).map((b) => b.codigo as string)
const stock = async (prod: string) => (await uno(`select coalesce(sum(cantidad), 0)::int n from wms.saldos where producto_id = $1`, [prod])).n as number
const estadoRuta = async (r: string) => (await uno('select estado from wms.rutas where id = $1', [r])).estado as string

beforeAll(async () => {
  base = await crearBaseDePrueba()
  logissa = await idPropietario(base.admin, 'LOGISSA')
  dt = base.personas.katia.id
  jt = await persona('jefe_transporte'); aux1 = await persona('auxiliar'); sandra = await persona(['asistente_dt', 'conformidad_despacho'])
  await base.admin.query(`insert into wms.posiciones (codigo, rack, forma, tipo_area) values ('STG-9', 'S', 'PISO', 'DESPACHO')`)
  await base.admin.query(`update wms.parametros set valor = 'STG-9' where clave = 'posicion_despacho_defecto'`)
  // lo que decidió Sebas el 11-nov: sin embalaje, sin escaneo del QR y Lima = 15 y 07
  await base.admin.query(`update wms.parametros set valor = 'NO' where clave in ('embalaje_activo', 'carga_escaneo_qr'); update wms.parametros set valor = '15,07' where clave = 'ubigeos_lima_metropolitana'`)
}, 180_000)
afterAll(async () => { await base?.cerrar() })

const lleva = (id: string) => como(jt, async (c) => (await c.query('select wms.salida_lleva_etiqueta($1) r', [id])).rows[0].r as boolean)
const contar = (quien: string, r: string, salida: string, n: number) => como(quien, async (c) => (await c.query('select wms.registrar_conteo_carga($1, $2, $3) r', [r, salida, n])).rows[0].r as number)
const cargados = async (r: string, salida: string) => (await uno(`select count(*)::int n from wms.carga_bultos c join wms.bultos b on b.id = c.bulto_id where c.ruta_id = $1 and b.salida_id = $2 and c.estado = 'CARGADO'`, [r, salida])).n as number

describe('sin embalaje y carga por conteo (0061)', () => {
  it('con el embalaje apagado la conformidad deja los bultos del pedido y «Embalar» ya no se usa', async () => {
    const a = await pedidoListo('F-8.1', 10, 3)
    expect(await uno('select requiere_embalaje r, bultos_conformidad n from wms.salidas where id = $1', [a.id])).toMatchObject({ r: false, n: 3 })
    expect(await codigos(a.id)).toEqual([`${a.numero}-B1`, `${a.numero}-B2`, `${a.numero}-B3`])
    expect((await falla(como(aux1, (c) => c.query('select wms.embalar_salida($1, $2::jsonb)', [a.id, '[]'])))).message).toMatch(/no necesita embalaje|Un pedido se embala|ya está embalado/)
  })

  it('lleva etiqueta solo a provincia: Lima (15) y Callao (07) no; sin dato, sí', async () => {
    const a = await pedidoListo('F-8.1', 2)
    expect(await lleva(a.id)).toBe(true)                                              // sin ubigeo: se etiqueta (lo más prudente)
    for (const [ubigeo, esperado] of [['150101', false], ['150501', false], ['070101', false], ['040101', true], ['140101', true]] as const) {
      await base.admin.query(`update wms.salidas set cliente_manual = jsonb_build_object('ubigeo', $2::text) where id = $1`, [a.id, ubigeo])
      expect(await lleva(a.id), ubigeo).toBe(esperado)
    }
  })

  it('el conteo marca los primeros N bultos, se corrige con motivo guardado, y la unidad solo se libera con todos contados', async () => {
    const a = await pedidoListo('F-8.1', 10, 3); const b = await pedidoListo('F-8.1', 6, 2)
    const r = await ruta([a, b])
    await como(aux1, (c) => c.query('select wms.guardar_checklist_vehicular($1, $2::jsonb)', [r, JSON.stringify(checklist())]))
    expect(await contar(aux1, r, a.id, 2)).toBe(2)
    expect(await cargados(r, a.id)).toBe(2)
    expect(await contar(aux1, r, a.id, 2)).toBe(2)                                    // repetirlo no cambia nada
    expect((await uno('select count(*)::int n from wms.carga_bultos where ruta_id = $1', [r])).n).toBe(2)
    expect((await falla(como(jt, (c) => c.query('select wms.liberar_unidad($1)', [r])))).message).toMatch(/Faltan 3 bultos por cargar/)
    // se corrige: eran 1, no 2
    await contar(aux1, r, a.id, 1)
    expect(await cargados(r, a.id)).toBe(1)
    expect(await uno(`select motivo_retiro from wms.carga_bultos where estado = 'RETIRADO' and ruta_id = $1`, [r])).toMatchObject({ motivo_retiro: expect.stringMatching(/Conteo corregido: se contaron 1 de 3/) })
    expect((await falla(contar(aux1, r, a.id, 4))).message).toMatch(/Este pedido tiene 3 bultos: cuenta de 0 a 3/)
    expect((await falla(contar(aux1, r, a.id, -1))).message).toMatch(/cuenta de 0 a 3/)
    await contar(aux1, r, a.id, 3); await contar(aux1, r, b.id, 2)
    await como(jt, (c) => c.query('select wms.liberar_unidad($1)', [r]))
    expect(await estadoRuta(r)).toBe('LIBERADA')
    expect((await falla(contar(aux1, r, a.id, 1))).message).toMatch(/La ruta ya no está en carga/)
  })

  it('el conteo exige permiso de carga, un pedido de la ruta y que no esté fuera de la salida', async () => {
    const a = await pedidoListo('F-8.1', 4, 2); const otro = await pedidoListo('F-8.1', 4, 1)
    const r = await ruta([a])
    expect((await falla(contar(base.personas.sinRol.id, r, a.id, 1))).message).toMatch(/No tienes permiso para cargar la unidad/)
    expect((await falla(contar(aux1, r, otro.id, 1))).message).toMatch(/Ese pedido no está en esta ruta/)
    await como(jt, (c) => c.query('select wms.excluir_pedido_de_carga($1, $2, $3)', [r, a.id, 'Cliente cerrado']))
    expect((await falla(contar(aux1, r, a.id, 1))).message).toMatch(/se dejó fuera de esta salida/)
  })

  it('el escaneo del QR sigue disponible (apagado en la pantalla, no en la base)', async () => {
    const a = await pedidoListo('F-8.1', 4, 2); const r = await ruta([a])
    const [a1] = await codigos(a.id)
    expect(await cargar(aux1, r, a1)).toBe('CARGADO')
    expect(await cargados(r, a.id)).toBe(1)
    expect(await contar(aux1, r, a.id, 2)).toBe(2)                                    // el conteo completa lo escaneado, sin duplicar
    expect((await uno('select count(*)::int n from wms.carga_bultos where ruta_id = $1', [r])).n).toBe(2)
  })

  it('al aplicar la 0061 con pedidos abiertos: los conformados sin bultos los reciben y los demás dejan de pedir embalaje', async () => {
    const x = await pedidoListo('F-8.1', 3, 2)
    // simula el estado de antes: embalaje pedido, bultos aún sin crear
    await base.admin.query(`update wms.bultos set estado = 'ANULADO', anulado_por = $2, anulado_en = now(), motivo_anulacion = 'prueba de la 0061' where salida_id = $1`, [x.id, jt])
    await base.admin.query(`update wms.salidas set requiere_embalaje = true where id = $1`, [x.id])
    const abierta = (await uno(`select id from wms.salidas where estado = 'ABIERTA' and conformada_en is null and id <> $1 limit 1`, [x.id]))
    await base.admin.query(await (await import('node:fs/promises')).readFile('supabase/migrations/0061_wms_sin_embalaje_y_carga_por_conteo.sql', 'utf8'))
    expect((await codigos(x.id)).length).toBe(2)
    expect((await uno('select requiere_embalaje r from wms.salidas where id = $1', [x.id])).r).toBe(false)
    if (abierta) expect((await uno('select requiere_embalaje r from wms.salidas where id = $1', [abierta.id])).r).toBe(false)
  })
})
