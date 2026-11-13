// Migración 0069: la pantalla de seguimiento para el cliente (pedidos de distribución). Los 5 pasos, la ruta, a quién escribir, la guía, la carita y los contactos de los vendedores.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPropietario } from './helpers'

let base: BaseDePrueba
let jt: string
let admin: string
let logissa: string
const RUC = '20512345671'
const OTRO_RUC = '20600000009'
const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
const como = <T>(id: string, fn: (c: import('pg').Client) => Promise<T>) => base.como(id, fn)
type R = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
async function anon<T>(fn: () => Promise<T>): Promise<T> { await base.admin.query('set role anon'); try { return await fn() } finally { await base.admin.query('reset role') } }
let nIp = 0
const ipNueva = () => `10.69.${Math.floor(nIp / 250)}.${(nIp++ % 250) + 1}`
const ver = (pedido: string, ruc = RUC, ip = ipNueva()) => anon(async () => (await base.admin.query('select wms.seguimiento_consultar($1, $2, $3) r', [pedido, ruc, ip])).rows[0].r as R)
const responder = (pedido: string, ruc: string, valor: number, ip = ipNueva()) => anon(async () => (await base.admin.query('select wms.seguimiento_responder($1, $2, $3, $4) r', [pedido, ruc, valor, ip])).rows[0].r as R)
const param = (clave: string, valor: string) => base.admin.query(`update wms.parametros set valor = $2 where clave = $1`, [clave, valor])
const hitos = (r: R) => (r.hitos as R[]).map((h) => h.estado)
const hace = (min: number) => new Date(Date.now() - min * 60_000).toISOString()

let n = 0
let nGuia = 0
/** Un pedido de distribución con su Orden de Salida, y (si se pide) su parada en una ruta. */
async function pedido(o: { vendedor?: string; ruc?: string; ruta?: string; picking?: boolean; conformada?: boolean; salio?: boolean } = {}) {
  n += 1
  const numero = `PED-PA${n}`; const pid = `pa-${n}`
  const ped = { pedidoId: pid, numero, version: 1, estado: 'READY_FOR_OPERATIONS', fecha: '2026-11-03', modificadoEn: '2026-11-03T08:00:00Z', vendedor: o.vendedor ?? 'Juan Pérez',
    cliente: { id: `c${n}`, nombre: 'Botica Central', ruc: o.ruc ?? RUC, direccion: 'Av. Secreta 123' }, lineas: [{ lineaId: 'l-1', productoCodigo: 'T-DAPA', descripcion: 'Dapagliflozina', cantidad: 10 }], condicionPago: 'Crédito 30 días' }
  await como(jt, (c) => c.query('select wms.registrar_importacion_pedidos($1, $2::jsonb, null)', [`pantalla.${n}`, JSON.stringify([ped])]))
  const salida = (await uno(`insert into wms.salidas (numero, tipo, motivo, propietario_id, estado, creada_por, creada_en, conformada_en) values ($1, 'DISTRIBUCION', 'VENTA', $2, 'ABIERTA', $3, $4, $5) returning id`,
    [`SAL-PA-${n}`, logissa, jt, hace(300), o.conformada ? hace(200) : null])).id
  await base.admin.query(`update wms.pedidos_despacho set salida_id = $1 where pedido_id = $2`, [salida, pid])
  if (o.picking) await base.admin.query(`insert into wms.ordenes_picking (numero, salida_id, estado, generada_por, generada_en) values ($1, $2, 'EN_CURSO', $3, $4)`, [`OP-PA-${n}`, salida, jt, hace(250)])
  return { numero, pid, salida }
}
async function ruta(paradas: string[], opciones: { salio?: boolean; estado?: string } = {}) {
  const r = (await uno(`insert into wms.rutas (numero, fecha, estado, creada_por, salio_en) values ($1, current_date, $2, $3, $4) returning id`, [`RUT-PA-${randomUUID().slice(0, 6)}`, opciones.estado ?? 'EN_RUTA', jt, opciones.salio === false ? null : hace(120)])).id
  const ids: string[] = []
  for (const [i, pid] of paradas.entries()) {
    const pd = await uno(`select id from wms.pedidos_despacho where pedido_id = $1`, [pid])
    ids.push((await uno(`insert into wms.ruta_paradas (ruta_id, secuencia, pedido_id, pedido_despacho_id) values ($1, $2, $3, $4) returning id`, [r, i + 1, pid, pd.id])).id)
  }
  return { id: r, paradas: ids }
}
const evento = (parada: string, rutaId: string, ev: string, minHace: number) => base.admin.query(
  `insert into wms.ruta_paradas_eventos (parada_id, ruta_id, evento, motivo, recibio_nombre, recibio_documento, foto_ref, foto_hash, por, creado_en) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
  [parada, rutaId, ev, ev === 'NO_ENTREGADO' || ev === 'RECHAZADO' ? 'Local cerrado (motivo interno)' : null, ev === 'ENTREGADO' ? 'María Pérez' : null, ev === 'ENTREGADO' ? '12345678' : null, ev === 'ENTREGADO' ? 'entregas/x.jpg' : null, ev === 'ENTREGADO' ? 'a'.repeat(64) : null, jt, hace(minHace)])
const guia = (salida: string, enlace: string | null, estadoSunat = 'ACEPTADA', estado = 'VIGENTE') => base.admin.query(
  `insert into wms.guias_remision (salida_id, numero, lineas, placa, fecha_traslado, registrada_por, origen, estado_sunat, enlace, estado, fecha_emision, entorno, anulada_en, anulada_por, motivo_anulacion)
   values ($1, $2, '[]'::jsonb, 'ABC-123', current_date, $3, 'NUBEFACT', $4, $5, $6, current_date, 'PRUEBA', $7, $8, $9)`,
  [salida, `TTT1-${String(++nGuia).padStart(8, '0')}`, jt, estadoSunat, enlace, estado, estado === 'ANULADA' ? new Date().toISOString() : null, estado === 'ANULADA' ? jt : null, estado === 'ANULADA' ? 'Prueba' : null])

beforeAll(async () => {
  base = await crearBaseDePrueba({ piloto: true })
  logissa = await idPropietario(base.admin, 'LOGISSA')
  jt = randomUUID(); admin = randomUUID()
  for (const [id, rol] of [[jt, 'jefe_transporte'], [admin, 'admin_wms']]) { await base.admin.query('insert into auth.users (id) values ($1)', [id]); await base.admin.query('insert into wms.usuario_roles (user_id, rol) values ($1, $2)', [id, rol]) }
  await param('seguimiento_cliente_habilitado', 'true')
  await param('modo_piloto', 'no')       // fuera del piloto: el contacto es el del vendedor
}, 120_000)
afterAll(async () => { await base?.cerrar() })

describe('los 5 pasos, de lo que ya registra el WMS', () => {
  it('Pedido recibido = Orden de Salida creada; Preparando = picking o conformidad; sin hora estimada ni datos internos', async () => {
    const a = await pedido()
    const r = await ver(a.numero)
    expect(r).toMatchObject({ estado: 'OK', pedido: a.numero, cliente: 'Botica Central', tiene_parada: false })
    expect(hitos(r)).toEqual(['RECIBIDO'])
    const b = await pedido({ picking: true })
    expect(hitos(await ver(b.numero))).toEqual(['RECIBIDO', 'PREPARANDO'])
    const c = await pedido({ conformada: true })
    expect(hitos(await ver(c.numero))).toEqual(['RECIBIDO', 'PREPARANDO'])
    const texto = JSON.stringify(r).toLowerCase()
    for (const secreto of ['av. secreta', 'crédito', 'dapagliflozina', 'precio', 'estimad', 'lote']) expect(texto).not.toContain(secreto)
  })

  it('En camino = Salida confirmada; Llegó = «Llegué»; Entregado = «Entregado» (cada uno con su hora, en ese orden)', async () => {
    const p = await pedido({ picking: true, conformada: true })
    const rt = await ruta([p.pid, (await pedido()).pid])
    await base.admin.query(`update wms.salidas set estado = 'CONFIRMADA' where id = $1`, [p.salida])
    const linea = (await uno(`insert into wms.salida_lineas (salida_id, producto_id, cantidad) values ($1, $2, 1) returning id`, [p.salida, (await uno(`insert into catalogo.productos (codigo, descripcion, unidad_medida) values ($1, 'x', 'TABLETA') returning id`, [`PA-${randomUUID().slice(0, 6)}`])).id])).id
    await base.admin.query(`insert into wms.salida_movimientos (salida_id, linea_id, tipo, cantidad, actor_id, preparador_id, creado_en) values ($1, $2, 'STAGING', 1, $3, $3, $4)`, [p.salida, linea, jt, hace(150)])
    await base.admin.query(`insert into wms.salida_movimientos (salida_id, linea_id, tipo, cantidad, actor_id, creado_en) values ($1, $2, 'SALIDA', 1, $3, $4)`, [p.salida, linea, jt, hace(110)])
    let r = await ver(p.numero)
    expect(hitos(r)).toEqual(['RECIBIDO', 'PREPARANDO', 'EN_CAMINO']); expect(r.tiene_parada).toBe(true)
    await evento(rt.paradas[0], rt.id, 'LLEGUE', 20)
    expect(hitos(await ver(p.numero))).toEqual(['RECIBIDO', 'PREPARANDO', 'EN_CAMINO', 'LLEGO'])
    await evento(rt.paradas[0], rt.id, 'ENTREGADO', 10)
    r = await ver(p.numero)
    expect(hitos(r)).toEqual(['RECIBIDO', 'PREPARANDO', 'EN_CAMINO', 'LLEGO', 'ENTREGADO'])
    const horas = (r.hitos as R[]).map((h) => Date.parse(h.en)); expect([...horas].sort((a, b) => a - b)).toEqual(horas)
    expect(JSON.stringify(r)).not.toMatch(/María Pérez|12345678|entregas\/x\.jpg/)      // ni evidencias ni personal
  })

  it('«No entregado» y «Rechazado» salen igual (un solo aviso neutral, sin motivos internos)', async () => {
    const a = await pedido(); const b = await pedido()
    const rt = await ruta([a.pid, b.pid])
    await evento(rt.paradas[0], rt.id, 'NO_ENTREGADO', 5); await evento(rt.paradas[1], rt.id, 'RECHAZADO', 5)
    for (const p of [a, b]) { const r = await ver(p.numero); expect(hitos(r)).toContain('NO_ENTREGADO'); expect(hitos(r)).not.toContain('ENTREGADO'); expect(JSON.stringify(r)).not.toMatch(/RECHAZADO|motivo interno|Local cerrado/) }
  })

  it('un pedido sin parada en una ruta de Logisalud (provincia por agencia) no inventa pasos: tiene_parada = false', async () => {
    const p = await pedido({ conformada: true })
    expect(await ver(p.numero)).toMatchObject({ tiene_parada: false, ruta: null })
  })

  it('un pedido cancelado en Pedidos muestra «cancelado»', async () => {
    const p = await pedido()
    // el snapshot de un pedido importado no se edita (lo protege un disparador): para probar la lectura se simula la versión cancelada con el disparador apagado
    await base.admin.query('alter table wms.pedidos_despacho disable trigger all')
    try { await base.admin.query(`update wms.pedidos_despacho set snapshot = jsonb_set(snapshot, '{estado}', '"CANCELLED"') where pedido_id = $1`, [p.pid]) } finally { await base.admin.query('alter table wms.pedidos_despacho enable trigger all') }
    expect(hitos(await ver(p.numero))).toContain('CANCELADO')
  })
})

describe('acceso: el de siempre', () => {
  it('con otro RUC, pedido inexistente o RUC mal escrito la respuesta es idéntica; un pedido no abre datos de otro', async () => {
    const a = await pedido({ ruc: RUC }); const b = await pedido({ ruc: OTRO_RUC })
    expect(await ver(a.numero, RUC)).toMatchObject({ estado: 'OK', pedido: a.numero })
    const falsas = [await ver(a.numero, OTRO_RUC), await ver('PED-NO-EXISTE', RUC), await ver(a.numero, 'abc'), await ver(b.numero, RUC)]
    for (const f of falsas) expect(f).toEqual({ estado: 'NO_ENCONTRADO' })
    expect((await ver(b.numero, OTRO_RUC)).pedido).toBe(b.numero)
  })
  it('límite de intentos por pedido y por IP', async () => {
    const a = await pedido()
    for (let i = 0; i < 5; i += 1) expect((await ver(a.numero, OTRO_RUC, `10.70.0.${i}`)).estado).toBe('NO_ENCONTRADO')
    const e = await ver(a.numero, RUC, '10.70.0.99')
    expect(e.estado).toBe('ESPERA'); expect(Object.keys(e).sort()).toEqual(['espera_segundos', 'estado'])
    for (let i = 0; i < 8; i += 1) await ver(`PED-IP-${i}`, RUC, '10.71.0.1')
    expect((await ver((await pedido()).numero, RUC, '10.71.0.1')).estado).toBe('ESPERA')
  })
})

describe('«Van X de Y entregas de tu ruta»', () => {
  it('cuenta solo paradas atendidas y totales, sin nada de los otros clientes; no sale con una sola parada ni antes de salir', async () => {
    const [a, b, c] = [await pedido({ ruc: RUC }), await pedido({ ruc: OTRO_RUC }), await pedido({ ruc: '20700000001' })]
    const rt = await ruta([a.pid, b.pid, c.pid])
    await evento(rt.paradas[1], rt.id, 'LLEGUE', 30); await evento(rt.paradas[1], rt.id, 'ENTREGADO', 20)
    const r = await ver(a.numero)
    expect(r.ruta).toEqual({ atendidas: 1, total: 3 })
    const texto = JSON.stringify(r)
    for (const ajeno of [b.numero, c.numero, OTRO_RUC, '20700000001']) expect(texto).not.toContain(ajeno)
    const sola = await pedido(); await ruta([sola.pid])
    expect((await ver(sola.numero)).ruta).toBeNull()
    const antes = await pedido(); const otra = await pedido(); await ruta([antes.pid, otra.pid], { estado: 'PLANIFICADA', salio: false })
    expect((await ver(antes.numero)).ruta).toBeNull()
  })
  it('el parámetro lo apaga', async () => {
    const a = await pedido(); const b = await pedido(); await ruta([a.pid, b.pid])
    await param('seguimiento_ruta_visible', 'false')
    try { expect((await ver(a.numero)).ruta).toBeNull() } finally { await param('seguimiento_ruta_visible', 'true') }
    expect((await ver(a.numero)).ruta).toEqual({ atendidas: 0, total: 2 })
  })
})

describe('«Escribir a mi vendedor»', () => {
  beforeAll(async () => {
    await como(admin, (c) => c.query(`select wms.guardar_contacto_vendedor('JUAN PÉREZ  ', '+51 987 654 321')`))
    await param('contacto_logisalud_telefono', '+51 999 888 777')
    await param('seguimiento_whatsapp_prueba', '911222333')
  })
  it('con número cargado: el del vendedor (el nombre se compara sin tildes, mayúsculas ni espacios de más)', async () => {
    const p = await pedido({ vendedor: 'juan perez' })
    expect((await ver(p.numero)).contacto).toEqual({ nombre: 'juan perez', telefono: '+51987654321', es_vendedor: true })
  })
  it('sin número cargado: el contacto público de Logisalud; sin ninguno, no hay botón', async () => {
    const p = await pedido({ vendedor: 'Rosa Sin Número' })
    expect((await ver(p.numero)).contacto).toEqual({ nombre: 'Logisalud', telefono: '+51999888777', es_vendedor: false })
    await param('contacto_logisalud_telefono', '')
    try { expect((await ver(p.numero)).contacto).toBeNull() } finally { await param('contacto_logisalud_telefono', '+51 999 888 777') }
    const sinVendedor = await pedido({ vendedor: '' })
    expect((await ver(sinVendedor.numero)).contacto).toMatchObject({ nombre: 'Logisalud', es_vendedor: false })
  })
  it('en modo piloto SIEMPRE el número de prueba, nunca el del vendedor real (ni el de Logisalud)', async () => {
    await param('modo_piloto', 'si')
    try {
      const p = await pedido({ vendedor: 'Juan Pérez' })
      const r = await ver(p.numero)
      expect(r.prueba).toBe(true)
      expect(r.contacto).toMatchObject({ telefono: '+51911222333' })
      expect(JSON.stringify(r)).not.toContain('987654321'); expect(JSON.stringify(r)).not.toContain('999888777')
      await param('seguimiento_whatsapp_prueba', '')
      expect((await ver(p.numero)).contacto).toBeNull()      // sin número de prueba no hay botón: no se usa el real
    } finally { await param('modo_piloto', 'no'); await param('seguimiento_whatsapp_prueba', '911222333') }
    expect((await ver((await pedido()).numero)).prueba).toBe(false)
  })
})

describe('«Ver guía de remisión»', () => {
  it('solo si la guía fue aceptada y existe su enlace de Nubefact; en modo prueba (sin enlace) no hay botón ni error', async () => {
    const a = await pedido(); const b = await pedido(); const c = await pedido(); const d = await pedido()
    await guia(a.salida, 'https://www.nubefact.com/guia/abc123')
    await guia(b.salida, null)
    await guia(c.salida, 'https://www.nubefact.com/guia/pendiente', 'PENDIENTE')
    await guia(d.salida, 'https://www.nubefact.com/guia/anulada', 'ACEPTADA', 'ANULADA')
    expect((await ver(a.numero)).guia).toEqual({ enlace: 'https://www.nubefact.com/guia/abc123' })
    for (const p of [b, c, d]) expect((await ver(p.numero)).guia).toBeNull()
  })
  it('el parámetro «guía visible»: siempre o solo después de Entregado', async () => {
    const p = await pedido(); const q2 = await pedido(); const rt = await ruta([p.pid, q2.pid])
    await guia(p.salida, 'https://www.nubefact.com/guia/xyz')
    await param('seguimiento_guia_visible', 'DESPUES_ENTREGA')
    try {
      expect((await ver(p.numero)).guia).toBeNull()
      await evento(rt.paradas[0], rt.id, 'LLEGUE', 6); await evento(rt.paradas[0], rt.id, 'ENTREGADO', 5)
      expect((await ver(p.numero)).guia).toEqual({ enlace: 'https://www.nubefact.com/guia/xyz' })
    } finally { await param('seguimiento_guia_visible', 'SIEMPRE') }
  })
})

describe('«¿Cómo fue tu entrega?»', () => {
  it('solo después de entregado, una respuesta por pedido, con el mismo acceso (respuesta idéntica si el RUC no es)', async () => {
    const p = await pedido(); const o = await pedido(); const rt = await ruta([p.pid, o.pid])
    expect(await responder(p.numero, RUC, 3)).toEqual({ estado: 'AUN_NO' })
    await evento(rt.paradas[0], rt.id, 'LLEGUE', 8); await evento(rt.paradas[0], rt.id, 'ENTREGADO', 6)
    expect(await responder(p.numero, OTRO_RUC, 3)).toEqual({ estado: 'NO_ENCONTRADO' })
    expect(await responder(p.numero, RUC, 7)).toEqual({ estado: 'ERROR' })
    expect(await responder(p.numero, RUC, 3)).toEqual({ estado: 'OK' })
    expect(await responder(p.numero, RUC, 1)).toEqual({ estado: 'YA_RESPONDIDA' })
    expect((await ver(p.numero)).respuesta).toBe(3)
    expect((await uno('select valor from wms.respuestas_entrega where pedido_id = $1', [p.pid])).valor).toBe(3)
    expect((await ver(o.numero)).respuesta).toBeNull()
    expect(Object.keys(await uno('select * from wms.respuestas_entrega limit 1')).sort()).toEqual(['pedido_id', 'respondida_en', 'valor'])     // anónima
  })
  it('con el seguimiento apagado no responde; y el límite de intentos también la cubre', async () => {
    const p = await pedido()
    for (let i = 0; i < 5; i += 1) await responder(p.numero, OTRO_RUC, 3, `10.72.0.${i}`)
    expect((await responder(p.numero, RUC, 3, '10.72.0.99')).estado).toBe('ESPERA')
    await param('seguimiento_cliente_habilitado', 'false')
    try { expect(await responder(p.numero, RUC, 3)).toEqual({ estado: 'NO_DISPONIBLE' }) } finally { await param('seguimiento_cliente_habilitado', 'true') }
  })
})

describe('contactos de los vendedores y opciones (Administrador)', () => {
  it('solo el Administrador los edita; el teléfono se normaliza a +51 y se rechaza si no tiene 9 dígitos', async () => {
    expect((await falla(como(jt, (c) => c.query(`select wms.guardar_contacto_vendedor('Ana', '987654321')`)))).message).toMatch(/No tienes permiso/)
    expect((await falla(como(admin, (c) => c.query(`select wms.guardar_contacto_vendedor('Ana', '12345')`)))).message).toMatch(/9 dígitos/)
    expect((await falla(como(admin, (c) => c.query(`select wms.guardar_contacto_vendedor('  ', '987654321')`)))).message).toMatch(/nombre del vendedor/)
    const id = (await como(admin, async (c) => (await c.query(`select wms.guardar_contacto_vendedor('Ana Ríos', '51 912 345 678') id`)).rows[0].id)) as string
    expect((await uno('select telefono from wms.contactos_vendedores where id = $1', [id])).telefono).toBe('+51912345678')
    await como(admin, (c) => c.query(`select wms.guardar_contacto_vendedor('ANA RIOS', '900111222')`))      // mismo vendedor: se actualiza, no se duplica
    expect((await uno(`select count(*)::int n from wms.contactos_vendedores where wms._norm_nombre(nombre) = 'ana rios'`)).n).toBe(1)
    expect(await como(admin, async (c) => (await c.query('select wms.eliminar_contacto_vendedor($1) r', [id])).rows[0].r)).toBe(true)
    expect((await uno(`select count(*)::int n from wms.audit_events where evento in ('contacto_vendedor_guardado', 'contacto_vendedor_eliminado')`)).n).toBeGreaterThanOrEqual(3)
  })
  it('el CSV guarda las filas buenas y dice cuáles no, sin frenar todo', async () => {
    const r = await como(admin, async (c) => (await c.query('select wms.cargar_contactos_vendedores($1::jsonb) r', [JSON.stringify([
      { nombre: 'Luis Vega', telefono: '987000111' }, { nombre: '', telefono: '987000222' }, { nombre: 'Mal Teléfono', telefono: '123' }, { nombre: 'Marta Soto', telefono: '+51 987 000 333' }])])).rows[0].r as R)
    expect(r.guardados).toBe(2)
    expect(r.errores).toEqual([{ fila: 2, nombre: '', motivo: 'Falta el nombre' }, { fila: 3, nombre: 'Mal Teléfono', motivo: 'El teléfono no tiene 9 dígitos' }])
    expect((await falla(como(jt, (c) => c.query(`select wms.cargar_contactos_vendedores('[]')`)))).message).toMatch(/No tienes permiso/)
  })
  it('las opciones del seguimiento se validan y solo las cambia el Administrador; los interruptores no pasan por aquí', async () => {
    await como(admin, (c) => c.query(`select wms.guardar_opcion_seguimiento('seguimiento_guia_visible', 'despues_entrega')`))
    expect((await uno(`select valor from wms.parametros where clave = 'seguimiento_guia_visible'`)).valor).toBe('DESPUES_ENTREGA')
    await como(admin, (c) => c.query(`select wms.guardar_opcion_seguimiento('seguimiento_guia_visible', 'SIEMPRE')`))
    await como(admin, (c) => c.query(`select wms.guardar_opcion_seguimiento('contacto_logisalud_telefono', '999 888 777')`))
    expect((await uno(`select valor from wms.parametros where clave = 'contacto_logisalud_telefono'`)).valor).toBe('+51999888777')
    for (const [clave, valor, msj] of [['seguimiento_guia_visible', 'nunca', /siempre/i], ['contacto_logisalud_telefono', '12', /9 dígitos/], ['seguimiento_base_url', 'http://x.com', /https/], ['seguimiento_cliente_habilitado', 'true', /no se cambia aquí/]] as const) {
      expect((await falla(como(admin, (c) => c.query(`select wms.guardar_opcion_seguimiento($1, $2)`, [clave, valor])))).message).toMatch(msj)
    }
    expect((await falla(como(jt, (c) => c.query(`select wms.guardar_opcion_seguimiento('seguimiento_ruta_visible', 'true')`)))).message).toMatch(/No tienes permiso/)
  })
  it('el cliente sin usuario no toca las tablas nuevas ni las funciones del Administrador', async () => {
    for (const tabla of ['contactos_vendedores', 'respuestas_entrega']) await anon(async () => { await expect(base.admin.query(`select 1 from wms.${tabla} limit 1`)).rejects.toThrow(/permission denied/) })
    await anon(async () => { await expect(base.admin.query(`select wms.guardar_contacto_vendedor('x', '987654321')`)).rejects.toThrow(/permission denied/) })
    await anon(async () => { await expect(base.admin.query(`select wms._seguimiento_datos('pa-1')`)).rejects.toThrow(/permission denied/) })
  })
})
