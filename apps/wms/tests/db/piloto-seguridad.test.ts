// Piloto (0038): modo_piloto, avisos a Pedidos retenidos y copia inmutable de las órdenes de compra.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPosicion, idPropietario, postear, SQL } from './helpers'

let base: BaseDePrueba
let logissa: string
let jt: string
let aux1: string
let sandra: string
let dt: string
let n = 0
let nPed = 0
let nGuia = 0
let nPan = 0

const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
const como = <T>(id: string, fn: (c: import('pg').Client) => Promise<T>) => base.como(id, fn)

async function persona(rol: string | string[]): Promise<string> {
  const id = randomUUID()
  await base.admin.query('insert into auth.users (id) values ($1)', [id])
  for (const r of Array.isArray(rol) ? rol : [rol]) await base.admin.query('insert into wms.usuario_roles (user_id, rol) values ($1, $2)', [id, r])
  return id
}
async function producto(): Promise<string> {
  n += 1
  return (await uno(`insert into catalogo.productos (codigo, descripcion, unidad_medida) values ($1, $2, 'TABLETA') returning id`, [`GE-${n}-${randomUUID().slice(0, 4)}`, `Producto guía ${n}`])).id as string
}
async function sembrar(prod: string, pos: string, lote: string, cantidad: number) {
  const posId = await idPosicion(base.admin, pos)
  const loteId = (await uno(`insert into wms.lotes (producto_id, codigo, vence, propietario_id) values ($1, $2, '2030-06-30', $3) returning id`, [prod, lote, logissa])).id as string
  await como(base.personas.admin.id, (c) => postear(c, 'CARGA_INICIAL', [{ posicion_id: posId, producto_id: prod, lote_id: loteId, propietario_id: logissa, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: randomUUID(), delta: cantidad }]))
  return loteId
}
const saldoEn = async (prod: string, pos: string) => Number((await uno(`select coalesce(sum(s.cantidad), 0)::int n from wms.saldos s join wms.posiciones p on p.id = s.posicion_id where s.producto_id = $1 and p.codigo = $2`, [prod, pos])).n)
const saldoEnZona = async (prod: string, area: string) => Number((await uno(`select coalesce(sum(s.cantidad), 0)::int n from wms.saldos s join wms.posiciones p on p.id = s.posicion_id where s.producto_id = $1 and p.tipo_area = $2`, [prod, area])).n)
const conformar = (quien: string, op: string, bultos = 2) =>
  como(quien, async (c) => (await c.query('select wms.conformar_orden($1, null, $2, null) r', [op, bultos])).rows[0].r as Record<string, unknown>)

/** Una Orden de Salida impresa con `aux1` como picker. */
async function orden(pos: string, cantidad: number) {
  const prod = await producto()
  await sembrar(prod, pos, `L-${randomUUID().slice(0, 6)}`, 100)
  const salida = await como(jt, async (c) => (await c.query(`select wms.crear_salida('DISTRIBUCION', 'VENTA', $1, $2::jsonb) id`, [logissa, JSON.stringify([{ producto_id: prod, cantidad }])])).rows[0].id as string)
  await como(jt, (c) => c.query('select * from wms.asignar_salida($1)', [salida]))
  const op = await como(jt, async (c) => (await c.query('select wms.generar_orden_picking($1, $2) id', [salida, aux1])).rows[0].id as string)
  const numero = (await uno('select numero from wms.salidas where id = $1', [salida])).numero as string
  return { prod, salida, op, numero, pos }
}
/** Pone el pedido en una ruta del día; `completa` = con vehículo y conductor. */
async function aRuta(salida: string, completa = true) {
  const veh = completa ? (await uno(`insert into wms.vehiculos (placa, calificado) values ($1, true) returning id`, [`G${randomUUID().slice(0, 5)}`.toUpperCase()])).id : null
  const cond = completa ? (await uno(`insert into wms.personal_transporte (nombre, funcion, dni) values ($1, 'CONDUCTOR', '12345678') returning id`, [`Conductor ${randomUUID().slice(0, 6)}`])).id : null
  const r = (await uno(`insert into wms.rutas (numero, fecha, estado, vehiculo_id, conductor_id, creada_por) values ($1, current_date, 'PLANIFICADA', $2, $3, $4) returning id`, [`RUT-G-${randomUUID().slice(0, 6)}`, veh, cond, jt])).id as string
  nPed += 1
  const ped = `PED-G-${nPed}`
  const pd = (await uno(`insert into wms.pedidos_despacho (pedido_id, version, numero, fecha, cliente_id, cliente_nombre, cliente_ruc, snapshot, vigente, importado_por, salida_id)
    values ($1, 1, $1, current_date, 'c1', 'Botica Salud', '20512345671', '{"cliente":{"id":"c1","nombre":"Botica Salud"}}'::jsonb, true, $2, $3) returning id`, [ped, jt, salida])).id
  await base.admin.query(`insert into wms.ruta_paradas (ruta_id, secuencia, pedido_id, pedido_despacho_id, salida_id) values ($1, 1, $2, $3, $4)`, [r, ped, pd, salida])
  return { ruta: r, pedido: ped }
}

const panel = (quien: string, salida: string, numero: string) => como(quien, async (c) =>
  (await c.query('select wms.registrar_guia_panel($1, $2, $3::date, $4, $5, null, $6) id', [salida, numero, hoy, 'ACEPTADA', 'https://panel.nubefact.test/g.pdf', 'Panel'])).rows[0].id as string)
const modoPiloto = (v: string) => base.admin.query(`update wms.parametros set valor = $1 where clave = 'modo_piloto'`, [v])
const compras = async () => {
  const prov = (await uno(`insert into compras.proveedores (ruc, razon_social) values ($1, 'Proveedor Piloto') returning id`, [`20${Math.floor(Math.random() * 1e9)}`.slice(0, 11)])).id as string
  const prod = await producto()
  const oc = (await uno(`insert into compras.ordenes_compra (codigo, proveedor_id, estado) values ($1, $2, 'confirmada') returning id`, [`OC-P-${randomUUID().slice(0, 6)}`, prov])).id as string
  const it = (await uno(`insert into compras.ordenes_compra_items (oc_id, producto_id, cantidad_pedida) values ($1, $2, 100) returning id`, [oc, prod])).id as string
  return { prov, prod, oc, it }
}
const sync = (quien: string, oc: string) => como(quien, async (c) => (await c.query('select wms.sincronizar_oc($1) r', [oc])).rows[0].r as Record<string, unknown>)
const versiones = (oc: string) => q('select version, hash, eliminada_en_compras from wms.oc_versiones where oc_id = $1 order by version', [oc])
const alertasOc = (oc: string) => q(`select clave, destinatario_rol, mensaje from wms.alertas where tipo = 'OC_CAMBIADA' and clave like $1 order by clave`, [`oc-cambiada:${oc}:%`])

beforeAll(async () => {
  base = await crearBaseDePrueba({ piloto: true })
  logissa = await idPropietario(base.admin, 'LOGISSA')
  jt = await persona('jefe_transporte'); aux1 = await persona('auxiliar'); sandra = await persona(['asistente_dt', 'conformidad_despacho'])
  await base.admin.query(`insert into wms.posiciones (codigo, rack, forma, tipo_area) values ('STG-P', 'S', 'PISO', 'DESPACHO')`)
  await base.admin.query(`update wms.parametros set valor = 'STG-P' where clave = 'posicion_despacho_defecto'`)
}, 180_000)
afterAll(async () => { await base?.cerrar() })

describe('modo_piloto', () => {
  it('nace en «si», solo admite si o no (y normaliza) y la 0038 se puede volver a aplicar', async () => {
    expect((await uno(`select valor from wms.parametros where clave = 'modo_piloto'`)).valor).toBe('si')
    await expect(base.admin.query(`update wms.parametros set valor = 'quizas' where clave = 'modo_piloto'`)).rejects.toThrow(/«si» y se apaga con «no»/)
    await modoPiloto(' NO ')
    expect((await uno(`select valor from wms.parametros where clave = 'modo_piloto'`)).valor).toBe('no')
    await modoPiloto('SI')
    await base.admin.query(SQL.m0038())
    expect((await uno(`select valor from wms.parametros where clave = 'modo_piloto'`)).valor).toBe('si')
  })
  it('falla cerrada: sin el parámetro se asume piloto', async () => {
    await base.admin.query(`delete from wms.parametros where clave = 'modo_piloto'`)
    try { expect((await uno('select wms._modo_piloto() v')).v).toBe(true) } finally { await base.admin.query(`insert into wms.parametros (clave, valor) values ('modo_piloto', 'si')`) }
  })
})

describe('B.4: nada hacia Pedidos en el piloto', () => {
  it('el aviso de guía nace RETENIDO_PILOTO, no se puede enviar ni cambiar ni borrar; con modo_piloto = no nace PENDIENTE', async () => {
    const o = await orden('F-9.1', 4)
    await conformar(sandra, o.op); await aRuta(o.salida)
    const id = await panel(jt, o.salida, 'TTT1-00000901')
    const ev = await q('select id, tipo, estado, payload from wms.eventos_pedidos where guia_id = $1', [id])
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ tipo: 'GUIA_EMITIDA', estado: 'RETENIDO_PILOTO' })
    expect(ev[0].payload).toMatchObject({ guia: 'TTT1-00000901' })     // el contenido se guarda (para el go-live), pero no sale
    expect((await falla(como(jt, (c) => c.query('select wms.marcar_evento_pedidos($1, true)', [ev[0].id])))).message).toMatch(/no se envía nada a Pedidos/)
    await como(jt, (c) => c.query('select wms.marcar_evento_pedidos($1, false, $2)', [ev[0].id, 'x']))
    expect((await uno('select estado, intentos from wms.eventos_pedidos where id = $1', [ev[0].id]))).toMatchObject({ estado: 'RETENIDO_PILOTO', intentos: 0 })
    await expect(base.admin.query(`update wms.eventos_pedidos set estado = 'PENDIENTE' where id = $1`, [ev[0].id])).rejects.toThrow(/no se edita/)
    await expect(base.admin.query(`update wms.eventos_pedidos set estado = 'ENVIADO' where id = $1`, [ev[0].id])).rejects.toThrow(/no se edita/)
    await expect(base.admin.query('delete from wms.eventos_pedidos where id = $1', [ev[0].id])).rejects.toThrow(/no se borra/)
    expect(Number((await uno(`select count(*) n from wms.eventos_pedidos where estado = 'PENDIENTE'`)).n)).toBe(0)

    await modoPiloto('no')
    try {
      const o2 = await orden('F-9.2', 3)
      await conformar(sandra, o2.op); await aRuta(o2.salida)
      const id2 = await panel(jt, o2.salida, 'TTT1-00000902')
      expect((await uno('select estado from wms.eventos_pedidos where guia_id = $1', [id2])).estado).toBe('PENDIENTE')
    } finally { await modoPiloto('si') }
  })
})

describe('A.1: copia inmutable de las órdenes de compra', () => {
  it('crea la versión 1 con encabezado, líneas, hash, fecha y quién; sin cambios no duplica', async () => {
    const c = await compras()
    expect(await sync(sandra, c.oc)).toMatchObject({ accion: 'CREADA', version: 1 })
    const v = await uno('select * from wms.oc_versiones where oc_id = $1', [c.oc])
    expect(v).toMatchObject({ version: 1, estado_oc: 'confirmada', creada_por: sandra, eliminada_en_compras: false })
    expect(v.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(v.encabezado).toMatchObject({ proveedor_nombre: 'Proveedor Piloto', anulada: false })
    expect(v.lineas).toHaveLength(1)
    expect(v.lineas[0]).toMatchObject({ oc_item_id: c.it, producto_id: c.prod, cantidad_pedida: 100 })
    expect(await sync(sandra, c.oc)).toMatchObject({ accion: 'SIN_CAMBIOS', version: 1 })
    // lo recibido y lo facturado cambian a diario y NO son un cambio de la OC
    await base.admin.query('update compras.ordenes_compra_items set cantidad_recibida = 40, cantidad_facturada = 40 where id = $1', [c.it])
    await base.admin.query(`update compras.ordenes_compra set estado = 'parcialmente_recibida' where id = $1`, [c.oc])
    expect(await sync(sandra, c.oc)).toMatchObject({ accion: 'SIN_CAMBIOS' })
    expect(await versiones(c.oc)).toHaveLength(1)
    expect(await alertasOc(c.oc)).toHaveLength(0)
  })

  it('un cambio de cantidad, de líneas o la anulación crea una versión nueva con alerta OC_CAMBIADA y deja intacta la anterior', async () => {
    const c = await compras()
    await sync(sandra, c.oc)
    const v1 = await uno('select * from wms.oc_versiones where oc_id = $1 and version = 1', [c.oc])
    await base.admin.query('update compras.ordenes_compra_items set cantidad_pedida = 120 where id = $1', [c.it])
    expect(await sync(sandra, c.oc)).toMatchObject({ accion: 'CAMBIADA', version: 2 })
    const prod2 = await producto()
    await base.admin.query('insert into compras.ordenes_compra_items (oc_id, producto_id, cantidad_pedida) values ($1, $2, 5)', [c.oc, prod2])
    expect(await sync(sandra, c.oc)).toMatchObject({ accion: 'CAMBIADA', version: 3 })
    await base.admin.query(`update compras.ordenes_compra set estado = 'anulada' where id = $1`, [c.oc])
    expect(await sync(sandra, c.oc)).toMatchObject({ accion: 'CAMBIADA', version: 4 })
    expect((await versiones(c.oc)).map((x) => x.version)).toEqual([1, 2, 3, 4])
    expect(await uno('select * from wms.oc_versiones where oc_id = $1 and version = 1', [c.oc])).toEqual(v1)
    const al = await alertasOc(c.oc)
    expect(al.map((a) => a.destinatario_rol)).toEqual(['asistente_dt', 'asistente_dt', 'asistente_dt'])
    expect(al[0].mensaje).toMatch(/versión 2.*1 línea con otra cantidad/)
    expect(al[1].mensaje).toMatch(/1 línea agregada/)
    expect(al[2].mensaje).toMatch(/la anularon/)
    expect((await uno(`select count(*)::int n from wms.audit_events where evento = 'oc_version_creada' and entidad_id in (select id::text from wms.oc_versiones where oc_id = $1)`, [c.oc])).n).toBe(4)
  })

  it('si Compras borra la OC, la copia se conserva y una versión nueva lo deja asentado (con alerta)', async () => {
    const c = await compras()
    await sync(sandra, c.oc)
    await base.admin.query('delete from compras.ordenes_compra_items where oc_id = $1', [c.oc])
    await base.admin.query('delete from compras.ordenes_compra where id = $1', [c.oc])
    expect(await sync(sandra, c.oc)).toMatchObject({ accion: 'ELIMINADA', version: 2 })
    expect(await sync(sandra, c.oc)).toMatchObject({ accion: 'SIN_CAMBIOS', version: 2 })
    const vs = await versiones(c.oc)
    expect(vs.map((x) => x.eliminada_en_compras)).toEqual([false, true])
    expect((await uno('select lineas from wms.oc_versiones where oc_id = $1 and version = 1', [c.oc])).lineas).toHaveLength(1)
    expect((await alertasOc(c.oc))[0].mensaje).toMatch(/ya no existe en Compras/)
    expect(await sync(sandra, randomUUID())).toMatchObject({ accion: 'AUSENTE' })
  })

  it('solo se agregan filas: ni update, ni delete, ni truncate (ni con permisos de administrador); la vista da la vigente', async () => {
    const c = await compras()
    await sync(sandra, c.oc)
    await base.admin.query('update compras.ordenes_compra_items set cantidad_pedida = 7 where id = $1', [c.it]); await sync(sandra, c.oc)
    for (const sql of [`update wms.oc_versiones set hash = 'x'`, 'delete from wms.oc_versiones', 'truncate wms.oc_versiones'])
      expect((await falla(base.admin.query(sql))).message, sql).toMatch(/no se edita ni se borra/)
    for (const sql of [`insert into wms.oc_versiones (oc_id, oc_codigo, version, encabezado, lineas, hash) values (gen_random_uuid(), 'X', 1, '{}', '[]', 'h')`, `update wms.oc_versiones set hash = 'x'`, 'delete from wms.oc_versiones'])
      expect((await falla(como(base.personas.admin.id, (cl) => cl.query(sql)))).message, sql).toMatch(/permission denied/)
    expect((await uno('select version from wms.v_oc_versiones_vigentes where oc_id = $1', [c.oc])).version).toBe(2)
  })

  it('permisos: sin permiso de ejecutar no copia; «todas las abiertas» revisa las abiertas y las que ya tenían copia', async () => {
    const c = await compras()
    expect((await falla(sync(base.personas.auditor.id, c.oc))).message).toMatch(/No tienes permiso/)
    const r = await como(sandra, async (cl) => (await cl.query('select wms.sincronizar_ocs_abiertas() r')).rows[0].r as Record<string, number>)
    expect(r.nuevas).toBeGreaterThanOrEqual(1)
    expect((await versiones(c.oc))).toHaveLength(1)
    await base.admin.query('update compras.ordenes_compra_items set cantidad_pedida = 1 where id = $1', [c.it])
    const r2 = await como(sandra, async (cl) => (await cl.query('select wms.sincronizar_ocs_abiertas() r')).rows[0].r as Record<string, number>)
    expect(r2.cambiadas).toBeGreaterThanOrEqual(1)
    const r3 = await como(sandra, async (cl) => (await cl.query('select wms.sincronizar_ocs_abiertas() r')).rows[0].r as Record<string, number>)
    expect(r3).toMatchObject({ nuevas: 0, cambiadas: 0, eliminadas: 0 })
    expect(r3.sin_cambios).toBe(r3.revisadas)
  })
})

describe('Fase 4 · P1: el piloto con producción real no abre nada a clientes', () => {
  it('el interruptor de clientes sigue apagado, no hay usuarios de cliente y el piloto está encendido', async () => {
    expect((await uno(`select valor from wms.parametros where clave = 'acceso_clientes_habilitado'`)).valor).toBe('false')
    expect(Number((await uno(`select count(*)::int n from wms.usuario_roles where rol in ('usuario_cliente', 'dt_cliente')`)).n)).toBe(0)
    expect((await uno(`select valor from wms.parametros where clave = 'modo_piloto'`)).valor).toBe('si')
  })
  it('un usuario de cliente no se puede crear con el interruptor apagado (ni siquiera siendo administrador)', async () => {
    const cliente = randomUUID()
    await base.admin.query('insert into auth.users (id) values ($1)', [cliente])
    const e = await falla(base.admin.query(`insert into wms.usuario_roles (user_id, rol) values ($1, 'usuario_cliente')`, [cliente]))
    expect(e.message).toMatch(/cliente/i)
  })
})
