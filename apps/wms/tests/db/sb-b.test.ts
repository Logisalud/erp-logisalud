// SB-B (migración 0032): devolución al proveedor con aviso (no bloquea), muestra a nombre de un trabajador (DNI), numeración atómica de las guías (serie TTT1 compartida con el
// panel de Nubefact) y guía dada de baja en el panel. La migración se puede volver a aplicar.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, SQL, crearBaseDePrueba, falla, idPropietario, sembrarStock } from './helpers'

let base: BaseDePrueba
let logissa: string
let jt: string
let aux: string
let muestras: string
let admin: string

const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
const en = (dias: number) => { const d = new Date(`${hoy}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10) }
const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
const como = <T>(id: string, fn: (c: import('pg').Client) => Promise<T>) => base.como(id, fn)
async function persona(rol: string): Promise<string> {
  const id = randomUUID()
  await base.admin.query('insert into auth.users (id) values ($1)', [id])
  await base.admin.query('insert into wms.usuario_roles (user_id, rol) values ($1, $2)', [id, rol])
  return id
}
let nProd = 0
async function producto(): Promise<string> {
  nProd += 1
  return (await uno(`insert into catalogo.productos (codigo, descripcion, unidad_medida) values ($1, $2, 'TABLETA') returning id`, [`SB-P${nProd}-${randomUUID().slice(0, 4)}`, `Producto SB ${nProd}`])).id as string
}
const stock = (prod: string, lote: string, vence: string, cantidad: number, pos = 'F-1.1') => sembrarStock(base, { posicion: pos, producto: prod, lote, propietario: 'LOGISSA', cantidad, vence })
const PROVEEDOR = { ruc: '20100070970', razon_social: 'Laboratorios Biosana SAC', direccion: 'Av. Industrial 450, Lurín', ubigeo: '150119' }
const manual = (quien: string, clase: string, motivo: string | null, lineas: unknown[], cliente: unknown) =>
  como(quien, async (c) => (await c.query('select wms.crear_orden_salida_manual($1, $2, null, $3::jsonb, null, $4::jsonb, null, null, null) id', [clase, motivo, JSON.stringify(lineas), JSON.stringify(cliente)])).rows[0].id as string)
const rpc = <T = unknown>(quien: string, sql: string, args: unknown[] = []) => como(quien, async (c) => (await c.query(sql, args)).rows[0].r as T)

beforeAll(async () => {
  base = await crearBaseDePrueba()
  logissa = await idPropietario(base.admin, 'LOGISSA')
  jt = await persona('jefe_transporte'); aux = await persona('auxiliar'); muestras = await persona('autoriza_salidas_sin_venta'); admin = await persona('admin_wms')
}, 120_000)
afterAll(async () => { await base?.cerrar() })

describe('devolución al proveedor: menos de 90 días avisa y pide el motivo, no bloquea', () => {
  it('con 40 días por delante pide el motivo; con motivo se crea y lo guarda con la auditoría; con 200 días no pide nada', async () => {
    const p = await producto()
    const cerca = await stock(p, 'DV-CERCA', en(40), 30); const lejos = await stock(p, 'DV-LEJOS', en(200), 30, 'F-1.2')
    const linea = (lote: string) => [{ producto_id: p, cantidad: 5, lote_id: lote }]
    expect((await falla(manual(jt, 'C', 'DEVOLUCION_PROVEEDOR', linea(cerca.loteId), PROVEEDOR))).message).toBe('Una línea tiene menos de 90 días para vencer: escribe el motivo para continuar con la devolución')
    const id = await manual(jt, 'C', 'DEVOLUCION_PROVEEDOR', linea(cerca.loteId), { ...PROVEEDOR, aviso_motivo: 'El proveedor aceptó recibirlo por correo' })
    expect(await uno('select devolucion_aviso_motivo m from wms.salidas where id = $1', [id])).toMatchObject({ m: 'El proveedor aceptó recibirlo por correo' })
    expect((await uno(`select motivo from wms.audit_events where evento = 'devolucion_proveedor_poco_plazo' and entidad_id = $1`, [id])).motivo).toBe('El proveedor aceptó recibirlo por correo')
    const sin = await manual(jt, 'C', 'DEVOLUCION_PROVEEDOR', linea(lejos.loteId), PROVEEDOR)
    expect((await uno('select devolucion_aviso_motivo m from wms.salidas where id = $1', [sin])).m).toBeNull()
  })

  it('lo vencido sigue bloqueando (no es un aviso)', async () => {
    const p = await producto(); const v = await stock(p, 'DV-VENC', en(-1), 10, 'F-1.3')
    expect((await falla(manual(jt, 'C', 'DEVOLUCION_PROVEEDOR', [{ producto_id: p, cantidad: 1, lote_id: v.loteId }], { ...PROVEEDOR, aviso_motivo: 'x' }))).message).toMatch(/no se devuelve vencido a nadie/)
  })
})

describe('muestra a nombre de un trabajador (DNI)', () => {
  const dest = { razon_social: 'Pedro Quispe Mamani', direccion: 'Jr. Los Pinos 12, Lima', ubigeo: '150101' }
  it('acepta un DNI de 8 números en una muestra, lo guarda con su tipo y rechaza un DNI mal escrito', async () => {
    const p = await producto(); await stock(p, 'MU-1', en(300), 40, 'F-1.4')
    const lineas = [{ producto_id: p, cantidad: 2 }]
    const id = await manual(muestras, 'C', 'MUESTRA', lineas, { ...dest, ruc: '40123456', tipo_documento: 'DNI' })
    expect((await uno('select cliente_manual c from wms.salidas where id = $1', [id])).c).toMatchObject({ ruc: '40123456', tipo_documento: 'DNI', razon_social: 'Pedro Quispe Mamani' })
    expect((await falla(manual(muestras, 'C', 'MUESTRA', lineas, { ...dest, ruc: '4012345', tipo_documento: 'DNI' }))).message).toBe('El DNI tiene 8 números')
    expect((await falla(manual(muestras, 'C', 'MUESTRA', lineas, { ...dest, ruc: '40123456' }))).message).toBe('El RUC tiene 11 números')
  })
  it('una devolución al proveedor sigue pidiendo RUC aunque se mande tipo DNI', async () => {
    const p = await producto(); const l = await stock(p, 'MU-2', en(300), 10, 'F-1.3')
    expect((await falla(manual(jt, 'C', 'DEVOLUCION_PROVEEDOR', [{ producto_id: p, cantidad: 1, lote_id: l.loteId }], { ...PROVEEDOR, ruc: '40123456', tipo_documento: 'DNI' }))).message).toBe('El RUC tiene 11 números')
  })
})

describe('numeración atómica de las guías (serie TTT1)', () => {
  let s1: string; let s2: string
  const reservar = (quien: string, entorno: string, salida: string) => rpc<{ numero: number; reintento: boolean }>(quien, `select wms.reservar_numero_guia('TTT1', $1, $2) r`, [entorno, salida])
  const estado = (n: number) => uno(`select estado, entorno from wms.guia_numeros where serie = 'TTT1' and numero = $1 and not archivado`, [n])
  beforeAll(async () => {
    const mk = async () => {
      const p = await producto(); await stock(p, `NU-${randomUUID().slice(0, 5)}`, en(300), 50, 'F-2.1')
      return await como(jt, async (c) => (await c.query(`select wms.crear_salida('DISTRIBUCION', 'VENTA', $1, $2::jsonb) id`, [logissa, JSON.stringify([{ producto_id: p, cantidad: 1 }])])).rows[0].id as string)
    }
    s1 = await mk(); s2 = await mk()
  })

  it('una guía real no se reserva mientras nadie confirme el correlativo inicial', async () => {
    expect((await falla(reservar(jt, 'PRODUCCION', s1))).message).toMatch(/falta confirmar con qué número empieza la serie TTT1/)
    expect((await falla(reservar(aux, 'PRUEBA', s1))).message).toMatch(/No tienes permiso/)
  })

  it('reserva de a una: otra guía en curso espera; el reintento de la misma orden recibe el mismo número; liberar devuelve el número y se usa primero', async () => {
    const a = await reservar(jt, 'PRUEBA', s1)
    expect(a.reintento).toBe(false)
    expect(await estado(a.numero)).toMatchObject({ estado: 'RESERVADO', entorno: 'PRUEBA' })
    expect((await falla(reservar(jt, 'PRUEBA', s2))).message).toMatch(new RegExp(`Se está emitiendo otra guía de la serie TTT1 .* con el número ${a.numero}`))
    expect(await reservar(jt, 'PRUEBA', s1)).toEqual({ numero: a.numero, reintento: true })
    expect(await rpc(jt, `select wms.liberar_numero_guia('TTT1', $1, 'Nubefact rechazó el RUC') r`, [a.numero])).toBe(true)
    expect(await estado(a.numero)).toMatchObject({ estado: 'LIBERADO' })
    expect(await rpc(jt, `select wms.liberar_numero_guia('TTT1', $1, null) r`, [a.numero])).toBe(false)   // ya no hay nada que liberar
    const b = await reservar(jt, 'PRUEBA', s2)
    expect(b.numero).toBe(a.numero)                                                                        // sin huecos: el número devuelto va primero
    expect(await rpc(jt, `select wms.marcar_numero_guia_ocupado('TTT1', $1, 'ya existe') r`, [b.numero])).toBe(true)
    expect(await estado(b.numero)).toMatchObject({ estado: 'OCUPADO' })
    expect((await reservar(jt, 'PRUEBA', s2)).numero).toBe(b.numero + 1)                                  // el ocupado se salta
    await rpc(jt, `select wms.liberar_numero_guia('TTT1', $1, null) r`, [b.numero + 1])
    expect((await uno(`select count(*)::int n from wms.audit_events where evento in ('guia_numero_reservado','guia_numero_liberado','guia_numero_ocupado','guia_numero_reintento')`)).n).toBeGreaterThanOrEqual(5)
  })

  it('confirmar el correlativo: solo el Jefe de Transporte o la administración; la primera guía real lleva ese número; las de prueba ya no usan la serie', async () => {
    expect((await falla(rpc(aux, `select wms.confirmar_correlativo_guia('TTT1', 3000, null) r`))).message).toMatch(/Solo el Jefe de Transporte o la administración/)
    expect((await falla(rpc(jt, `select wms.confirmar_correlativo_guia('TTT1', 0, null) r`))).message).toMatch(/entero de 1 a 99 999 999/)
    expect((await falla(rpc(jt, `select wms.confirmar_correlativo_guia('XXX9', 10, null) r`))).message).toMatch(/no está configurada/)
    await rpc(admin, `select wms.confirmar_correlativo_guia('TTT1', 3000, 'Lo indicó Sebas') r`)
    expect(await uno(`select ultimo, confirmado from wms.guia_correlativos where serie = 'TTT1'`)).toMatchObject({ ultimo: 2999, confirmado: true })
    expect((await uno(`select valor from wms.parametros where clave = 'guia_correlativo_inicial'`)).valor).toBe('3000')
    expect((await falla(reservar(jt, 'PRUEBA', s1))).message).toMatch(/ya está confirmada para producción/)
    expect((await reservar(jt, 'PRODUCCION', s1)).numero).toBe(3000)
    expect((await falla(rpc(jt, `select wms.confirmar_correlativo_guia('TTT1', 3500, null) r`))).message).toMatch(/Hay una guía en curso/)
    expect((await falla(rpc(jt, `select wms.siguiente_numero_guia('TTT1') r`))).message).toMatch(/va por la reserva de números/)
  })

  it('corregir el correlativo (tras un «salto»): pide motivo, no baja de una guía del WMS y deja auditoría', async () => {
    await rpc(jt, `select wms.liberar_numero_guia('TTT1', 3000, 'Prueba') r`)
    expect((await falla(rpc(jt, `select wms.corregir_correlativo_guia('TTT1', 3004, '  ') r`))).message).toMatch(/Cuenta por qué/)
    await rpc(jt, `select wms.corregir_correlativo_guia('TTT1', 3004, 'Alguien emitió 3000 a 3004 desde el panel') r`)
    expect((await uno(`select ultimo from wms.guia_correlativos where serie = 'TTT1'`)).ultimo).toBe(3004)
    expect((await reservar(jt, 'PRODUCCION', s1)).numero).toBe(3005)
    expect((await uno(`select motivo from wms.audit_events where evento = 'guia_correlativo_corregido'`)).motivo).toMatch(/desde el panel/)
    await rpc(jt, `select wms.liberar_numero_guia('TTT1', 3005, null) r`)
  })
})

describe('la migración 0032', () => {
  it('se puede volver a aplicar sin error ni cambiar lo ya hecho', async () => {
    const antes = (await uno(`select ultimo from wms.guia_correlativos where serie = 'TTT1'`)).ultimo
    await base.admin.query(SQL.m0032())
    await base.admin.query(SQL.m0032())
    expect((await uno(`select ultimo from wms.guia_correlativos where serie = 'TTT1'`)).ultimo).toBe(antes)
    expect((await uno(`select valor from wms.parametros where clave = 'devolucion_proveedor_aviso_dias'`)).valor).toBe('90')
    const par = await q(`select clave, valor from wms.parametros where clave like 'guia\\_motivo\\_%' order by clave`)
    expect(Object.fromEntries(par.map((r) => [r.clave, r.valor]))).toMatchObject({ guia_motivo_codigo_venta: '01', guia_motivo_codigo_devolucion: '06', guia_motivo_codigo_muestra: '13', guia_motivo_otros_descripcion_muestra: 'MUESTRA SIN VALOR COMERCIAL', guia_motivo_otros_descripcion_retorno: 'RETORNO DE RECHAZO' })
  })
})
