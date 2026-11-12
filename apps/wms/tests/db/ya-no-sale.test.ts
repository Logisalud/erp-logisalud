// Migración 0064: «Ya no sale» (orden ya hecha o ya pickeada) y el tipo de «dejar fuera de la salida» (anulado / reprogramado).
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
async function pedidoListo(pos: string, cantidad: number, bultos = 1, conGre = true, hastaConformidad = true, pickear = hastaConformidad) {
  const prod = await producto()
  const lote = await sembrar(prod, pos, `L-${randomUUID().slice(0, 6)}`, 100)
  const id = await como(jt, async (c) => (await c.query(`select wms.crear_salida('DISTRIBUCION', 'VENTA', $1, $2::jsonb) id`, [logissa, JSON.stringify([{ producto_id: prod, cantidad }])])).rows[0].id as string)
  await como(jt, (c) => c.query('select * from wms.asignar_salida($1)', [id]))
  const orden = await como(jt, async (c) => (await c.query('select wms.generar_orden_picking($1) id', [id])).rows[0].id as string)
  const lineas = await q('select id, cantidad from wms.ordenes_picking_lineas where orden_id = $1 order by id', [orden])
  for (const l of lineas) if (pickear) await como(aux1, (c) => c.query('select wms.registrar_picking($1, $2, $3, $4)', [l.id, 'PICKEADA', l.cantidad, null]))
  if (hastaConformidad) await como(sandra, (c) => c.query('select wms.conformar_orden($1, null, $2, null)', [orden, bultos]))
  if (conGre) await como(jt, (c) => c.query('select wms.registrar_gre($1, $2, null)', [id, `T${String(100 + nPed).padStart(3, '0')}-${String(++nPed).padStart(8, '0')}`]))
  const numero = (await uno('select numero from wms.salidas where id = $1', [id])).numero as string
  return { id, numero, prod, lote, orden }
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


let aux2: string
beforeAll(async () => {
  base = await crearBaseDePrueba()
  logissa = await idPropietario(base.admin, 'LOGISSA')
  dt = base.personas.katia.id
  jt = await persona('jefe_transporte'); aux1 = await persona('auxiliar'); aux2 = await persona('auxiliar'); sandra = await persona(['asistente_dt', 'conformidad_despacho'])
  await base.admin.query(`insert into wms.posiciones (codigo, rack, forma, tipo_area) values ('STG-10', 'S', 'PISO', 'DESPACHO')`)
  await base.admin.query(`update wms.parametros set valor = 'STG-10' where clave = 'posicion_despacho_defecto'`)
  await base.admin.query(`update wms.parametros set valor = 'NO' where clave in ('embalaje_activo', 'carga_escaneo_qr')`)
  await base.admin.query(`update wms.guia_correlativos set ultimo = 0 where serie = 'TTT1'`)
}, 180_000)
afterAll(async () => { await base?.cerrar() })

const yaNoSale = (quien: string, id: string, motivo: string, rehacer = false) => como(quien, async (c) => (await c.query('select wms.ya_no_sale($1, $2, $3) r', [id, motivo, rehacer])).rows[0].r as { liberadas: number; por_devolver: number; cancelada: boolean; rehacer: boolean; pre_guia: string | null })
const salida = (id: string) => uno('select estado, cancelacion_pendiente, rehacer_al_cancelar, motivo_cancelacion from wms.salidas where id = $1', [id])
const preGuia = (id: string) => uno(`select estado, detalle from wms.guia_numeros where salida_id = $1 and pre_guia order by id desc limit 1`, [id])
const crearPreGuia = (id: string) => como(jt, async (c) => (await c.query(`select wms.crear_pre_guia('TTT1', 'PRUEBA', $1) r`, [id])).rows[0].r)

describe('«Ya no sale» (0064)', () => {
  it('con la orden ya pickeada y la pre-guía hecha: cancela la pre-guía, deja lo pickeado por devolver y, al verificarse la devolución, la orden se cancela sola', async () => {
    const a = await pedidoListo('F-8.1', 10, 2, false)
    await crearPreGuia(a.id)
    expect((await preGuia(a.id)).estado).toBe('RESERVADO')
    const r = await yaNoSale(jt, a.id, 'El vendedor avisó que el cliente canceló', true)
    expect(r).toMatchObject({ cancelada: false, rehacer: true, pre_guia: expect.stringMatching(/^TTT1-\d{8}$/) })
    expect(r.por_devolver).toBeGreaterThan(0)
    expect(await preGuia(a.id)).toMatchObject({ estado: 'SIN_USAR', detalle: expect.stringContaining('Ya no sale') })
    expect(await salida(a.id)).toMatchObject({ estado: 'ABIERTA', cancelacion_pendiente: true, rehacer_al_cancelar: true })
    expect((await q(`select estado, causa from wms.devoluciones_picking where salida_id = $1`, [a.id])).every((d) => d.estado === 'POR_DEVOLVER' && d.causa === 'PEDIDO_CANCELADO')).toBe(true)
    expect((await uno(`select mensaje from wms.alertas where clave = $1`, [`devolucion:${a.id}`])).mensaje).toMatch(/ya no sale.*por devolver a su ubicación/)
    // el auxiliar la devuelve y OTRA persona la verifica: la orden se cancela sola
    await como(aux1, (c) => c.query('select wms.ejecutar_devolucion_picking($1)', [a.id]))
    await como(aux2, (c) => c.query('select wms.verificar_devolucion_picking($1)', [a.id]))
    expect(await salida(a.id)).toMatchObject({ estado: 'CANCELADA', cancelacion_pendiente: false })
    // no se borra nada y queda auditado
    expect((await uno(`select count(*)::int n from wms.audit_events where evento = 'ya_no_sale' and entidad_id = $1`, [a.id])).n).toBe(1)
  })

  it('sin picking, la orden se cancela de una vez y, si se pidió rehacer, el pedido vuelve a la bandeja', async () => {
    const a = await pedidoListo('F-8.1', 6, 1, false, false)
    const pd = (await uno(`insert into wms.pedidos_despacho (pedido_id, version, numero, fecha, cliente_id, cliente_nombre, cliente_ruc, snapshot, cambios, vigente, importado_por, salida_id)
      values ($1, 1, $1, current_date, 'c1', 'Cliente', null, '{}'::jsonb, '{}', true, $2, $3) returning id`, [`PED-YNS-${randomUUID().slice(0, 4)}`, jt, a.id])).id
    const r = await yaNoSale(jt, a.id, 'El cliente ya no lo quiere', true)
    expect(r).toMatchObject({ cancelada: true, por_devolver: 0 })
    expect((await salida(a.id)).estado).toBe('CANCELADA')
    expect((await uno('select salida_id from wms.pedidos_despacho where id = $1', [pd])).salida_id).toBeNull()      // el pedido vuelve a la bandeja
  })

  it('sin rehacer, el pedido se cancela: se avisa al Jefe de Transporte para que el área comercial lo cancele en Pedidos', async () => {
    const a = await pedidoListo('F-8.1', 6, 1, false, false)
    await yaNoSale(jt, a.id, 'Se cancela el pedido completo', false)
    expect((await uno(`select destinatario_rol, mensaje from wms.alertas where clave = $1`, [`ya-no-sale:${a.id}`]))).toMatchObject({ destinatario_rol: 'jefe_transporte', mensaje: expect.stringMatching(/cancele en Pedidos/) })
  })

  it('pide motivo, permiso y una orden abierta; con guía registrada pide anularla primero', async () => {
    const a = await pedidoListo('F-8.1', 6, 1, true)
    expect((await falla(yaNoSale(jt, a.id, 'no'))).message).toMatch(/al menos 5 letras/)
    expect((await falla(yaNoSale(aux1, a.id, 'Motivo suficiente'))).message).toMatch(/No tienes permiso para cancelar una salida/)
    expect((await falla(yaNoSale(jt, a.id, 'Motivo suficiente'))).message).toMatch(/anula la guía primero/)
    const b = await pedidoListo('F-8.1', 4, 1, false, false)
    await yaNoSale(jt, b.id, 'Motivo suficiente')
    expect((await falla(yaNoSale(jt, b.id, 'Motivo suficiente'))).message).toMatch(/ya no está abierta/)
  })

  it('en una ruta PLANIFICADA (el estado real de carga) el pedido sale del plan pero queda marcado «anulado»; con la ruta ya en camino no se puede; con bultos cargados pide retirarlos', async () => {
    const a = await pedidoListo('F-8.1', 6, 2, false); const b = await pedidoListo('F-8.1', 6, 1, false)
    const r = await ruta([a, b])
    // un bulto del pedido a ya está cargado en el vehículo: primero se retira
    const bulto = (await uno(`select id from wms.bultos where salida_id = $1 and secuencia = 1`, [a.id])).id as string
    await base.admin.query(`insert into wms.carga_bultos (ruta_id, bulto_id, cargado_por) values ($1, $2, $3)`, [r, bulto, jt])
    expect((await falla(yaNoSale(jt, a.id, 'Motivo suficiente'))).message).toMatch(/bultos de este pedido cargados en el vehículo/)
    await como(jt, (cl) => cl.query(`select wms.retirar_bulto_carga($1, $2, 'Se descarga')`, [r, `${a.numero}-B1`]))
    await yaNoSale(jt, a.id, 'El cliente canceló')
    expect(await uno(`select tipo, motivo from wms.carga_exclusiones where ruta_id = $1 and salida_id = $2`, [r, a.id])).toMatchObject({ tipo: 'ANULADO', motivo: expect.stringContaining('Ya no sale') })
    expect((await uno(`select activa from wms.ruta_paradas where ruta_id = $1 and salida_id = $2`, [r, a.id])).activa).toBe(false)      // sale del plan: el pedido queda libre
    // la pantalla de carga lo sigue mostrando, marcado como dejado fuera
    const conc = await como(jt, async (cl) => (await cl.query('select salida_id, excluida from wms.conciliacion_carga($1)', [r])).rows as { salida_id: string; excluida: boolean }[])
    expect(conc.find((x) => x.salida_id === a.id)).toMatchObject({ excluida: true })
    await base.admin.query(`update wms.rutas set estado = 'EN_RUTA' where id = $1`, [r])
    expect((await falla(yaNoSale(jt, b.id, 'Motivo suficiente'))).message).toMatch(/ya salió/)
  })
})

describe('dejar un pedido fuera de la salida: anulado o reprogramado (0064)', () => {
  it('guarda el tipo (por defecto «fuera»), no acepta otro y la exclusión no se edita', async () => {
    const a = await pedidoListo('F-8.1', 4, 1, false); const b = await pedidoListo('F-8.1', 4, 1, false); const c = await pedidoListo('F-8.1', 4, 1, false)
    const r = await ruta([a, b, c])
    const excluir = (salida: string, tipo?: string) => como(jt, (cl) => (tipo === undefined ? cl.query('select wms.excluir_pedido_de_carga($1, $2, $3)', [r, salida, 'Motivo de prueba']) : cl.query('select wms.excluir_pedido_de_carga($1, $2, $3, $4)', [r, salida, 'Motivo de prueba', tipo])))
    await excluir(a.id, 'REPROGRAMADO'); await excluir(b.id, 'anulado'); await excluir(c.id)
    expect((await q('select tipo from wms.carga_exclusiones where ruta_id = $1 order by tipo', [r])).map((x) => x.tipo)).toEqual(['ANULADO', 'FUERA', 'REPROGRAMADO'])
    // cada uno sale del plan de esa ruta (queda libre para planificarlo otro día) y la fila se sigue mostrando
    expect((await q('select count(*)::int n from wms.ruta_paradas where ruta_id = $1 and activa', [r]))[0].n).toBe(0)
    expect((await como(jt, async (cl) => (await cl.query('select salida_id from wms.conciliacion_carga($1) where excluida', [r])).rows)).length).toBe(3)
    const otra = await ruta([a])         // el pedido reprogramado entra a otra ruta sin chocar con la anterior
    const d = await pedidoListo('F-8.1', 4, 1, false)
    const rd = await ruta([d])
    expect((await falla(como(jt, (cl) => cl.query(`select wms.excluir_pedido_de_carga($1, $2, 'Motivo', 'OTRO')`, [rd, d.id])))).message).toMatch(/Elige si el pedido se anula o se reprograma/)
    expect((await falla(base.admin.query(`update wms.carga_exclusiones set tipo = 'FUERA' where ruta_id = $1`, [r]))).message).toMatch(/no se edita ni se borra/)
  })
})

describe('correcciones de la auditoría (0065)', () => {
  it('cancelar la orden porque el pedido se canceló también cancela su pre-guía: el número no queda retenido', async () => {
    const b = await pedidoListo('F-8.1', 4, 1, false)
    await crearPreGuia(b.id)
    expect((await preGuia(b.id)).estado).toBe('RESERVADO')
    await base.admin.query(`select wms._cancelar_salida_por_pedido($1, 'El pedido se canceló en Pedidos')`, [b.id])
    expect(await preGuia(b.id)).toMatchObject({ estado: 'SIN_USAR', detalle: expect.stringContaining('La orden se canceló') })
  })

  it('«Editar» no cambia las líneas de una orden con lote indicado (tipo B); sí su nota', async () => {
    const a = await pedidoListo('F-8.1', 6, 1, false, false)
    await base.admin.query(`update wms.salida_lineas set lote_indicado_id = $2 where salida_id = $1`, [a.id, a.lote])
    const linea = (await uno('select id from wms.salida_lineas where salida_id = $1', [a.id])).id as string
    expect((await falla(como(jt, (c) => c.query(`select wms.editar_orden_salida($1, $2::jsonb, 'Cambio de cantidad')`, [a.id, JSON.stringify({ lineas: [{ linea_id: linea, cantidad: 3 }] })])))).message).toMatch(/lote indicado/)
    await como(jt, (c) => c.query(`select wms.editar_orden_salida($1, $2::jsonb, null)`, [a.id, JSON.stringify({ nota: 'Entregar por la tarde' })]))
  })

  it('dar_conformidad por línea respeta lo mismo que conformar_orden: una orden tomada por otra persona queda bloqueada', async () => {
    const a = await pedidoListo('F-8.1', 6, 1, false, false, true)      // pickeada, sin conformidad todavía
    const lineas = await q('select id from wms.ordenes_picking_lineas where orden_id = $1', [a.orden])
    await como(sandra, (c) => c.query('select wms.tomar_para_conformidad($1)', [a.orden]))
    expect((await falla(como(aux2, (c) => c.query(`select wms.dar_conformidad($1, 'CONFORME', null, null)`, [lineas[0].id])))).message).toMatch(/la tomó otra persona/)
  })
})
