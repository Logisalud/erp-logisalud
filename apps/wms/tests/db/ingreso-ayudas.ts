// Ayudas compartidas por las pruebas de base de datos del bloque «Orden de Salida» (OS-5): recorren el flujo real de ingreso
// (solicitud → recepción → acta firmada → ingreso confirmado → acta organoléptica) con las funciones de la base.
import { randomUUID } from 'node:crypto'
import { type BaseDePrueba, idPosicion, idPropietario } from './helpers'

const IMG = 'data:image/png;base64,' + 'A'.repeat(200)
const j = JSON.stringify

export function ayudasDeIngreso(base: BaseDePrueba) {
  const P = () => base.personas
  const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
  const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]

  async function persona(rol: string | string[]): Promise<string> {
    const id = randomUUID()
    await base.admin.query('insert into auth.users (id) values ($1)', [id])
    for (const r of Array.isArray(rol) ? rol : [rol]) await base.admin.query('insert into wms.usuario_roles (user_id, rol) values ($1, $2)', [id, r])
    return id
  }

  let nProd = 0
  async function productoNuevo(opciones: { rs?: boolean } = {}): Promise<string> {
    nProd += 1
    const id = (await uno(`insert into catalogo.productos (codigo, descripcion, unidad_medida) values ($1, $2, 'TABLETA') returning id`, [`OS5-${nProd}-${randomUUID().slice(0, 4)}`, `Producto OS-5 ${nProd}`])).id as string
    if (opciones.rs !== false) {
      await base.admin.query(`insert into wms.producto_regulatorio (producto_id, registro_sanitario, rs_vence, estado_validacion, creado_por, validado_por, validado_en)
                              values ($1, $2, '2031-01-01', 'VALIDADO', $3, $3, now())`, [id, `EG-OS5-${nProd}`, P().katia.id])
    }
    return id
  }

  const recibir = (sol: string) => base.como(P().charlie.id, async (c) => (await c.query('select wms.iniciar_recepcion($1) id', [sol])).rows[0].id as string)
  const verificar = async (linea: string, posicion: string) =>
    base.como(P().charlie.id, (c) => c.query('select wms.verificar_linea($1, true, null, null, null, null, $2, null)', [linea, posicion]))
  const datosRecepcion = (ingreso: string) =>
    base.como(P().charlie.id, (c) => c.query('select wms.editar_ingreso($1, $2::jsonb)', [ingreso, j({ temperatura_c: 20, bultos: 3, paletas: 1, placa: 'ABC-123', marca_vehiculo: 'Hyundai', tipo_conteo: 'TOTAL' })]))
  async function firmarTodo(ingreso: string) {
    const acta = await base.como(P().charlie.id, async (c) => (await c.query('select wms.generar_acta_recepcion($1) id', [ingreso])).rows[0].id as string)
    await base.como(P().charlie.id, (c) => c.query(`select wms.firmar_acta_recepcion($1, 'JEFE_ALMACEN', 'Charlie Chancco')`, [acta]))
    await base.como(P().katia.id, (c) => c.query(`select wms.firmar_acta_recepcion($1, 'DIRECCION_TECNICA', 'Katia Zapata')`, [acta]))
    await base.como(P().aux.id, (c) => c.query(`select wms.firmar_acta_recepcion($1, 'RESPONSABLE_CONTEO', 'Christians')`, [acta]))
    await base.como(P().charlie.id, (c) => c.query(`select wms.firmar_acta_recepcion($1, 'TRANSPORTISTA', 'Pedro Quispe', '45678912', 'ABC-123', $2)`, [acta, IMG]))
    return acta
  }
  const confirmar = (ingreso: string) => base.como(P().charlie.id, async (c) => (await c.query('select wms.confirmar_ingreso($1) id', [ingreso])).rows[0].id as string)

  /** Una solicitud nueva (devolución o ingreso de cliente) creada por Sandra, recibida y confirmada: devuelve el ingreso y el acta organoléptica de su primer lote. */
  async function ingresoDirecto(o: { tipo: 'DEVOLUCION' | 'INGRESO_CLIENTE'; propietario: string; producto: string; lote: string; cantidad: number; posicion: string; vence?: string }) {
    const datos = o.tipo === 'DEVOLUCION'
      ? { guia_numero: 'T001-9', doc_original_tipo: 'FACTURA', doc_original_numero: 'F001-77', motivo: 'Prueba' }
      : { guia_numero: 'G-CLI-1', contraparte_nombre: 'Cliente de prueba' }
    const sol = await base.como(P().sandra.id, async (c) => (await c.query('select wms.crear_solicitud($1, $2, $3::jsonb, $4::jsonb, true) id',
      [o.tipo, o.propietario, j(datos), j([{ producto_id: o.producto, lote: o.lote, vence: o.vence ?? '2028-06-30', cantidad: o.cantidad }])])).rows[0].id as string)
    return recepcionCompleta(sol, o.posicion)
  }

  async function recepcionCompleta(sol: string, posicion: string) {
    const lineas = await q('select id from wms.solicitud_ingreso_lineas where solicitud_id = $1 and cantidad > 0 order by creado_en', [sol])
    const ing = await recibir(sol)
    const pos = await idPosicion(base.admin, posicion)
    for (const l of lineas) await verificar(l.id, pos)
    await datosRecepcion(ing)
    const acta = await firmarTodo(ing)
    await confirmar(ing)
    const orgs = await q('select id from wms.actas_organolepticas where ingreso_id = $1 order by numero', [ing])
    return { sol, ing, acta, orgs: orgs.map((r) => r.id as string), org: orgs[0]?.id as string }
  }

  /** Una compra local confirmada (OC de prueba de un proveedor con ese RUC). */
  async function compra(o: { producto: string; cantidad: number; lote: string; ruc?: string; posicion?: string }) {
    const logissa = await idPropietario(base.admin, 'LOGISSA')
    const ruc = o.ruc ?? String(Math.floor(Math.random() * 1e10)).padStart(11, '3')
    const prov = (await uno(`insert into compras.proveedores (ruc, razon_social) values ($1, 'Proveedor OS-5') on conflict (ruc) do update set razon_social = excluded.razon_social returning id`, [ruc])).id
    const oc = await uno(`insert into compras.ordenes_compra (codigo, proveedor_id) values ($1, $2) returning id`, ['OC-OS5-' + randomUUID().slice(0, 6), prov])
    const oi = (await uno(`insert into compras.ordenes_compra_items (oc_id, producto_id, cantidad_pedida) values ($1, $2, $3) returning id`, [oc.id, o.producto, o.cantidad + 1000])).id
    const sol = await base.como(P().sandra.id, async (c) => (await c.query(`select wms.crear_solicitud('COMPRA_LOCAL', $1, $2::jsonb, $3::jsonb, true) id`,
      [logissa, j({ oc_id: oc.id, guia_numero: 'T001-1' }), j([{ oc_item_id: oi, lote: o.lote, vence: '2028-06-30', cantidad: o.cantidad }])])).rows[0].id as string)
    return recepcionCompleta(sol, o.posicion ?? 'A-6')
  }

  const llenar = (org: string, conclusion = 'CONFORME') =>
    base.como(P().sandra.id, (c) => c.query('select wms.guardar_acta_organoleptica($1, $2::jsonb, true)', [org,
      j({ cert_analisis: true, checklist: { embalaje_cerrado: 'C', envase_ok: 'C' }, destino_sugerido: 'APROBADO', conclusion })]))
  const decidir = (org: string, decision: 'APROBADO' | 'BAJAS_RECHAZADOS') =>
    base.como(P().katia.id, (c) => c.query('select wms.decidir_acta_organoleptica($1, $2, null)', [org, decision]))
  const acta = (org: string) => uno('select * from wms.actas_organolepticas where id = $1', [org])
  const saldosDe = async (ing: string) => q(`select s.estado, s.cantidad::int, ps.codigo as posicion from wms.saldos s join wms.ingreso_lotes il on il.id = s.procedencia_id
      join wms.posiciones ps on ps.id = s.posicion_id where il.ingreso_id = $1 and s.cantidad > 0 order by ps.codigo, s.estado`, [ing])

  return { P, q, uno, persona, productoNuevo, recibir, verificar, datosRecepcion, firmarTodo, confirmar, ingresoDirecto, recepcionCompleta, compra, llenar, decidir, acta, saldosDe, j }
}
