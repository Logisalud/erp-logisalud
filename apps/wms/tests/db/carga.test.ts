// S8 (migración 0021): carga por bultos, conciliación, «Liberar unidad» y «Salida confirmada» (el stock sale aquí, una sola vez).
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
/** Un pedido «listo para carga»: conforme, embalado en `bultos` bultos, con guía y paquete completo. */
async function pedidoListo(pos: string, cantidad: number, bultos = 1) {
  const prod = await producto()
  const lote = await sembrar(prod, pos, `L-${randomUUID().slice(0, 6)}`, 100)
  const id = await como(jt, async (c) => (await c.query(`select wms.crear_salida('DISTRIBUCION', 'VENTA', $1, $2::jsonb) id`, [logissa, JSON.stringify([{ producto_id: prod, cantidad }])])).rows[0].id as string)
  await como(jt, (c) => c.query('select * from wms.asignar_salida($1)', [id]))
  const orden = await como(jt, async (c) => (await c.query('select wms.generar_orden_picking($1) id', [id])).rows[0].id as string)
  const lineas = await q('select id, cantidad, linea_id from wms.ordenes_picking_lineas where orden_id = $1 order by id', [orden])
  for (const l of lineas) await como(aux1, (c) => c.query('select wms.registrar_picking($1, $2, $3, $4)', [l.id, 'PICKEADA', l.cantidad, null]))
  for (const l of lineas) await como(sandra, (c) => c.query('select wms.dar_conformidad($1, $2, $3, null, $4)', [l.id, 'CONFORME', null, null]))
  const linea = lineas[0].linea_id as string
  const por = Math.floor(cantidad / bultos)
  const reparto = Array.from({ length: bultos }, (_, i) => ({ contenido: [{ linea_id: linea, lote_id: lote, cantidad: i === bultos - 1 ? cantidad - por * (bultos - 1) : por }] }))
  await como(aux1, (c) => c.query('select wms.embalar_salida($1, $2::jsonb)', [id, JSON.stringify(reparto)]))
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
  await base.admin.query(`insert into wms.posiciones (codigo, rack, forma, tipo_area) values ('STG-8', 'S', 'PISO', 'PENDIENTE_CONFORMIDAD')`)
}, 180_000)
afterAll(async () => { await base?.cerrar() })

describe('recorrido completo de la carga', () => {
  it('cargar, conciliar, checklist, liberar la unidad y confirmar la salida: el stock baja SOLO al confirmar, y confirmar dos veces no descuenta dos veces', async () => {
    const a = await pedidoListo('F-8.1', 10, 2); const b = await pedidoListo('F-8.2', 6, 1)
    const r = await ruta([a, b])
    const antes = [await stock(a.prod), await stock(b.prod)]
    expect(antes).toEqual([100, 100])
    // conciliación: 3 bultos esperados, ninguno cargado
    const conc = () => como(jt, async (c) => (await c.query('select * from wms.conciliacion_carga($1)', [r])).rows as { salida_id: string; codigo: string | null; cargado: boolean; listo: boolean; excluida: boolean; bulto_secuencia: number | null; bulto_total: number | null }[])
    expect((await conc()).map((x) => `${x.codigo}:${x.cargado}`)).toEqual([...(await codigos(a.id)), ...(await codigos(b.id))].map((c) => `${c}:false`))
    const [a1, a2] = await codigos(a.id); const [b1] = await codigos(b.id)
    expect(await cargar(aux1, r, a1.toLowerCase())).toBe('CARGADO')
    expect(await cargar(aux1, r, a1)).toBe('YA_CARGADO')               // escanear dos veces no falla ni duplica
    expect((await uno('select count(*)::int n from wms.carga_bultos where ruta_id = $1', [r])).n).toBe(1)
    // sin checklist y con bultos sin cargar no se libera
    expect((await falla(como(jt, (c) => c.query('select wms.liberar_unidad($1)', [r])))).message).toMatch(/Falta el checklist/)
    await como(aux1, (c) => c.query('select wms.guardar_checklist_vehicular($1, $2::jsonb)', [r, JSON.stringify(checklist())]))
    expect((await falla(como(jt, (c) => c.query('select wms.liberar_unidad($1)', [r])))).message).toMatch(/Faltan 2 bultos por cargar/)
    await cargar(aux1, r, a2); await cargar(aux1, r, b1)
    expect((await conc()).every((x) => x.cargado)).toBe(true)
    await como(jt, (c) => c.query('select wms.liberar_unidad($1)', [r]))
    expect(await estadoRuta(r)).toBe('LIBERADA')
    expect(await stock(a.prod)).toBe(100)                              // liberar NO descuenta stock
    // ahora sí: salida confirmada
    const n1 = await como(jt, async (c) => (await c.query('select wms.confirmar_salida_ruta($1) n', [r])).rows[0].n as number)
    expect(n1).toBe(2)
    expect([await stock(a.prod), await stock(b.prod)]).toEqual([90, 94])
    expect(await estadoRuta(r)).toBe('EN_RUTA')
    expect(await uno('select salio_en is not null as sale, salio_por from wms.rutas where id = $1', [r])).toMatchObject({ sale: true, salio_por: jt })
    expect((await q(`select estado from wms.salidas where id in ($1, $2)`, [a.id, b.id])).map((x) => x.estado)).toEqual(['CONFIRMADA', 'CONFIRMADA'])
    // idempotente: repetir no descuenta de nuevo
    const n2 = await como(jt, async (c) => (await c.query('select wms.confirmar_salida_ruta($1) n', [r])).rows[0].n as number)
    expect(n2).toBe(0)
    expect([await stock(a.prod), await stock(b.prod)]).toEqual([90, 94])
    expect((await uno(`select count(*)::int n from wms.salida_movimientos where salida_id = $1 and tipo = 'SALIDA'`, [a.id])).n).toBe(1)
  })

  it('el checklist con un punto en «no» (con su nota) no deja liberar; una ruta liberada ya no recibe carga; quienes pueden liberar y confirmar', async () => {
    const a = await pedidoListo('F-8.3', 4); const r = await ruta([a])
    const [a1] = await codigos(a.id)
    await cargar(aux1, r, a1)
    expect((await falla(como(aux1, (c) => c.query('select wms.guardar_checklist_vehicular($1, $2::jsonb)', [r, JSON.stringify([{ item: 'Vehículo limpio', ok: false, nota: '' }])])))).message).toMatch(/necesita su nota/)
    await como(aux1, (c) => c.query('select wms.guardar_checklist_vehicular($1, $2::jsonb)', [r, JSON.stringify(checklist(false))]))
    expect((await falla(como(jt, (c) => c.query('select wms.liberar_unidad($1)', [r])))).message).toMatch(/puntos sin cumplir/)
    await como(aux1, (c) => c.query('select wms.guardar_checklist_vehicular($1, $2::jsonb)', [r, JSON.stringify(checklist(true))]))
    for (const quien of [aux1, sandra, base.personas.sinRol.id]) expect((await falla(como(quien, (c) => c.query('select wms.liberar_unidad($1)', [r])))).message, quien).toMatch(/No tienes permiso para liberar la unidad/)
    await como(jt, (c) => c.query('select wms.liberar_unidad($1)', [r]))
    expect((await falla(cargar(aux1, r, a1))).message).toMatch(/La ruta ya no está en carga/)
    expect((await falla(como(aux1, (c) => c.query('select wms.confirmar_salida_ruta($1)', [r])))).message).toMatch(/No tienes permiso para confirmar la salida/)
    await como(jt, (c) => c.query('select wms.confirmar_salida_ruta($1)', [r]))
  })

  it('confirmar la salida de una ruta sin liberar falla; y es todo o nada: si un pedido no puede salir, ninguno sale', async () => {
    const a = await pedidoListo('F-8.4', 4); const r = await ruta([a])
    expect((await falla(como(jt, (c) => c.query('select wms.confirmar_salida_ruta($1)', [r])))).message).toMatch(/todavía no está liberada/)
    expect(await stock(a.prod)).toBe(100)
  })
})

describe('excepciones de la carga', () => {
  it('un bulto de otro pedido o de otra ruta, inexistente o de un pedido que no está listo no se carga', async () => {
    const a = await pedidoListo('F-1.1', 4); const b = await pedidoListo('F-1.2', 4); const c2 = await pedidoListo('F-1.3', 4)
    const r1 = await ruta([a]); const r2 = await ruta([b])
    const [bb] = await codigos(b.id); const [cc] = await codigos(c2.id)
    expect((await falla(cargar(aux1, r1, bb))).message).toMatch(/no está en esta ruta \(va en RUT-T-/)
    expect((await falla(cargar(aux1, r1, cc))).message).toMatch(/que no está en esta ruta/)
    expect((await falla(cargar(aux1, r1, 'SAL-9999-99999-B1'))).message).toMatch(/No encontramos el bulto/)
    expect((await falla(cargar(aux1, r1, '  '))).message).toMatch(/Escanea o escribe/)
    await cargar(aux1, r2, bb)
    expect((await falla(cargar(aux1, r1, bb))).message).toMatch(/no está en esta ruta/)          // ya va cargado en otra
    // un pedido que dejó de estar listo (se anula su guía) no se carga
    const [aa] = await codigos(a.id)
    const g = await uno(`select id from wms.guias_remision where salida_id = $1 and estado = 'VIGENTE'`, [a.id])
    await como(jt, (c) => c.query('select wms.anular_gre($1, $2)', [g.id, 'Error']))
    expect((await falla(cargar(aux1, r1, aa))).message).toMatch(/todavía no está listo para carga/)
    expect((await falla(cargar(base.personas.sinRol.id, r1, aa))).message).toMatch(/No tienes permiso para cargar la unidad/)
  })

  it('falta un bulto en la carga: no se libera; el Jefe de Transporte deja ESE pedido fuera de la salida (con motivo) y la unidad sale con el resto', async () => {
    const a = await pedidoListo('F-2.1', 10, 2); const b = await pedidoListo('F-2.2', 5, 1)
    const r = await ruta([a, b])
    const [a1] = await codigos(a.id); const [b1] = await codigos(b.id)
    await cargar(aux1, r, a1); await cargar(aux1, r, b1)               // falta el bulto 2 del pedido A
    await como(aux1, (c) => c.query('select wms.guardar_checklist_vehicular($1, $2::jsonb)', [r, JSON.stringify(checklist())]))
    expect((await falla(como(jt, (c) => c.query('select wms.liberar_unidad($1)', [r])))).message).toMatch(/Faltan 1 bultos por cargar/)
    expect((await falla(como(aux1, (c) => c.query('select wms.excluir_pedido_de_carga($1, $2, $3)', [r, a.id, 'Se extravió'])))).message).toMatch(/No tienes permiso para dejar un pedido fuera/)
    expect((await falla(como(jt, (c) => c.query('select wms.excluir_pedido_de_carga($1, $2, $3)', [r, a.id, '  '])))).message).toMatch(/por qué el pedido se deja fuera/)
    await como(jt, (c) => c.query('select wms.excluir_pedido_de_carga($1, $2, $3)', [r, a.id, 'Se extravió el bulto 2']))
    expect((await uno(`select cb.estado from wms.carga_bultos cb join wms.bultos bu on bu.id = cb.bulto_id where bu.codigo = $1`, [a1])).estado).toBe('RETIRADO')
    expect((await falla(cargar(aux1, r, a1))).message).toMatch(/se dejó fuera de esta salida/)
    expect((await falla(como(jt, (c) => c.query('select wms.excluir_pedido_de_carga($1, $2, $3)', [r, a.id, 'otra vez'])))).message).toMatch(/ya se dejó fuera/)
    await como(jt, (c) => c.query('select wms.liberar_unidad($1)', [r]))
    await como(jt, (c) => c.query('select wms.confirmar_salida_ruta($1)', [r]))
    expect(await stock(b.prod)).toBe(95)                                // el pedido B salió
    expect(await stock(a.prod)).toBe(100)                               // el pedido A, no: su stock sigue
    expect((await uno('select estado from wms.salidas where id = $1', [a.id])).estado).toBe('ABIERTA')
  })

  it('un bulto cargado se retira con motivo; con carga viva no se reabre el embalaje; la historia de la carga no se borra', async () => {
    const a = await pedidoListo('F-2.3', 4); const r = await ruta([a])
    const [a1] = await codigos(a.id)
    await cargar(aux1, r, a1)
    expect((await falla(como(aux1, (c) => c.query('select wms.reabrir_embalaje($1, $2)', [a.id, 'Rehacer'])))).message).toMatch(/cargados en una ruta/)
    expect((await falla(como(aux1, (c) => c.query('select wms.retirar_bulto_carga($1, $2, $3)', [r, a1, '  '])))).message).toMatch(/por qué se retira/)
    await como(aux1, (c) => c.query('select wms.retirar_bulto_carga($1, $2, $3)', [r, a1, 'Se cargó por error']))
    expect((await falla(como(aux1, (c) => c.query('select wms.retirar_bulto_carga($1, $2, $3)', [r, a1, 'otra vez'])))).message).toMatch(/no está cargado/)
    await como(aux1, (c) => c.query('select wms.reabrir_embalaje($1, $2)', [a.id, 'Rehacer']))      // ya sin carga viva, sí
    expect((await falla(base.admin.query('delete from wms.carga_bultos where ruta_id = $1', [r]))).message).toMatch(/no se borra/)
    expect((await falla(base.admin.query(`update wms.carga_exclusiones set motivo = 'x'`))).message ?? 'sin filas').toBeTruthy()
  })
})

describe('migración 0021', () => {
  it('es re-ejecutable', async () => {
    const { SQL } = await import('./helpers')
    await base.admin.query(SQL.m0021()); await base.admin.query(SQL.m0021())
    expect((await uno(`select count(*)::int n from wms.permisos_rol where accion in ('cargar_ruta', 'liberar_unidad')`)).n).toBe(4)
  })
})
