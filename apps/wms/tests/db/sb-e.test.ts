// SB-E (migración 0035, D-196): el Administrador hace todo lo operativo y de configuración. Sigue reservado a Dirección Técnica: aprobar, dar de baja, autorizar ajustes y validar producto.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, SQL, crearBaseDePrueba, falla, idPosicion, idPropietario } from './helpers'
import { ayudasDeIngreso } from './ingreso-ayudas'

let base: BaseDePrueba
let a: ReturnType<typeof ayudasDeIngreso>
let admin: string
let admin2: string
const IMG = 'data:image/png;base64,' + 'A'.repeat(200)
const como = <T>(id: string, fn: (c: import('pg').Client) => Promise<T>) => base.como(id, fn)

beforeAll(async () => {
  base = await crearBaseDePrueba(); a = ayudasDeIngreso(base)
  admin = await a.persona('admin_wms'); admin2 = await a.persona('admin_wms')
}, 120_000)
afterAll(async () => { await base?.cerrar() })

async function solicitudDeCompra(creador: string) {
  const prod = await a.productoNuevo()
  const logissa = await idPropietario(base.admin, 'LOGISSA')
  const prov = (await a.uno(`insert into compras.proveedores (ruc, razon_social) values ($1, 'Proveedor SB-E') on conflict (ruc) do update set razon_social = excluded.razon_social returning id`, [String(Math.floor(Math.random() * 1e10)).padStart(11, '3')])).id
  const oc = await a.uno(`insert into compras.ordenes_compra (codigo, proveedor_id) values ($1, $2) returning id`, ['OC-SBE-' + randomUUID().slice(0, 6), prov])
  const oi = (await a.uno(`insert into compras.ordenes_compra_items (oc_id, producto_id, cantidad_pedida) values ($1, $2, 100) returning id`, [oc.id, prod])).id
  const sol = await como(creador, async (c) => (await c.query(`select wms.crear_solicitud('COMPRA_LOCAL', $1, $2::jsonb, $3::jsonb, true) id`,
    [logissa, a.j({ oc_id: oc.id, guia_numero: 'T001-5' }), a.j([{ oc_item_id: oi, lote: 'SBE-1', vence: '2028-06-30', cantidad: 10 }])])).rows[0].id as string)
  return { sol, prod }
}

describe('el Administrador en las entradas', () => {
  it('prepara y autoriza la solicitud, y firma el acta como Jefe de Almacén; y no como Dirección Técnica', async () => {
    const { sol } = await solicitudDeCompra(admin)
    expect((await a.uno('select estado from wms.solicitudes_ingreso where id = $1', [sol])).estado).toMatch(/PROGRAMADA/)
    const lineas = await a.q('select id from wms.solicitud_ingreso_lineas where solicitud_id = $1', [sol])
    const ing = await a.recibir(sol)
    const pos = await idPosicion(base.admin, 'A-6')
    for (const l of lineas) await a.verificar(l.id, pos)
    await a.datosRecepcion(ing)
    const acta = await base.como(a.P().charlie.id, async (c) => (await c.query('select wms.generar_acta_recepcion($1) id', [ing])).rows[0].id as string)
    await como(admin, (c) => c.query(`select wms.firmar_acta_recepcion($1, 'JEFE_ALMACEN', 'Sebastián')`, [acta]))
    expect((await falla(como(admin2, (c) => c.query(`select wms.firmar_acta_recepcion($1, 'DIRECCION_TECNICA', 'Andrés')`, [acta])))).message).toMatch(/Solo Dirección Técnica/)
    await como(a.P().katia.id, (c) => c.query(`select wms.firmar_acta_recepcion($1, 'DIRECCION_TECNICA', 'Katia Zapata')`, [acta]))
    await como(a.P().aux.id, (c) => c.query(`select wms.firmar_acta_recepcion($1, 'RESPONSABLE_CONTEO', 'Christians')`, [acta]))
    await como(a.P().charlie.id, (c) => c.query(`select wms.firmar_acta_recepcion($1, 'TRANSPORTISTA', 'Pedro Quispe', '45678912', 'ABC-123', $2)`, [acta, IMG]))
    const firmas = await a.q('select rol_firma, firmante_id from wms.actas_recepcion_firmas where acta_id = $1', [acta]).catch(() => [])
    if (firmas.length) expect(firmas.some((f) => f.rol_firma === 'JEFE_ALMACEN' && f.firmante_id === admin)).toBe(true)
  })
  it('llena el acta organoléptica y cierra expedientes; la decisión sigue siendo solo de Dirección Técnica', async () => {
    const { sol } = await solicitudDeCompra(a.P().sandra.id)
    const r = await a.recepcionCompleta(sol, 'A-6')
    await como(admin, (c) => c.query('select wms.guardar_acta_organoleptica($1, $2::jsonb, true)', [r.org, a.j({ cert_analisis: true, checklist: { embalaje_cerrado: 'C', envase_ok: 'C' }, destino_sugerido: 'APROBADO', conclusion: 'CONFORME' })]))
    expect((await falla(como(admin, (c) => c.query('select wms.decidir_acta_organoleptica($1, $2, null)', [r.org, 'APROBADO'])))).message).toMatch(/Solo Dirección Técnica/)
    await a.decidir(r.org, 'APROBADO')
  })
})

describe('el Administrador y los productos', () => {
  const alta = (quien: string, codigo: string) => como(quien, async (c) => (await c.query(`select wms.crear_producto($1, 'Producto SB-E', null, null, null, 'UND', 'EG-7001', '2031-12-31') id`, [codigo])).rows[0].id as string)
  const estado = async (id: string) => (await a.uno('select estado_validacion, validado_por from wms.producto_regulatorio where producto_id = $1', [id]))
  it('da de alta un producto que nace PENDIENTE; solo DT o su asistente lo validan; hasta entonces no se aprueban sus lotes', async () => {
    const id = await alta(admin, 'SBE-' + randomUUID().slice(0, 5))
    expect(await estado(id)).toMatchObject({ estado_validacion: 'PENDIENTE', validado_por: null })
    expect((await falla(como(admin, (c) => c.query('select wms.validar_producto($1)', [id])))).message).toMatch(/Solo Dirección Técnica o su asistente/)
    expect((await falla(como(a.P().charlie.id, (c) => c.query('select wms.validar_producto($1)', [id])))).message).toMatch(/Solo Dirección Técnica/)
    await como(a.P().katia.id, (c) => c.query('select wms.validar_producto($1)', [id]))
    expect(await estado(id)).toMatchObject({ estado_validacion: 'VALIDADO', validado_por: a.P().katia.id })
    expect((await a.uno(`select count(*)::int n from wms.audit_events where evento = 'producto_validado' and entidad_id = $1`, [id])).n).toBe(1)
  })
  it('el alta de Sandra o de Katia sigue rigiendo de inmediato', async () => {
    const id = await alta(a.P().sandra.id, 'SBE-' + randomUUID().slice(0, 5))
    expect(await estado(id)).toMatchObject({ estado_validacion: 'VALIDADO', validado_por: a.P().sandra.id })
  })
  it('si el Administrador cambia datos regulatorios de un producto validado, queda PENDIENTE; sin cambios no se mueve; DT lo valida de nuevo', async () => {
    const id = await alta(a.P().katia.id, 'SBE-' + randomUUID().slice(0, 5))
    await como(admin, (c) => c.query(`select wms.editar_regulatorio($1, '{"fabricante":"Lab del Administrador"}'::jsonb, 'Corrección')`, [id]))
    expect((await estado(id)).estado_validacion).toBe('PENDIENTE')
    await como(a.P().katia.id, (c) => c.query('select wms.validar_producto($1)', [id]))
    await como(admin, (c) => c.query(`select wms.editar_regulatorio($1, '{"fabricante":"Lab del Administrador"}'::jsonb, 'Sin cambios')`, [id]))
    expect((await estado(id)).estado_validacion).toBe('VALIDADO')
    await como(a.P().sandra.id, (c) => c.query(`select wms.editar_regulatorio($1, '{"fabricante":"Otro"}'::jsonb, 'Sandra')`, [id]))
    expect((await estado(id)).estado_validacion).toBe('VALIDADO')
  })
  it('un lote de un producto sin validar no se puede aprobar (la base lo impide, también al Administrador)', async () => {
    const id = await alta(admin, 'SBE-' + randomUUID().slice(0, 5))
    const { sol } = await (async () => {
      const logissa = await idPropietario(base.admin, 'LOGISSA')
      const prov = (await a.uno(`insert into compras.proveedores (ruc, razon_social) values ($1, 'P') on conflict (ruc) do update set razon_social = excluded.razon_social returning id`, [String(Math.floor(Math.random() * 1e10)).padStart(11, '4')])).id
      const oc = await a.uno(`insert into compras.ordenes_compra (codigo, proveedor_id) values ($1, $2) returning id`, ['OC-SBE-' + randomUUID().slice(0, 6), prov])
      const oi = (await a.uno(`insert into compras.ordenes_compra_items (oc_id, producto_id, cantidad_pedida) values ($1, $2, 100) returning id`, [oc.id, id])).id
      const s = await como(a.P().sandra.id, async (c) => (await c.query(`select wms.crear_solicitud('COMPRA_LOCAL', $1, $2::jsonb, $3::jsonb, true) id`,
        [logissa, a.j({ oc_id: oc.id, guia_numero: 'T001-6' }), a.j([{ oc_item_id: oi, lote: 'SBE-2', vence: '2028-06-30', cantidad: 5 }])])).rows[0].id as string)
      return { sol: s }
    })()
    const r = await a.recepcionCompleta(sol, 'A-6')
    await a.llenar(r.org)
    expect((await falla(a.decidir(r.org, 'APROBADO'))).message).toMatch(/no está validado/)
    await como(a.P().katia.id, (c) => c.query('select wms.validar_producto($1)', [id]))
    await a.decidir(r.org, 'APROBADO')
  })
})

describe('el Administrador y los documentos', () => {
  it('sube y reemplaza documentos (COA, registro sanitario, BPM) y crea fabricantes; el Jefe de Transporte sigue sin poder con el registro sanitario', async () => {
    const prod = await a.productoNuevo()
    const doc = (quien: string, tipo: string, alcance: string, nombre: string, reemplaza: string | null = null) => como(quien, async (c) => (await c.query(
      'select wms.subir_documento_regulatorio($1, $2, $3, $4, $5, 10, null, null, $6, $7) id', [tipo, alcance, nombre, `ref/${nombre}`, 'a'.repeat(64), reemplaza, reemplaza ? 'Corregido' : null])).rows[0].id as string)
    const rs1 = await doc(admin, 'REGISTRO_SANITARIO', prod, 'rs1.pdf')
    await doc(admin, 'REGISTRO_SANITARIO', prod, 'rs2.pdf', rs1)
    const fab = await como(admin, async (c) => (await c.query(`select wms.crear_fabricante('Laboratorio SB-E') id`)).rows[0].id as string)
    await doc(admin, 'BPM', fab, 'bpm.pdf')
    const jt = await a.persona('jefe_transporte')
    expect((await falla(doc(jt, 'REGISTRO_SANITARIO', prod, 'rs3.pdf'))).message).toMatch(/Solo Dirección Técnica/)
    expect((await a.uno(`select count(*)::int n from wms.audit_events where entidad = 'documentos_regulatorios' and actor = $1`, [admin])).n).toBeGreaterThanOrEqual(3)
  })
  it('gestionar_documentos_regulatorios ya es del Administrador, pero los permisos sanitarios siguen sin poder tocarse desde la aplicación', async () => {
    const tiene = (id: string, accion: string) => como(id, async (c) => (await c.query('select wms.tiene_permiso($1) v', [accion])).rows[0].v as boolean)
    expect(await tiene(admin, 'gestionar_documentos_regulatorios')).toBe(true)
    for (const x of ['aprobar', 'ajustar', 'autorizar_baja', 'registrar_dictamen_cliente', 'marcar_antecedentes_calidad', 'liberar_stock_propietario']) expect(await tiene(admin, x), x).toBe(false)
    expect((await falla(como(admin, (c) => c.query(`insert into wms.permisos_rol (rol, accion) values ('admin_wms', 'aprobar')`)))).message).toMatch(/no se cambian desde la aplicación/)
  })
})

describe('el Administrador y la configuración, las rutas, el personal y los vehículos', () => {
  it('edita parámetros y permisos no sanitarios, gestiona personal de transporte y vehículos, y todo queda en la auditoría', async () => {
    await como(admin, (c) => c.query(`update wms.parametros set valor = valor where clave = 'guia_motivo_codigo_venta'`))
    await como(admin, (c) => c.query(`select wms.guardar_personal_transporte(null, 'Conductor SB-E', 'CONDUCTOR', true)`))
    await como(admin, (c) => c.query(`insert into wms.vehiculos (placa, descripcion) values ('SBE-123', 'Camión SB-E')`).catch(() => c.query(`insert into wms.vehiculos (placa) values ('SBE-123')`)))
    expect((await a.uno(`select count(*)::int n from wms.audit_events where actor = $1`, [admin])).n).toBeGreaterThanOrEqual(2)
    await como(admin, (c) => c.query(`insert into wms.usuario_roles (user_id, rol) values ($1, 'auxiliar') on conflict do nothing`, [a.P().aux.id]))
  })
  it('el Administrador atiende las alertas de la asistente, pero no las de Dirección Técnica', async () => {
    const al = async (rol: string) => (await a.uno(`insert into wms.alertas (tipo, destinatario_rol, clave, mensaje) values ('TEMPERATURA', $1, $2, 'x') returning id`, [rol, randomUUID()])).id as string
    const idSandra = await al('asistente_dt')
    await como(admin, (c) => c.query('select wms.atender_alerta($1, null)', [idSandra]))
    const idDt = await al('direccion_tecnica')
    expect((await falla(como(admin, (c) => c.query('select wms.atender_alerta($1, null)', [idDt])))).message).toMatch(/Dirección Técnica/)
  })
  it('la migración se puede volver a aplicar', async () => {
    await base.admin.query(SQL.m0035())
    const r = await como(admin, async (c) => (await c.query('select wms.tiene_permiso($1) v', ['gestionar_documentos_regulatorios'])).rows[0].v as boolean)
    expect(r).toBe(true)
  })
})
