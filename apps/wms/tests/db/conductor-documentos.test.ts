// SB-A (migración 0031): vehículo calificado fuera del WMS y «conductor en documentos» (temporal). La ruta y la auditoría guardan siempre al conductor real;
// la guía electrónica y el LS-FR.43.03 nombran a quien figura en el parámetro; cada uso se audita junto al conductor real; el interruptor se quita borrando una fila.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, SQL, crearBaseDePrueba, falla, idPosicion, idPropietario, postear } from './helpers'

let base: BaseDePrueba
let logissa: string
let jt: string
let aux1: string
let sandra: string
let n = 0
let nGuia = 0
let hans: string
let michele: string

const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
const como = <T>(id: string, fn: (c: import('pg').Client) => Promise<T>) => base.como(id, fn)

async function persona(rol: string | string[]): Promise<string> {
  const id = randomUUID()
  await base.admin.query('insert into auth.users (id) values ($1)', [id])
  for (const r of Array.isArray(rol) ? rol : [rol]) await base.admin.query('insert into wms.usuario_roles (user_id, rol) values ($1, $2)', [id, r])
  return id
}
async function orden(pos: string, cantidad: number) {
  n += 1
  const prod = (await uno(`insert into catalogo.productos (codigo, descripcion, unidad_medida) values ($1, $2, 'TABLETA') returning id`, [`CD-${n}-${randomUUID().slice(0, 4)}`, `Producto conductor ${n}`])).id as string
  const posId = await idPosicion(base.admin, pos)
  const loteId = (await uno(`insert into wms.lotes (producto_id, codigo, vence, propietario_id) values ($1, $2, '2030-06-30', $3) returning id`, [prod, `L-${randomUUID().slice(0, 6)}`, logissa])).id as string
  await como(base.personas.admin.id, (c) => postear(c, 'CARGA_INICIAL', [{ posicion_id: posId, producto_id: prod, lote_id: loteId, propietario_id: logissa, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: randomUUID(), delta: 100 }]))
  const salida = await como(jt, async (c) => (await c.query(`select wms.crear_salida('DISTRIBUCION', 'VENTA', $1, $2::jsonb) id`, [logissa, JSON.stringify([{ producto_id: prod, cantidad }])])).rows[0].id as string)
  await como(jt, (c) => c.query('select * from wms.asignar_salida($1)', [salida]))
  const op = await como(jt, async (c) => (await c.query('select wms.generar_orden_picking($1, $2) id', [salida, aux1])).rows[0].id as string)
  await como(sandra, (c) => c.query('select wms.conformar_orden($1, null, 2, null)', [op]))
  return salida
}
/** Pone la salida en una ruta de hoy con ese conductor REAL y ese vehículo. */
async function aRuta(salida: string, conductor: string, vehiculo: string) {
  const r = (await uno(`insert into wms.rutas (numero, fecha, estado, vehiculo_id, conductor_id, creada_por) values ($1, current_date, 'PLANIFICADA', $2, $3, $4) returning id`, [`RUT-C-${randomUUID().slice(0, 6)}`, vehiculo, conductor, jt])).id as string
  const ped = `PED-C-${randomUUID().slice(0, 6)}`
  const pd = (await uno(`insert into wms.pedidos_despacho (pedido_id, version, numero, fecha, cliente_id, cliente_nombre, cliente_ruc, snapshot, vigente, importado_por, salida_id)
    values ($1, 1, $1, current_date, 'c1', 'Botica Salud', '20512345671', '{"cliente":{"id":"c1","nombre":"Botica Salud"}}'::jsonb, true, $2, $3) returning id`, [ped, jt, salida])).id
  await base.admin.query(`insert into wms.ruta_paradas (ruta_id, secuencia, pedido_id, pedido_despacho_id, salida_id) values ($1, 1, $2, $3, $4)`, [r, ped, pd, salida])
  return r
}
const emitir = (salida: string) => como(jt, async (c) =>
  (await c.query('select wms.registrar_guia_electronica($1, $2, $3, current_date, 12.5, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10) id',
    [salida, `TTT1-${String(++nGuia).padStart(8, '0')}`, 'SIMULADOR', JSON.stringify({ operacion: 'generar_guia' }), JSON.stringify({ aceptada: true }), 'ACEPTADA',
      'https://simulador.nubefact.test/guia.pdf', 'https://simulador.nubefact.test/guia.xml', null, 'abc123'])).rows[0].id as string)
const contexto = (salida: string) => como(jt, async (c) => (await c.query('select wms.contexto_guia($1) r', [salida])).rows[0].r as Record<string, any>)
const cambiar = (quien: string, persona: string | null, motivo: string) => como(quien, (c) => c.query('select wms.cambiar_conductor_en_documentos($1, $2)', [persona, motivo]))
const usos = (entidadId: string) => q(`select despues from wms.audit_events where evento = 'conductor_en_documento' and entidad_id = $1 order by ts`, [entidadId])
const vehiculo = async (placa: string) => (await uno(`insert into wms.vehiculos (placa, calificado) values ($1, false) returning id`, [placa])).id as string

beforeAll(async () => {
  base = await crearBaseDePrueba()
  logissa = await idPropietario(base.admin, 'LOGISSA')
  jt = await persona('jefe_transporte'); aux1 = await persona('auxiliar'); sandra = await persona(['asistente_dt', 'conformidad_despacho'])
  await base.admin.query(`insert into wms.posiciones (codigo, rack, forma, tipo_area) values ('STG-C', 'S', 'PISO', 'DESPACHO')`)
  await base.admin.query(`update wms.parametros set valor = 'STG-C' where clave = 'posicion_despacho_defecto'`)
  await base.admin.query(SQL.seedTransporte())
  hans = (await uno(`select id from wms.personal_transporte where nombre = 'Hans'`)).id as string
  michele = (await uno(`select id from wms.personal_transporte where nombre like 'Michele%'`)).id as string
}, 180_000)
afterAll(async () => { await base?.cerrar() })

describe('la carga inicial del transporte', () => {
  it('deja a Hans (documento pendiente), a Michele (carné de extranjería), el vehículo BWO902 y el parámetro apuntando a Michele; volver a aplicarla no duplica nada', async () => {
    expect(await uno(`select documento_tipo, dni, licencia, activo from wms.personal_transporte where id = $1`, [hans])).toMatchObject({ documento_tipo: 'DNI', dni: null, licencia: 'Q75084250', activo: true })
    expect(await uno(`select documento_tipo, dni, licencia from wms.personal_transporte where id = $1`, [michele])).toMatchObject({ documento_tipo: 'CE', dni: '004780086', licencia: 'Q004780086' })
    expect(await uno(`select descripcion, tipo, activo from wms.vehiculos where placa = 'BWO902'`)).toMatchObject({ descripcion: 'DFSK K05S', tipo: 'PROPIO', activo: true })
    expect((await uno(`select valor from wms.parametros where clave = 'conductor_en_documentos'`)).valor).toBe(michele)
    await base.admin.query(SQL.seedTransporte())
    expect(Number((await uno(`select count(*) n from wms.personal_transporte where nombre = 'Hans' or nombre like 'Michele%'`)).n)).toBe(2)
    expect(Number((await uno(`select count(*) n from wms.vehiculos where placa = 'BWO902'`)).n)).toBe(1)
  })
})

describe('vehículo calificado fuera del WMS (D-153)', () => {
  it('el aviso de cambio de pedido ya no menciona el vehículo calificado, pero sí lo demás', async () => {
    const r = (await uno(`select wms._cambios_de_pedido($1::jsonb, $2::jsonb) c`, [
      JSON.stringify({ cliente: { nombre: 'A', direccion: 'X', vehiculoCalificado: 'Furgón' }, lineas: [] }),
      JSON.stringify({ cliente: { nombre: 'A', direccion: 'Y', vehiculoCalificado: 'Camión' }, lineas: [] }),
    ])).c as string[]
    expect(r).toEqual(['Cambió la dirección de entrega'])
  })
  it('planificar_ruta ya no contiene la comprobación', async () => {
    const def = (await uno(`select pg_get_functiondef('wms.planificar_ruta(uuid,date,uuid,uuid,uuid,jsonb,text)'::regprocedure) d`)).d as string
    expect(def).not.toMatch(/exige un vehículo calificado/)
    expect(def).toMatch(/0031 \(D-153\)/)
  })
})

describe('conductor real vs conductor en documentos', () => {
  it('la guía nombra a Michele (carné de extranjería y su licencia) mientras la ruta guarda a Hans, y el uso se audita junto al conductor real', async () => {
    const salida = await orden('F-1.1', 5)
    const ruta = await aRuta(salida, hans, await vehiculo('BWO902X'))
    const c = (await contexto(salida)).ruta
    expect(c).toMatchObject({ conductor: expect.stringMatching(/^Michele/), conductor_real: 'Hans', conductor_documento_tipo: 'CE', conductor_dni: '004780086', conductor_licencia: 'Q004780086' })
    expect((await uno('select conductor_id from wms.rutas where id = $1', [ruta])).conductor_id).toBe(hans)
    const guia = await emitir(salida)
    const u = await usos(guia)
    expect(u).toHaveLength(1)
    expect(u[0].despues).toMatchObject({ conductor_real: 'Hans', conductor_real_id: hans, conductor_en_documento_id: michele, distinto: true, documento: expect.stringMatching(/^Guía electrónica TTT1-/) })
    // la ruta sigue con el conductor real
    expect((await uno('select conductor_id from wms.rutas where id = $1', [ruta])).conductor_id).toBe(hans)
  })

  it('al imprimir el LS-FR.43.03 también queda el uso, con el conductor real', async () => {
    const salida = await orden('F-1.2', 3)
    const ruta = await aRuta(salida, hans, await vehiculo('BWO902Y'))
    await base.admin.query(`insert into wms.ls_fr_impresiones (ruta_id, estado_ruta, antes_de_salir, por) values ($1, 'PLANIFICADA', true, $2)`, [ruta, jt])
    const u = await usos(ruta)
    expect(u).toHaveLength(1)
    expect(u[0].despues).toMatchObject({ documento: 'LS-FR.43.03 impreso', conductor_real: 'Hans', distinto: true })
  })

  it('solo el Jefe de Transporte lo cambia, con motivo y a un conductor disponible; el cambio queda en la auditoría y en la nota', async () => {
    expect((await falla(cambiar(aux1, hans, 'prueba'))).message).toMatch(/No tienes permiso/)
    expect((await falla(cambiar(jt, hans, '  '))).message).toMatch(/Cuenta por qué cambia/)
    const aux = (await uno(`insert into wms.personal_transporte (nombre, funcion) values ('Auxiliar de prueba', 'AUXILIAR') returning id`)).id as string
    expect((await falla(cambiar(jt, aux, 'prueba'))).message).toMatch(/Elige un conductor disponible/)
    const baja = (await uno(`insert into wms.personal_transporte (nombre, funcion, activo) values ('Conductor de baja', 'CONDUCTOR', false) returning id`)).id as string
    expect((await falla(cambiar(jt, baja, 'prueba'))).message).toMatch(/Elige un conductor disponible/)
    await cambiar(jt, hans, 'Michele no puede por ahora')
    expect(await uno(`select valor, nota from wms.parametros where clave = 'conductor_en_documentos'`)).toMatchObject({ valor: hans, nota: expect.stringContaining('Michele no puede por ahora') })
    const a = await uno(`select antes, despues, motivo from wms.audit_events where evento = 'conductor_en_documentos_cambiado' order by ts desc limit 1`)
    expect(a).toMatchObject({ motivo: 'Michele no puede por ahora', antes: { persona: michele }, despues: { persona: hans } })
    // ahora la guía lleva a Hans; con Hans como conductor real ya no son distintos
    const salida = await orden('F-1.3', 2)
    await aRuta(salida, hans, await vehiculo('BWO902Z'))
    expect((await contexto(salida)).ruta).toMatchObject({ conductor: 'Hans', conductor_real: 'Hans' })
    const guia = await emitir(salida)
    expect((await usos(guia))[0].despues).toMatchObject({ distinto: false })
    // vacío = el conductor real de cada ruta
    await cambiar(jt, null, 'Vuelve a salir el conductor de cada ruta')
    const salida2 = await orden('F-1.4', 2)
    await aRuta(salida2, michele, await vehiculo('BKW757Z'))
    expect((await contexto(salida2)).ruta).toMatchObject({ conductor: expect.stringMatching(/^Michele/), conductor_real: expect.stringMatching(/^Michele/) })
    await cambiar(jt, michele, 'Dejamos otra vez a Michele en los documentos')
  })

  it('si la persona elegida deja de estar disponible, los documentos llevan al conductor real (nunca a alguien que no puede conducir)', async () => {
    await base.admin.query(`update wms.personal_transporte set activo = false where id = $1`, [michele])
    const salida = await orden('F-2.1', 2)
    await aRuta(salida, hans, await vehiculo('BWO902W'))
    expect((await contexto(salida)).ruta).toMatchObject({ conductor: 'Hans', conductor_real: 'Hans' })
    await base.admin.query(`update wms.personal_transporte set activo = true where id = $1`, [michele])
  })

  it('INTERRUPTOR: borrar la fila del parámetro basta; los documentos llevan al conductor real y la opción deja de existir', async () => {
    const salida = await orden('F-2.2', 2)
    await aRuta(salida, hans, await vehiculo('BWO902V'))
    expect((await contexto(salida)).ruta.conductor).toMatch(/^Michele/)
    await base.admin.query(`delete from wms.parametros where clave = 'conductor_en_documentos'`)
    expect((await contexto(salida)).ruta).toMatchObject({ conductor: 'Hans', conductor_real: 'Hans' })
    expect((await falla(cambiar(jt, michele, 'ya no existe'))).message).toMatch(/Esta opción ya no existe/)
    const guia = await emitir(salida)
    expect((await usos(guia))[0].despues).toMatchObject({ conductor_en_documento: 'Hans', distinto: false })
    await base.admin.query(`insert into wms.parametros (clave, valor, nota) values ('conductor_en_documentos', $1, 'prueba') on conflict (clave) do nothing`, [michele])
  })
})

describe('documento de identidad y licencia del personal', () => {
  it('se completa con las reglas de cada tipo de documento; vacío es pendiente; la auditoría no repite el número', async () => {
    const guardar = (quien: string, id: string, tipo: string, doc: string, lic: string) => como(quien, (c) => c.query('select wms.guardar_documentos_personal($1, $2, $3, $4)', [id, tipo, doc, lic]))
    expect((await falla(guardar(aux1, hans, 'DNI', '12345678', 'Q12345678'))).message).toMatch(/No tienes permiso/)
    expect((await falla(guardar(jt, hans, 'DNI', '1234', 'Q75084250'))).message).toBe('El DNI tiene 8 números')
    expect((await falla(guardar(jt, hans, 'CE', '123', 'Q75084250'))).message).toMatch(/carné de extranjería/)
    expect((await falla(guardar(jt, hans, 'PASAPORTE', '12', 'Q75084250'))).message).toMatch(/pasaporte/)
    expect((await falla(guardar(jt, hans, 'DNI', '12345678', 'abc'))).message).toMatch(/licencia/)
    expect((await falla(guardar(jt, hans, 'OTRO', '', ''))).message).toMatch(/tipo de documento/)
    expect((await falla(guardar(jt, randomUUID(), 'DNI', '', ''))).message).toMatch(/No encontramos/)
    await guardar(jt, hans, 'DNI', '', 'q75084250')
    expect(await uno('select dni, licencia from wms.personal_transporte where id = $1', [hans])).toMatchObject({ dni: null, licencia: 'Q75084250' })
    await guardar(jt, hans, 'DNI', '87654321', 'Q75084250')
    const a = await uno(`select despues from wms.audit_events where evento = 'personal_documentos_guardados' and entidad_id = $1 order by ts desc limit 1`, [hans])
    expect(a.despues).toMatchObject({ documento: 'completo', licencia: 'completa' })
    expect(JSON.stringify(a.despues)).not.toMatch(/87654321/)
    await guardar(jt, hans, 'DNI', '', 'Q75084250')   // vuelve a quedar pendiente
  })
})

describe('re-ejecución y permisos', () => {
  it('la 0031 se puede aplicar dos veces y en cadena (0028 a 0031) sin avisos de objetos inexistentes, y sigue sin exigir vehículo calificado', async () => {
    const avisos: string[] = []
    base.admin.on('notice', (m) => avisos.push(String(m.message)))
    await base.admin.query(SQL.m0031())
    for (const m of [SQL.m0028, SQL.m0029, SQL.m0030, SQL.m0031]) await base.admin.query(m())
    base.admin.removeAllListeners('notice')
    expect(avisos.filter((m) => /does not exist/.test(m))).toEqual([])
    const def = (await uno(`select pg_get_functiondef('wms.planificar_ruta(uuid,date,uuid,uuid,uuid,jsonb,text)'::regprocedure) d`)).d as string
    expect(def).not.toMatch(/exige un vehículo calificado/)
    // el interruptor no se pisa al re-aplicar
    expect((await uno(`select valor from wms.parametros where clave = 'conductor_en_documentos'`)).valor).toBe(michele)
  })

  it('las funciones internas no son llamables por una persona autenticada; las dos nuevas de la API sí', async () => {
    const ok = async (sql: string) => (await base.admin.query(`select has_function_privilege('authenticated', $1::regprocedure, 'execute') v`, [sql])).rows[0].v as boolean
    expect(await ok('wms._conductor_para_documentos(uuid)')).toBe(false)
    expect(await ok('wms._auditar_uso_conductor(text,text,text,uuid)')).toBe(false)
    expect(await ok('wms.cambiar_conductor_en_documentos(uuid,text)')).toBe(true)
    expect(await ok('wms.guardar_documentos_personal(uuid,text,text,text)')).toBe(true)
  })
})
