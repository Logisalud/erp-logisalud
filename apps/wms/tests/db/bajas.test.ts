// OS-6 (migración 0026): Bajas con sustento por motivo y la Orden de Baja LS-FR.56.01 (BJ1).
import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPosicion, idPropietario, postear, sembrarStock } from './helpers'

let base: BaseDePrueba
let katia: string
let sandra: string
let charlie: string
let aux: string
let logissa: string
let diphasac: string
let n = 0
let k = 0
/** La siguiente ubicación de Aprobados de Logissa (F-1.1 … F-10.4) que ningún test usó. */
const libre = () => { const i = k++; return `F-${1 + Math.floor(i / 4)}.${1 + (i % 4)}` }

const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
const en = (dias: number) => { const d = new Date(`${hoy}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10) }
const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
const como = <T>(id: string, fn: (c: Client) => Promise<T>) => base.como(id, fn)

async function producto(): Promise<string> {
  n += 1
  const id = (await uno(`insert into catalogo.productos (codigo, descripcion, presentacion, unidad_medida) values ($1, $2, 'Caja x 30', 'TABLETA') returning id`, [`BJ-${n}-${randomUUID().slice(0, 4)}`, `Producto baja ${n}`])).id as string
  await base.admin.query(`insert into wms.producto_regulatorio (producto_id, registro_sanitario, rs_vence, estado_validacion, creado_por, validado_por, validado_en) values ($1, $2, '2031-01-01', 'VALIDADO', $3, $3, now())`, [id, `EG-BJ-${n}`, katia])
  return id
}
async function stock(opts: { prod?: string; pos: string; lote: string; vence?: string; cantidad: number; estado?: 'APROBADO' | 'CUARENTENA' | 'DEVOLUCIONES' | 'BAJAS_RECHAZADOS'; propietario?: string; origen?: string }) {
  const prod = opts.prod ?? (await producto())
  const s = await sembrarStock(base, { posicion: opts.pos, producto: prod, lote: opts.lote, propietario: opts.propietario ?? 'LOGISSA', estado: opts.estado ?? 'APROBADO', cantidad: opts.cantidad, vence: opts.vence ?? en(400), origen: opts.origen })
  return { ...s, prod }
}
const linea = (s: { loteId: string; posicionId: string }, cantidad: number, motivo: string, estado = 'APROBADO', detalle?: string) => ({ lote_id: s.loteId, posicion_id: s.posicionId, estado, cantidad, motivo, detalle })
const solicitar = (quien: string, lineas: unknown[], propietario = logissa, nota: string | null = null) =>
  como(quien, async (c) => (await c.query('select wms.solicitar_baja($1, $2::jsonb, $3) id', [propietario, JSON.stringify(lineas), nota])).rows[0].id as string)
const lineasDe = (orden: string) => q('select id, n, motivo from wms.ordenes_baja_lineas where orden_id = $1 order by n', [orden])
const autorizar = (orden: string, quien = katia) => como(quien, async (c) => (await c.query('select wms.autorizar_baja($1) id', [orden])).rows[0].id as string)
const confirmarVence = (linea: string, quien = katia) => como(quien, (c) => c.query('select wms.confirmar_vencimiento_baja($1)', [linea]))
const evaluar = (quien: string, linea: string, datos: Record<string, unknown>) => como(quien, async (c) => (await c.query('select wms.registrar_evaluacion_baja($1, $2::jsonb) id', [linea, JSON.stringify(datos)])).rows[0].id as string)
const adjuntar = (quien: string, linea: string, tipo: string, nombre = 'alerta.pdf') => como(quien, (c) => c.query('select wms.adjuntar_sustento_baja($1, $2, $3, $4, $5, $6, $7)', [linea, tipo, nombre, `baja/${randomUUID()}-${nombre}`, 'abc123', 2048, 'ALERTA 045-2026']))
const estadoOrden = async (id: string) => (await uno('select estado from wms.ordenes_baja where id = $1', [id])).estado as string
const saldoEstado = (lote: string, estado: string) => q(`select coalesce(sum(cantidad), 0)::int n from wms.saldos where lote_id = $1 and estado = $2`, [lote, estado]).then((r) => r[0].n as number)
const evalOk = { checklist: { emb_cerrado: 'C', emb_limpio: 'NC', emb_sin_humedad: 'NC' }, observacion: 'Envase húmedo y con rotura', conclusion: 'NO_CONFORME', cert_analisis: true }

beforeAll(async () => {
  base = await crearBaseDePrueba()
  katia = base.personas.katia.id; sandra = base.personas.sandra.id; charlie = base.personas.charlie.id; aux = base.personas.aux.id
  logissa = await idPropietario(base.admin, 'LOGISSA')
  diphasac = await idPropietario(base.admin, 'DIPHASAC')
}, 120_000)
afterAll(async () => { await base?.cerrar() })

describe('quién solicita y quién autoriza', () => {
  it('solicitan Dirección Técnica, la asistente y el Jefe de Almacén; el auxiliar no; autoriza solo Dirección Técnica', async () => {
    const s = await stock({ pos: libre(), lote: 'BJ-P1', vence: en(-10), cantidad: 20 })
    expect((await falla(solicitar(aux, [linea(s, 5, 'VENCIDO')]))).message).toMatch(/No tienes permiso para solicitar una baja/)
    const o1 = await solicitar(sandra, [linea(s, 5, 'VENCIDO')])
    const o2 = await solicitar(charlie, [linea(s, 5, 'VENCIDO')])
    const o3 = await solicitar(katia, [linea(s, 5, 'VENCIDO')])
    expect(new Set([o1, o2, o3]).size).toBe(3)
    for (const quien of [sandra, charlie, aux]) expect((await falla(autorizar(o3, quien))).message).toMatch(/Solo Dirección Técnica autoriza/)
    for (const quien of [sandra, charlie, aux]) expect((await falla(confirmarVence((await lineasDe(o3))[0].id, quien))).message).toMatch(/Solo Dirección Técnica confirma/)
  })

  it('el número es un correlativo BJ-AAAA-NNNNN sin saltos', async () => {
    const s = await stock({ pos: libre(), lote: 'BJ-P2', vence: en(-3), cantidad: 10 })
    const a = await solicitar(katia, [linea(s, 1, 'VENCIDO')]); const b = await solicitar(katia, [linea(s, 1, 'VENCIDO')])
    const na = (await uno('select numero from wms.ordenes_baja where id = $1', [a])).numero as string
    const nb = (await uno('select numero from wms.ordenes_baja where id = $1', [b])).numero as string
    const [, anio, nn] = na.match(/^BJ-(\d{4})-(\d{5})$/)!
    expect(anio).toBe(hoy.slice(0, 4))
    expect(nb).toBe(`BJ-${anio}-${String(Number(nn) + 1).padStart(5, '0')}`)
  })
})

describe('reglas al solicitar', () => {
  it('no se da de baja más de lo que hay, ni de lo ya pedido en otra solicitud abierta', async () => {
    const s = await stock({ pos: libre(), lote: 'BJ-Q1', vence: en(-30), cantidad: 10 })
    expect((await falla(solicitar(katia, [linea(s, 11, 'VENCIDO')]))).message).toMatch(/no se puede dar de baja más de lo que hay\. Disponible en F-1\.3 \(APROBADO\): 10 unidades/)
    const o = await solicitar(katia, [linea(s, 7, 'VENCIDO')])
    expect((await falla(solicitar(katia, [linea(s, 4, 'VENCIDO')]))).message).toMatch(/Disponible en F-1\.3 \(APROBADO\): 3 unidades/)
    await como(katia, (c) => c.query(`select wms.cerrar_solicitud_baja($1, 'CANCELADA', 'Me equivoqué de lote')`, [o]))
    await solicitar(katia, [linea(s, 10, 'VENCIDO')]) // al retirarla, las unidades vuelven a estar disponibles
  })

  it('lo comprometido en un movimiento abierto no se puede dar de baja', async () => {
    const s = await stock({ pos: libre(), lote: 'BJ-Q2', vence: en(-5), cantidad: 10 })
    const destino = await idPosicion(base.admin, libre())
    await como(charlie, (c) => c.query(`select wms.ejecutar_movimiento($1::jsonb, 'Acomodo')`, [JSON.stringify([{ lote_id: s.loteId, estado: 'APROBADO', procedencia_id: s.procedencia, desde_posicion_id: s.posicionId, hasta_posicion_id: destino, cantidad: 8 }])]))
    const e = await falla(solicitar(katia, [linea(s, 5, 'VENCIDO')]))
    expect(e.message).toMatch(/Disponible en F-1\.4 \(APROBADO\): 2 unidades \(otras 8 están comprometidas en pedidos o movimientos\)/)
  })

  it('lo que ya está en Bajas no se vuelve a dar de baja, ni lo que está en Despacho', async () => {
    const b = await stock({ pos: 'E-8.1.2', lote: 'BJ-Q3', vence: en(-30), cantidad: 6, estado: 'BAJAS_RECHAZADOS' })
    expect((await falla(solicitar(katia, [linea(b, 2, 'VENCIDO', 'BAJAS_RECHAZADOS')]))).message).toMatch(/ya está en Bajas/)
    expect((await falla(solicitar(katia, [linea(b, 2, 'VENCIDO', 'APROBADO')]))).message).toMatch(/ya está en Bajas/)
    await base.admin.query(`insert into wms.posiciones (codigo, rack, forma, tipo_area) values ('STG-BJ', 'S', 'PISO', 'DESPACHO') on conflict do nothing`)
    const d = await stock({ pos: 'STG-BJ', lote: 'BJ-Q4', vence: en(-30), cantidad: 6 }).catch(() => null)
    if (d) expect((await falla(solicitar(katia, [linea(d, 2, 'VENCIDO')]))).message).toMatch(/Despacho dentro de una salida/)
  })

  it('«vencido» solo para un lote que de verdad venció; una baja es de un solo propietario', async () => {
    const vigente = await stock({ pos: libre(), lote: 'BJ-Q5', vence: en(200), cantidad: 10 })
    expect((await falla(solicitar(katia, [linea(vigente, 2, 'VENCIDO')]))).message).toMatch(/el lote no está vencido \(vence el/)
    await solicitar(katia, [linea(vigente, 2, 'DETERIORO_DANO')]) // otro motivo sí
    const ajeno = await stock({ pos: 'A-14.2', lote: 'BJ-Q6', vence: en(-2), cantidad: 4, propietario: 'DIPHASAC' })
    expect((await falla(solicitar(katia, [linea(ajeno, 1, 'VENCIDO')], logissa))).message).toMatch(/es de otro propietario/)
    await solicitar(katia, [linea(ajeno, 1, 'VENCIDO')], diphasac)
  })

  it('motivos y cantidades inválidos se rechazan con mensajes claros; hace falta al menos una línea', async () => {
    const s = await stock({ pos: libre(), lote: 'BJ-Q7', vence: en(-2), cantidad: 4 })
    expect((await falla(solicitar(katia, [linea(s, 1, 'PORQUE_SI')]))).message).toMatch(/elige el motivo de la baja/)
    expect((await falla(solicitar(katia, [linea(s, 0, 'VENCIDO')]))).message).toMatch(/la cantidad debe ser mayor que cero/)
    expect((await falla(solicitar(katia, []))).message).toMatch(/al menos una línea/)
  })

  it('se puede pedir la baja de lo que está en Cuarentena, en Devoluciones o en Reserva (observado), vencido o no', async () => {
    const c = await stock({ pos: 'A-6', lote: 'BJ-R1', vence: en(300), cantidad: 5, estado: 'CUARENTENA', origen: 'COMPRA_LOCAL' })
    await solicitar(katia, [linea(c, 5, 'OBSERVACION_PROVEEDOR', 'CUARENTENA')])
    const d = await stock({ pos: 'E-8.1.1', lote: 'BJ-R2', vence: en(300), cantidad: 5, estado: 'DEVOLUCIONES', origen: 'DEVOLUCION' })
    await solicitar(katia, [linea(d, 5, 'DETERIORO_DANO', 'DEVOLUCIONES')])
    const r = await stock({ pos: libre(), lote: 'BJ-R3', vence: en(300), cantidad: 5 })
    await como(katia, (cl) => cl.query(`select wms.aplicar_reserva_lote($1, 'En revisión')`, [r.loteId]))
    await solicitar(katia, [linea(r, 5, 'ALERTA_DIGEMID')])
  })
})

describe('sin sustento no se da de baja (por motivo)', () => {
  it('VENCIDO: la fecha la propone el lote y Dirección Técnica la confirma; sin confirmar no hay baja', async () => {
    const s = await stock({ pos: libre(), lote: 'BJ-S1', vence: en(-12), cantidad: 20 })
    const o = await solicitar(sandra, [linea(s, 20, 'VENCIDO')])
    const [l] = await lineasDe(o)
    expect(await uno('select vence_propuesta::text v, vence_confirmada from wms.ordenes_baja_lineas where id = $1', [l.id])).toEqual({ v: en(-12), vence_confirmada: null })
    expect((await falla(autorizar(o))).message).toMatch(/Sin sustento no se da de baja\. Línea 1 \(lote BJ-S1\): Dirección Técnica debe confirmar la fecha de vencimiento/)
    await confirmarVence(l.id)
    expect(await uno('select vence_confirmada::text v, vence_confirmada_por p from wms.ordenes_baja_lineas where id = $1', [l.id])).toEqual({ v: en(-12), p: katia })
    await autorizar(o)
    expect(await estadoOrden(o)).toBe('EMITIDA')
  })

  it('si el vencimiento del lote cambia después de confirmarlo, hay que confirmarlo otra vez', async () => {
    const s = await stock({ pos: libre(), lote: 'BJ-S2', vence: en(-12), cantidad: 5 })
    const o = await solicitar(katia, [linea(s, 5, 'VENCIDO')])
    await confirmarVence((await lineasDe(o))[0].id)
    await base.admin.query(`alter table wms.lotes disable trigger user`)
    await base.admin.query(`update wms.lotes set vence = $2 where id = $1`, [s.loteId, en(-20)])
    await base.admin.query(`alter table wms.lotes enable trigger user`)
    expect((await falla(autorizar(o))).message).toMatch(/el vencimiento del lote cambió/)
  })

  it('DETERIORO_DANO: pide una evaluación tipo acta organoléptica que concluya NO CONFORME y marque algo no conforme', async () => {
    const s = await stock({ pos: libre(), lote: 'BJ-S3', vence: en(300), cantidad: 12 })
    const o = await solicitar(sandra, [linea(s, 12, 'DETERIORO_DANO', 'APROBADO', 'Cajas aplastadas en el rack')])
    const [l] = await lineasDe(o)
    expect((await falla(autorizar(o))).message).toMatch(/falta la evaluación del deterioro o daño/)
    for (const quien of [charlie, aux]) expect((await falla(evaluar(quien, l.id, evalOk))).message).toMatch(/Solo la asistente de Dirección Técnica o Dirección Técnica registran la evaluación/)
    expect((await falla(evaluar(sandra, l.id, { ...evalOk, conclusion: undefined }))).message).toMatch(/Elige la conclusión/)
    expect((await falla(evaluar(sandra, l.id, { ...evalOk, observacion: ' ' }))).message).toMatch(/Describe lo que viste/)
    expect((await falla(evaluar(sandra, l.id, { ...evalOk, checklist: {} }))).message).toMatch(/Completa el checklist/)
    await evaluar(sandra, l.id, { ...evalOk, conclusion: 'CONFORME', checklist: { emb_cerrado: 'C' } })
    expect((await falla(autorizar(o))).message).toMatch(/la evaluación concluye CONFORME: no sustenta una baja/)
    await evaluar(sandra, l.id, { ...evalOk, checklist: { emb_cerrado: 'C' } })          // NO CONFORME sin ningún punto «no conforme»
    expect((await falla(autorizar(o))).message).toMatch(/no marca ningún punto no conforme/)
    await evaluar(sandra, l.id, evalOk)                                                    // la última versión vale
    expect((await q('select version from wms.ordenes_baja_evaluaciones where linea_id = $1 order by version', [l.id])).map((r) => r.version)).toEqual([1, 2, 3])
    await autorizar(o)
    expect(await estadoOrden(o)).toBe('EMITIDA')
  })

  it('ALERTA_DIGEMID y OBSERVACION_PROVEEDOR: piden su archivo adjunto, del tipo que corresponde', async () => {
    const s = await stock({ pos: libre(), lote: 'BJ-S4', vence: en(300), cantidad: 10 })
    const s2 = await stock({ prod: s.prod, pos: libre(), lote: 'BJ-S4B', vence: en(300), cantidad: 5 })
    const o = await solicitar(katia, [linea(s, 4, 'ALERTA_DIGEMID'), linea(s2, 3, 'OBSERVACION_PROVEEDOR', 'APROBADO', 'Carta del fabricante')])
    const [l1, l2] = await lineasDe(o)
    expect((await falla(autorizar(o))).message).toMatch(/falta adjuntar la alerta o el retiro de DIGEMID/)
    expect((await falla(adjuntar(aux, l1.id, 'ALERTA_DIGEMID'))).message).toMatch(/No tienes permiso para adjuntar/)
    expect((await falla(adjuntar(sandra, l1.id, 'COMUNICACION_PROVEEDOR'))).message).toMatch(/no corresponde al motivo/)
    await adjuntar(sandra, l1.id, 'ALERTA_DIGEMID')
    expect((await falla(autorizar(o))).message).toMatch(/Línea 2 \(lote BJ-S4B\): falta adjuntar la comunicación del proveedor o fabricante/)
    await adjuntar(charlie, l2.id, 'COMUNICACION_PROVEEDOR', 'carta.png')
    await autorizar(o)
    expect(await estadoOrden(o)).toBe('EMITIDA')
  })

  it('el sustento de un vencido y el de un daño no se confunden: confirmar fecha solo vale en VENCIDO, evaluar solo en DETERIORO', async () => {
    const s = await stock({ pos: libre(), lote: 'BJ-S5', vence: en(-4), cantidad: 4 })
    const o = await solicitar(katia, [linea(s, 4, 'VENCIDO')])
    const [l] = await lineasDe(o)
    expect((await falla(evaluar(katia, l.id, evalOk))).message).toMatch(/no es una baja por deterioro o daño/)
    expect((await falla(adjuntar(katia, l.id, 'ALERTA_DIGEMID'))).message).toMatch(/no corresponde al motivo/)
  })
})

describe('autorizar: el cambio de estado del ledger', () => {
  it('un movimiento de CAMBIO_ESTADO (Aprobado → Bajas) en el mismo lugar, con la Orden como sustento; el stock queda «por trasladar»', async () => {
    const s = await stock({ pos: libre(), lote: 'BJ-A1', vence: en(-8), cantidad: 30 })
    const o = await solicitar(sandra, [linea(s, 18, 'VENCIDO')])
    await confirmarVence((await lineasDe(o))[0].id)
    const mov = await autorizar(o)
    expect(await uno('select tipo, sustento_tipo, sustento_id, referencia_tipo, ejecutor_id from wms.movimientos where id = $1', [mov])).toEqual({ tipo: 'CAMBIO_ESTADO', sustento_tipo: 'ORDEN_BAJA', sustento_id: o, referencia_tipo: 'orden_baja', ejecutor_id: katia })
    expect(await saldoEstado(s.loteId, 'APROBADO')).toBe(12)
    expect(await saldoEstado(s.loteId, 'BAJAS_RECHAZADOS')).toBe(18)
    expect(await q(`select p.codigo from wms.saldos x join wms.posiciones p on p.id = x.posicion_id where x.lote_id = $1 and x.estado = 'BAJAS_RECHAZADOS'`, [s.loteId])).toEqual([{ codigo: await q('select codigo from wms.posiciones where id = $1', [s.posicionId]).then((r) => r[0].codigo) }])
    expect(await q('select * from wms.verificar_saldos()')).toHaveLength(0)
    const orden = await uno('select estado, emitida_por, fecha_documento::text f, hash_contenido, movimiento_estado_id from wms.ordenes_baja where id = $1', [o])
    expect(orden).toMatchObject({ estado: 'EMITIDA', emitida_por: katia, f: hoy, movimiento_estado_id: mov })
    expect(orden.hash_contenido).toMatch(/^[0-9a-f]{64}$/)
  })

  it('el contenido emitido lleva los campos del LS-FR.56.01: solicitante, número, fecha y, por línea, producto, presentación, registro sanitario, lote, vencimiento, cantidad y motivo', async () => {
    const prod = await producto()
    const s = await stock({ prod, pos: libre(), lote: 'BJ-A2', vence: en(-8), cantidad: 9 })
    const o = await solicitar(sandra, [linea(s, 9, 'VENCIDO')])
    await confirmarVence((await lineasDe(o))[0].id)
    await autorizar(o)
    const { contenido, numero } = await uno('select contenido, numero from wms.ordenes_baja where id = $1', [o])
    expect(contenido).toMatchObject({
      formato: 'LS-FR.56.01', poe: 'LS-POE.11.01', numero, fecha: hoy, motivo_traslado: 'Traslado al área de baja',
      solicitante: { nombre: 'Katia Zapata', cargo: 'Dirección Técnica' }, propietario: { codigo: 'LOGISSA' },
    })
    expect(contenido.lineas).toEqual([expect.objectContaining({ n: 1, presentacion: 'Caja x 30', registro_sanitario: expect.stringMatching(/^EG-BJ-/), lote: 'BJ-A2', vence: en(-8), cantidad: 9, motivo: 'VENCIDO', motivo_texto: 'Vencido', ubicacion: expect.stringMatching(/^F-/) })])
    expect(contenido.lineas[0].sustento).toMatch(/Venció el \d{2}\/\d{2}\/\d{4}/)
  })

  it('al autorizar, lo vencido deja de pedir decisión: la alerta LOTE_VENCIDO se cierra y se avisa el traslado al Jefe de Almacén', async () => {
    const s = await stock({ pos: libre(), lote: 'BJ-A3', vence: en(-8), cantidad: 5 })
    await como(katia, (c) => c.query('select wms.revisar_vencimientos()'))
    expect((await uno(`select estado from wms.alertas where clave = $1`, ['lote-vencido:' + s.loteId])).estado).toBe('ABIERTA')
    const o = await solicitar(sandra, [linea(s, 5, 'VENCIDO')])
    expect(await uno(`select tipo, destinatario_rol, estado from wms.alertas where clave = $1`, ['baja:' + o])).toEqual({ tipo: 'BAJA_POR_AUTORIZAR', destinatario_rol: 'direccion_tecnica', estado: 'ABIERTA' })
    await confirmarVence((await lineasDe(o))[0].id)
    await autorizar(o)
    expect((await uno(`select estado from wms.alertas where clave = $1`, ['baja:' + o])).estado).toBe('ATENDIDA')
    expect((await uno(`select estado from wms.alertas where clave = $1`, ['lote-vencido:' + s.loteId])).estado).toBe('ATENDIDA')
    expect(await uno(`select tipo, destinatario_rol, estado from wms.alertas where clave = $1`, ['baja-traslado:' + o])).toEqual({ tipo: 'BAJA_POR_TRASLADAR', destinatario_rol: 'jefe_almacen', estado: 'ABIERTA' })
  })

  it('no se autoriza dos veces ni una solicitud ya cerrada; si el stock se movió, ya no alcanza', async () => {
    const s = await stock({ pos: libre(), lote: 'BJ-A4', vence: en(-8), cantidad: 10 })
    const o = await solicitar(katia, [linea(s, 10, 'VENCIDO')])
    await confirmarVence((await lineasDe(o))[0].id)
    // otra persona mueve 4 unidades antes de que Dirección Técnica autorice
    const destino = await idPosicion(base.admin, libre())
    await como(charlie, (c) => c.query(`select wms.ejecutar_movimiento($1::jsonb, 'Acomodo')`, [JSON.stringify([{ lote_id: s.loteId, estado: 'APROBADO', procedencia_id: s.procedencia, desde_posicion_id: s.posicionId, hasta_posicion_id: destino, cantidad: 4 }])]))
    expect((await falla(autorizar(o))).message).toMatch(/ya no hay tantas unidades disponibles/)
    expect(await estadoOrden(o)).toBe('SOLICITADA')
    expect(await saldoEstado(s.loteId, 'BAJAS_RECHAZADOS')).toBe(0)       // nada quedó a medias
    await como(katia, (c) => c.query(`select wms.cerrar_solicitud_baja($1, 'RECHAZADA', 'Ya no alcanza: se rehace con 6')`, [o]))
    const o2 = await solicitar(katia, [linea(s, 6, 'VENCIDO')])
    await confirmarVence((await lineasDe(o2))[0].id)
    await autorizar(o2)
    expect((await falla(autorizar(o2))).message).toMatch(/ya no está en solicitud \(EMITIDA\)/)
  })

  it('un lote con varias entregas se reparte entre ellas y nada queda sin explicar', async () => {
    const s = await stock({ pos: libre(), lote: 'BJ-A5', vence: en(-8), cantidad: 6 })
    const p2 = randomUUID()
    await como(base.personas.admin.id, (c) => postear(c, 'CARGA_INICIAL', [{ posicion_id: s.posicionId, producto_id: s.prod, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: p2, delta: 4 }]))
    const o = await solicitar(katia, [linea(s, 9, 'VENCIDO')])
    await confirmarVence((await lineasDe(o))[0].id)
    await autorizar(o)
    expect(await saldoEstado(s.loteId, 'BAJAS_RECHAZADOS')).toBe(9)
    expect(await saldoEstado(s.loteId, 'APROBADO')).toBe(1)
    const rep = (await uno('select reparto from wms.ordenes_baja_lineas where orden_id = $1', [o])).reparto as { cantidad: number }[]
    expect(rep.reduce((t, r) => t + r.cantidad, 0)).toBe(9)
  })

  it('una solicitud puede mezclar motivos y estados; todo o nada', async () => {
    const a = await stock({ pos: libre(), lote: 'BJ-M1', vence: en(-8), cantidad: 5 })
    const b = await stock({ pos: 'A-7', lote: 'BJ-M2', vence: en(300), cantidad: 6, estado: 'CUARENTENA', origen: 'COMPRA_LOCAL' })
    const o = await solicitar(katia, [linea(a, 5, 'VENCIDO'), linea(b, 6, 'ALERTA_DIGEMID', 'CUARENTENA')])
    const [l1] = await lineasDe(o)
    await confirmarVence(l1.id)
    expect((await falla(autorizar(o))).message).toMatch(/Línea 2 \(lote BJ-M2\): falta adjuntar la alerta/)
    expect(await saldoEstado(a.loteId, 'BAJAS_RECHAZADOS')).toBe(0)       // la línea 1 no se dio de baja sola
    await adjuntar(katia, (await lineasDe(o))[1].id, 'ALERTA_DIGEMID')
    await autorizar(o)
    expect(await saldoEstado(a.loteId, 'BAJAS_RECHAZADOS')).toBe(5)
    expect(await saldoEstado(b.loteId, 'BAJAS_RECHAZADOS')).toBe(6)
  })
})

describe('el ledger no deja dar de baja Aprobado sin su Orden', () => {
  it('Aprobado → Bajas directo (aunque lo haga Dirección Técnica y con «sustento») se rechaza en la base', async () => {
    const s = await stock({ pos: libre(), lote: 'BJ-L1', vence: en(300), cantidad: 8 })
    const e = await falla(como(katia, (c) => postear(c, 'CAMBIO_ESTADO', [
      { posicion_id: s.posicionId, producto_id: s.prod, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: s.procedencia, delta: -2 },
      { posicion_id: s.posicionId, producto_id: s.prod, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'BAJAS_RECHAZADOS', origen: 'CARGA_INICIAL', procedencia_id: s.procedencia, delta: 2 },
    ], { sustentoId: 'BAJA-1' })))
    expect(e.message).toMatch(/necesita su Orden de Baja con el sustento del motivo/)
    expect(await saldoEstado(s.loteId, 'BAJAS_RECHAZADOS')).toBe(0)
    // ni siquiera con un sustento que se llame ORDEN_BAJA pero no exista
    const e2 = await falla(como(katia, (c) => postear(c, 'CAMBIO_ESTADO', [
      { posicion_id: s.posicionId, producto_id: s.prod, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: s.procedencia, delta: -2 },
      { posicion_id: s.posicionId, producto_id: s.prod, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'BAJAS_RECHAZADOS', origen: 'CARGA_INICIAL', procedencia_id: s.procedencia, delta: 2 },
    ], { sustentoId: randomUUID(), sustentoTipo: 'ORDEN_BAJA' })))
    expect(e2.message).toMatch(/necesita su Orden de Baja/)
  })

  it('Cuarentena → Bajas por el acta organoléptica no cambia (el rechazo sigue su camino)', async () => {
    const s = await stock({ pos: 'A-8', lote: 'BJ-L2', vence: en(300), cantidad: 3, estado: 'CUARENTENA', origen: 'COMPRA_LOCAL' })
    await como(katia, (c) => postear(c, 'CAMBIO_ESTADO', [
      { posicion_id: s.posicionId, producto_id: s.prod, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'CUARENTENA', origen: 'COMPRA_LOCAL', procedencia_id: s.procedencia, delta: -3 },
      { posicion_id: s.posicionId, producto_id: s.prod, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'BAJAS_RECHAZADOS', origen: 'COMPRA_LOCAL', procedencia_id: s.procedencia, delta: 3 },
    ], { sustentoId: 'ACTA-X' }))
    expect(await saldoEstado(s.loteId, 'BAJAS_RECHAZADOS')).toBe(3)
  })
})

describe('rechazar, retirar, y la Orden emitida es inmutable', () => {
  it('Dirección Técnica rechaza con motivo; quien la pidió (o DT) la retira; todo con motivo', async () => {
    const s = await stock({ pos: libre(), lote: 'BJ-C1', vence: en(-8), cantidad: 30 })
    const o1 = await solicitar(sandra, [linea(s, 5, 'VENCIDO')])
    expect((await falla(como(sandra, (c) => c.query(`select wms.cerrar_solicitud_baja($1, 'RECHAZADA', 'No')`, [o1])))).message).toMatch(/Solo Dirección Técnica rechaza/)
    expect((await falla(como(katia, (c) => c.query(`select wms.cerrar_solicitud_baja($1, 'RECHAZADA', ' ')`, [o1])))).message).toMatch(/Cuéntanos el motivo/)
    expect((await falla(como(charlie, (c) => c.query(`select wms.cerrar_solicitud_baja($1, 'CANCELADA', 'x')`, [o1])))).message).toMatch(/Solo quien pidió la baja/)
    await como(sandra, (c) => c.query(`select wms.cerrar_solicitud_baja($1, 'CANCELADA', 'La pedí por error')`, [o1]))
    expect(await estadoOrden(o1)).toBe('CANCELADA')
    expect((await falla(como(katia, (c) => c.query(`select wms.cerrar_solicitud_baja($1, 'RECHAZADA', 'otra vez')`, [o1])))).message).toMatch(/ya no está en solicitud/)
    const o2 = await solicitar(sandra, [linea(s, 5, 'VENCIDO')])
    await como(katia, (c) => c.query(`select wms.cerrar_solicitud_baja($1, 'RECHAZADA', 'Todavía hay que verificar el lote')`, [o2]))
    expect(await uno('select estado, cerrada_por, motivo_cierre from wms.ordenes_baja where id = $1', [o2])).toEqual({ estado: 'RECHAZADA', cerrada_por: katia, motivo_cierre: 'Todavía hay que verificar el lote' })
    expect((await uno(`select estado from wms.alertas where clave = $1`, ['baja:' + o2])).estado).toBe('ATENDIDA')
  })

  it('una Orden emitida no se edita ni se borra, ni su contenido, ni sus líneas, ni su sustento; una cerrada tampoco', async () => {
    const s = await stock({ pos: libre(), lote: 'BJ-C2', vence: en(-8), cantidad: 10 })
    const o = await solicitar(katia, [linea(s, 10, 'VENCIDO')])
    const [l] = await lineasDe(o)
    await confirmarVence(l.id)
    await autorizar(o)
    for (const sql of [
      `update wms.ordenes_baja set contenido = '{}'::jsonb where id = $1`,
      `update wms.ordenes_baja set estado = 'SOLICITADA' where id = $1`,
      `update wms.ordenes_baja set nota = 'x', numero = 'BJ-0000-00000' where id = $1`,
      `delete from wms.ordenes_baja where id = $1`,
    ]) expect((await falla(base.admin.query(sql, [o]))).message, sql).toMatch(/no se borra|inmutable|solo se anula|no se editan/)
    expect((await falla(base.admin.query(`update wms.ordenes_baja_lineas set cantidad = 1 where orden_id = $1`, [o]))).message).toMatch(/ya no admite cambios en sus líneas/)
    expect((await falla(base.admin.query(`delete from wms.ordenes_baja_lineas where orden_id = $1`, [o]))).message).toMatch(/Nada de una Orden de Baja se borra/)
    expect((await falla(base.admin.query(`insert into wms.ordenes_baja_evaluaciones (orden_id, linea_id, version, checklist, observacion, conclusion, evaluada_por) values ($1, $2, 1, '{}', 'x', 'NO_CONFORME', $3)`, [o, l.id, katia]))).message).toMatch(/ya no admite cambios/)
  })

  it('nadie escribe con DML directo; el personal lee, el resto no', async () => {
    const s = await stock({ pos: libre(), lote: 'BJ-C3', vence: en(-8), cantidad: 4 })
    const o = await solicitar(katia, [linea(s, 4, 'VENCIDO')])
    expect((await como(aux, (c) => c.query('select 1 from wms.ordenes_baja where id = $1', [o]))).rows).toHaveLength(1)
    expect((await como(base.personas.sinRol.id, (c) => c.query('select 1 from wms.ordenes_baja where id = $1', [o]))).rows).toHaveLength(0)
    expect((await falla(como(katia, (c) => c.query(`update wms.ordenes_baja set nota = 'x' where id = $1`, [o])))).message).toMatch(/permission denied|row-level security/)
    expect((await falla(como(katia, (c) => c.query(`insert into wms.ordenes_baja_sustentos (orden_id, linea_id, tipo, nombre_archivo, archivo_ref, agregado_por) values ($1, $1, 'ALERTA_DIGEMID', 'a', 'b', $1)`, [o])))).message).toMatch(/permission denied|row-level security/)
  })
})

describe('anular y reemitir (el documento; el cambio de estado no se revierte)', () => {
  it('solo Dirección Técnica anula una Orden emitida, con motivo; una anulada se reemite una sola vez, con otro número y el mismo sustento', async () => {
    const s = await stock({ pos: libre(), lote: 'BJ-N1', vence: en(-8), cantidad: 10 })
    const o = await solicitar(sandra, [linea(s, 10, 'VENCIDO')])
    await confirmarVence((await lineasDe(o))[0].id)
    const mov = await autorizar(o)
    expect((await falla(como(sandra, (c) => c.query(`select wms.anular_orden_baja($1, 'x')`, [o])))).message).toMatch(/Solo Dirección Técnica anula/)
    expect((await falla(como(katia, (c) => c.query(`select wms.anular_orden_baja($1, ' ')`, [o])))).message).toMatch(/necesita un motivo/)
    expect((await falla(como(katia, (c) => c.query(`select wms.reemitir_orden_baja($1)`, [o])))).message).toMatch(/Solo se reemite una Orden anulada/)
    await como(katia, (c) => c.query(`select wms.anular_orden_baja($1, 'El cargo del solicitante estaba mal impreso')`, [o]))
    expect(await estadoOrden(o)).toBe('ANULADA')
    expect(await saldoEstado(s.loteId, 'BAJAS_RECHAZADOS')).toBe(10)                // el stock sigue en Bajas
    expect((await falla(como(katia, (c) => c.query(`select wms.anular_orden_baja($1, 'otra vez')`, [o])))).message).toMatch(/ya está anulada/)
    const nueva = await como(katia, async (c) => (await c.query('select wms.reemitir_orden_baja($1) id', [o])).rows[0].id as string)
    const filas = await q('select numero, estado, reemite_de, movimiento_estado_id, contenido from wms.ordenes_baja where id = any($1::uuid[]) order by solicitada_en', [[o, nueva]])
    expect(filas[0].numero).not.toBe(filas[1].numero)
    expect(filas[1]).toMatchObject({ estado: 'EMITIDA', reemite_de: o, movimiento_estado_id: mov })
    expect(filas[1].contenido.reemite).toBe(filas[0].numero)
    expect(filas[1].contenido.lineas).toHaveLength(1)
    expect((await falla(como(katia, (c) => c.query(`select wms.reemitir_orden_baja($1)`, [o])))).message).toMatch(/ya fue reemitida/)
    expect((await falla(base.admin.query(`update wms.ordenes_baja set motivo_anulacion = 'x' where id = $1`, [o]))).message).toMatch(/ya está cerrada/)
    expect(await q('select * from wms.verificar_saldos()')).toHaveLength(0)
  })

  it('una solicitud no se anula (se rechaza o se retira)', async () => {
    const s = await stock({ pos: libre(), lote: 'BJ-N2', vence: en(-8), cantidad: 3 })
    const o = await solicitar(katia, [linea(s, 3, 'VENCIDO')])
    expect((await falla(como(katia, (c) => c.query(`select wms.anular_orden_baja($1, 'x')`, [o])))).message).toMatch(/Solo se anula una Orden emitida/)
  })
})

describe('trasladar a Bajas (movimiento físico por el flujo normal)', () => {
  async function emitida(pos: string, lote: string, cant: number, propietario = 'LOGISSA', prop = logissa) {
    const s = await stock({ pos, lote, vence: en(-8), cantidad: cant, propietario })
    const o = await solicitar(sandra, [linea(s, cant, 'VENCIDO')], prop)
    await confirmarVence((await lineasDe(o))[0].id)
    await autorizar(o)
    return { s, o }
  }
  const trasladar = (quien: string, o: string, destino: string | null = null) => como(quien, async (c) => (await c.query('select wms.trasladar_baja($1, $2) id', [o, destino])).rows[0].id as string)

  it('crea un movimiento interno hacia el área de Bajas del propietario; otra persona lo verifica; el stock llega a Bajas', async () => {
    const { s, o } = await emitida(libre(), 'BJ-T1', 10)
    expect((await falla(trasladar(katia, o))).message).toMatch(/No tienes permiso para registrar movimientos/)       // DT cambia el estado; no mueve
    const mi = await trasladar(aux, o)
    expect(await uno('select numero, estado, ejecutor_id from wms.ordenes_movimiento where id = $1', [mi])).toMatchObject({ estado: 'EJECUTADO', ejecutor_id: aux })
    expect(await uno('select orden_movimiento_id, posicion_destino_id from wms.ordenes_baja where id = $1', [o])).toMatchObject({ orden_movimiento_id: mi })
    expect((await falla(trasladar(aux, o))).message).toMatch(/El traslado de esta baja ya está registrado/)
    expect((await uno(`select estado from wms.alertas where clave = $1`, ['baja-traslado:' + o])).estado).toBe('ATENDIDA')
    expect(await q(`select 1 from wms.v_stock_en_bajas where lote_id = $1 and en_area_bajas`, [s.loteId])).toHaveLength(0)      // todavía en verificación
  })

  it('el destino debe ser del área de Bajas y aceptar al propietario; si no se indica, se elige solo', async () => {
    const { o } = await emitida(libre(), 'BJ-T2', 4)
    const otra = await idPosicion(base.admin, 'J-12.1')                      // Bajas de Diphasac
    expect((await falla(trasladar(aux, o, otra))).message).toMatch(/no es de este propietario/)
    expect((await falla(trasladar(aux, o, await idPosicion(base.admin, 'F-10.4')))).message).toMatch(/no es del área de Bajas/)
    const mi = await trasladar(aux, o, await idPosicion(base.admin, 'E-8.1.2'))
    expect(mi).toBeTruthy()
  })

  it('cuando se confirma el movimiento, el stock aparece en la vista de Bajas por propietario y lote, listo para una salida por destrucción', async () => {
    const { s, o } = await emitida(libre(), 'BJ-T3', 7)
    const mi = await trasladar(aux, o)
    const lineas = await q('select id from wms.ordenes_movimiento_lineas where orden_id = $1', [mi])
    await como(charlie, (c) => c.query('select wms.revisar_movimiento($1, $2::jsonb)', [mi, JSON.stringify(lineas.map((l) => ({ linea_id: l.id, resultado: 'COINCIDE' })))]))
    const filas = await q('select * from wms.v_stock_en_bajas where lote_id = $1', [s.loteId])
    expect(filas).toEqual([expect.objectContaining({ propietario_codigo: 'LOGISSA', lote: 'BJ-T3', cantidad: 7, vencido: true, en_area_bajas: true, posicion: 'E-8.1.2', motivos: ['VENCIDO'] })])
    expect(filas[0].ordenes_baja).toHaveLength(1)
  })
})

describe('stock en Bajas por propietario y lote (contrato para OS-2)', () => {
  it('lo que llegó a Bajas por un rechazo también aparece (sin Orden), con su ubicación; el personal lo lee y se puede filtrar por propietario', async () => {
    const b1 = await stock({ pos: 'J-12.1', lote: 'BJ-V1', vence: en(-3), cantidad: 12, estado: 'BAJAS_RECHAZADOS', propietario: 'DIPHASAC' })
    const b2 = await stock({ pos: 'E-8.1.2', lote: 'BJ-V2', vence: en(100), cantidad: 3, estado: 'BAJAS_RECHAZADOS' })
    const filas = await como(aux, async (c) => (await c.query(`select propietario_codigo, lote, cantidad, vencido, en_area_bajas, ordenes_baja from wms.v_stock_en_bajas where lote_id = any($1::uuid[]) order by lote`, [[b1.loteId, b2.loteId]])).rows)
    expect(filas).toEqual([
      { propietario_codigo: 'DIPHASAC', lote: 'BJ-V1', cantidad: 12, vencido: true, en_area_bajas: true, ordenes_baja: [] },
      { propietario_codigo: 'LOGISSA', lote: 'BJ-V2', cantidad: 3, vencido: false, en_area_bajas: true, ordenes_baja: [] },
    ])
    expect((await como(base.personas.sinRol.id, (c) => c.query('select 1 from wms.v_stock_en_bajas'))).rows).toHaveLength(0)
  })
})

describe('destrucción desde Bajas: la salida de un cliente de almacenamiento (§7)', () => {
  const destruir = (lineas: unknown[], quien: string) =>
    como(quien, async (c) => (await c.query(`select wms.crear_salida('CLIENTE', 'DESTRUCCION', $1, $2::jsonb) id`, [diphasac, JSON.stringify(lineas)])).rows[0].id as string)
  let jt: string
  beforeAll(async () => {
    jt = randomUUID()
    await base.admin.query('insert into auth.users (id) values ($1)', [jt])
    await base.admin.query(`insert into wms.usuario_roles (user_id, rol) values ($1, 'jefe_transporte')`, [jt])
  })

  it('lo vencido de un cliente nunca sale de Aprobados; se da de baja (Orden), se traslada al área de Bajas y entonces se puede pedir su destrucción', async () => {
    const p = await producto()
    const s = await stock({ prod: p, pos: 'A-14.2', lote: 'BJ-D1', vence: en(-15), cantidad: 12, propietario: 'DIPHASAC' })
    const sal = (motivo: string) => como(jt, (c) => c.query(`select wms.crear_salida('CLIENTE', $1, $2, $3::jsonb)`, [motivo, diphasac, JSON.stringify([{ producto_id: p, cantidad: 5, lote_id: s.loteId }])]))
    expect((await falla(sal('PESQUISA_DIGEMID'))).message).toMatch(/la pesquisa DIGEMID nunca es de lotes vencidos/)
    expect((await falla(sal('VENTA'))).message).toMatch(/lo vencido solo va a Bajas/)
    expect((await falla(sal('DESTRUCCION'))).message).toMatch(/La destrucción sale solo desde Bajas: del lote BJ-D1 hay 0 unidades en el área de Bajas/)
    // la baja con su Orden: el estado cambia en el mismo lugar y queda «por trasladar»; todavía no se puede destruir
    const o = await solicitar(sandra, [linea(s, 12, 'VENCIDO')], diphasac)
    await confirmarVence((await lineasDe(o))[0].id)
    await autorizar(o)
    expect((await falla(sal('DESTRUCCION'))).message).toMatch(/hay 0 unidades en el área de Bajas/)
    // el traslado físico y su verificación lo dejan en el área de Bajas: ahora sí
    const mi = await como(aux, async (c) => (await c.query('select wms.trasladar_baja($1, $2) id', [o, null])).rows[0].id as string)
    const ls = await q('select id from wms.ordenes_movimiento_lineas where orden_id = $1', [mi])
    await como(charlie, (c) => c.query('select wms.revisar_movimiento($1, $2::jsonb)', [mi, JSON.stringify(ls.map((l) => ({ linea_id: l.id, resultado: 'COINCIDE' })))]))
    const salida = await destruir([{ producto_id: p, cantidad: 12, lote_id: s.loteId }], jt)
    const fila = await uno('select estado, nota_stock from wms.salida_lineas where salida_id = $1', [salida])
    expect(fila.estado).toBe('PENDIENTE')                       // el picking desde Bajas lo arma OS-2
    expect(fila.nota_stock).toMatch(/Sale desde Bajas/)
    expect((await uno('select tipo, motivo from wms.salidas where id = $1', [salida]))).toMatchObject({ tipo: 'CLIENTE', motivo: 'DESTRUCCION' })
    // no más de lo que hay en Bajas, ni sumando varias líneas del mismo lote
    expect((await falla(destruir([{ producto_id: p, cantidad: 8, lote_id: s.loteId }, { producto_id: p, cantidad: 8, lote_id: s.loteId }], jt))).message).toMatch(/hay 4 unidades en el área de Bajas y la línea pide 8/)
    expect((await falla(destruir([{ producto_id: p, cantidad: 3 }], jt))).message).toMatch(/Indica el lote/)
  })

  it('la destrucción también sale de lo rechazado en la recepción (Bajas/Rechazados), vencido o no', async () => {
    const p = await producto()
    const b = await stock({ prod: p, pos: 'J-12.1', lote: 'BJ-D2', vence: en(200), cantidad: 6, estado: 'BAJAS_RECHAZADOS', propietario: 'DIPHASAC' })
    expect(await destruir([{ producto_id: p, cantidad: 6, lote_id: b.loteId }], jt)).toBeTruthy()
  })
})
