// Piloto C y F (migraciones 0039 y 0040): firma del acta en orden con firma dibujada como referencia + huella; vencimiento solo mes y año,
// vida útil mínima, corrección auditada de la fecha, «sin material de envase» y formato organoléptico versionado.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { crearBaseDePrueba, idPosicion, idPropietario, type BaseDePrueba } from './helpers'
import { ayudasDeIngreso } from './ingreso-ayudas'

const HASH = 'b'.repeat(64)
const IMG = 'firmas/' + 'a'.repeat(16) + '-' + HASH + '.png'
const j = JSON.stringify

let base: BaseDePrueba
const P = () => base.personas
beforeAll(async () => { base = await crearBaseDePrueba() }, 120_000)
afterAll(async () => { await base?.cerrar() })

const falla = async (p: Promise<unknown>) => { try { await p } catch (e) { return e as Error } throw new Error('Debía fallar') }

async function proveedor(ruc: string, nombre: string) {
  return (await base.admin.query(`insert into compras.proveedores (ruc, razon_social) values ($1, $2) on conflict (ruc) do update set razon_social = excluded.razon_social returning id`, [ruc, nombre])).rows[0].id as string
}
/** Solicitud de compra de un proveedor (con ese RUC), con un lote que vence en `vence`. */
async function solicitud(ruc: string, vence: string, lote: string) {
  const prov = await proveedor(ruc, 'Daré Pharma')
  const oc = (await base.admin.query(`insert into compras.ordenes_compra (codigo, proveedor_id) values ($1, $2) returning id`, ['OC-F-' + randomUUID().slice(0, 6), prov])).rows[0].id
  const oi = (await base.admin.query(`insert into compras.ordenes_compra_items (oc_id, producto_id, cantidad_pedida) values ($1, $2, 100) returning id`, [oc, base.productos.dapa])).rows[0].id
  const logissa = await idPropietario(base.admin, 'LOGISSA')
  const sol = await base.como(P().sandra.id, async (c) => (await c.query(`select wms.crear_solicitud('COMPRA_LOCAL', $1, $2::jsonb, $3::jsonb, true) id`,
    [logissa, j({ oc_id: oc, guia_numero: 'T001-1' }), j([{ oc_item_id: oi, lote, vence, cantidad: 10 }])])).rows[0].id as string)
  const linea = (await base.admin.query('select id from wms.solicitud_ingreso_lineas where solicitud_id = $1', [sol])).rows[0].id as string
  const ing = await base.como(P().charlie.id, async (c) => (await c.query('select wms.iniciar_recepcion($1) id', [sol])).rows[0].id as string)
  return { sol, linea, ing }
}
const verificar = async (linea: string) =>
  base.como(P().charlie.id, async (c) => c.query('select wms.verificar_linea($1, true, null, null, null, null, $2, null)', [linea, await idPosicion(base.admin, 'A-6')]))
const alertas = async (sol: string, tipo: string) =>
  (await base.admin.query('select destinatario_rol, mensaje from wms.alertas where solicitud_id = $1 and tipo = $2', [sol, tipo])).rows

describe('C · firma del acta en orden (0039)', () => {
  async function actaNueva() {
    const x = await solicitud('20' + String(Math.floor(Math.random() * 1e9)).padStart(9, '1'), '2031-06-30', 'L-' + randomUUID().slice(0, 5))
    await verificar(x.linea)
    await base.como(P().charlie.id, (c) => c.query('select wms.editar_ingreso($1, $2::jsonb)', [x.ing, j({ temperatura_c: 20, bultos: 3, paletas: 1, placa: 'ABC-123', marca_vehiculo: 'H', tipo_conteo: 'TOTAL' })]))
    return base.como(P().charlie.id, async (c) => (await c.query('select wms.generar_acta_recepcion($1) id', [x.ing])).rows[0].id as string)
  }
  const firmar = (quien: string, acta: string, rol: string, nombre: string, ...resto: unknown[]) =>
    base.como(quien, (c) => c.query('select wms.firmar_acta_recepcion($1, $2, $3, $4, $5, $6)', [acta, rol, nombre, resto[0] ?? null, resto[1] ?? null, resto[2] ?? null]))

  it('no se puede firmar fuera de orden y el mensaje dice a quién le toca', async () => {
    const acta = await actaNueva()
    expect((await falla(firmar(P().katia.id, acta, 'DIRECCION_TECNICA', 'Katia'))).message).toBe('Todavía no le toca a Dirección Técnica. Le toca a Transportista.')
    expect((await falla(firmar(P().charlie.id, acta, 'JEFE_ALMACEN', 'Charlie'))).message).toMatch(/Todavía no le toca a Jefe de Almacén\. Le toca a Transportista/)
    await firmar(P().charlie.id, acta, 'TRANSPORTISTA', 'Pedro Quispe', '45678912', 'ABC-123', IMG)
    expect((await falla(firmar(P().charlie.id, acta, 'JEFE_ALMACEN', 'Charlie'))).message).toMatch(/Le toca a Responsable de conteo/)
    await firmar(P().aux.id, acta, 'RESPONSABLE_CONTEO', 'Christians')
    expect((await falla(firmar(P().katia.id, acta, 'DIRECCION_TECNICA', 'Katia'))).message).toMatch(/Le toca a Jefe de Almacén/)
    const r = await firmar(P().charlie.id, acta, 'JEFE_ALMACEN', 'Charlie')
    expect(r.rows[0].select ?? r.rows[0].firmar_acta_recepcion).toMatchObject({ completa: false, faltan: ['DIRECCION_TECNICA'] })
    const ultima = await firmar(P().katia.id, acta, 'DIRECCION_TECNICA', 'Katia')
    expect(ultima.rows[0].firmar_acta_recepcion).toMatchObject({ completa: true })
    expect((await base.admin.query('select estado from wms.actas_recepcion where id = $1', [acta])).rows[0].estado).toBe('FIRMADA')
  })

  it('el transportista guarda referencia + huella de su firma, el DNI y la placa; quien capturó queda aparte; la firma no se edita', async () => {
    const acta = await actaNueva()
    await firmar(P().aux.id, acta, 'TRANSPORTISTA', 'Pedro Quispe', '45678912', 'ABC-123', IMG)
    const f = (await base.admin.query('select user_id, registrado_por, nombre, dni, placa, imagen_ref, imagen_hash, imagen_firma from wms.acta_firmas where acta_id = $1', [acta])).rows[0]
    expect(f).toMatchObject({ user_id: null, registrado_por: P().aux.id, nombre: 'Pedro Quispe', dni: '45678912', placa: 'ABC-123', imagen_ref: IMG, imagen_hash: HASH, imagen_firma: null })
    expect((await falla(base.admin.query(`update wms.acta_firmas set imagen_hash = $1 where acta_id = $2`, ['c'.repeat(64), acta]))).message).toMatch(/inmutable/i)
    const aud = (await base.admin.query(`select despues from wms.audit_events where evento = 'acta_recepcion_firmada' and entidad_id = $1`, [acta])).rows[0]
    expect(aud.despues).toMatchObject({ captura: P().aux.id, huella_firma: HASH })
  })

  it('exige la referencia de la firma (en formato) y rechaza una firma que no sea la del transportista dentro de otra fila', async () => {
    const acta = await actaNueva()
    for (const mala of [null, 'x', 'firmas/corta.png', 'data:image/png;base64,' + 'A'.repeat(200)]) {
      expect((await falla(firmar(P().charlie.id, acta, 'TRANSPORTISTA', 'Pedro', '45678912', 'ABC-1', mala))).message).toMatch(/firma del transportista/)
    }
    expect((await falla(base.admin.query(`insert into wms.acta_firmas (acta_tipo, acta_id, rol_firma, nombre, dni, placa, imagen_ref, imagen_hash, registrado_por, hash_contenido)
      values ('RECEPCION', $1, 'TRANSPORTISTA', 'X', '45678912', 'A-1', $2, $3, $4, 'h')`, [acta, IMG, 'c'.repeat(64), P().charlie.id]))).message).toMatch(/acta_firmas_ref_formato/)
  })
})

describe('F · vencimiento, vida útil y proveedor (0040)', () => {
  it('los parámetros nacen con primero y 24, y se validan', async () => {
    const v = async (k: string) => (await base.admin.query('select valor from wms.parametros where clave = $1', [k])).rows[0].valor
    expect(await v('vencimiento_dia_por_defecto')).toBe('primero')
    expect(await v('vida_util_minima_meses')).toBe('24')
    expect((await falla(base.admin.query(`update wms.parametros set valor = 'quince' where clave = 'vencimiento_dia_por_defecto'`))).message).toMatch(/primero.*ultimo/)
    expect((await falla(base.admin.query(`update wms.parametros set valor = '0' where clave = 'vida_util_minima_meses'`))).message).toMatch(/1 a 120/)
    await base.admin.query(`update wms.parametros set valor = ' ULTIMO ' where clave = 'vencimiento_dia_por_defecto'`)
    expect(await v('vencimiento_dia_por_defecto')).toBe('ultimo')
    await base.admin.query(`update wms.parametros set valor = 'primero' where clave = 'vencimiento_dia_por_defecto'`)
  })

  it('un proveedor marcado «solo mes y año» genera la alerta de verificar la fecha al recibir; uno sin marca, no; la marca pide motivo y rol', async () => {
    const ruc = '20600000001'
    expect((await falla(base.como(P().aux.id, (c) => c.query(`select wms.marcar_proveedor_vencimiento($1, 'Daré Pharma', true, 'Solo imprime mes y año')`, [ruc])))).message).toMatch(/Solo Dirección Técnica/)
    expect((await falla(base.como(P().katia.id, (c) => c.query(`select wms.marcar_proveedor_vencimiento($1, 'Daré Pharma', true, ' ')`, [ruc])))).message).toMatch(/motivo/)
    await base.como(P().sandra.id, (c) => c.query(`select wms.marcar_proveedor_vencimiento($1, 'Daré Pharma', true, 'Solo imprime mes y año')`, [ruc]))
    const marcado = await solicitud(ruc, '2031-06-01', 'L-DARE')
    await verificar(marcado.linea)
    const a = await alertas(marcado.sol, 'VENCIMIENTO_VERIFICAR')
    expect(a).toEqual([expect.objectContaining({ destinatario_rol: 'jefe_almacen', mensaje: expect.stringMatching(/Daré Pharma solo imprime mes y año.*lote L-DARE/) })])
    const normal = await solicitud('20600000002', '2031-06-30', 'L-NORMAL')
    await verificar(normal.linea)
    expect(await alertas(normal.sol, 'VENCIMIENTO_VERIFICAR')).toEqual([])
    await base.como(P().katia.id, (c) => c.query(`select wms.marcar_proveedor_vencimiento($1, null, false, 'Ya imprime día')`, [ruc]))
    expect((await base.admin.query('select vence_solo_mes_anio from wms.proveedores_config where ruc = $1', [ruc])).rows[0].vence_solo_mes_anio).toBe(false)
  })

  it('alerta de vida útil: menos de 24 meses avisa a Dirección Técnica; con 24 o más no; el valor del parámetro manda', async () => {
    const hoy = (await base.admin.query(`select (now() at time zone 'America/Lima')::date d`)).rows[0].d as Date
    const fecha = (meses: number, dias = 0) => { const d = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth() + meses, hoy.getDate() + dias)); return d.toISOString().slice(0, 10) }
    const corta = await solicitud('20600000003', fecha(23, 15), 'L-CORTA')
    await verificar(corta.linea)
    expect(await alertas(corta.sol, 'VIDA_UTIL_CORTA')).toEqual([expect.objectContaining({ destinatario_rol: 'direccion_tecnica', mensaje: expect.stringMatching(/le quedan 23 meses.*24 mínimos/) })])
    const justa = await solicitud('20600000004', fecha(24), 'L-JUSTA')
    await verificar(justa.linea)
    expect(await alertas(justa.sol, 'VIDA_UTIL_CORTA')).toEqual([])
    await base.admin.query(`update wms.parametros set valor = '30' where clave = 'vida_util_minima_meses'`)
    const con30 = await solicitud('20600000005', fecha(26), 'L-30')
    await verificar(con30.linea)
    expect(await alertas(con30.sol, 'VIDA_UTIL_CORTA')).toHaveLength(1)
    await base.admin.query(`update wms.parametros set valor = '24' where clave = 'vida_util_minima_meses'`)
  })
})

describe('F · corrección auditada de la fecha del lote (0040)', () => {
  async function lote() {
    const id = randomUUID()
    await base.admin.query(`insert into wms.lotes (id, producto_id, codigo, vence, vence_texto_original, propietario_id) values ($1, $2, $3, '2028-06-01', '06/2028', $4)`,
      [id, base.productos.dapa, 'L-' + id.slice(0, 6), await idPropietario(base.admin, 'LOGISSA')])
    return id
  }
  const corregir = (quien: string, id: string, fecha: string, motivo: string) => base.como(quien, (c) => c.query('select wms.corregir_vencimiento_lote($1, $2, $3)', [id, fecha, motivo]))

  it('la corrige el Jefe de Almacén o Dirección Técnica, con motivo; queda el historial y no se edita a mano', async () => {
    const id = await lote()
    expect((await falla(corregir(P().aux.id, id, '2028-06-30', 'El envase dice 30'))).message).toMatch(/Solo el Jefe de Almacén/)
    expect((await falla(corregir(P().sandra.id, id, '2028-06-30', 'x'))).message).toMatch(/Solo el Jefe de Almacén/)
    expect((await falla(corregir(P().charlie.id, id, '2028-06-30', ' '))).message).toMatch(/motivo/)
    expect((await falla(corregir(P().charlie.id, id, '2028-06-01', 'igual'))).message).toMatch(/nada que corregir/)
    await corregir(P().charlie.id, id, '2028-06-30', 'El envase dice 30/06/2028')
    await corregir(P().katia.id, id, '2028-06-15', 'Revisé el protocolo')
    const h = (await base.admin.query('select antes::text, despues::text, antes_texto, motivo, usuario from wms.lote_vencimiento_cambios where lote_id = $1 order by id', [id])).rows
    expect(h).toEqual([
      { antes: '2028-06-01', despues: '2028-06-30', antes_texto: '06/2028', motivo: 'El envase dice 30/06/2028', usuario: P().charlie.id },
      { antes: '2028-06-30', despues: '2028-06-15', antes_texto: null, motivo: 'Revisé el protocolo', usuario: P().katia.id },
    ])
    expect((await base.admin.query('select vence::text, vence_texto_original from wms.lotes where id = $1', [id])).rows[0]).toEqual({ vence: '2028-06-15', vence_texto_original: null })
    expect((await falla(base.admin.query('update wms.lote_vencimiento_cambios set motivo = $1', ['otro']))).message).toMatch(/inmutable/i)
    expect((await falla(base.como(P().charlie.id, (c) => c.query(`update wms.lotes set vence = '2030-01-01' where id = $1`, [id])))).message).toMatch(/permission denied/i)
  })
})

describe('F · sin material de envase y formato versionado (0040)', () => {
  it('solo Dirección Técnica marca «sin material de envase»; queda en el historial regulatorio con su motivo', async () => {
    const edit = (quien: string, valor: string) => base.como(quien, (c) => c.query('select wms.editar_regulatorio($1, $2::jsonb, $3) n', [base.productos.dapa, j({ sin_material_envase: valor }), 'Es una crema en tubo sin envase secundario']))
    expect((await falla(edit(P().sandra.id, 'true'))).message).toMatch(/Solo Dirección Técnica marca/)
    expect((await edit(P().katia.id, 'true')).rows[0].n).toBe(1)
    expect((await base.admin.query('select sin_material_envase from wms.producto_regulatorio where producto_id = $1', [base.productos.dapa])).rows[0].sin_material_envase).toBe(true)
    expect((await edit(P().katia.id, 'true')).rows[0].n).toBe(0)
    const h = (await base.admin.query(`select campo, antes, despues, motivo from wms.producto_regulatorio_cambios where producto_id = $1 and campo = 'sin_material_envase'`, [base.productos.dapa])).rows
    expect(h).toEqual([{ campo: 'sin_material_envase', antes: 'false', despues: 'true', motivo: 'Es una crema en tubo sin envase secundario' }])
    await edit(P().katia.id, 'false')
  })

  it('la versión 2 del acta organoléptica nace PENDIENTE: las actas nuevas salen en la versión 1 hasta que Dirección Técnica la aprueba', async () => {
    const vig = async () => (await base.admin.query(`select wms.formato_version_vigente('ACTA_ORGANOLEPTICA') v`)).rows[0].v
    expect(await vig()).toBe(1)
    expect((await base.admin.query(`select version, estado from wms.formatos_versiones where formato = 'ACTA_ORGANOLEPTICA' order by version`)).rows).toEqual([{ version: 1, estado: 'APROBADA' }, { version: 2, estado: 'PENDIENTE' }])
    expect((await falla(base.como(P().sandra.id, (c) => c.query(`select wms.aprobar_version_formato('ACTA_ORGANOLEPTICA', 2)`)))).message).toMatch(/Solo Dirección Técnica aprueba/)
    expect((await falla(base.admin.query(`update wms.formatos_versiones set resumen = 'otro' where version = 2`))).message).toMatch(/no se edita/)
    const ay = ayudasDeIngreso(base)
    const antes = await ay.compra({ producto: base.productos.dapa, cantidad: 3, lote: 'L-FORM1' })
    expect((await ay.acta(antes.org)).formato_version).toBe(1)
    await base.como(P().katia.id, (c) => c.query(`select wms.aprobar_version_formato('ACTA_ORGANOLEPTICA', 2)`))
    expect(await vig()).toBe(2)
    expect((await falla(base.como(P().katia.id, (c) => c.query(`select wms.aprobar_version_formato('ACTA_ORGANOLEPTICA', 2)`)))).message).toMatch(/ya está aprobada/)
    expect((await falla(base.admin.query(`delete from wms.formatos_versiones where version = 1`))).message).toMatch(/no se borra/)
    // Un acta organoléptica que nazca ahora lleva la versión vigente (2); la anterior conserva la suya.
    const despues = await ay.compra({ producto: base.productos.dapa, cantidad: 3, lote: 'L-FORM2' })
    expect((await ay.acta(despues.org)).formato_version).toBe(2)
    expect((await ay.acta(antes.org)).formato_version).toBe(1)
  })
})
