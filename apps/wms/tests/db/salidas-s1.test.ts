// S1 (migración 0011): roles y permisos, tipos de movimiento, zonas de salida, orden de recorrido y vehículos.
// El aislamiento por propietario (P0) está en aislamiento.test.ts.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { puede } from '@/domain/permisos'
import type { Accion, Rol } from '@/domain/tipos'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPosicion, idPropietario, postear, SQL } from './helpers'

let base: BaseDePrueba
beforeAll(async () => { base = await crearBaseDePrueba() }, 60_000)
afterAll(async () => { await base?.cerrar() })
const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)

async function persona(rol: string): Promise<string> {
  const id = randomUUID()
  await base.admin.query('insert into auth.users (id) values ($1)', [id])
  await base.admin.query('insert into wms.usuario_roles (user_id, rol) values ($1, $2)', [id, rol])
  return id
}

describe('permisos: la base y el dominio dicen lo mismo', () => {
  it('permisos_rol (base) == puede() (dominio) para cada rol y cada acción', async () => {
    const roles = ['direccion_tecnica', 'asistente_dt', 'jefe_almacen', 'auxiliar', 'auditoria_lectura', 'admin_wms',
      'jefe_transporte', 'conductor', 'auxiliar_transporte', 'conformidad_despacho', 'autoriza_salidas_sin_venta', 'usuario_cliente'] as Rol[]
    const acciones = ['ver', 'ejecutar', 'verificar', 'aprobar', 'ajustar', 'configurar', 'exportar', 'auditar', 'dar_conformidad',
      'cambiar_lote_asignado', 'imprimir_paquete_documental', 'gestionar_documentos_regulatorios', 'autorizar_salida_sin_venta', 'preparar_salidas', 'confirmar_salida'] as Accion[]
    const filas = await q('select rol, accion from wms.permisos_rol')
    const enBase = new Set(filas.map((f) => `${f.rol}/${f.accion}`))
    for (const r of roles) for (const a of acciones) expect(enBase.has(`${r}/${a}`), `${r}/${a}`).toBe(puede([r], a))
  })

  it('en la base, solo quien tiene el permiso lo ejerce (tiene_permiso)', async () => {
    const consulta = (id: string, accion: string) => base.como(id, async (c) => (await c.query('select wms.tiene_permiso($1) p', [accion])).rows[0].p)
    const sandra = await persona('asistente_dt')
    await base.admin.query(`insert into wms.usuario_roles (user_id, rol) values ($1, 'conformidad_despacho')`, [sandra])
    expect(await consulta(sandra, 'dar_conformidad')).toBe(true)
    expect(await consulta(base.personas.charlie.id, 'dar_conformidad')).toBe(false)
    expect(await consulta(await persona('jefe_transporte'), 'cambiar_lote_asignado')).toBe(true)
    expect(await consulta(await persona('jefe_transporte'), 'ejecutar')).toBe(false)
    expect(await consulta(base.personas.katia.id, 'gestionar_documentos_regulatorios')).toBe(true)
    expect(await consulta(base.personas.sandra.id, 'gestionar_documentos_regulatorios')).toBe(false)
  })

  it('un rol desconocido o una acción desconocida no entran', async () => {
    const u = randomUUID()
    expect((await falla(base.admin.query(`insert into wms.usuario_roles (user_id, rol) values ($1, 'superusuario')`, [u]))).message).toMatch(/usuario_roles_rol_check/)
    expect((await falla(base.admin.query(`insert into wms.permisos_rol (rol, accion) values ('auxiliar', 'todo')`))).message).toMatch(/permisos_rol_accion_check/)
  })

  it('las alertas se pueden dirigir al Jefe de Transporte', async () => {
    await base.admin.query(`insert into wms.alertas (tipo, destinatario_rol, mensaje, clave) values ('TEMPERATURA', 'jefe_transporte', 'prueba', 'k-s1')`)
    expect((await q(`select destinatario_rol from wms.alertas where clave = 'k-s1'`))[0].destinatario_rol).toBe('jefe_transporte')
  })
})

describe('tipos de movimiento SALIDA y RETORNO', () => {
  it('existen; S2 los habilita y nadie los registra a mano (solo el flujo de salidas)', async () => {
    const t = await q(`select codigo, habilitado from wms.tipos_movimiento where codigo in ('SALIDA', 'RETORNO') order by 1`)
    expect(t.map((r) => r.codigo)).toEqual(['RETORNO', 'SALIDA'])
    const pos = await idPosicion(base.admin, 'K-1')
    const prop = await idPropietario(base.admin, 'LOGISSA')
    const lote = (await q(`insert into wms.lotes (producto_id, codigo, vence, propietario_id) values ($1, 'S1-L', '2030-01-01', $2) returning id`, [base.productos.dapa, prop]))[0].id
    for (const tipo of ['SALIDA', 'RETORNO']) {
      const e = await falla(base.como(base.personas.admin.id, (c) =>
        postear(c, tipo, [{ posicion_id: pos, producto_id: base.productos.dapa, lote_id: lote, propietario_id: prop, estado: 'APROBADO',
          origen: 'CARGA_INICIAL', procedencia_id: randomUUID(), delta: -1 }])))
      expect(e.message, tipo).toMatch(/no habilitado|solo se registran por el flujo de salidas/)
    }
  })
})

describe('zonas de salida', () => {
  it('Embalaje y Despacho están en alcance y admiten Aprobado, no Cuarentena', async () => {
    expect(await q(`select codigo, en_alcance from wms.tipos_area where codigo in ('EMBALAJE', 'DESPACHO') order by 1`))
      .toEqual([{ codigo: 'DESPACHO', en_alcance: true }, { codigo: 'EMBALAJE', en_alcance: true }])
    const prop = await idPropietario(base.admin, 'LOGISSA')
    const lote = (await q(`insert into wms.lotes (producto_id, codigo, vence, propietario_id) values ($1, 'S1-D', '2030-01-01', $2) returning id`, [base.productos.dapa, prop]))[0].id
    const ped = (estado: 'APROBADO' | 'CUARENTENA') => [{ posicion_id: '', producto_id: base.productos.dapa, lote_id: lote, propietario_id: prop,
      estado, origen: 'CARGA_INICIAL', procedencia_id: randomUUID(), delta: 5 }]
    const k1 = await idPosicion(base.admin, 'K-1')
    const m2 = await idPosicion(base.admin, 'K-M2')
    for (const pos of [k1, m2]) {
      const ok = ped('APROBADO'); ok[0].posicion_id = pos
      await base.como(base.personas.admin.id, (c) => postear(c, 'CARGA_INICIAL', ok))
      const mal = ped('CUARENTENA'); mal[0].posicion_id = pos
      const e = await falla(base.como(base.personas.admin.id, (c) => postear(c, 'CARGA_INICIAL', mal)))
      expect(e.message).toMatch(/no admite unidades en estado/)
    }
  })

  it('las tres zonas nuevas existen, apagadas, y la base rechaza cualquier unidad que intente entrar', async () => {
    const z = await q(`select codigo, es_compartida, en_alcance from wms.tipos_area where codigo in ('PENDIENTE_CONFORMIDAD', 'OBSERVADO', 'RETORNO_RESERVADO') order by 1`)
    expect(z).toHaveLength(3)
    expect(z.every((r) => r.en_alcance === false && r.es_compartida === true)).toBe(true)
    // S2 hace que «Pendiente de conformidad» y «Retorno reservado» admitan Aprobado (sin posiciones, nada entra); «Observado» sigue sin admitir nada.
    expect(await q(`select 1 from wms.area_estado_admitido where tipo_area = 'OBSERVADO'`)).toHaveLength(0)
    expect(await q(`select 1 from wms.posiciones where tipo_area in ('PENDIENTE_CONFORMIDAD', 'OBSERVADO', 'RETORNO_RESERVADO')`)).toHaveLength(0)
    // Una posición de prueba en una zona apagada: la base no deja entrar nada (la zona no admite ningún estado).
    const prop = await idPropietario(base.admin, 'LOGISSA')
    const lote = (await q(`insert into wms.lotes (producto_id, codigo, vence, propietario_id) values ($1, 'S1-Z', '2030-01-01', $2) returning id`, [base.productos.dapa, prop]))[0].id
    const pos = (await q(`insert into wms.posiciones (codigo, rack, forma, tipo_area) values ('ZZ-PRUEBA', 'Z', 'PISO', 'OBSERVADO') returning id`))[0].id
    const e = await falla(base.como(base.personas.admin.id, (c) =>
      postear(c, 'CARGA_INICIAL', [{ posicion_id: pos, producto_id: base.productos.dapa, lote_id: lote, propietario_id: prop, estado: 'APROBADO',
        origen: 'CARGA_INICIAL', procedencia_id: randomUUID(), delta: 1 }])))
    expect(e.message).toMatch(/no admite unidades en estado/)
  })

  it('un movimiento interno manual no entra ni sale de las zonas de salida', async () => {
    const k1 = await idPosicion(base.admin, 'K-1')
    const origen = await idPosicion(base.admin, 'F-2.1')
    const prop = await idPropietario(base.admin, 'LOGISSA')
    const lote = (await q(`insert into wms.lotes (producto_id, codigo, vence, propietario_id) values ($1, 'S1-M', '2030-01-01', $2) returning id`, [base.productos.dapa, prop]))[0].id
    const ordenId = (await q(`insert into wms.ordenes_movimiento (numero, motivo, ejecutor_id) values ('MI-TEST-00001', 'prueba', $1) returning id`,
      [base.personas.charlie.id]))[0].id
    const e = await falla(base.admin.query(
      `insert into wms.ordenes_movimiento_lineas (orden_id, producto_id, lote_id, propietario_id, estado, origen, procedencia_id, desde_posicion_id, hasta_posicion_id, cantidad)
       values ($1, $2, $3, $4, 'APROBADO', 'CARGA_INICIAL', $5, $6, $7, 1)`, [ordenId, base.productos.dapa, lote, prop, randomUUID(), origen, k1]))
    expect(e.message).toMatch(/solo en las salidas/)
  })

  it('el trigger existe y nombra las cinco zonas de salida', async () => {
    const def = (await q(`select pg_get_functiondef('wms.trg_mover_no_toca_zonas_de_salida'::regproc) d`))[0].d as string
    for (const a of ['EMBALAJE', 'DESPACHO', 'PENDIENTE_CONFORMIDAD', 'OBSERVADO', 'RETORNO_RESERVADO']) expect(def).toContain(`'${a}'`)
    expect(await q(`select 1 from pg_trigger where tgname = 'mover_no_toca_zonas_de_salida' and not tgisinternal`)).toHaveLength(1)
  })
})

describe('orden de recorrido (D-65)', () => {
  it('toda posición tiene orden y los niveles de una columna comparten el mismo (el picker camina a la columna)', async () => {
    expect(await q('select 1 from wms.posiciones where orden_recorrido is null')).toHaveLength(0)
    const a10 = await q(`select distinct orden_recorrido from wms.posiciones where rack = 'A' and posicion = 10`)
    expect(a10).toHaveLength(1)
    const a10n = (await q(`select count(*)::int n from wms.posiciones where rack = 'A' and posicion = 10`))[0].n
    expect(a10n).toBeGreaterThanOrEqual(4)
  })

  it('el recorrido por defecto va por rack y luego por columna', async () => {
    const o = async (codigo: string) => (await q('select orden_recorrido o from wms.posiciones where codigo = $1', [codigo]))[0].o as number
    expect(await o('A-10.1')).toBeLessThan(await o('A-11.1'))
    expect(await o('A-27.1')).toBeLessThan(await o('B-1'))
    expect(await o('F-1.1')).toBeLessThan(await o('G-7.1'))
  })

  it('Charlie (por la administración) lo ajusta por posición y un alta nueva recibe el valor por defecto', async () => {
    await base.como(base.personas.admin.id, (c) => c.query(`update wms.posiciones set orden_recorrido = 12345 where codigo = 'H-1.1'`))
    expect((await q(`select orden_recorrido o from wms.posiciones where codigo = 'H-1.1'`))[0].o).toBe(12345)
    const n = (await q(`insert into wms.posiciones (codigo, rack, posicion, nivel, forma, tipo_area) values ('Q-3.1', 'Q', 3, 1, 'RACK', 'APROBADOS') returning orden_recorrido o`))[0].o
    expect(n).toBe((17) * 1000 + 30)
    // Quien no administra no lo cambia.
    const sin = await base.como(base.personas.aux.id, async (c) => (await c.query(`update wms.posiciones set orden_recorrido = 1 where codigo = 'H-1.2'`)).rowCount)
    expect(sin).toBe(0)
  })
})

describe('vehículos', () => {
  it('lo administran admin_wms y el Jefe de Transporte; el resto del personal lo ve; nadie sin rol', async () => {
    const jt = await persona('jefe_transporte')
    await base.como(jt, (c) => c.query(`insert into wms.vehiculos (placa, descripcion, capacidad_kg) values ('BKW-757', 'Camión prueba', 1500)`))
    const e = await falla(base.como(base.personas.aux.id, (c) => c.query(`insert into wms.vehiculos (placa) values ('XYZ-123')`)))
    expect(e.message).toMatch(/row-level security/)
    expect(await base.como(base.personas.aux.id, async (c) => (await c.query('select count(*)::int n from wms.vehiculos')).rows[0].n)).toBe(1)
    expect(await base.como(base.personas.sinRol.id, async (c) => (await c.query('select count(*)::int n from wms.vehiculos')).rows[0].n)).toBe(0)
    // Un conductor todavía no lee el inventario ni los vehículos (sus políticas llegan con S9).
    const cond = await persona('conductor')
    expect(await base.como(cond, async (c) => (await c.query('select count(*)::int n from wms.vehiculos')).rows[0].n)).toBe(0)
  })

  it('la placa no se repite (sin distinguir mayúsculas) y la capacidad no es negativa', async () => {
    const e = await falla(base.admin.query(`insert into wms.vehiculos (placa) values ('bkw-757')`))
    expect(e.message).toMatch(/vehiculos_placa_uk/)
    expect((await falla(base.admin.query(`insert into wms.vehiculos (placa, capacidad_kg) values ('NEG-001', -1)`))).message).toMatch(/check/)
  })

  it('queda auditado', async () => {
    expect((await q(`select 1 from wms.audit_events where entidad = 'vehiculos' and evento = 'insert'`)).length).toBeGreaterThan(0)
  })
})

describe('la migración 0011 es re-ejecutable (en su lugar de la cadena, como un reintento tras un fallo)', () => {
  it('correrla otra vez no falla y no cambia lo que ya había', async () => {
    const solo11 = await crearBaseDePrueba({ sinMigracion0012: true, sinMigracion0015: true })
    try {
      const n = async () => (await solo11.admin.query('select count(*)::int n from wms.permisos_rol')).rows[0].n
      const antes = await n()
      await solo11.admin.query(SQL.m0011())
      await solo11.admin.query(SQL.m0011())
      expect(await n()).toBe(antes)
      expect((await solo11.admin.query(`select valor from wms.parametros where clave = 'acceso_clientes_habilitado'`)).rows[0].valor).toBe('false')
    } finally { await solo11.cerrar() }
  }, 60_000)
})
