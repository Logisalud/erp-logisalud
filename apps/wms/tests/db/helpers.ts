// Ayudas para los tests de base de datos: crean una base NUEVA por archivo de
// prueba (stubs de Supabase + migraciones + seed de topología) y simulan a una
// persona logueada (rol `authenticated` + auth.uid()).
//
// Qué NO cubre esta simulación: ver docs/wms/gate-0.md §G.1 (PostgREST, GoTrue,
// Storage, claims reales del JWT, RLS real de Compras).

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'

const RAIZ = resolve(__dirname, '../..')
const url = process.env.WMS_TEST_DATABASE_URL ?? 'postgres://wms_test:wms_test@127.0.0.1:5432/postgres'

const leer = (ruta: string) => readFileSync(resolve(RAIZ, ruta), 'utf8')
export const SQL = {
  stubs: () => leer('tests/db/stubs.sql'),
  m0001: () => leer('supabase/migrations/0001_wms_base.sql'),
  m0002: () => leer('supabase/migrations/0002_wms_ledger.sql'),
  m0003: () => leer('supabase/migrations/0003_wms_productos.sql'),
  m0004: () => leer('supabase/migrations/0004_wms_entradas.sql'),
  m0005: () => leer('supabase/migrations/0005_wms_flujo_ingreso.sql'),
  m0006: () => leer('supabase/migrations/0006_wms_regulatorio_y_verificacion.sql'),
  m0007: () => leer('supabase/migrations/0007_wms_inventario.sql'),
  m0008: () => leer('supabase/migrations/0008_wms_presentacion_principio_activo.sql'),
  m0009: () => leer('supabase/migrations/0009_wms_operacion_diaria_y_reportes.sql'),
  m0011: () => leer('supabase/migrations/0011_wms_salidas_cimientos.sql'),
  m0012: () => leer('supabase/migrations/0012_wms_salidas_nucleo_de_stock.sql'),
  m0013: () => leer('supabase/migrations/0013_wms_salidas_edicion_libre_de_lotes.sql'),
  m0014: () => leer('supabase/migrations/0014_wms_salidas_bandeja_de_pedidos.sql'),
  m0015: () => leer('supabase/migrations/0015_wms_roles_jefes_y_cargos.sql'),
  m0016: () => leer('supabase/migrations/0016_wms_documentos_regulatorios.sql'),
  m0017: () => leer('supabase/migrations/0017_wms_rutas.sql'),
  m0018: () => leer('supabase/migrations/0018_wms_picking_y_conformidad.sql'),
  m0019: () => leer('supabase/migrations/0019_wms_documentacion_final.sql'),
  m0020: () => leer('supabase/migrations/0020_wms_embalaje_y_bultos.sql'),
  m0021: () => leer('supabase/migrations/0021_wms_carga_y_salida_confirmada.sql'),
  m0022: () => leer('supabase/migrations/0022_wms_areas_estados_y_reserva.sql'),
  m0023: () => leer('supabase/migrations/0023_wms_orden_de_salida.sql'),
  m0024: () => leer('supabase/migrations/0024_wms_guia_electronica_y_anulacion.sql'),
  m0026: () => leer('supabase/migrations/0026_wms_bajas_y_orden_de_baja.sql'),
  m0027: () => leer('supabase/migrations/0027_wms_ls_fr_43_03_y_carga_inicial.sql'),
  m0025: () => leer('supabase/migrations/0025_wms_retornos_liberacion_muestreo.sql'),
  m0028: () => leer('supabase/migrations/0028_wms_orden_de_salida_manual.sql'),
  m0029: () => leer('supabase/migrations/0029_wms_falta_de_stock_y_cambio_de_pedido.sql'),
  m0030: () => leer('supabase/migrations/0030_wms_rutas_para_ordenes_sin_pedido.sql'),
  m0031: () => leer('supabase/migrations/0031_wms_vehiculo_calificado_y_conductor_en_documentos.sql'),
  m0032: () => leer('supabase/migrations/0032_wms_devolucion_proveedor_numeracion_de_guias_y_muestras.sql'),
  m0033: () => leer('supabase/migrations/0033_wms_dictamen_baja_producto_nuevo_y_temperatura.sql'),
  m0034: () => leer('supabase/migrations/0034_wms_baja_de_guia_tras_la_salida_motivos_y_administrador.sql'),
  m0035: () => leer('supabase/migrations/0035_wms_administrador_todo_lo_operativo.sql'),
  seed: () => leer('supabase/seeds/0001_topologia.sql'),
  seedTransporte: () => leer('supabase/seeds/0002_transporte_inicial.sql'),
}

export interface Persona {
  id: string
  rol: string | null
}

export interface BaseDePrueba {
  nombre: string
  /** Conexión de superusuario (para armar datos y para verificar cosas que la app no puede ver). */
  admin: Client
  /** Conexión nueva (para pruebas de concurrencia). Se cierra sola al final. */
  nuevaConexion: () => Promise<Client>
  /** Ejecuta `fn` como una persona logueada, en una transacción que se confirma al terminar. */
  como: <T>(personaId: string | null, fn: (c: Client) => Promise<T>) => Promise<T>
  /** Abre una transacción como persona y la deja abierta (devuelve cliente + commit/rollback). */
  transaccionComo: (personaId: string) => Promise<{
    cliente: Client
    commit: () => Promise<void>
    rollback: () => Promise<void>
  }>
  personas: Record<'katia' | 'sandra' | 'charlie' | 'aux' | 'admin' | 'auditor' | 'sinRol', Persona>
  productos: { dapa: string; lizi: string }
  cerrar: () => Promise<void>
}

export async function crearBaseDePrueba(opciones: { conSeed?: boolean; sinMigracion0012?: boolean; sinMigracion0015?: boolean } = {}): Promise<BaseDePrueba> {
  const nombre = `wms_test_${randomUUID().slice(0, 8).replace(/-/g, '')}`
  const raiz = new Client({ connectionString: url })
  await raiz.connect()
  await raiz.query(`create database ${nombre}`)
  await raiz.end()

  const u = new URL(url)
  u.pathname = `/${nombre}`
  const conexiones: Client[] = []
  const abrir = async () => {
    const c = new Client({ connectionString: u.toString() })
    await c.connect()
    conexiones.push(c)
    return c
  }
  const admin = await abrir()
  await admin.query(SQL.stubs())
  await admin.query(SQL.m0001())
  await admin.query(SQL.m0002())
  await admin.query(SQL.m0003())
  await admin.query(SQL.m0004())
  await admin.query(SQL.m0005())
  await admin.query(SQL.m0006())
  await admin.query(SQL.m0007())
  await admin.query(SQL.m0008())
  await admin.query(SQL.m0009())
  await admin.query(SQL.m0011())
  if (!opciones.sinMigracion0012) { await admin.query(SQL.m0012()); await admin.query(SQL.m0013()); await admin.query(SQL.m0014()); await admin.query(SQL.m0016()); await admin.query(SQL.m0017()); await admin.query(SQL.m0018()); await admin.query(SQL.m0019()); await admin.query(SQL.m0020()); await admin.query(SQL.m0021()); await admin.query(SQL.m0022()); await admin.query(SQL.m0023()); await admin.query(SQL.m0024()) }
  if (!opciones.sinMigracion0015) await admin.query(SQL.m0015())
  if (!opciones.sinMigracion0012) await admin.query(SQL.m0025())
  if (!opciones.sinMigracion0012) await admin.query(SQL.m0026())
  if (!opciones.sinMigracion0012) await admin.query(SQL.m0027())
  if (!opciones.sinMigracion0012) await admin.query(SQL.m0028())
  if (!opciones.sinMigracion0012) await admin.query(SQL.m0029())
  if (!opciones.sinMigracion0012) await admin.query(SQL.m0030())
  if (!opciones.sinMigracion0012) await admin.query(SQL.m0031())
  if (!opciones.sinMigracion0012) await admin.query(SQL.m0032())
  if (!opciones.sinMigracion0012) await admin.query(SQL.m0033())
  if (!opciones.sinMigracion0012) await admin.query(SQL.m0034())
  if (!opciones.sinMigracion0012) await admin.query(SQL.m0035())
  if (opciones.conSeed !== false) await admin.query(SQL.seed())

  const personas = {
    katia: { id: randomUUID(), rol: 'direccion_tecnica' },
    sandra: { id: randomUUID(), rol: 'asistente_dt' },
    charlie: { id: randomUUID(), rol: 'jefe_almacen' },
    aux: { id: randomUUID(), rol: 'auxiliar' },
    admin: { id: randomUUID(), rol: 'admin_wms' },
    auditor: { id: randomUUID(), rol: 'auditoria_lectura' },
    sinRol: { id: randomUUID(), rol: null },
  } as const
  for (const p of Object.values(personas)) {
    await admin.query('insert into auth.users (id) values ($1)', [p.id])
    if (p.rol) await admin.query('insert into wms.usuario_roles (user_id, rol) values ($1, $2)', [p.id, p.rol])
  }
  const dapa = randomUUID()
  const lizi = randomUUID()
  await admin.query(
    `insert into catalogo.productos (id, codigo, descripcion, presentacion, unidad_medida)
     values ($1, 'T-DAPA', 'Dapagliflozina 10 mg (prueba)', 'Caja x 30', 'TABLETA'),
            ($2, 'T-LIZI', 'Lisinopril 10 mg (prueba)', 'Caja x 30', 'TABLETA')`,
    [dapa, lizi],
  )
  // Dapa: registro sanitario validado y vigente. Lizi: validado pero VENCIDO.
  await admin.query(
    `insert into wms.producto_regulatorio (producto_id, registro_sanitario, rs_vence, estado_validacion,
                                           creado_por, validado_por, validado_en)
     values ($1, 'EG-0001', '2031-01-01', 'VALIDADO', $3, $3, now()),
            ($2, 'EG-0002', '2020-01-01', 'VALIDADO', $3, $3, now())`,
    [dapa, lizi, personas.katia.id],
  )

  const como: BaseDePrueba['como'] = async (personaId, fn) => {
    const c = await abrir()
    try {
      await c.query('begin')
      await c.query('set local role authenticated')
      if (personaId) await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [personaId])
      const r = await fn(c)
      await c.query('commit')
      return r
    } catch (e) {
      await c.query('rollback').catch(() => {})
      throw e
    } finally {
      // Cada llamada abre su conexión: se cierra al terminar (Postgres limita los clientes simultáneos).
      conexiones.splice(conexiones.indexOf(c), 1)
      await c.end().catch(() => {})
    }
  }

  const transaccionComo: BaseDePrueba['transaccionComo'] = async (personaId) => {
    const c = await abrir()
    await c.query('begin')
    await c.query('set local role authenticated')
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [personaId])
    return {
      cliente: c,
      commit: async () => void (await c.query('commit')),
      rollback: async () => void (await c.query('rollback')),
    }
  }

  return {
    nombre,
    admin,
    nuevaConexion: abrir,
    como,
    transaccionComo,
    personas,
    productos: { dapa, lizi },
    cerrar: async () => {
      for (const c of conexiones) await c.end().catch(() => {})
      const r = new Client({ connectionString: url })
      await r.connect()
      await r.query(`drop database if exists ${nombre} with (force)`)
      await r.end()
    },
  }
}

// ── Datos de apoyo ─────────────────────────────────────────────────────────

export async function idPosicion(c: Client, codigo: string): Promise<string> {
  const r = await c.query('select id from wms.posiciones where codigo = $1', [codigo])
  if (!r.rows[0]) throw new Error(`Posición inexistente: ${codigo}`)
  return r.rows[0].id
}

export async function idPropietario(c: Client, codigo: string): Promise<string> {
  const r = await c.query('select id from wms.propietarios where codigo = $1', [codigo])
  if (!r.rows[0]) throw new Error(`Propietario inexistente: ${codigo}`)
  return r.rows[0].id
}

export interface PartidaIn {
  posicion_id: string
  producto_id: string
  lote_id: string
  propietario_id: string
  estado: 'CUARENTENA' | 'DEVOLUCIONES' | 'APROBADO' | 'BAJAS_RECHAZADOS'
  origen: string
  procedencia_id: string
  delta: number
}

export async function postear(
  c: Client,
  tipo: string,
  partidas: PartidaIn[],
  extra: { motivo?: string; sustentoId?: string | null; sustentoTipo?: string } = {},
): Promise<string> {
  const r = await c.query('select wms.postear_movimiento($1, $2, $3::jsonb, null, null, $4, $5, null) as id', [
    tipo,
    extra.motivo ?? 'prueba',
    JSON.stringify(partidas),
    extra.sustentoId ? (extra.sustentoTipo ?? 'ACTA') : null,
    extra.sustentoId ?? null,
  ])
  return r.rows[0].id
}

/** Crea un lote como superusuario (sin pasar por la función, para armar datos). */
export async function crearLote(
  c: Client, producto: string, codigo: string, vence: string, propietario: string,
): Promise<string> {
  const r = await c.query(
    'insert into wms.lotes (producto_id, codigo, vence, propietario_id) values ($1,$2,$3,$4) returning id',
    [producto, codigo, vence, propietario],
  )
  return r.rows[0].id
}

/** Deja `cantidad` unidades de un lote ya Aprobadas en una posición (carga inicial como admin). */
export async function sembrarStock(
  base: BaseDePrueba,
  opciones: {
    posicion: string; producto: string; lote: string; propietario: string
    estado?: PartidaIn['estado']; cantidad: number; procedencia?: string; origen?: string; vence?: string
  },
): Promise<{ procedencia: string; posicionId: string; propietarioId: string; loteId: string }> {
  const posicionId = await idPosicion(base.admin, opciones.posicion)
  const propietarioId = await idPropietario(base.admin, opciones.propietario)
  const loteId = await crearLote(base.admin, opciones.producto, opciones.lote, opciones.vence ?? '2028-12-31', propietarioId)
  const procedencia = opciones.procedencia ?? randomUUID()
  await base.como(base.personas.admin.id, (c) =>
    postear(c, 'CARGA_INICIAL', [{
      posicion_id: posicionId, producto_id: opciones.producto, lote_id: loteId, propietario_id: propietarioId,
      estado: opciones.estado ?? 'APROBADO', origen: opciones.origen ?? 'CARGA_INICIAL',
      procedencia_id: procedencia, delta: opciones.cantidad,
    }]),
  )
  return { procedencia, posicionId, propietarioId, loteId }
}

export async function saldoDe(c: Client, filtro: Record<string, string>): Promise<number> {
  const claves = Object.keys(filtro)
  const where = claves.map((k, i) => `${k} = $${i + 1}`).join(' and ')
  const r = await c.query(`select coalesce(sum(cantidad), 0)::int as n from wms.saldos where ${where}`, Object.values(filtro))
  return r.rows[0].n
}

/** Mensaje y código de un error de Postgres (para afirmar sobre el texto humano). */
export async function falla(promesa: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await promesa
  } catch (e) {
    const err = e as { code?: string; message: string }
    return { code: err.code, message: err.message }
  }
  throw new Error('Se esperaba un error y la operación terminó bien')
}
