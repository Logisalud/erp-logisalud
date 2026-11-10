// Reinicio del piloto (Fase 4 · P5): lógica del script manual `reinicio-piloto.mjs`. Separada para probarla en Postgres local con datos sembrados (tests/db/reinicio-piloto.test.ts).
// NUNCA se corre contra una base real sin la copia del día confirmada. Por defecto solo SIMULA: cuenta y lista, no borra nada.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Lo que se CONSERVA: topología, propietarios, usuarios, roles, parámetros y datos regulatorios (docs/wms/piloto/plan-noviembre.md). */
export const CONSERVAR = [
  'area_estado_admitido', 'asignaciones_posicion', 'cargos_usuario', 'documentos_regulatorios', 'documentos_sustento', 'estados_sanitarios', 'fabricantes', 'origenes', 'parametros',
  'perfil_documental_cliente', 'permisos_rol', 'personal_transporte', 'posicion_geometria', 'posiciones', 'producto_codigos', 'producto_regulatorio', 'producto_regulatorio_cambios',
  'propietarios', 'tablas_muestreo', 'tablas_muestreo_tramos', 'tipos_area', 'tipos_movimiento', 'transiciones_estado', 'usuario_roles', 'vehiculos', 'vistas_guardadas',
  'formatos_versiones', 'proveedores_config',
  'oc_sincronizacion', // solo dice cuándo se sincronizó con Compras por última vez: se conserva
  'reinicios',      // el registro de reinicios queda FUERA de lo que se borra
]
/** Lo que se BORRA: todo lo transaccional, incluidas las copias de pedidos y de OC, la carga de ensayo «piloto», las firmas dibujadas (están en `acta_firmas` y en el bucket) y las fotos de entrega. */
export const BORRAR = [
  'acta_firmas', 'actas_organolepticas', 'actas_recepcion', 'ajustes_conformidad', 'ajustes_inventario', 'alertas', 'antecedentes_calidad', 'bulto_contenido', 'bultos', 'cambios_lote_asignado',
  'carga_bultos', 'carga_exclusiones', 'cargas_coa', 'cargas_coa_items', 'cargas_iniciales', 'cargas_iniciales_lineas', 'cargas_informes', 'conteo_lineas', 'conteos', 'devoluciones_picking',
  'dictamenes_cliente', 'discrepancias_picking', 'entregas_transportista_cliente', 'eventos_pedidos', 'expediente_documentos', 'expediente_faltantes', 'expedientes', 'guia_numeros', 'guias_remision',
  'importaciones_pedidos', 'ingreso_lotes', 'ingresos', 'lote_vencimiento_cambios', 'lotes', 'ls_fr_escaneos', 'ls_fr_impresiones', 'movimientos', 'observaciones_conformidad', 'observaciones_liberacion',
  'oc_versiones', 'ordenes_baja', 'ordenes_baja_evaluaciones', 'ordenes_baja_lineas', 'ordenes_baja_sustentos', 'ordenes_movimiento', 'ordenes_movimiento_lineas', 'ordenes_picking', 'ordenes_picking_lineas',
  'partidas', 'pedidos_despacho', 'programacion_conteos', 'quiebres_stock', 'registros_ls_fr_43_03', 'reservas', 'reservas_lote', 'revision_focos', 'revision_pendientes', 'revisiones_diarias', 'ruta_cierres',
  'ruta_logger_importes', 'ruta_logger_lecturas', 'seguimiento_intentos', 'seguimiento_tokens', 'ruta_paradas', 'ruta_paradas_eventos', 'ruta_versiones', 'rutas', 'saldos', 'salida_lineas', 'salida_movimientos', 'salidas', 'solicitud_ingreso_cambios',
  'solicitud_ingreso_lineas', 'solicitud_ingreso_versiones', 'solicitudes_ingreso',
]
/** Se REINICIAN (decisión de Sebas, 7-nov): la fila se conserva, el contador vuelve a su base. `correlativos` (actas, órdenes, movimientos…) vuelve a 0. `guia_correlativos` NO vuelve a 0: la serie TTT1 es la REAL
 *  (la comparte el panel de Nubefact), así que vuelve a su valor de siembra y SIN confirmar; la guía real solo arranca cuando se confirma el correlativo (`confirmar_correlativo_guia`). */
export const REINICIAR = ['correlativos', 'guia_correlativos']
export const GUIA_ULTIMO_BASE = 2887   // el de la siembra (migración 0024): último número que mostraba Nubefact al 30/09/2026
/** `audit_events`: se EXPORTA a un archivo fuera de la base y después se vacía. */
export const AUDITORIA = 'audit_events'
export const BUCKET = 'wms-documentos'

export const hoyLima = (ahora = new Date()) => new Date(ahora.getTime() - 5 * 3_600_000).toISOString().slice(0, 10)
const q = (n) => `"${String(n).replace(/"/g, '""')}"`

/** Lee las banderas. Sin `--ejecutar` es SIMULACIÓN (el modo por defecto). */
export function leerArgumentos(argv) {
  const a = { ejecutar: false, simular: true, copia: undefined, salida: 'reinicio-salida', dbUrl: undefined, ayuda: false }
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i]
    if (x === '--simular') a.simular = true
    else if (x === '--ejecutar') { a.ejecutar = true; a.simular = false }
    else if (x === '--confirmo-copia-del-dia') a.copia = argv[++i]
    else if (x.startsWith('--confirmo-copia-del-dia=')) a.copia = x.split('=')[1]
    else if (x === '--salida') a.salida = argv[++i]
    else if (x === '--db-url') a.dbUrl = argv[++i]
    else if (x === '--help' || x === '-h') a.ayuda = true
    else throw new Error(`Bandera desconocida: ${x}`)
  }
  return a
}

/** Para ejecutar de verdad: la bandera con la fecha de HOY (hora de Lima) de la copia de Supabase. Sin ella, el script se niega. */
export function exigirCopiaDelDia(args, ahora = new Date()) {
  if (!args.copia) throw new Error('Me niego a borrar: falta --confirmo-copia-del-dia AAAA-MM-DD (la copia de Supabase de HOY, confirmada en el panel).')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.copia)) throw new Error('La fecha de --confirmo-copia-del-dia debe ser AAAA-MM-DD.')
  if (args.copia !== hoyLima(ahora)) throw new Error(`Me niego a borrar: la copia confirmada es del ${args.copia} y hoy es ${hoyLima(ahora)}. Hace falta una copia DEL DÍA.`)
}

/** Lista cerrada: toda tabla de `wms` tiene que estar decidida (conservar, borrar o auditoría). Una tabla nueva sin decidir aborta el reinicio. */
export async function clasificarTablas(c) {
  const { rows } = await c.query(`select tablename from pg_tables where schemaname = 'wms' order by 1`)
  const existentes = rows.map((r) => r.tablename)
  const conocidas = new Set([...CONSERVAR, ...BORRAR, ...REINICIAR, AUDITORIA])
  const sinDecidir = existentes.filter((t) => !conocidas.has(t))
  if (sinDecidir.length) throw new Error(`Hay tablas de wms sin decidir (agrégalas a CONSERVAR, BORRAR o REINICIAR en reinicio-piloto-lib.mjs): ${sinDecidir.join(', ')}`)
  return { borrar: BORRAR.filter((t) => existentes.includes(t)), conservar: CONSERVAR.filter((t) => existentes.includes(t)), reiniciar: REINICIAR.filter((t) => existentes.includes(t)), auditoria: existentes.includes(AUDITORIA) }
}

async function contar(c, tablas) {
  const out = {}
  for (const t of tablas) out[t] = Number((await c.query(`select count(*)::bigint n from wms.${q(t)}`)).rows[0].n)
  return out
}

/** Los archivos del bucket: recorre todos los prefijos. `almacen` = { listar(prefijo) → [{name, esCarpeta}], borrar(rutas[]) }. */
export async function listarArchivos(almacen, prefijo = '') {
  const archivos = []
  for (const e of await almacen.listar(prefijo)) {
    const ruta = prefijo ? `${prefijo}/${e.name}` : e.name
    if (e.esCarpeta) archivos.push(...await listarArchivos(almacen, ruta)); else archivos.push(ruta)
  }
  return archivos
}
const prefijoDe = (ruta) => (ruta.includes('/') ? ruta.split('/')[0] : '(raíz)')

/**
 * Planifica (y, con `ejecutar`, hace) el reinicio. Devuelve el informe. Simular no escribe nada: ni la base, ni archivos, ni el registro.
 * Con `ejecutar`: 1) exporta `audit_events` a un archivo y verifica; 2) en UNA transacción borra lo transaccional y registra el reinicio en `wms.reinicios`; 3) borra los archivos
 * (salvo los referenciados por documentos regulatorios que se conservan).
 */
export async function reiniciar(c, { ejecutar = false, almacen = null, salida = 'reinicio-salida', ejecutadoPor = 'script', fechaCopia = null, ahora = new Date() } = {}) {
  const { borrar, conservar, reiniciar: aReiniciar, auditoria } = await clasificarTablas(c)
  const conteos = await contar(c, borrar)
  const conservadas = await contar(c, conservar)
  const filasAuditoria = auditoria ? Number((await c.query(`select count(*)::bigint n from wms.audit_events`)).rows[0].n) : 0
  // los documentos regulatorios de un LOTE (p. ej. el COA de un lote del piloto) son transaccionales; los de producto o fabricante se conservan
  const regDeLote = (await c.query(`select count(*)::int n, coalesce(array_agg(archivo_ref) filter (where archivo_ref is not null), '{}') refs from wms.documentos_regulatorios where lote_id is not null`)).rows[0]
  const protegidosRefs = new Set((await c.query(`select archivo_ref from wms.documentos_regulatorios where lote_id is null and archivo_ref is not null`)).rows.map((r) => r.archivo_ref))
  let archivosInfo = { disponible: false, total: 0, aBorrar: [], conservados: [], prefijos: {}, todos: [] }
  if (almacen) {
    const todos = await listarArchivos(almacen)
    const conservados = todos.filter((r) => protegidosRefs.has(r))
    const aBorrar = todos.filter((r) => !protegidosRefs.has(r))
    const prefijos = {}
    for (const r of todos) { const p = prefijoDe(r); prefijos[p] ??= { total: 0, borrar: 0, conservar: 0 }; prefijos[p].total++; if (protegidosRefs.has(r)) prefijos[p].conservar++; else prefijos[p].borrar++ }
    archivosInfo = { disponible: true, total: todos.length, aBorrar, conservados, prefijos, todos }
  }
  const informe = {
    modo: ejecutar ? 'EJECUTAR' : 'SIMULAR', tablasABorrar: conteos, tablasConservadas: conservadas, correlativosAReiniciar: aReiniciar, auditoria: { tabla: AUDITORIA, filas: filasAuditoria, destino: 'archivo fuera de la base y luego se vacía' },
    documentosRegulatoriosDeLote: regDeLote.n, archivos: { disponible: archivosInfo.disponible, total: archivosInfo.total, aBorrar: archivosInfo.aBorrar.length, conservados: archivosInfo.conservados.length, prefijos: archivosInfo.prefijos },
    filasABorrar: Object.values(conteos).reduce((n, x) => n + x, 0) + filasAuditoria + regDeLote.n, auditoriaArchivo: null, registro: null,
  }
  if (!ejecutar) return informe

  // 1) la auditoría se exporta ANTES de borrar nada y se comprueba que el archivo quedó completo
  let rutaAuditoria = null
  if (auditoria) {
    mkdirSync(salida, { recursive: true })
    rutaAuditoria = join(salida, `audit_events-${hoyLima(ahora)}-${ahora.getTime()}.jsonl`)
    const { rows } = await c.query(`select to_jsonb(a) j from wms.audit_events a order by 1`)
    const texto = rows.map((r) => JSON.stringify(r.j)).join('\n') + (rows.length ? '\n' : '')
    writeFileSync(rutaAuditoria, texto)
    if (rows.length !== filasAuditoria) throw new Error('La exportación de la auditoría cambió mientras se escribía: no se borra nada. Vuelve a empezar.')
  }
  // 2) una sola transacción: se borra lo transaccional y se asienta el reinicio
  const aBorrarRefs = [...regDeLote.refs]
  const listaArchivos = almacen ? [...new Set([...archivosInfo.aBorrar, ...aBorrarRefs.filter((r) => !protegidosRefs.has(r) && archivosInfo.todos.includes(r))])] : []
  await c.query('begin')
  try {
    await c.query(`set local session_replication_role = replica`)   // los triggers de «solo agregar» no corren: es el reinicio autorizado
    await c.query(`delete from wms.documentos_regulatorios where lote_id is not null`)
    // DELETE (no TRUNCATE): una tabla que se conserva (documentos_regulatorios) apunta a `lotes`, y TRUNCATE no lo permite aunque esté vacía. Con el rol «replica» no se revisan llaves ni triggers.
    for (const t of [...borrar, ...(auditoria ? [AUDITORIA] : [])]) await c.query(`delete from wms.${q(t)}`)
    // los contadores vuelven a su base (en la misma transacción): actas y demás a 0; la serie de guías a su siembra y sin confirmar
    if (aReiniciar.includes('correlativos')) await c.query(`update wms.correlativos set ultimo = 0`)
    if (aReiniciar.includes('guia_correlativos')) {
      await c.query(`update wms.guia_correlativos set ultimo = $1, confirmado = false, confirmado_por = null, confirmado_en = null, nota = 'Reiniciado tras el piloto: CONFIRMAR con Nubefact el siguiente número antes de emitir una guía real'`, [GUIA_ULTIMO_BASE])
      await c.query(`update wms.parametros set valor = 'PENDIENTE' where clave = 'guia_correlativo_inicial'`)
    }
    const archivos = { borrados: listaArchivos.length, conservados: archivosInfo.conservados.length, prefijos: archivosInfo.prefijos }
    const tablas = { ...conteos, [AUDITORIA]: filasAuditoria, documentos_regulatorios_de_lote: regDeLote.n }
    const r = await c.query(`insert into wms.reinicios (fecha_copia, ejecutado_por, tablas, archivos, auditoria_archivo, auditoria_filas, notas) values ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7) returning id`,
      [fechaCopia ?? hoyLima(ahora), ejecutadoPor, JSON.stringify(tablas), JSON.stringify(archivos), rutaAuditoria, filasAuditoria, `Correlativos reiniciados: actas y demás a 0; serie de guías devuelta a ${GUIA_ULTIMO_BASE} y sin confirmar`])
    await c.query('commit')
    informe.registro = r.rows[0].id
  } catch (e) { await c.query('rollback'); throw e }
  informe.auditoriaArchivo = rutaAuditoria
  // 3) los archivos, después de que la base ya quedó (si esto falla, la base está bien y el informe dice qué quedó)
  if (almacen) {
    const lista = listaArchivos
    for (let i = 0; i < lista.length; i += 100) await almacen.borrar(lista.slice(i, i + 100))
    informe.archivos.aBorrar = lista.length
  }
  return informe
}

/** El almacén real: el bucket privado `wms-documentos` de Supabase Storage, con la llave de servicio (solo en este script). */
export async function almacenSupabase({ url, llave }) {
  const { createClient } = await import('@supabase/supabase-js')
  const b = createClient(url, llave, { auth: { persistSession: false } }).storage.from(BUCKET)
  return {
    async listar(prefijo) {
      const salida = []
      for (let desde = 0; ; desde += 1000) {
        const { data, error } = await b.list(prefijo, { limit: 1000, offset: desde })
        if (error) throw new Error(`No se pudo listar el bucket: ${error.message}`)
        salida.push(...data.map((e) => ({ name: e.name, esCarpeta: e.id === null })))
        if (data.length < 1000) break
      }
      return salida
    },
    async borrar(rutas) { const { error } = await b.remove(rutas); if (error) throw new Error(`No se pudieron borrar archivos: ${error.message}`) },
  }
}
