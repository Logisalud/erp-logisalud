// OS-5 · LS-POE.04.05 (migración 0025): liberación de productos. Logissa: Sandra evalúa y Katia dictamina; una observación es reversible y deja el producto en Cuarentena.
// Clientes de almacenamiento: libera el DT del cliente; Sandra o Katia registran su dictamen (documento adjunto) y confirman el cambio de estado. El rol «DT de cliente» está apagado hasta SEC1.
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPosicion, idPropietario } from './helpers'
import { ayudasDeIngreso } from './ingreso-ayudas'

let base: BaseDePrueba
let a: ReturnType<typeof ayudasDeIngreso>
let logissa: string
let ajr: string
beforeAll(async () => {
  base = await crearBaseDePrueba(); a = ayudasDeIngreso(base)
  logissa = await idPropietario(base.admin, 'LOGISSA'); ajr = await idPropietario(base.admin, 'AJR_LABS')
  await base.admin.query(`insert into wms.asignaciones_posicion (posicion_id, propietario_id, desde) values ($1, $2, current_date)`, [await idPosicion(base.admin, 'A-7'), ajr])
}, 120_000)
afterAll(async () => { await base?.cerrar() })

const sandra = () => base.personas.sandra.id
const katia = () => base.personas.katia.id
const hash = (s: string) => createHash('sha256').update(s).digest('hex')
const registrar = (quien: string, acta: string, lib: number, rech: number, fecha = '2026-10-15') =>
  base.como(quien, async (c) => (await c.query(`select wms.registrar_dictamen_cliente($1, $2, $3, $4::date, 'Correo del DT', 'ajr/dictamen.pdf', 'dictamen.pdf', $5, 'application/pdf') id`,
    [acta, lib, rech, fecha, hash('dictamen' + acta + lib)])).rows[0].id as string)
const confirmar = (quien: string, dictamen: string) => base.como(quien, (c) => c.query('select wms.confirmar_dictamen_cliente($1)', [dictamen]))
const estados = async (ing: string) => (await a.saldosDe(ing)).map((s) => [s.estado, s.cantidad])
const deCliente = async (cantidad: number, lote: string) => {
  const prod = await a.productoNuevo()
  const x = await a.ingresoDirecto({ tipo: 'INGRESO_CLIENTE', propietario: ajr, producto: prod, lote, cantidad, posicion: 'A-7' })
  await a.llenar(x.org)
  return x
}

describe('productos de Logissa: observación reversible', () => {
  it('Katia deja el acta Observada, el producto sigue en Cuarentena y al decidir se cierra como disposición final', async () => {
    const x = await a.compra({ producto: await a.productoNuevo(), cantidad: 50, lote: 'OB-1' })
    await a.llenar(x.org)
    expect((await falla(base.como(sandra(), (c) => c.query(`select wms.observar_acta_organoleptica($1, 'Falta el certificado')`, [x.org])))).message).toMatch(/Solo Dirección Técnica deja un producto Observado/)
    expect((await falla(base.como(katia(), (c) => c.query(`select wms.observar_acta_organoleptica($1, ' ')`, [x.org])))).message).toMatch(/qué se observa/)
    await base.como(katia(), (c) => c.query(`select wms.observar_acta_organoleptica($1, 'Falta el certificado de análisis del lote')`, [x.org]))
    expect((await falla(base.como(katia(), (c) => c.query(`select wms.observar_acta_organoleptica($1, 'Otra')`, [x.org])))).message).toMatch(/ya está Observada/)
    expect(await estados(x.ing)).toEqual([['CUARENTENA', 50]])
    await base.como(katia(), (c) => c.query(`select wms.levantar_observacion_acta($1, 'Llegó el certificado')`, [x.org]))
    expect((await a.q('select nota from wms.observaciones_liberacion where acta_id = $1', [x.org]))[0].nota).toMatch(/Observación levantada: Llegó el certificado/)
    await base.como(katia(), (c) => c.query(`select wms.observar_acta_organoleptica($1, 'Otra vez')`, [x.org]))
    await a.decidir(x.org, 'APROBADO')
    expect(await estados(x.ing)).toEqual([['APROBADO', 50]])
    expect((await a.q('select nota, cerrada_en is not null as cerrada from wms.observaciones_liberacion where acta_id = $1 and texto = $2', [x.org, 'Otra vez']))[0]).toEqual({ nota: 'Disposición final: Aprobado', cerrada: true })
  })

  it('una observación no se borra ni se edita; un acta firmada no se puede observar', async () => {
    const x = await a.compra({ producto: await a.productoNuevo(), cantidad: 50, lote: 'OB-2' })
    await a.llenar(x.org)
    await base.como(katia(), (c) => c.query(`select wms.observar_acta_organoleptica($1, 'Duda')`, [x.org]))
    expect((await falla(base.admin.query('delete from wms.observaciones_liberacion where acta_id = $1', [x.org]))).message).toMatch(/no se borra/)
    expect((await falla(base.admin.query(`update wms.observaciones_liberacion set texto = 'x' where acta_id = $1`, [x.org]))).message).toMatch(/solo se cierra/)
    await a.decidir(x.org, 'APROBADO')
    expect((await falla(base.como(katia(), (c) => c.query(`select wms.observar_acta_organoleptica($1, 'Tarde')`, [x.org])))).message).toMatch(/ya está firmada/)
  })
})

describe('productos de clientes: libera el DT del cliente; Sandra o Katia registran su dictamen', () => {
  it('Katia no firma el acta de un producto de cliente por sí sola: hace falta el dictamen', async () => {
    const x = await deCliente(100, 'CL-1')
    expect(await estados(x.ing)).toEqual([['CUARENTENA', 100]])
    expect((await falla(a.decidir(x.org, 'APROBADO'))).message).toMatch(/lo libera el DT del cliente/)
    expect((await falla(a.decidir(x.org, 'BAJAS_RECHAZADOS'))).message).toMatch(/lo libera el DT del cliente/)
  })

  it('registrar no cambia nada; confirmar cambia el estado (liberadas a Aprobado, rechazadas a Bajas) y firma el acta', async () => {
    const x = await deCliente(100, 'CL-2')
    const d = await registrar(sandra(), x.org, 90, 10)
    expect(await estados(x.ing)).toEqual([['CUARENTENA', 100]])
    expect(await a.q(`select tipo, destinatario_rol, estado from wms.alertas where clave = $1`, ['dictamen:' + d])).toEqual([{ tipo: 'DICTAMEN_POR_CONFIRMAR', destinatario_rol: 'asistente_dt', estado: 'ABIERTA' }])
    await confirmar(katia(), d) // SB-C (D-169): el recordatorio es de quien registró (Sandra); lo confirma ella o Katia, sin segunda firma
    expect(await estados(x.ing)).toEqual([['APROBADO', 90], ['BAJAS_RECHAZADOS', 10]])
    const ac = await a.acta(x.org)
    expect(ac).toMatchObject({ estado: 'FIRMADA', decision: 'APROBADO' })
    expect(ac.contenido).toMatchObject({ liberacion: 'DT_CLIENTE', cantidad_liberada: 90, cantidad_rechazada: 10 })
    expect(await a.q(`select estado from wms.alertas where clave = $1`, ['dictamen:' + d])).toEqual([{ estado: 'ATENDIDA' }])
    expect((await base.admin.query('select * from wms.verificar_saldos()')).rows).toHaveLength(0)
  })

  it('un dictamen parcial deja el resto esperando; el segundo cierra el acta; todo rechazado va a Bajas', async () => {
    const x = await deCliente(100, 'CL-3')
    await confirmar(sandra(), await registrar(katia(), x.org, 60, 0))
    expect(await estados(x.ing)).toEqual([['APROBADO', 60], ['CUARENTENA', 40]])
    expect((await a.acta(x.org)).estado).toBe('PENDIENTE_DT')
    expect((await falla(registrar(sandra(), x.org, 41, 0))).message).toMatch(/solo hay 40 unidades esperando decisión/)
    await confirmar(sandra(), await registrar(sandra(), x.org, 0, 40))
    expect(await estados(x.ing)).toEqual([['APROBADO', 60], ['BAJAS_RECHAZADOS', 40]])
    expect((await a.acta(x.org)).estado).toBe('FIRMADA')
    const y = await deCliente(20, 'CL-4')
    await confirmar(sandra(), await registrar(sandra(), y.org, 0, 20))
    expect(await estados(y.ing)).toEqual([['BAJAS_RECHAZADOS', 20]])
    expect((await a.acta(y.org)).decision).toBe('BAJAS_RECHAZADOS')
  })

  it('exige el documento, la fecha y un lote de cliente; no se registra dos veces el mismo lote ni sobre un acta firmada', async () => {
    const x = await deCliente(50, 'CL-5')
    const sin = (ref: string | null, hashd: string | null, tipo: string | null, fecha: string | null) =>
      base.como(sandra(), (c) => c.query(`select wms.registrar_dictamen_cliente($1, 10, 0, $2::date, null, $3, 'd.pdf', $4, $5)`, [x.org, fecha, ref, hashd, tipo]))
    expect((await falla(sin(null, null, 'application/pdf', '2026-10-15'))).message).toMatch(/Adjunta el documento/)
    expect((await falla(sin('r/d.exe', 'h', 'application/x-msdownload', '2026-10-15'))).message).toMatch(/PDF o una imagen/)
    expect((await falla(sin('r/d.pdf', 'h', 'application/pdf', null))).message).toMatch(/fecha del dictamen/)
    expect((await falla(sin('r/d.pdf', 'h', 'application/pdf', '2999-01-01'))).message).toMatch(/no puede ser futura/)
    const d = await registrar(sandra(), x.org, 10, 0)
    expect((await falla(registrar(sandra(), x.org, 10, 0))).message).toMatch(/Ya hay un dictamen registrado/)
    await confirmar(katia(), d)
    expect((await falla(confirmar(katia(), d))).message).toMatch(/ya está confirmado/)
    const l = await a.compra({ producto: await a.productoNuevo(), cantidad: 50, lote: 'CL-6' })
    await a.llenar(l.org)
    expect((await falla(registrar(sandra(), l.org, 10, 0))).message).toMatch(/Este producto es de Logissa/)
  })

  it('anular exige motivo y solo vale mientras no se confirmó; un dictamen no se edita ni se borra', async () => {
    const x = await deCliente(50, 'CL-7')
    const d = await registrar(sandra(), x.org, 50, 0)
    expect((await falla(base.admin.query(`update wms.dictamenes_cliente set cantidad_liberada = 1 where id = $1`, [d]))).message).toMatch(/no se edita/)
    expect((await falla(base.admin.query('delete from wms.dictamenes_cliente where id = $1', [d]))).message).toMatch(/no se borra/)
    expect((await falla(base.como(sandra(), (c) => c.query(`select wms.anular_dictamen_cliente($1, ' ')`, [d])))).message).toMatch(/por qué se anula/)
    await base.como(sandra(), (c) => c.query(`select wms.anular_dictamen_cliente($1, 'Era de otro lote')`, [d]))
    expect(await estados(x.ing)).toEqual([['CUARENTENA', 50]])
    expect((await falla(confirmar(katia(), d))).message).toMatch(/ya está anulado/)
    const d2 = await registrar(sandra(), x.org, 50, 0)
    await confirmar(katia(), d2)
    expect((await falla(base.como(sandra(), (c) => c.query(`select wms.anular_dictamen_cliente($1, 'Tarde')`, [d2])))).message).toMatch(/ya cambió el estado/)
  })

  it('una sola persona: quien registró el dictamen lo confirma (D-169, el parámetro «dos personas» ya no se consulta)', async () => {
    const x = await deCliente(50, 'CL-8')
    await base.admin.query(`update wms.parametros set valor = 'si' where clave = 'dictamen_cliente_dos_personas'`)
    try {
      const d = await registrar(sandra(), x.org, 50, 0)
      await confirmar(sandra(), d)
      expect(await estados(x.ing)).toEqual([['APROBADO', 50]])
    } finally { await base.admin.query(`update wms.parametros set valor = 'no' where clave = 'dictamen_cliente_dos_personas'`) }
  })

  it('solo Sandra y Katia registran, confirman y anulan; los demás no', async () => {
    const x = await deCliente(50, 'CL-9')
    for (const quien of [base.personas.charlie.id, base.personas.aux.id, base.personas.auditor.id, base.personas.sinRol.id]) {
      expect((await falla(registrar(quien, x.org, 10, 0))).message).toMatch(/Solo Sandra o Dirección Técnica registran/)
    }
    const d = await registrar(sandra(), x.org, 10, 0)
    expect((await falla(confirmar(base.personas.charlie.id, d))).message).toMatch(/Solo Sandra o Dirección Técnica confirman/)
    expect((await falla(base.como(base.personas.charlie.id, (c) => c.query(`select wms.anular_dictamen_cliente($1, 'x')`, [d])))).message).toMatch(/Solo Sandra o Dirección Técnica anulan/)
  })

  it('la observación de un producto de cliente la dejan Sandra o Katia (por el DT del cliente)', async () => {
    const x = await deCliente(50, 'CL-10')
    await base.como(sandra(), (c) => c.query(`select wms.observar_acta_organoleptica($1, 'El DT pidió corregir el rótulo')`, [x.org]))
    expect((await falla(base.como(base.personas.charlie.id, (c) => c.query(`select wms.levantar_observacion_acta($1, 'x')`, [x.org])))).message).toMatch(/Solo Sandra o Dirección Técnica/)
    await base.como(sandra(), (c) => c.query(`select wms.levantar_observacion_acta($1, 'Corregido')`, [x.org]))
  })
})

describe('el rol «DT de cliente» queda como gancho, apagado hasta SEC1 (D-68)', () => {
  it('no se puede crear la cuenta mientras el acceso de clientes esté apagado', async () => {
    const u = await a.persona([])
    const e = await falla(base.admin.query(`insert into wms.usuario_roles (user_id, rol, propietario_id) values ($1, 'dt_cliente', $2)`, [u, ajr]))
    expect(e.message).toMatch(/deshabilitado hasta que SEC1/)
  })

  it('con el acceso encendido (solo en esta prueba) libera únicamente el stock de SU propietario, con su único permiso', async () => {
    const x = await deCliente(40, 'CL-11')
    const otro = await a.compra({ producto: await a.productoNuevo(), cantidad: 40, lote: 'CL-12' })
    await a.llenar(otro.org)
    const u = await a.persona([])
    await base.admin.query(`update wms.parametros set valor = 'true' where clave = 'acceso_clientes_habilitado'`)
    try {
      await base.admin.query(`insert into wms.usuario_roles (user_id, rol, propietario_id) values ($1, 'dt_cliente', $2)`, [u, ajr])
      expect((await falla(base.admin.query(`insert into wms.usuario_roles (user_id, rol) values ($1, 'auxiliar')`, [u]))).message).toMatch(/no puede recibir otros roles/)
      const dictaminar = (acta: string, l: number, r: number) => base.como(u, async (c) => (await c.query('select wms.dictaminar_como_dt_cliente($1, $2, $3, null) id', [acta, l, r])).rows[0].id)
      expect((await falla(dictaminar(otro.org, 10, 0))).message).toMatch(/Este producto es de Logissa/)
      await dictaminar(x.org, 30, 10)
      expect(await estados(x.ing)).toEqual([['APROBADO', 30], ['BAJAS_RECHAZADOS', 10]])
      expect((await a.acta(x.org)).estado).toBe('FIRMADA')
      // no es personal: no registra dictámenes por otros ni lee el WMS como el personal
      expect((await falla(base.como(u, (c) => c.query(`select wms.registrar_dictamen_cliente($1, 1, 0, current_date, null, 'r', 'n', 'h', 'application/pdf')`, [otro.org])))).message).toMatch(/Solo Sandra o Dirección Técnica registran/)
    } finally {
      await base.admin.query(`delete from wms.usuario_roles where user_id = $1`, [u]).catch(() => undefined)
      await base.admin.query(`update wms.parametros set valor = 'false' where clave = 'acceso_clientes_habilitado'`)
    }
  })

  it('el acta de un producto de un cliente nunca se firma por otra vía que el dictamen (ni por update directo)', async () => {
    const x = await deCliente(10, 'CL-13')
    expect((await falla(base.admin.query(`update wms.actas_organolepticas set estado = 'FIRMADA', decision = 'APROBADO' where id = $1`, [x.org]))).message).toMatch(/lo libera el DT del cliente/)
  })
})
