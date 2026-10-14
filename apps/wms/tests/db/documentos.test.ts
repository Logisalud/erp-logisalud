// S6a (migración 0016): documentos regulatorios con vigencia e historial, permisos, perfil documental, estado documental y carga masiva de COA.
import { createHash, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla } from './helpers'

let base: BaseDePrueba
let dt: string; let sandra: string; let charlie: string; let aux: string; let jt: string; let auditor: string; let sinRol: string
const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
const como = <T>(id: string, fn: (c: import('pg').Client) => Promise<T>) => base.como(id, fn)
async function persona(rol: string): Promise<string> {
  const id = randomUUID()
  await base.admin.query('insert into auth.users (id) values ($1)', [id])
  await base.admin.query('insert into wms.usuario_roles (user_id, rol) values ($1, $2)', [id, rol])
  return id
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
const en = (dias: number) => { const d = new Date(`${hoy}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10) }
let n = 0
async function productoNuevo(): Promise<string> {
  const id = randomUUID()
  await base.admin.query(`insert into catalogo.productos (id, codigo, descripcion, unidad_medida) values ($1, $2, 'Producto documental', 'TABLETA')`, [id, `DOC-P-${id.slice(0, 6)}`])
  await base.admin.query(`insert into wms.producto_regulatorio (producto_id, registro_sanitario, rs_vence, estado_validacion, creado_por, validado_por, validado_en) values ($1, 'EG-9', '2031-01-01', 'VALIDADO', $2, $2, now())`, [id, base.personas.katia.id])
  return id
}
const lote = async (producto = base.productos.dapa) => {
  n += 1
  const dueno = (await uno(`select id from wms.propietarios where codigo = 'LOGISSA'`)).id
  return (await uno(`insert into wms.lotes (producto_id, codigo, vence, propietario_id) values ($1, $2, '2028-12-31', $3) returning id`, [producto, `DOC-${n}-${randomUUID().slice(0, 4)}`, dueno])).id as string
}
const subir = (quien: string, tipo: string, alcance: string, o: { nombre?: string; desde?: string | null; hasta?: string | null; reemplaza?: string | null; motivo?: string | null } = {}) =>
  como(quien, async (c) => (await c.query('select wms.subir_documento_regulatorio($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) id',
    [tipo, alcance, o.nombre ?? 'doc.pdf', `docs/${randomUUID()}.pdf`, sha(randomUUID()), 1234, o.desde ?? null, o.hasta ?? null, o.reemplaza ?? null, o.motivo ?? null])).rows[0].id as string)
const estado = (quien: string, loteId: string, ruc: string | null = null, entrega: string | null = null) =>
  como(quien, async (c) => (await c.query('select * from wms.estado_documental($1, $2, $3)', [loteId, ruc, entrega])).rows as { tipo: string; exigido: boolean; estado: string; vigente_hasta: string | null }[])

beforeAll(async () => {
  base = await crearBaseDePrueba()
  dt = base.personas.katia.id; sandra = base.personas.sandra.id; charlie = base.personas.charlie.id; aux = base.personas.aux.id; auditor = base.personas.auditor.id; sinRol = base.personas.sinRol.id
  jt = await persona('jefe_transporte')
}, 120_000)
afterAll(async () => { await base?.cerrar() })

describe('fabricantes', () => {
  it('Dirección Técnica los crea (sin repetir por mayúsculas) y los asigna a un producto; nadie más', async () => {
    const a = await como(dt, async (c) => (await c.query(`select wms.crear_fabricante('  Laboratorios Mintlab  ') id`)).rows[0].id as string)
    const b = await como(dt, async (c) => (await c.query(`select wms.crear_fabricante('laboratorios mintlab') id`)).rows[0].id as string)
    expect(b).toBe(a)
    for (const quien of [sandra, charlie, aux, jt]) expect((await falla(como(quien, (c) => c.query(`select wms.crear_fabricante('Otro')`)))).message, quien).toMatch(/Solo Dirección Técnica/)
    expect((await falla(como(dt, (c) => c.query(`select wms.crear_fabricante('x')`)))).message).toMatch(/entre 2 y 120/)
    await como(dt, (c) => c.query('select wms.asignar_fabricante_producto($1, $2)', [base.productos.dapa, a]))
    expect((await uno('select fabricante_id from wms.producto_regulatorio where producto_id = $1', [base.productos.dapa])).fabricante_id).toBe(a)
    expect((await falla(como(sandra, (c) => c.query('select wms.asignar_fabricante_producto($1, $2)', [base.productos.dapa, a])))).message).toMatch(/Solo Dirección Técnica/)
    expect((await falla(como(dt, (c) => c.query('select wms.asignar_fabricante_producto($1, $2)', [randomUUID(), a])))).message).toMatch(/no tiene datos regulatorios/)
  })
})

describe('documentos con vigencia e historial', () => {
  it('el COA lo sube quien recibe (Jefe de Almacén, auxiliar, asistente de DT, DT); Transporte, auditoría y sin rol no', async () => {
    for (const quien of [charlie, aux, sandra, dt]) await subir(quien, 'COA', await lote())
    for (const quien of [jt, auditor, sinRol]) expect((await falla(subir(quien, 'COA', await lote()))).message, quien).toMatch(/No tienes permiso para adjuntar un COA|Sesión|permission/)
  })

  it('si el lote ya tiene COA vigente no se sube otro: se reemplaza, solo DT, con motivo, y la versión anterior queda en el historial', async () => {
    const l = await lote()
    const v1 = await subir(aux, 'COA', l, { nombre: 'coa-v1.pdf' })
    expect((await falla(subir(aux, 'COA', l))).message).toMatch(/Ya hay un documento vigente/)
    expect((await falla(subir(charlie, 'COA', l, { reemplaza: v1, motivo: 'x' }))).message).toMatch(/Solo Dirección Técnica reemplaza/)
    expect((await falla(subir(dt, 'COA', l, { reemplaza: v1 }))).message).toMatch(/Indica el motivo/)
    const v2 = await subir(dt, 'COA', l, { nombre: 'coa-v2.pdf', reemplaza: v1, motivo: 'El laboratorio corrigió el certificado' })
    expect((await q('select id from wms.documentos_vigentes where lote_id = $1', [l])).map((r) => r.id)).toEqual([v2])
    expect((await q('select nombre_archivo from wms.documentos_regulatorios where lote_id = $1 order by subido_en, id', [l])).map((r) => r.nombre_archivo).sort()).toEqual(['coa-v1.pdf', 'coa-v2.pdf'])
    expect((await falla(subir(dt, 'COA', l, { reemplaza: v1, motivo: 'otra vez' }))).message).toMatch(/ya fue reemplazado/)
    expect((await uno('select reemplaza_a, motivo_reemplazo from wms.documentos_regulatorios where id = $1', [v2]))).toEqual({ reemplaza_a: v1, motivo_reemplazo: 'El laboratorio corrigió el certificado' })
    // el reemplazo es del mismo alcance
    const otro = await lote()
    expect((await falla(subir(dt, 'COA', otro, { reemplaza: v2, motivo: 'no corresponde' }))).message).toMatch(/Ya hay un documento vigente|mismo alcance|no es del mismo/)
  })

  it('registro sanitario y BPM: solo Dirección Técnica sube y reemplaza; cada tipo cuelga de su alcance', async () => {
    const fab = await como(dt, async (c) => (await c.query(`select wms.crear_fabricante('Fabricante BPM ${randomUUID().slice(0, 4)}') id`)).rows[0].id as string)
    for (const quien of [sandra, charlie, aux, jt]) {
      expect((await falla(subir(quien, 'REGISTRO_SANITARIO', base.productos.lizi))).message, quien).toMatch(/Solo Dirección Técnica sube o reemplaza el registro sanitario y el BPM/)
      expect((await falla(subir(quien, 'BPM', fab))).message, quien).toMatch(/Solo Dirección Técnica sube o reemplaza/)
    }
    const rs = await subir(dt, 'REGISTRO_SANITARIO', base.productos.lizi, { hasta: en(400) })
    const bpm = await subir(dt, 'BPM', fab, { hasta: en(200) })
    expect(await uno('select tipo, producto_id, lote_id, fabricante_id from wms.documentos_regulatorios where id = $1', [rs])).toEqual({ tipo: 'REGISTRO_SANITARIO', producto_id: base.productos.lizi, lote_id: null, fabricante_id: null })
    expect((await uno('select fabricante_id from wms.documentos_regulatorios where id = $1', [bpm])).fabricante_id).toBe(fab)
    expect((await falla(subir(dt, 'REGISTRO_SANITARIO', randomUUID()))).message).toMatch(/no tiene datos regulatorios/)
    expect((await falla(subir(dt, 'BPM', randomUUID()))).message).toMatch(/No encontramos ese fabricante/)
    expect((await falla(subir(dt, 'COA', randomUUID()))).message).toMatch(/No encontramos ese lote/)
    expect((await falla(subir(dt, 'XYZ', fab))).message).toMatch(/Tipo de documento no válido/)
  })

  it('la vigencia no puede terminar antes de empezar; el archivo trae hash válido; nada se edita ni se borra; el cuerpo de la base impone un solo alcance', async () => {
    const l = await lote()
    expect((await falla(subir(dt, 'COA', l, { desde: en(10), hasta: en(5) }))).message).toMatch(/no puede vencer antes de empezar/)
    expect((await falla(como(dt, (c) => c.query(`select wms.subir_documento_regulatorio('COA', $1, 'a.pdf', 'r', 'no-es-hash', 10)`, [l])))).message).toMatch(/hash_sha256|check/i)
    const id = await subir(dt, 'COA', l)
    expect((await falla(base.admin.query(`update wms.documentos_regulatorios set nombre_archivo = 'x' where id = $1`, [id]))).message).toMatch(/inmutable/i)
    expect((await falla(base.admin.query(`delete from wms.documentos_regulatorios where id = $1`, [id]))).message).toMatch(/inmutable/i)
    expect((await falla(base.admin.query(`insert into wms.documentos_regulatorios (tipo, lote_id, producto_id, nombre_archivo, archivo_ref, hash_sha256, tamano_bytes, subido_por)
        values ('COA', $1, $2, 'a', 'b', $3, 1, $4)`, [l, base.productos.dapa, sha('z'), dt]))).message).toMatch(/check/i)
  })

  it('lo lee el personal; sin rol no ve nada; nadie escribe con DML directo', async () => {
    expect(await como(auditor, async (c) => (await c.query('select count(*)::int n from wms.documentos_regulatorios')).rows[0].n)).toBeGreaterThan(0)
    expect(await como(sinRol, async (c) => (await c.query('select count(*)::int n from wms.documentos_regulatorios')).rows[0].n)).toBe(0)
    expect(await como(sinRol, async (c) => (await c.query('select count(*)::int n from wms.documentos_vigentes')).rows[0].n)).toBe(0)
    expect((await falla(como(dt, (c) => c.query(`insert into wms.documentos_regulatorios (tipo, lote_id, nombre_archivo, archivo_ref, hash_sha256, tamano_bytes, subido_por)
        values ('COA', $1, 'a', 'b', $2, 1, $3)`, [randomUUID(), sha('q'), dt])))).message).toMatch(/permission denied|row-level/i)
  })
})

describe('perfil documental del cliente y estado documental', () => {
  const RUC = '20512345671'
  it('Dirección Técnica y el Jefe de Transporte definen qué exige un cliente; los demás no; se valida el RUC y las copias', async () => {
    await como(dt, (c) => c.query(`select wms.guardar_perfil_documental($1, true, true, false, 2, 'Pide original y copia')`, [RUC]))
    await como(jt, (c) => c.query(`select wms.guardar_perfil_documental($1, true, true, true, 1, null)`, [RUC]))
    expect(await uno('select exige_bpm, copias, nota from wms.perfil_documental_cliente where ruc = $1', [RUC])).toEqual({ exige_bpm: true, copias: 1, nota: null })
    for (const quien of [charlie, aux, sandra]) expect((await falla(como(quien, (c) => c.query(`select wms.guardar_perfil_documental($1, true, true, false, 1)`, [RUC])))).message, quien).toMatch(/Solo Dirección Técnica y el Jefe de Transporte/)
    expect((await falla(como(dt, (c) => c.query(`select wms.guardar_perfil_documental('123', true, true, false, 1)`)))).message).toMatch(/11 dígitos/)
    expect((await falla(como(dt, (c) => c.query(`select wms.guardar_perfil_documental($1, true, true, false, 0)`, [RUC])))).message).toMatch(/copias van de 1 a 10/)
  })

  it('sin perfil se exigen COA y registro sanitario; dice qué falta, qué venció y qué vence antes de la entrega', async () => {
    const prod = await productoNuevo()
    const l = await lote(prod) // producto sin documento de registro sanitario
    const antes = await estado(charlie, l)
    expect(antes.map((x) => [x.tipo, x.exigido, x.estado])).toEqual([['COA', true, 'FALTA'], ['REGISTRO_SANITARIO', true, 'FALTA'], ['BPM', false, 'NO_EXIGIDO']])
    await subir(aux, 'COA', l)
    const coa = await uno('select id from wms.documentos_vigentes where lote_id = $1', [l])
    expect((await estado(charlie, l)).find((x) => x.tipo === 'COA')!.estado).toBe('OK')
    // un COA con vigencia: vence antes de la entrega
    const l2 = await lote(prod)
    await subir(aux, 'COA', l2, { hasta: en(10) })
    expect((await estado(charlie, l2, null, en(5))).find((x) => x.tipo === 'COA')!.estado).toBe('OK')
    expect((await estado(charlie, l2, null, en(15))).find((x) => x.tipo === 'COA')!.estado).toBe('VENCE_ANTES_DE_ENTREGA')
    // un registro sanitario vencido
    const prod2 = await productoNuevo()
    await subir(dt, 'REGISTRO_SANITARIO', prod2, { desde: en(-100), hasta: en(-1) })
    const l3 = await lote(prod2)
    expect((await estado(charlie, l3)).find((x) => x.tipo === 'REGISTRO_SANITARIO')!.estado).toBe('VENCIDO')
    expect(coa.id).toBeTruthy()
  })

  it('con el perfil del cliente: si exige BPM y el fabricante no tiene uno, falta; si el perfil no exige COA, no se pide', async () => {
    const l = await lote(base.productos.dapa)
    const e = await estado(charlie, l, RUC)
    expect(e.find((x) => x.tipo === 'BPM')).toMatchObject({ exigido: true, estado: 'FALTA' })
    const fab = (await uno('select fabricante_id from wms.producto_regulatorio where producto_id = $1', [base.productos.dapa])).fabricante_id as string
    await subir(dt, 'BPM', fab, { hasta: en(300) })
    expect((await estado(charlie, l, RUC)).find((x) => x.tipo === 'BPM')!.estado).toBe('OK')
    await como(dt, (c) => c.query(`select wms.guardar_perfil_documental('20999999999', false, true, false, 1)`))
    expect((await estado(charlie, l, '20999999999')).find((x) => x.tipo === 'COA')).toMatchObject({ exigido: false, estado: 'NO_EXIGIDO' })
    expect((await falla(estado(sinRol, l))).message).toMatch(/Sin acceso/)
  })
})

describe('lotes sin COA', () => {
  it('lista los lotes con stock que no tienen COA vigente, y deja de listar el que ya lo tiene', async () => {
    const { sembrarStock } = await import('./helpers')
    const s = await sembrarStock(base, { posicion: 'F-1.1', producto: base.productos.dapa, lote: `SIN-COA-${randomUUID().slice(0, 4)}`, propietario: 'LOGISSA', cantidad: 7 })
    const ver = (quien: string) => como(quien, async (c) => (await c.query('select * from wms.lotes_sin_coa()')).rows as { lote_id: string; unidades: number }[])
    expect((await ver(charlie)).find((x) => x.lote_id === s.loteId)).toMatchObject({ unidades: 7 })
    await subir(aux, 'COA', s.loteId)
    expect((await ver(charlie)).find((x) => x.lote_id === s.loteId)).toBeUndefined()
    expect((await falla(ver(sinRol))).message).toMatch(/Sin acceso/)
  })
})

describe('alertas de vigencia', () => {
  it('avisa a Dirección Técnica de un documento vencido o por vencer, una sola vez por documento', async () => {
    const l = await lote()
    const venc = await subir(dt, 'COA', l, { desde: en(-50), hasta: en(-2) })
    const l2 = await lote()
    const pv = await subir(dt, 'COA', l2, { hasta: en(10) })
    const l3 = await lote()
    await subir(dt, 'COA', l3, { hasta: en(200) }) // lejos: sin aviso
    const nA = await como(charlie, async (c) => (await c.query('select wms.revisar_documentos_regulatorios() n')).rows[0].n as number)
    expect(nA).toBeGreaterThanOrEqual(2)
    await como(charlie, (c) => c.query('select wms.revisar_documentos_regulatorios()'))
    const a = await q(`select clave, destinatario_rol, mensaje from wms.alertas where tipo = 'DOCUMENTO_VENCIDO' and clave in ($1, $2)`, [`doc:${venc}:v`, `doc:${pv}:pv`])
    expect(a).toHaveLength(2)
    expect(a.every((x) => x.destinatario_rol === 'direccion_tecnica')).toBe(true)
    expect(a.find((x) => x.clave.endsWith(':v'))!.mensaje).toMatch(/venció el/)
    expect(a.find((x) => x.clave.endsWith(':pv'))!.mensaje).toMatch(/vence el .* \(en 10 días\)/)
    expect((await falla(como(sinRol, (c) => c.query('select wms.revisar_documentos_regulatorios()')))).message).toMatch(/Sin permiso/)
  })
})

describe('carga masiva de COA', () => {
  const item = (nombre: string, extra: Record<string, unknown> = {}) => ({ nombre, ref: `coa/${randomUUID()}.pdf`, hash: sha(randomUUID()), bytes: 2048, ...extra })
  const cargar = (quien: string, items: unknown[]) => como(quien, async (c) => (await c.query('select wms.registrar_carga_coa($1::jsonb) r', [JSON.stringify(items)])).rows[0].r as Record<string, number | string>)
  const items = (carga: string) => q('select * from wms.cargas_coa_items where carga_id = $1 order by nombre_archivo', [carga])

  it('lo relacionado se importa como COA vigente; lo demás queda por revisar con su motivo; el mismo archivo no se carga dos veces; un lote con COA no se pisa', async () => {
    const a = await lote(); const b = await lote(); const c3 = await lote(); const conCoa = await lote(); await subir(dt, 'COA', conCoa)
    const repetido = item('repetido.pdf', { lote_id: c3 })
    const r = await cargar(charlie, [item('a.pdf', { lote_id: a }), item('b.pdf', { lote_id: b }), item('sin-lote.pdf', { motivo: 'No encontré un lote en el nombre.', candidatos: [{ lote_id: a, lote: 'X', producto: 'Y' }] }),
      item('pisa.pdf', { lote_id: conCoa }), repetido, { ...repetido, nombre: 'repetido-otra-vez.pdf' }])
    expect(r).toMatchObject({ total: 6, importados: 3, por_revisar: 2, duplicados: 1 })
    const f = await items(r.carga_id as string)
    const por = (n: string) => f.find((x) => x.nombre_archivo === n)!
    expect(por('a.pdf')).toMatchObject({ estado: 'IMPORTADO', lote_id: a })
    expect(por('sin-lote.pdf')).toMatchObject({ estado: 'POR_REVISAR', motivo: 'No encontré un lote en el nombre.', lote_id: null })
    expect(por('pisa.pdf')).toMatchObject({ estado: 'POR_REVISAR', motivo: expect.stringMatching(/ya tiene un COA vigente/) })
    expect(por('repetido-otra-vez.pdf')).toMatchObject({ estado: 'DUPLICADO' })
    expect((await uno(`select count(*)::int n from wms.documentos_vigentes where tipo = 'COA' and lote_id = $1`, [a])).n).toBe(1)
    expect((await uno('select documento_id from wms.cargas_coa_items where id = $1', [por('a.pdf').id])).documento_id).toBeTruthy()
  })

  it('asignar a mano un archivo por revisar crea el COA; descartar pide motivo; lo resuelto no se vuelve a resolver; el lote con COA no se pisa', async () => {
    const l = await lote(); const ocupado = await lote(); await subir(dt, 'COA', ocupado)
    const r = await cargar(sandra, [item('por-revisar-1.pdf'), item('por-revisar-2.pdf'), item('por-revisar-3.pdf')])
    const [i1, i2, i3] = await items(r.carga_id as string)
    const doc = await como(charlie, async (c) => (await c.query('select wms.asignar_item_coa($1, $2) d', [i1.id, l])).rows[0].d as string)
    expect(await uno('select estado, lote_id, documento_id from wms.cargas_coa_items where id = $1', [i1.id])).toEqual({ estado: 'IMPORTADO', lote_id: l, documento_id: doc })
    expect((await falla(como(charlie, (c) => c.query('select wms.asignar_item_coa($1, $2)', [i1.id, l])))).message).toMatch(/ya se resolvió/)
    expect((await falla(como(charlie, (c) => c.query('select wms.asignar_item_coa($1, $2)', [i2.id, ocupado])))).message).toMatch(/ya tiene un COA vigente/)
    expect((await falla(como(charlie, (c) => c.query('select wms.descartar_item_coa($1, $2)', [i2.id, '  '])))).message).toMatch(/Indica por qué/)
    await como(charlie, (c) => c.query('select wms.descartar_item_coa($1, $2)', [i2.id, 'No es un COA: es una factura']))
    expect(await uno('select estado, motivo from wms.cargas_coa_items where id = $1', [i2.id])).toEqual({ estado: 'DESCARTADO', motivo: 'No es un COA: es una factura' })
    expect((await uno('select estado from wms.cargas_coa_items where id = $1', [i3.id])).estado).toBe('POR_REVISAR')
  })

  it('permisos: cargan y resuelven DT, Jefe de Almacén y la asistente; el auxiliar, Transporte y quien no tiene rol no; entradas mal formadas se rechazan', async () => {
    for (const quien of [aux, jt, sinRol, auditor]) expect((await falla(cargar(quien, [item('x.pdf')]))).message, quien).toMatch(/No tienes permiso para cargar COA|Sesión|permission/)
    await cargar(dt, [item('dt.pdf')])
    expect((await falla(cargar(charlie, []))).message).toMatch(/No hay archivos/)
    expect((await falla(cargar(charlie, [{ nombre: 'a.pdf', ref: 'r', hash: 'malo', bytes: 5 }]))).message).toMatch(/nombre, ruta, tamaño y hash/)
    expect((await falla(cargar(charlie, [{ nombre: 'a.pdf', ref: 'r', hash: sha('z'), bytes: 0 }]))).message).toMatch(/nombre, ruta, tamaño y hash/)
    const r = await cargar(charlie, [item('solo.pdf')])
    const [it] = await items(r.carga_id as string)
    for (const quien of [aux, jt]) expect((await falla(como(quien, (c) => c.query('select wms.descartar_item_coa($1, $2)', [it.id, 'x'])))).message, quien).toMatch(/No tienes permiso para resolver/)
  })

  it('la migración 0016 es re-ejecutable', async () => {
    const { SQL } = await import('./helpers')
    await base.admin.query(SQL.m0016()); await base.admin.query(SQL.m0016())
    expect((await uno('select count(*)::int n from wms.documentos_regulatorios')).n).toBeGreaterThan(0)
  })
})
