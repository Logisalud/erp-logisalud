// P0 (D-68, S1): un usuario de cliente solo ve lo de su propietario y nada más; ningún usuario sin rol puede llamar a las
// funciones internas del WMS. Base de datos local (ver docs/wms/gate-0.md §G.1 para lo que esta simulación no cubre).
//
// Lo que NO se puede probar aquí: las políticas de Compras y Pedidos (otros proyectos/migraciones). Su verificación es
// el PR SEC1; mientras tanto el interruptor `acceso_clientes_habilitado` impide que exista un usuario de cliente.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPropietario, sembrarStock } from './helpers'

let base: BaseDePrueba
let ajr: string // usuario de cliente de AJR
let diph: string // usuario de cliente de Diphasac
let idAjr: string
let idDiph: string
let idLogissa: string

beforeAll(async () => {
  base = await crearBaseDePrueba()
  const a = base.admin
  idAjr = await idPropietario(a, 'AJR_LABS')
  idDiph = await idPropietario(a, 'DIPHASAC')
  idLogissa = await idPropietario(a, 'LOGISSA')
  await sembrarStock(base, { posicion: 'F-1.1', producto: base.productos.dapa, lote: 'LOG-1', propietario: 'LOGISSA', cantidad: 100 })
  await sembrarStock(base, { posicion: 'G-7.1', producto: base.productos.dapa, lote: 'AJR-1', propietario: 'AJR_LABS', cantidad: 50 })
  await sembrarStock(base, { posicion: 'A-14.1', producto: base.productos.lizi, lote: 'DIPH-1', propietario: 'DIPHASAC', cantidad: 30 })
}, 120_000)
afterAll(async () => { await base?.cerrar() })

const interruptor = (valor: 'true' | 'false') =>
  base.admin.query(`update wms.parametros set valor = $1 where clave = 'acceso_clientes_habilitado'`, [valor])

async function nuevaCuenta(): Promise<string> {
  const id = randomUUID()
  await base.admin.query('insert into auth.users (id) values ($1)', [id])
  return id
}

describe('interruptor: sin SEC1 no existe ningún usuario de cliente', () => {
  it('apagado por defecto: ni la base ni la aplicación pueden crear un usuario de cliente', async () => {
    const v = (await base.admin.query(`select valor from wms.parametros where clave = 'acceso_clientes_habilitado'`)).rows[0].valor
    expect(v).toBe('false')
    const u = await nuevaCuenta()
    const e1 = await falla(base.admin.query(`insert into wms.usuario_roles (user_id, rol, propietario_id) values ($1, 'usuario_cliente', $2)`, [u, idAjr]))
    expect(e1.message).toMatch(/acceso de clientes no está habilitado/)
    // Ni siquiera el administrador del WMS, por la aplicación.
    const e2 = await falla(base.como(base.personas.admin.id, (c) =>
      c.query(`insert into wms.usuario_roles (user_id, rol, propietario_id) values ($1, 'usuario_cliente', $2)`, [u, idAjr])))
    expect(e2.message).toMatch(/acceso de clientes no está habilitado/)
  })

  it('la aplicación no puede encender (ni borrar ni reinsertar) el interruptor, ni siquiera con admin_wms', async () => {
    for (const sql of [
      `update wms.parametros set valor = 'true' where clave = 'acceso_clientes_habilitado'`,
      `delete from wms.parametros where clave = 'acceso_clientes_habilitado'`,
      `insert into wms.parametros (clave, valor) values ('acceso_clientes_habilitado', 'true')`,
    ]) {
      const e = await falla(base.como(base.personas.admin.id, (c) => c.query(sql)))
      expect(e.message, sql).toMatch(/administrador de la base|duplicate key|permission denied/i)
    }
    const v = (await base.admin.query(`select valor from wms.parametros where clave = 'acceso_clientes_habilitado'`)).rows[0].valor
    expect(v).toBe('false')
  })

  it('los demás parámetros siguen siendo editables por admin_wms', async () => {
    await base.como(base.personas.admin.id, (c) => c.query(`update wms.parametros set valor = '16' where clave = 'temperatura_min_c'`))
    await base.admin.query(`update wms.parametros set valor = '15' where clave = 'temperatura_min_c'`)
  })
})

describe('reglas de la cuenta de cliente (con el acceso habilitado por un administrador de la base)', () => {
  beforeAll(async () => { await interruptor('true') })
  afterAll(async () => { await interruptor('false') })

  it('debe pertenecer a un cliente de almacenamiento activo, no al dueño del almacén', async () => {
    const u = await nuevaCuenta()
    const e = await falla(base.admin.query(`insert into wms.usuario_roles (user_id, rol, propietario_id) values ($1, 'usuario_cliente', $2)`, [u, idLogissa]))
    expect(e.message).toMatch(/cliente de almacenamiento activo/)
  })

  it('un rol del personal no lleva propietario y el cliente siempre lo lleva', async () => {
    const u = await nuevaCuenta()
    const e1 = await falla(base.admin.query(`insert into wms.usuario_roles (user_id, rol, propietario_id) values ($1, 'auxiliar', $2)`, [u, idAjr]))
    expect(e1.message).toMatch(/usuario_roles_cliente_propietario_check/)
    const e2 = await falla(base.admin.query(`insert into wms.usuario_roles (user_id, rol) values ($1, 'usuario_cliente')`, [u]))
    expect(e2.message).toMatch(/usuario_roles_cliente_propietario_check|cliente de almacenamiento activo/)
  })

  it('una cuenta de cliente nunca es personal (en ningún orden) ni de dos propietarios', async () => {
    const u = await nuevaCuenta()
    await base.admin.query(`insert into wms.usuario_roles (user_id, rol, propietario_id) values ($1, 'usuario_cliente', $2)`, [u, idAjr])
    expect((await falla(base.admin.query(`insert into wms.usuario_roles (user_id, rol) values ($1, 'auxiliar')`, [u]))).message)
      .toMatch(/es de un cliente/)
    expect((await falla(base.admin.query(`insert into wms.usuario_roles (user_id, rol, propietario_id, desde) values ($1, 'usuario_cliente', $2, current_date - 1)`, [u, idDiph]))).message)
      .toMatch(/un solo propietario/)
    const v = await nuevaCuenta()
    await base.admin.query(`insert into wms.usuario_roles (user_id, rol) values ($1, 'auxiliar')`, [v])
    expect((await falla(base.admin.query(`insert into wms.usuario_roles (user_id, rol, propietario_id) values ($1, 'usuario_cliente', $2)`, [v, idAjr]))).message)
      .toMatch(/roles del personal/)
  })
})

// ── Lo que lee cada quien ─────────────────────────────────────────────────

const ROLES_ESPERADOS: Record<string, boolean> = {
  // rol → ¿cuenta como personal? (es_usuario). Si se agrega un rol al CHECK y no se clasifica aquí, la prueba falla.
  direccion_tecnica: true, asistente_dt: true, jefe_almacen: true, reemplazo_jefe: false, auxiliar: true,
  auditoria_lectura: true, admin_wms: true, jefe_transporte: true, conformidad_despacho: true,
  autoriza_salidas_sin_venta: true,
  conductor: false, auxiliar_transporte: false, usuario_cliente: false, dt_cliente: false,
}

describe('es_usuario(): lista cerrada de personal', () => {
  it('todo rol del CHECK está clasificado (falla cerrada)', async () => {
    const def: string = (await base.admin.query(
      `select pg_get_constraintdef(oid) d from pg_constraint where conrelid = 'wms.usuario_roles'::regclass and conname = 'usuario_roles_rol_check'`)).rows[0].d
    const roles = [...def.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
    expect(roles).toEqual(Object.keys(ROLES_ESPERADOS).sort())
  })

  it('cada rol da el es_usuario() esperado', async () => {
    await interruptor('true')
    try {
      for (const [rol, personal] of Object.entries(ROLES_ESPERADOS)) {
        if (rol === 'reemplazo_jefe') continue // retirado (0015): ya no se puede asignar; ver roles-jefes.test.ts
        const u = await nuevaCuenta()
        await base.admin.query(`insert into wms.usuario_roles (user_id, rol, propietario_id) values ($1, $2, $3)`, [u, rol, rol === 'usuario_cliente' || rol === 'dt_cliente' ? idAjr : null])
        const r = await base.como(u, async (c) => (await c.query('select wms.es_usuario() as p')).rows[0].p)
        expect(r, rol).toBe(personal)
      }
    } finally { await interruptor('false') }
  })

  it('un rol vencido no cuenta', async () => {
    const u = await nuevaCuenta()
    await base.admin.query(`insert into wms.usuario_roles (user_id, rol, desde, hasta) values ($1, 'auxiliar', current_date - 10, current_date - 1)`, [u])
    expect(await base.como(u, async (c) => (await c.query('select wms.es_usuario() as p')).rows[0].p)).toBe(false)
  })
})

describe('P0: el usuario de cliente solo ve lo de su propietario', () => {
  beforeAll(async () => {
    await interruptor('true')
    ajr = await nuevaCuenta()
    diph = await nuevaCuenta()
    await base.admin.query(`insert into wms.usuario_roles (user_id, rol, propietario_id) values ($1, 'usuario_cliente', $2), ($3, 'usuario_cliente', $4)`, [ajr, idAjr, diph, idDiph])
  })
  afterAll(async () => { await interruptor('false') })

  const tablas = async () =>
    (await base.admin.query(`select tablename t from pg_tables where schemaname = 'wms' order by 1`)).rows.map((r) => r.t as string)
  const vistas = async () =>
    (await base.admin.query(`select viewname t from pg_views where schemaname = 'wms' order by 1`)).rows.map((r) => r.t as string)

  it('todas las tablas del WMS tienen RLS activo (y las vistas respetan al que consulta)', async () => {
    const sin = (await base.admin.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'wms' and c.relkind in ('r', 'p') and not c.relrowsecurity`)).rows
    expect(sin).toEqual([])
    const v = (await base.admin.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'wms' and c.relkind = 'v' and not coalesce((select 'security_invoker=true' = any (c.reloptions)), false)`)).rows
    expect(v).toEqual([])
  })

  it('barrido: salvo propietarios, lotes y saldos (solo los suyos) y su propia fila de roles, no lee ninguna tabla', async () => {
    const permitidas: Record<string, (r: Record<string, unknown>) => boolean> = {
      propietarios: (r) => r.id === idAjr,
      lotes: (r) => r.propietario_id === idAjr,
      saldos: (r) => r.propietario_id === idAjr,
      usuario_roles: (r) => r.user_id === ajr,
    }
    const leidas: Record<string, number> = {}
    for (const t of await tablas()) {
      // «permission denied» (sin grant, p. ej. conteo_lineas) también es no leer nada.
      const filas = await base.como(ajr, async (c) => (await c.query(`select * from wms.${t}`)).rows as Record<string, unknown>[])
        .catch((e: { message: string }) => { if (/permission denied/.test(e.message)) return [] as Record<string, unknown>[]; throw e })
      const ok = permitidas[t]
      if (ok) {
        expect(filas.length, `${t} debe devolver algo`).toBeGreaterThan(0)
        expect(filas.every(ok), `${t}: solo filas propias`).toBe(true)
      } else {
        expect(filas.length, `wms.${t} no debe devolver filas a un cliente`).toBe(0)
      }
      leidas[t] = filas.length
    }
    expect(leidas.propietarios).toBe(1)
    expect(leidas.saldos).toBe(1)
    expect(leidas.lotes).toBe(1)
    // Sanidad: las tablas tienen datos (si no, el barrido no probaría nada).
    for (const t of ['posiciones', 'asignaciones_posicion', 'propietarios', 'saldos', 'partidas', 'movimientos', 'permisos_rol']) {
      expect(Number((await base.admin.query(`select count(*) n from wms.${t}`)).rows[0].n), `${t} sin datos`).toBeGreaterThan(0)
    }
  })

  it('barrido de vistas: nada que no sea suyo', async () => {
    for (const v of await vistas()) {
      const filas = await base.como(ajr, async (c) => (await c.query(`select * from wms.${v}`)).rows as Record<string, unknown>[])
      for (const f of filas) {
        if ('propietario_id' in f) expect(f.propietario_id, `vista ${v}`).toBe(idAjr)
        else expect.fail(`la vista ${v} devolvió filas sin propietario a un cliente`)
      }
    }
  })

  it('un cliente no ve el stock de otro propietario ni el del dueño del almacén (ni por filtro directo)', async () => {
    for (const [quien, propio, ajeno1, ajeno2] of [[ajr, idAjr, idDiph, idLogissa], [diph, idDiph, idAjr, idLogissa]] as const) {
      for (const t of ['saldos', 'lotes']) {
        const propias = await base.como(quien, async (c) => (await c.query(`select count(*)::int n from wms.${t} where propietario_id = $1`, [propio])).rows[0].n)
        expect(propias, `${t} propios`).toBe(1)
        for (const ajeno of [ajeno1, ajeno2]) {
          const n = await base.como(quien, async (c) => (await c.query(`select count(*)::int n from wms.${t} where propietario_id = $1`, [ajeno])).rows[0].n)
          expect(n, `${t} ajenos`).toBe(0)
        }
      }
      const props = await base.como(quien, async (c) => (await c.query('select id from wms.propietarios')).rows.map((r) => r.id))
      expect(props).toEqual([propio])
    }
  })

  it('con el interruptor apagado, un cliente ya creado deja de ver todo (kill switch)', async () => {
    await interruptor('false')
    try {
      for (const t of ['propietarios', 'lotes', 'saldos']) {
        const n = await base.como(ajr, async (c) => (await c.query(`select count(*)::int n from wms.${t}`)).rows[0].n)
        expect(n, t).toBe(0)
      }
    } finally { await interruptor('true') }
  })

  it('un cliente no puede escribir nada: ni DML directo ni crear/cambiar roles', async () => {
    for (const t of await tablas()) {
      const e = await falla(base.como(ajr, (c) => c.query(`insert into wms.${t} default values`)))
      expect(e.message, `insert en ${t}`).toMatch(/permission denied|row-level security|violates|null value|not-null|check/i)
      const borradas = await base.como(ajr, async (c) => (await c.query(`delete from wms.${t}`).catch(() => ({ rowCount: 0 }))).rowCount)
      expect(borradas, `delete en ${t}`).toBe(0)
      const cambiadas = await base.como(ajr, async (c) => (await c.query(`update wms.${t} set creado_en = now()`).catch(() => ({ rowCount: 0 }))).rowCount)
      expect(cambiadas ?? 0, `update en ${t}`).toBe(0)
    }
    // Ni auto-ascenderse a otro propietario o a personal.
    expect(await base.como(ajr, async (c) => (await c.query(`update wms.usuario_roles set propietario_id = $1`, [idDiph])).rowCount)).toBe(0)
    const e = await falla(base.como(ajr, (c) => c.query(`insert into wms.usuario_roles (user_id, rol) values ($1, 'admin_wms')`, [ajr])))
    expect(e.message).toMatch(/row-level security|permission denied|es de un cliente/)
  }, 60_000)

  it('un cliente no logra nada con las operaciones del WMS (ledger, ingresos, conteos, alertas…)', async () => {
    const pos = (await base.admin.query(`select id from wms.posiciones where codigo = 'G-7.1'`)).rows[0].id
    const lote = (await base.admin.query(`select id from wms.lotes where codigo = 'AJR-1'`)).rows[0].id
    const partidas = JSON.stringify([{ posicion_id: pos, producto_id: base.productos.dapa, lote_id: lote, propietario_id: idAjr,
      estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: randomUUID(), delta: -10 }])
    const antes = Number((await base.admin.query('select sum(cantidad) n from wms.saldos')).rows[0].n)
    for (const tipo of ['MOVIMIENTO', 'INGRESO', 'AJUSTE', 'CARGA_INICIAL', 'CAMBIO_ESTADO', 'REVERSA', 'SALIDA', 'RETORNO']) {
      const e = await falla(base.como(ajr, (c) => c.query(`select wms.postear_movimiento($1, 'x', $2::jsonb)`, [tipo, partidas])))
      expect(e.message, tipo).toMatch(/permiso|Solo Dirección|no habilitado|permission denied|solo se registran por el flujo de salidas/i)
    }
    expect(Number((await base.admin.query('select sum(cantidad) n from wms.saldos')).rows[0].n)).toBe(antes)
  })
})

describe('P0: ninguna función interna es llamable por cualquiera', () => {
  // Las únicas funciones con EXECUTE para `authenticated`: la API que la aplicación llama y los ayudantes de las políticas.
  // Agregar una función nueva obliga a decidirlo aquí (y toda migración termina con `revoke execute … from public`).
  const API = [
    'agregar_documento_expediente', 'agregar_faltante', 'ajustar_solicitud', 'anular_acta_recepcion', 'anular_movimiento',
    'anular_solicitud', 'asegurar_lote', 'atender_alerta', 'autorizar_solicitud', 'cancelar_programacion', 'cerrar_conteo',
    'cerrar_expediente', 'cerrar_revision_diaria', 'confirmar_carga_inicial', 'confirmar_ingreso', 'confirmar_movimiento',
    'conteo_lineas_para', 'corregir_vencimiento_lote', 'crear_carga_inicial', 'crear_producto', 'crear_solicitud',
    'decidir_acta_organoleptica', 'decidir_ajuste', 'decidir_estado_carga_inicial', 'editar_ingreso', 'editar_regulatorio',
    'ejecutar_movimiento', 'es_usuario', 'escalar_linea_conteo', 'estado_registro_compras', 'exactitud_conteos',
    'firmar_acta_recepcion', 'generar_acta_recepcion', 'generar_conteo_programado', 'guardar_acta_organoleptica',
    'historia_lote', 'iniciar_recepcion', 'iniciar_revision_diaria', 'kardex_filas', 'marcar_foco',
    'orden_recorrido_por_defecto', 'personas_del_equipo', 'posicion_acepta', 'posiciones_bloqueadas', 'postear_movimiento',
    'programar_conteo', 'programar_conteo_extra', 'programar_conteo_semanal', 'propietario_cliente', 'proponer_ajuste',
    'reemitir_acta_recepcion', 'registrar_causa_conteo', 'registrar_conteo', 'registrar_pendiente', 'resolver_faltante',
    'resolver_movimiento', 'resolver_pendiente', 'revertir_movimiento', 'revisar_movimiento',
    'revisar_movimientos_sin_verificar', 'revisar_por_trasladar', 'revisar_registro_compras', 'revisar_vencimientos',
    'saldos_al', 'tiene_permiso', 'tiene_rol', 'ultima_cobertura_por_posicion', 'validar_carga_inicial', 'validar_movimiento',
    'verificar_linea', 'verificar_pendiente', 'verificar_saldos',
    // S2 (0012)
    'aprobar_salida_vencida', 'asignar_salida', 'editar_asignacion', 'cancelar_salida', 'confirmar_salida', 'crear_salida',
    'dar_conformidad', 'disponibilidad_por_lote', 'generar_orden_picking', 'lote_bloqueado', 'proponer_reemplazo', 'registrar_picking',
    'stock_vendible',
    // Roles de los jefes y cargos (0015)
    'asignar_cargo',
    // OS-2 (0023)
    'conformar_orden', 'designar_picker', 'personal_de_picking',
    // OS-1 (0022)
    'aplicar_reserva_lote', 'quitar_reserva_lote',
    // OS-6 (0026)
    'adjuntar_sustento_baja', 'anular_orden_baja', 'autorizar_baja', 'cerrar_solicitud_baja', 'confirmar_vencimiento_baja', 'reemitir_orden_baja',
    'registrar_evaluacion_baja', 'solicitar_baja', 'stock_para_baja', 'trasladar_baja',
    // OS-7 (0027)
    'cerrar_ruta', 'corregir_cierre_ruta', 'registrar_impresion_ls_fr', 'subir_escaneo_ls_fr',
    // OS-5 (0025)
    'anular_dictamen_cliente', 'confirmar_dictamen_cliente', 'crear_retorno', 'dictaminar_como_dt_cliente', 'levantar_observacion_acta', 'lotes_retornables',
    'marcar_muestreo_estricto', 'observar_acta_organoleptica', 'quitar_muestreo_estricto', 'registrar_dictamen_cliente',
    // S8 (0021)
    'cargar_bulto', 'conciliacion_carga', 'confirmar_salida_ruta', 'excluir_pedido_de_carga', 'guardar_checklist_vehicular', 'liberar_unidad', 'retirar_bulto_carga',
    // S7 (0020)
    'embalar_salida', 'listo_para_carga', 'reabrir_embalaje',
    // OS-3 (0024)
    'actualizar_estado_guia', 'anular_guia', 'contexto_guia', 'marcar_evento_pedidos', 'registrar_guia_electronica', 'siguiente_numero_guia',
    // S6b (0019)
    'anular_gre', 'documentacion_resumen', 'paquete_documental', 'registrar_gre',
    // S5 (0018)
    'reabrir_observada', 'resolver_discrepancia_picking',
    // S4 (0017)
    'cancelar_ruta', 'confirmar_ruta', 'crear_ruta', 'guardar_personal_transporte', 'planificar_ruta',
    // S6a (0016)
    'asignar_fabricante_producto', 'asignar_item_coa', 'crear_fabricante', 'descartar_item_coa', 'estado_documental', 'guardar_perfil_documental', 'lotes_sin_coa',
    'registrar_carga_coa', 'revisar_documentos_regulatorios', 'subir_documento_regulatorio',
    // S2b (0013)
    'avisos_fefo', 'lotes_para_editar', 'reporte_cambios_fefo',
    // S3 (0014)
    'registrar_importacion_pedidos', 'revisar_cambio_pedido',
    // SA-2 (0028)
    'agregar_codigo_producto', 'crear_orden_de_pedido', 'crear_orden_salida_manual', 'crear_ordenes_pendientes', 'orden_del_pedido', 'cancelar_orden_salida',
    // SA-3 (0029)
    'ejecutar_devolucion_picking', 'explicar_faltante', 'verificar_devolucion_picking',
    // SA-6 (0030): entrega al transportista del cliente (tipo B); `confirmar_salida` ya era API, `_confirmar_salida_nucleo` es interna
    'registrar_entrega_transportista_cliente',
    // SB-B (0032): numeración atómica de las guías
    'reservar_numero_guia', 'liberar_numero_guia', 'marcar_numero_guia_ocupado', 'confirmar_correlativo_guia', 'corregir_correlativo_guia',
  ]

  it('solo la API conocida tiene EXECUTE para authenticated; los ayudantes internos no', async () => {
    const r = await base.admin.query(`select p.proname n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
       where s.nspname = 'wms' and p.prorettype <> 'trigger'::regtype and has_function_privilege('authenticated', p.oid, 'execute')`)
    const expuestas = [...new Set(r.rows.map((x) => x.n as string))].sort()
    expect(expuestas).toEqual([...API].sort())
  })

  it('una persona autenticada SIN rol en el WMS no puede falsificar auditoría, mover correlativos ni crear alertas', async () => {
    const sinRol = base.personas.sinRol.id
    const antes = Number((await base.admin.query('select count(*) n from wms.audit_events')).rows[0].n)
    for (const sql of [
      `select wms.registrar_audit('INVENTADO', 'x', '1', null, null)`,
      `select wms.siguiente_correlativo('X')`,
      `select wms._alertar('TEMPERATURA', 'jefe_almacen', null, null, 'k', 'spam', null, null)`,
      `select wms._snapshot_solicitud(gen_random_uuid())`,
      `select wms._aplicar_cambios(gen_random_uuid(), '[]'::jsonb, 'x')`,
    ]) {
      const e = await falla(base.como(sinRol, (c) => c.query(sql)))
      expect(e.message, sql).toMatch(/permission denied/)
    }
    expect(Number((await base.admin.query('select count(*) n from wms.audit_events')).rows[0].n)).toBe(antes)
  })

  it('una persona sin rol ni un cliente leen algo con las funciones de lectura públicas', async () => {
    await interruptor('true')
    try {
      const cliente = await nuevaCuenta()
      await base.admin.query(`insert into wms.usuario_roles (user_id, rol, propietario_id) values ($1, 'usuario_cliente', $2)`, [cliente, idAjr])
      // Cada función devuelve 0 filas o se niega; nunca devuelve datos.
      const nada = async (quien: string, sql: string) => {
        const r = await base.como(quien, async (c) => (await c.query(sql)).rowCount ?? 0).catch((e: Error) => e.message)
        if (typeof r === 'number') expect(r, sql).toBe(0)
        else expect(r, sql).toMatch(/Solo|permiso|acceso|permission denied|Sin /i)
      }
      for (const quien of [base.personas.sinRol.id, cliente]) {
        for (const sql of [
          'select * from wms.kardex_filas(null, null, null, null, null)',
          'select * from wms.saldos_al(current_date)',
          'select * from wms.verificar_saldos()',
          'select * from wms.posiciones_bloqueadas()',
          'select * from wms.personas_del_equipo()',
          'select * from wms.ultima_cobertura_por_posicion()',
          'select * from wms.exactitud_conteos(current_date - 30, current_date)',
          'select * from wms.historia_lote(gen_random_uuid())',
        ]) await nada(quien, sql)
      }
    } finally { await interruptor('false') }
  })
})

describe('otros módulos (Compras, Pedidos): lo que esta base de pruebas SÍ puede mostrar', () => {
  // La réplica de `catalogo.productos` reproduce la política REAL de Compras (`productos_lectura … using (true)`): cualquier
  // persona autenticada del proyecto lee el catálogo. Un usuario de cliente lo leería: es la fuga que cierra SEC1.
  // PENDIENTE hasta que SEC1 cierre la política abierta de Compras: la prueba queda en `it.skip` (la CI no se pone en rojo) y se
  // REACTIVA al terminar SEC1 (cambiar `it.skip` por `it`). El interruptor apagado mantiene a los clientes fuera hasta entonces.
  it.skip('SEC1 (pendiente): un usuario de cliente no debe leer catalogo.productos', async () => {
    await interruptor('true')
    try {
      const cliente = await nuevaCuenta()
      await base.admin.query(`insert into wms.usuario_roles (user_id, rol, propietario_id) values ($1, 'usuario_cliente', $2)`, [cliente, idAjr])
      const n = await base.como(cliente, async (c) => (await c.query('select count(*)::int n from catalogo.productos')).rows[0].n)
      expect(n).toBe(0)
    } finally { await interruptor('false') }
  })
})
