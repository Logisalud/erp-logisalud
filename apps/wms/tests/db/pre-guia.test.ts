// 0055 · pre-guía: número reservado tras la conformidad, varias a la vez, el envío adopta el número, la cancelada nunca se reutiliza.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba } from './helpers'

let base: BaseDePrueba
let jt: string
beforeAll(async () => {
  base = await crearBaseDePrueba({ piloto: true, con0008: false })
  jt = randomUUID(); await base.admin.query('insert into auth.users (id) values ($1)', [jt])
  await base.admin.query(`insert into wms.usuario_roles (user_id, rol) values ($1, 'jefe_transporte')`, [jt])
  await base.admin.query(`insert into wms.guia_correlativos (serie, ultimo) values ('TTT1', 0) on conflict (serie) do nothing`)
}, 120_000)
afterAll(async () => { await base?.cerrar() })

const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
let n = 0
async function orden(conforme = true) {
  n += 1
  const dueno = (await uno(`select id from wms.propietarios where codigo = 'LOGISSA'`)).id
  return (await uno(`insert into wms.salidas (numero, tipo, motivo, propietario_id, estado, creada_por, conformada_por, conformada_en) values ($1, 'DISTRIBUCION', 'VENTA', $2, 'ABIERTA', $3, $3, ${conforme ? 'now()' : 'null'}) returning id`, [`SAL-2026-7${String(n).padStart(4, '0')}`, dueno, jt])).id as string
}
/** Deja la serie sin números abiertos de las pruebas anteriores (se archivan: nada se borra). */
const limpiarSerie = () => q(`update wms.guia_numeros set archivado = true where serie = 'TTT1' and estado in ('RESERVADO', 'LIBERADO', 'SIN_USAR') and not archivado`)
const como = <T>(fn: (c: import('pg').Client) => Promise<T>) => base.como(jt, fn)
const crear = (salida: string) => como(async (c) => (await c.query(`select wms.crear_pre_guia('TTT1', 'PRUEBA', $1) r`, [salida])).rows[0].r as { serie: string; numero: number; nueva: boolean })
const reservarEnvio = (salida: string) => como(async (c) => (await c.query(`select wms.reservar_numero_guia('TTT1', 'PRUEBA', $1) r`, [salida])).rows[0].r as { numero: number; reintento: boolean })

describe('0055 · pre-guía', () => {
  it('reserva números seguidos para varias órdenes a la vez, y es idempotente por orden', async () => {
    const [a, b] = [await orden(), await orden()]
    const pa = await crear(a); const pb = await crear(b)
    expect(pa).toMatchObject({ serie: 'TTT1', nueva: true }); expect(pb.numero).toBe(pa.numero + 1)
    expect(await crear(a)).toEqual({ serie: 'TTT1', numero: pa.numero, nueva: false })
    expect(Number((await uno(`select count(*) n from wms.guia_numeros where pre_guia and estado = 'RESERVADO' and salida_id in ($1, $2)`, [a, b])).n)).toBe(2)
  })
  it('exige la conformidad, una orden viva y el permiso; no crea nada si falla', async () => {
    const sin = await orden(false)
    await expect(crear(sin)).rejects.toThrow(/cuando el pedido tiene la conformidad/)
    const otra = await orden()
    await expect(base.como(base.personas.sinRol.id, (c) => c.query(`select wms.crear_pre_guia('TTT1', 'PRUEBA', $1)`, [otra]))).rejects.toThrow()
    expect(Number((await uno(`select count(*) n from wms.guia_numeros where salida_id = $1`, [sin])).n)).toBe(0)
  })
  it('el envío usa el número que sigue en la serie (Nubefact pide correlativo seguido): si su pre-guía tenía otro, intercambian números y ninguno se pierde; una orden sin pre-guía no se bloquea', async () => {
    const [a, b, sinPre] = [await orden(), await orden(), await orden()]
    await crear(a); const pb = await crear(b)
    const antes = (await q(`select numero from wms.guia_numeros where pre_guia and estado = 'RESERVADO' and not archivado order by numero`)).map((r) => r.numero as number)
    const menor = antes[0]
    expect(pb.numero).toBeGreaterThan(menor)
    const envio = await reservarEnvio(b)
    expect(envio).toMatchObject({ numero: menor, reintento: true, intercambio: { numero_anterior: menor, numero_nuevo: pb.numero, mi_numero_anterior: pb.numero, mi_numero_nuevo: menor } })   // sale primero b: toma el número que sigue
    // el intento queda anotado: ya no se intercambia (el envío pudo llegar a Nubefact) y se consulta antes de repetirlo
    expect((await uno(`select enviado_en is not null as marcado from wms.guia_numeros where serie = 'TTT1' and numero = $1 and not archivado`, [menor])).marcado).toBe(true)
    const despues = (await q(`select numero from wms.guia_numeros where pre_guia and estado = 'RESERVADO' and not archivado order by numero`)).map((r) => r.numero as number)
    expect(despues).toEqual(antes)   // los mismos números siguen reservados: solo cambiaron de dueño
    const quien = await uno(`select salida_id, detalle from wms.guia_numeros where serie = 'TTT1' and numero = $1 and not archivado`, [pb.numero])
    expect(quien.detalle).toMatch(/pasó de/)
    expect((await uno(`select count(*)::int n from wms.audit_events where evento = 'pre_guia_numero_intercambiado'`)).n).toBeGreaterThanOrEqual(1)
    expect(await reservarEnvio(b)).toMatchObject({ numero: menor, reintento: true, intercambio: null })   // repetir es lo mismo, pero se pregunta a Nubefact antes de volver a enviar
    const libre = await reservarEnvio(sinPre)
    expect(libre.reintento).toBe(false); expect(libre.numero).toBeGreaterThan(Math.max(...antes))
  })
  it('si Nubefact rechaza el envío, el número de la pre-guía NO se libera', async () => {
    const a = await orden(); const p = await crear(a)
    expect((await como((c) => c.query(`select wms.liberar_numero_guia('TTT1', $1, 'Nubefact lo rechazó') ok`, [p.numero]))).rows[0].ok).toBe(false)
    expect((await uno(`select estado, pre_guia from wms.guia_numeros where serie = 'TTT1' and numero = $1 and not archivado`, [p.numero]))).toMatchObject({ estado: 'RESERVADO', pre_guia: true })
  })
  it('cancelar deja el número libre con su motivo y la siguiente pre-guía lo reutiliza (sin huecos)', async () => {
    const [a, b, c] = [await orden(), await orden(), await orden()]
    const pa = await crear(a)
    await expect(como((c) => c.query(`select wms.cancelar_pre_guia($1, '  ')`, [a]))).rejects.toThrow(/Escribe por qué/)
    expect((await como((c) => c.query(`select wms.cancelar_pre_guia($1, 'Se cambió el cliente') ok`, [a]))).rows[0].ok).toBe(true)
    expect(await uno(`select estado, detalle from wms.guia_numeros where serie = 'TTT1' and numero = $1 and not archivado`, [pa.numero])).toMatchObject({ estado: 'SIN_USAR', detalle: 'Se cambió el cliente' })
    expect((await uno(`select count(*)::int n from wms.audit_events where evento = 'pre_guia_cancelada' and entidad_id = $1`, ['TTT1-' + pa.numero])).n).toBe(1)
    const pb = await crear(b)
    expect(pb.numero).toBe(pa.numero)      // 0066: el número de una pre-guía que nunca se envió lo toma la siguiente
    expect(await uno(`select estado, pre_guia, salida_id, detalle from wms.guia_numeros where serie = 'TTT1' and numero = $1 and not archivado`, [pb.numero])).toMatchObject({ estado: 'RESERVADO', pre_guia: true, salida_id: b, detalle: null })
    const pc = await crear(c)
    expect(pc.numero).toBeGreaterThan(pb.numero)      // ya no hay libres: sigue el siguiente de la serie
    expect((await como((c) => c.query(`select wms.cancelar_pre_guia($1, 'otra vez') ok`, [a]))).rows[0].ok).toBe(false)
  })
  it('una pre-guía cancelada después de un intento de envío NO se reutiliza sola (se revisa en Nubefact)', async () => {
    await limpiarSerie()
    const [a, b] = [await orden(), await orden()]
    await crear(a)
    const env = await reservarEnvio(a)      // intento de envío: queda anotado
    expect((await como((c) => c.query(`select wms.cancelar_pre_guia($1, 'Se cambió el cliente') ok`, [a]))).rows[0].ok).toBe(true)
    const pb = await crear(b)
    expect(pb.numero).toBeGreaterThan(env.numero)
    expect(await uno(`select estado from wms.guia_numeros where serie = 'TTT1' and numero = $1 and not archivado`, [env.numero])).toMatchObject({ estado: 'SIN_USAR' })
  })
  it('un envío sin pre-guía también usa primero el número libre de una pre-guía cancelada', async () => {
    await limpiarSerie()
    const [a, sinPre] = [await orden(), await orden()]
    const pa = await crear(a)
    await como((c) => c.query(`select wms.cancelar_pre_guia($1, 'Se cambió el cliente') ok`, [a]))
    expect(await reservarEnvio(sinPre)).toMatchObject({ numero: pa.numero, reintento: false })
    expect(await uno(`select estado, pre_guia, salida_id from wms.guia_numeros where serie = 'TTT1' and numero = $1 and not archivado`, [pa.numero])).toMatchObject({ estado: 'RESERVADO', pre_guia: false, salida_id: sinPre })
  })
})
