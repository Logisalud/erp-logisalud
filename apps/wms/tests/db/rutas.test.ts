// S4 (migración 0017): rutas — planificación con vehículo y personal, salida y asignación FEFO por pedido, versiones, corte, vehículo calificado y confirmación.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PedidoSnapshot } from '@/domain/pedidos-despacho'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPosicion, idPropietario, postear } from './helpers'

let base: BaseDePrueba
let logissa: string
let jt: string
let aux: string
let soloAlmacen: string

const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
const en = (dias: number) => { const d = new Date(`${hoy}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10) }
const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
const como = <T>(id: string, fn: (c: import('pg').Client) => Promise<T>) => base.como(id, fn)

async function persona(rol: string | string[]): Promise<string> {
  const id = randomUUID()
  await base.admin.query('insert into auth.users (id) values ($1)', [id])
  for (const r of Array.isArray(rol) ? rol : [rol]) await base.admin.query('insert into wms.usuario_roles (user_id, rol) values ($1, $2)', [id, r])
  return id
}

let nProd = 0
const productos: Record<string, string> = {}
async function producto(): Promise<{ id: string; codigo: string }> {
  nProd += 1
  const codigo = `RT-P${nProd}-${randomUUID().slice(0, 4)}`
  const r = await uno(`insert into catalogo.productos (codigo, descripcion, unidad_medida) values ($1, $2, 'TABLETA') returning id`, [codigo, `Producto ruta ${nProd}`])
  productos[codigo] = r.id
  return { id: r.id, codigo }
}
async function sembrar(prod: string, lote: string, vence: string, cantidad: number) {
  const posId = await idPosicion(base.admin, 'F-1.1')
  const loteId = (await uno(`insert into wms.lotes (producto_id, codigo, vence, propietario_id) values ($1, $2, $3, $4) returning id`, [prod, lote, vence, logissa])).id
  await como(base.personas.admin.id, (c) => postear(c, 'CARGA_INICIAL', [{ posicion_id: posId, producto_id: prod, lote_id: loteId, propietario_id: logissa, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: randomUUID(), delta: cantidad }]))
}

let nPed = 0
const pedido = (codigo: string, cantidad: number, extra: Partial<PedidoSnapshot> = {}): PedidoSnapshot => {
  nPed += 1
  return {
    pedidoId: `rp-${nPed}-${randomUUID().slice(0, 4)}`, numero: `PED-R${String(nPed).padStart(3, '0')}`, version: 1, estado: 'READY_FOR_OPERATIONS', fecha: hoy, modificadoEn: `${hoy}T10:00:00Z`,
    cliente: { id: `c-${nPed}`, nombre: `Botica ${nPed} SAC`, ruc: '20123456789' },
    lineas: [{ lineaId: 'l-1', productoCodigo: codigo, descripcion: 'Producto', cantidad }], ...extra,
  }
}
const importar = (peds: PedidoSnapshot[]) => como(jt, (c) => c.query('select wms.registrar_importacion_pedidos($1, $2::jsonb, null)', ['rutas.test', JSON.stringify(peds)]))

let nVeh = 0
const vehiculo = async (calificado = false, activo = true) => { nVeh += 1; return (await uno(`insert into wms.vehiculos (placa, calificado, activo) values ($1, $2, $3) returning id`, [`T${nVeh}-${randomUUID().slice(0, 3)}`.toUpperCase(), calificado, activo])).id as string }
const personal = async (funcion: 'CONDUCTOR' | 'AUXILIAR') => (await uno(`insert into wms.personal_transporte (nombre, funcion) values ($1, $2) returning id`, [`${funcion} ${randomUUID().slice(0, 6)}`, funcion])).id as string

const crearRuta = (id: string, fecha: string, v: string | null = null, c: string | null = null, a: string | null = null) =>
  como(id, async (cl) => (await cl.query('select wms.crear_ruta($1, $2, $3, $4) id', [fecha, v, c, a])).rows[0].id as string)
const planificar = (id: string, ruta: string, fecha: string, v: string | null, c: string | null, a: string | null, paradas: unknown[], motivo: string | null = null) =>
  como(id, async (cl) => (await cl.query('select wms.planificar_ruta($1, $2, $3, $4, $5, $6::jsonb, $7) r', [ruta, fecha, v, c, a, JSON.stringify(paradas), motivo])).rows[0].r as { version: number; paradas: number; bloqueados_por_stock: string[] })
const confirmar = (id: string, ruta: string) => como(id, (cl) => cl.query('select wms.confirmar_ruta($1)', [ruta]))

/** Un pedido con stock de sobra, importado y listo para meter en una ruta. */
async function pedidoConStock(cantidad = 10, extra: Partial<PedidoSnapshot> = {}) {
  const p = await producto()
  await sembrar(p.id, `L-${randomUUID().slice(0, 4)}`, '2028-12-31', 500)
  const ped = pedido(p.codigo, cantidad, extra)
  await importar([ped])
  return { ped, prod: p }
}

beforeAll(async () => {
  base = await crearBaseDePrueba()
  logissa = await idPropietario(base.admin, 'LOGISSA')
  jt = await persona('jefe_transporte')
  aux = await persona('auxiliar')
  soloAlmacen = await persona('jefe_almacen')
  // El resultado no depende de la hora a la que corra la prueba: el corte de la víspera es a las 23:59 (la prueba del corte lo mueve)
  await base.admin.query(`update wms.parametros set valor = '23:59' where clave = 'hora_corte_planificacion'`)
}, 120_000)
afterAll(async () => { await base?.cerrar() })

describe('planificar una ruta', () => {
  it('crea la ruta, mete dos pedidos en orden (crea su salida y asigna FEFO), guarda la versión y al confirmar nace el registro LS-FR.43.03', async () => {
    const a = await pedidoConStock(10); const b = await pedidoConStock(25)
    const v = await vehiculo(); const cond = await personal('CONDUCTOR'); const au = await personal('AUXILIAR')
    const ruta = await crearRuta(jt, en(1), v, cond, au)
    expect(await uno('select numero, estado, version from wms.rutas where id = $1', [ruta])).toMatchObject({ estado: 'BORRADOR', version: 1 })
    expect((await uno('select numero from wms.rutas where id = $1', [ruta])).numero).toMatch(/^RUT-\d{4}-\d{5}$/)
    const r = await planificar(jt, ruta, en(1), v, cond, au, [{ pedido_id: b.ped.pedidoId }, { pedido_id: a.ped.pedidoId }])
    expect(r).toMatchObject({ version: 2, paradas: 2, bloqueados_por_stock: [] })
    const paradas = await q('select pa.secuencia, pd.numero, pa.salida_id from wms.ruta_paradas pa join wms.pedidos_despacho pd on pd.id = pa.pedido_despacho_id where pa.ruta_id = $1 and pa.activa order by pa.secuencia', [ruta])
    expect(paradas.map((x) => x.numero)).toEqual([b.ped.numero, a.ped.numero])
    for (const p of paradas) {
      expect(p.salida_id).not.toBeNull()
      const lin = await q('select estado from wms.salida_lineas where salida_id = $1', [p.salida_id])
      expect(lin.map((l) => l.estado)).toEqual(['ASIGNADA'])
    }
    expect((await uno('select salida_id from wms.pedidos_despacho where pedido_id = $1 and vigente', [a.ped.pedidoId])).salida_id).toBe(paradas[1].salida_id)
    const versiones = await q('select version, jsonb_array_length(paradas)::int n, motivo from wms.ruta_versiones where ruta_id = $1 order by version', [ruta])
    expect(versiones.map((x) => [x.version, x.n])).toEqual([[1, 0], [2, 2]])
    await confirmar(jt, ruta)
    expect(await uno('select estado, confirmada_por from wms.rutas where id = $1', [ruta])).toMatchObject({ estado: 'PLANIFICADA', confirmada_por: jt })
    expect(await uno('select estado, codigo, version_formato from wms.registros_ls_fr_43_03 where ruta_id = $1', [ruta])).toMatchObject({ estado: 'BASE', codigo: 'LS-FR.43.03', version_formato: '01' })
    // OS-7 (0027): las definiciones de DT del formato ya no están pendientes; el formato del archivo del data logger sí
    expect((await q('select clave from wms.parametros where clave = $1 and valor = $2', ['ls_fr_43_03_usuario_significado', 'PENDIENTE'])).length).toBe(0)
    expect((await q('select clave from wms.parametros where clave = $1 and valor = $2', ['ls_fr_43_03_logger_formato', 'PENDIENTE'])).length).toBe(1)
  })

  it('solo el Jefe de Transporte planifica: un Jefe de Almacén «solo», un auxiliar o una persona sin rol no', async () => {
    for (const quien of [soloAlmacen, aux]) {
      const e = await falla(como(quien, (c) => c.query('select wms.crear_ruta($1, null, null, null)', [en(1)])))
      expect(e.message).toBe('No tienes permiso para planificar rutas')
    }
    const ruta = await crearRuta(jt, en(1))
    const e = await falla(como(soloAlmacen, (c) => c.query('select wms.confirmar_ruta($1)', [ruta])))
    expect(e.message).toBe('No tienes permiso para planificar rutas')
  })

  it('no se puede planificar para una fecha pasada; el vehículo y el personal no pueden estar en dos rutas del mismo día; conductor y auxiliar deben ser distintos', async () => {
    expect((await falla(crearRuta(jt, en(-1)))).message).toBe('La fecha de la ruta no puede ser anterior a hoy')
    const v = await vehiculo(); const cond = await personal('CONDUCTOR'); const au = await personal('AUXILIAR')
    const r1 = await crearRuta(jt, en(2)); await planificar(jt, r1, en(2), v, cond, au, [])
    const r2 = await crearRuta(jt, en(2))
    expect((await falla(planificar(jt, r2, en(2), v, null, null, []))).message).toBe('El vehículo ya está en otra ruta de ese día')
    expect((await falla(planificar(jt, r2, en(2), null, cond, null, []))).message).toBe('El conductor ya está en otra ruta de ese día')
    expect((await falla(planificar(jt, r2, en(2), null, null, au, []))).message).toBe('El auxiliar ya está en otra ruta de ese día')
    // otro día sí
    await planificar(jt, r2, en(3), v, cond, au, [])
    const inactivo = await vehiculo(false, false)
    expect((await falla(planificar(jt, r2, en(3), inactivo, null, null, []))).message).toMatch(/está inactivo/)
  })

  it('el cliente que exige vehículo calificado bloquea un vehículo común; con uno calificado entra', async () => {
    const { ped } = await pedidoConStock(5, { cliente: { id: 'cc', nombre: 'Clínica Frío', vehiculoCalificado: 'Furgón con termo' } })
    const comun = await vehiculo(false); const calif = await vehiculo(true)
    const ruta = await crearRuta(jt, en(4))
    expect((await falla(planificar(jt, ruta, en(4), comun, null, null, [{ pedido_id: ped.pedidoId }]))).message).toBe(`El cliente de ${ped.numero} exige un vehículo calificado`)
    expect((await falla(planificar(jt, ruta, en(4), null, null, null, [{ pedido_id: ped.pedidoId }]))).message).toMatch(/exige un vehículo calificado/)
    expect((await planificar(jt, ruta, en(4), calif, null, null, [{ pedido_id: ped.pedidoId }])).paradas).toBe(1)
  })

  it('un pedido no puede estar en dos rutas vivas, y uno que cambió en Pedidos no entra hasta revisarlo', async () => {
    const { ped } = await pedidoConStock(5)
    const r1 = await crearRuta(jt, en(5)); const r2 = await crearRuta(jt, en(5))
    await planificar(jt, r1, en(5), null, null, null, [{ pedido_id: ped.pedidoId }])
    expect((await falla(planificar(jt, r2, en(5), null, null, null, [{ pedido_id: ped.pedidoId }]))).message).toBe(`El pedido ${ped.numero} ya está en otra ruta`)
    expect((await falla(planificar(jt, r1, en(5), null, null, null, [{ pedido_id: ped.pedidoId }, { pedido_id: ped.pedidoId }]))).message).toBe('Hay un pedido repetido o sin identificador en la ruta')
    const otro = await pedidoConStock(5)
    await importar([{ ...otro.ped, version: 2, lineas: [{ ...otro.ped.lineas[0], cantidad: 7 }] }])
    expect((await falla(planificar(jt, r2, en(5), null, null, null, [{ pedido_id: otro.ped.pedidoId }]))).message).toBe(`El pedido ${otro.ped.numero} cambió en Pedidos: revisa el cambio antes de planificarlo`)
    expect((await falla(planificar(jt, r2, en(5), null, null, null, [{ pedido_id: 'no-existe' }]))).message).toBe('No encontramos uno de los pedidos en la bandeja')
  })

  it('el corte: lo importado después de la víspera a la hora del corte necesita una excepción con motivo', async () => {
    const { ped } = await pedidoConStock(5)
    const ruta = await crearRuta(jt, en(1))
    await base.admin.query(`update wms.parametros set valor = '00:00' where clave = 'hora_corte_planificacion'`) // el corte de la víspera ya pasó
    try {
      expect((await falla(planificar(jt, ruta, en(1), null, null, null, [{ pedido_id: ped.pedidoId }]))).message).toMatch(/llegó después del corte de las 00:00 de la víspera/)
      expect((await falla(planificar(jt, ruta, en(1), null, null, null, [{ pedido_id: ped.pedidoId, excepcion_corte: true }]))).message).toBe(`La excepción del pedido ${ped.numero} necesita un motivo`)
      const r = await planificar(jt, ruta, en(1), null, null, null, [{ pedido_id: ped.pedidoId, excepcion_corte: true, motivo_excepcion: 'Cliente urgente' }])
      expect(r.paradas).toBe(1)
      expect(await uno('select excepcion_corte, motivo_excepcion from wms.ruta_paradas where ruta_id = $1 and activa', [ruta])).toMatchObject({ excepcion_corte: true, motivo_excepcion: 'Cliente urgente' })
    } finally {
      await base.admin.query(`update wms.parametros set valor = '23:59' where clave = 'hora_corte_planificacion'`)
    }
    // con el corte a las 23:59 de la víspera, lo de hoy entra sin excepción
    const otro = await pedidoConStock(5)
    const r2 = await crearRuta(jt, en(6))
    expect((await planificar(jt, r2, en(6), null, null, null, [{ pedido_id: otro.ped.pedidoId }])).paradas).toBe(1)
  })
})

describe('stock, cambios y cancelación', () => {
  it('un pedido sin stock suficiente se asigna como SIN_STOCK, se avisa y la ruta no se puede confirmar hasta quitarlo', async () => {
    const p = await producto()
    await sembrar(p.id, 'L-POCO', '2028-12-31', 3)
    const ped = pedido(p.codigo, 10); await importar([ped])
    const ruta = await crearRuta(jt, en(7), await vehiculo(), await personal('CONDUCTOR'))
    const r = await planificar(jt, ruta, en(7), (await uno('select vehiculo_id from wms.rutas where id = $1', [ruta])).vehiculo_id, (await uno('select conductor_id from wms.rutas where id = $1', [ruta])).conductor_id, null, [{ pedido_id: ped.pedidoId }])
    expect(r.bloqueados_por_stock).toEqual([ped.numero])
    expect((await q(`select 1 from wms.alertas where tipo = 'STOCK_INSUFICIENTE' and destinatario_rol = 'jefe_transporte' and estado = 'ABIERTA' and mensaje like $1`, [`%${p.codigo}%`])).length + (await q(`select 1 from wms.alertas where tipo = 'STOCK_INSUFICIENTE' and estado = 'ABIERTA'`)).length).toBeGreaterThan(0)
    expect((await falla(confirmar(jt, ruta))).message).toBe(`Estos pedidos no tienen stock suficiente: ${ped.numero}. Quítalos de la ruta o espera el ingreso de stock`)
    // sacarlo del plan libera su salida
    const rv = await uno('select vehiculo_id, conductor_id from wms.rutas where id = $1', [ruta])
    await planificar(jt, ruta, en(7), rv.vehiculo_id, rv.conductor_id, null, [])
    expect((await uno('select salida_id from wms.pedidos_despacho where pedido_id = $1 and vigente', [ped.pedidoId])).salida_id).toBeNull()
    expect((await uno(`select estado from wms.salidas where referencia_id = $1`, [ped.pedidoId])).estado).toBe('CANCELADA')
    await confirmar(jt, ruta).then(() => { throw new Error('debía fallar') }, (e: Error) => expect(e.message).toBe('La ruta no tiene pedidos'))
  })

  it('confirmar pide vehículo, conductor y al menos un pedido', async () => {
    const ruta = await crearRuta(jt, en(8))
    expect((await falla(confirmar(jt, ruta))).message).toBe('Elige el vehículo')
    const v = await vehiculo()
    await planificar(jt, ruta, en(8), v, null, null, [])
    expect((await falla(confirmar(jt, ruta))).message).toBe('Elige el conductor')
  })

  it('cambiar una ruta ya planificada exige motivo y deja una versión nueva; reordenar y quitar pedidos funciona', async () => {
    const a = await pedidoConStock(5); const b = await pedidoConStock(5)
    const v = await vehiculo(); const cond = await personal('CONDUCTOR')
    const ruta = await crearRuta(jt, en(9), v, cond)
    await planificar(jt, ruta, en(9), v, cond, null, [{ pedido_id: a.ped.pedidoId }, { pedido_id: b.ped.pedidoId }])
    await confirmar(jt, ruta)
    expect((await falla(planificar(jt, ruta, en(9), v, cond, null, [{ pedido_id: b.ped.pedidoId }, { pedido_id: a.ped.pedidoId }]))).message).toBe('La ruta ya estaba planificada: indica por qué cambia')
    const r = await planificar(jt, ruta, en(9), v, cond, null, [{ pedido_id: b.ped.pedidoId }, { pedido_id: a.ped.pedidoId }], 'Roberto pidió empezar por B')
    expect(r.version).toBe(3)
    expect((await q('select pd.numero from wms.ruta_paradas pa join wms.pedidos_despacho pd on pd.id = pa.pedido_despacho_id where pa.ruta_id = $1 and pa.activa order by pa.secuencia', [ruta])).map((x) => x.numero)).toEqual([b.ped.numero, a.ped.numero])
    await planificar(jt, ruta, en(9), v, cond, null, [{ pedido_id: b.ped.pedidoId }], 'A se reprograma')
    expect((await uno('select salida_id from wms.pedidos_despacho where pedido_id = $1 and vigente', [a.ped.pedidoId])).salida_id).toBeNull()
    expect((await q('select motivo from wms.ruta_versiones where ruta_id = $1 order by version', [ruta])).map((x) => x.motivo)).toEqual(['Ruta creada', 'Plan guardado', 'Roberto pidió empezar por B', 'A se reprograma'])
    // las versiones no se editan
    expect((await falla(base.admin.query('update wms.ruta_versiones set motivo = $1 where ruta_id = $2', ['x', ruta]))).message).toMatch(/no se (puede )?(edita|modifica|borra)|inmutable|append/i)
    // el pedido que salió puede entrar en otra ruta
    const otra = await crearRuta(jt, en(10))
    expect((await planificar(jt, otra, en(10), null, null, null, [{ pedido_id: a.ped.pedidoId }])).paradas).toBe(1)
  })

  it('un pedido con picking generado no sale de la ruta; cancelar la ruta libera las salidas y los pedidos', async () => {
    const a = await pedidoConStock(5); const b = await pedidoConStock(5)
    const v = await vehiculo(); const cond = await personal('CONDUCTOR')
    const ruta = await crearRuta(jt, en(11), v, cond)
    await planificar(jt, ruta, en(11), v, cond, null, [{ pedido_id: a.ped.pedidoId }])
    const salida = (await uno('select salida_id from wms.pedidos_despacho where pedido_id = $1 and vigente', [a.ped.pedidoId])).salida_id
    await como(jt, (c) => c.query('select wms.generar_orden_picking($1)', [salida]))
    expect((await falla(planificar(jt, ruta, en(11), v, cond, null, [{ pedido_id: b.ped.pedidoId }]))).message).toBe(`El pedido ${a.ped.numero} ya tiene picking generado: no se puede sacar de la ruta`)
    expect((await falla(como(jt, (c) => c.query('select wms.cancelar_ruta($1, $2)', [ruta, 'Prueba'])))).message).toBe(`El pedido ${a.ped.numero} ya tiene picking generado: no se puede cancelar la ruta`)
    // una ruta sin picking se cancela y libera todo
    const c2 = await crearRuta(jt, en(12))
    await planificar(jt, c2, en(12), null, null, null, [{ pedido_id: b.ped.pedidoId }])
    expect((await falla(como(jt, (c) => c.query('select wms.cancelar_ruta($1, $2)', [c2, '  '])))).message).toBe('La cancelación necesita un motivo')
    await como(jt, (c) => c.query('select wms.cancelar_ruta($1, $2)', [c2, 'Se cae la visita']))
    expect(await uno('select estado, motivo_cancelacion from wms.rutas where id = $1', [c2])).toMatchObject({ estado: 'CANCELADA', motivo_cancelacion: 'Se cae la visita' })
    expect((await uno('select salida_id from wms.pedidos_despacho where pedido_id = $1 and vigente', [b.ped.pedidoId])).salida_id).toBeNull()
    expect((await falla(planificar(jt, c2, en(12), null, null, null, []))).message).toMatch(/La ruta ya no se puede cambiar/)
  })

  it('un producto que el WMS no conoce impide planificar el pedido, con el código a la vista', async () => {
    const ped = pedido('NO-EXISTE-77', 4); await importar([ped])
    const ruta = await crearRuta(jt, en(13))
    expect((await falla(planificar(jt, ruta, en(13), null, null, null, [{ pedido_id: ped.pedidoId }]))).message).toBe(`El pedido ${ped.numero} trae un producto que el WMS no conoce (NO-EXISTE-77): Dirección Técnica debe darlo de alta`)
  })
})

describe('personal de transporte', () => {
  it('el Jefe de Transporte lo administra; no se repiten nombres; un auxiliar de almacén no', async () => {
    const id = await como(jt, async (c) => (await c.query(`select wms.guardar_personal_transporte(null, 'Juan Pérez', 'CONDUCTOR', true) id`)).rows[0].id as string)
    expect(await uno('select nombre, funcion, activo from wms.personal_transporte where id = $1', [id])).toMatchObject({ nombre: 'Juan Pérez', funcion: 'CONDUCTOR', activo: true })
    expect((await falla(como(jt, (c) => c.query(`select wms.guardar_personal_transporte(null, ' juan pérez ', 'CONDUCTOR', true)`)))).message).toMatch(/Ya existe/)
    await como(jt, (c) => c.query(`select wms.guardar_personal_transporte($1, 'Juan Pérez', 'CONDUCTOR', false)`, [id]))
    expect((await uno('select activo from wms.personal_transporte where id = $1', [id])).activo).toBe(false)
    expect((await falla(como(aux, (c) => c.query(`select wms.guardar_personal_transporte(null, 'Otro', 'AUXILIAR', true)`)))).message).toBe('No tienes permiso para administrar el personal de transporte')
    const ruta = await crearRuta(jt, en(14))
    expect((await falla(planificar(jt, ruta, en(14), null, id, null, []))).message).toBe('El conductor elegido no está disponible')
  })
})
