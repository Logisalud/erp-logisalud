// Piloto PIL-8 (migración 0041): los productos los crea Compras; el WMS los completa. En modo piloto el WMS no escribe en el catálogo (ni crea productos ni toca presentación o
// principio activo) y un producto con datos regulatorios incompletos está «pendiente de Dirección Técnica»: no se aprueban lotes suyos. Dos rutas de migraciones: sin la 0008
// (la ventana) y con la 0008 aplicada AL FINAL (go-live), que no debe borrar nada de lo posterior.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, SQL, crearBaseDePrueba, falla } from './helpers'
import { ayudasDeIngreso } from './ingreso-ayudas'

const j = JSON.stringify
const rutas: [string, { piloto: boolean; con0008: boolean }][] = [
  ['ventana del piloto (sin la 0008)', { piloto: true, con0008: false }],
  ['sin 0008 y luego la 0008 al final (go-live)', { piloto: true, con0008: true }],
]

describe.each(rutas)('PIL-8 · %s', (_nombre, opciones) => {
  let base: BaseDePrueba
  beforeAll(async () => { base = await crearBaseDePrueba(opciones) }, 120_000)
  afterAll(async () => { await base?.cerrar() })
  const P = () => base.personas
  const foto = async () => (await base.admin.query(`select md5(string_agg(t::text, '|' order by t::text)) m from catalogo.productos t`)).rows[0].m as string
  const crear = (quien: string, codigo: string) => base.como(quien, (c) => c.query(`select wms.crear_producto($1, 'Producto nuevo', 'Caja x 30', 'Marca', 'Principio', 'TABLETA', 'EG-1', '2031-01-01', 'Lab', 'Tableta', '10 mg', 'Menos de 30 C') id`, [codigo]))
  const editar = (quien: string, id: string, datos: object) => base.como(quien, (c) => c.query('select wms.editar_regulatorio($1, $2::jsonb, $3) n', [id, j(datos), 'Corrección']))

  it('en modo piloto crear un producto se rechaza (Sandra, Katia y el Administrador) y el catálogo no cambia', async () => {
    const antes = await foto()
    for (const q of [P().sandra.id, P().katia.id, P().admin.id]) expect((await falla(crear(q, 'PIL8-' + q.slice(0, 4)))).message).toMatch(/los productos se crean en Compras/)
    expect(await foto()).toBe(antes)
  })

  it('en modo piloto presentación y principio activo no se editan desde el WMS; los demás datos regulatorios sí', async () => {
    const antes = await foto()
    for (const dato of [{ presentacion: 'Caja x 60' }, { principio_activo: 'Otro' }, { presentacion: 'X', concentracion: '20 mg' }]) {
      expect((await falla(editar(P().katia.id, base.productos.dapa, dato))).message).toMatch(/se corrigen en Compras/)
    }
    expect(await foto()).toBe(antes)
    expect((await editar(P().sandra.id, base.productos.dapa, { concentracion: '20 mg' })).rows[0].n).toBe(1)
    expect((await editar(P().katia.id, base.productos.dapa, { sin_material_envase: 'true' })).rows[0].n).toBe(1)   // el parche de la 0040 sigue vivo, con o sin la 0008 al final
    await editar(P().katia.id, base.productos.dapa, { sin_material_envase: 'false' })
    expect(await foto()).toBe(antes)
  })

  it('un producto de Compras sin datos regulatorios completos está pendiente de Dirección Técnica: no se aprueban lotes suyos; completo, sí', async () => {
    const a = ayudasDeIngreso(base)
    const x = await a.compra({ producto: base.productos.dapa, cantidad: 3, lote: 'L-PIL8' })
    await a.llenar(x.org)
    await base.admin.query(`update wms.producto_regulatorio set fabricante = null where producto_id = $1`, [base.productos.dapa])
    expect((await base.admin.query('select wms.producto_completo($1) c', [base.productos.dapa])).rows[0].c).toBe(false)
    expect((await falla(a.decidir(x.org, 'APROBADO'))).message).toMatch(/pendiente de Dirección Técnica: faltan sus datos regulatorios/)
    await editar(P().sandra.id, base.productos.dapa, { fabricante: 'Laboratorio de prueba' })
    expect((await base.admin.query('select wms.producto_completo($1) c', [base.productos.dapa])).rows[0].c).toBe(true)
    await a.decidir(x.org, 'APROBADO')
    expect((await a.saldosDe(x.ing)).some((s) => s.estado === 'APROBADO')).toBe(true)
  })

  it('un producto sin fila regulatoria no está completo, y cada dato vacío lo deja incompleto', async () => {
    const id = (await base.admin.query(`insert into catalogo.productos (codigo, descripcion, unidad_medida) values ('PIL8-SIN', 'Sin datos', 'UND') returning id`)).rows[0].id
    expect((await base.admin.query('select wms.producto_completo($1) c', [id])).rows[0].c).toBe(false)
    await base.admin.query(`insert into wms.producto_regulatorio (producto_id, registro_sanitario, rs_vence, estado_validacion, creado_por, validado_por, validado_en)
      values ($1, 'EG-9', '2031-01-01', 'VALIDADO', $2, $2, now())`, [id, P().katia.id])
    expect((await base.admin.query('select wms.producto_completo($1) c', [id])).rows[0].c).toBe(true)   // el relleno de pruebas completó los otros cuatro
    for (const col of ['registro_sanitario', 'rs_vence', 'fabricante', 'forma_presentacion', 'concentracion', 'condicion_almacenamiento']) {
      const antes = (await base.admin.query(`select ${col} v from wms.producto_regulatorio where producto_id = $1`, [id])).rows[0].v
      await base.admin.query(`update wms.producto_regulatorio set ${col} = null where producto_id = $1`, [id])
      expect((await base.admin.query('select wms.producto_completo($1) c', [id])).rows[0].c, col).toBe(false)
      await base.admin.query(`update wms.producto_regulatorio set ${col} = $2 where producto_id = $1`, [id, antes])
    }
  })
})

describe('PIL-8 · go-live (0008 al final, modo piloto apagado)', () => {
  let base: BaseDePrueba
  beforeAll(async () => { base = await crearBaseDePrueba({ piloto: false, con0008: true }) }, 120_000)
  afterAll(async () => { await base?.cerrar() })
  it('Sandra y Katia vuelven a editar presentación y principio activo con historial (D-38) y lo de la 0040 sigue en su lugar', async () => {
    const editar = (id: string, datos: object) => base.como(base.personas.sandra.id, (c) => c.query('select wms.editar_regulatorio($1, $2::jsonb, $3) n', [id, j(datos), 'Corrección de la ficha']))
    expect((await editar(base.productos.dapa, { presentacion: 'Caja x 60', principio_activo: 'Dapagliflozina' })).rows[0].n).toBe(2)
    expect((await base.admin.query('select presentacion from catalogo.productos where id = $1', [base.productos.dapa])).rows[0].presentacion).toBe('Caja x 60')
    const h = (await base.admin.query(`select campo, despues from wms.producto_regulatorio_cambios where producto_id = $1 and campo in ('presentacion','principio_activo') order by id`, [base.productos.dapa])).rows
    expect(h).toEqual([{ campo: 'presentacion', despues: 'Caja x 60' }, { campo: 'principio_activo', despues: 'Dapagliflozina' }])
    const def = (await base.admin.query(`select pg_get_functiondef('wms.editar_regulatorio(uuid, jsonb, text)'::regprocedure) d`)).rows[0].d as string
    for (const marca of ['sin_material_envase', 'se corrigen en Compras', 'v_catalogo', 'por_validar']) expect(def, marca).toContain(marca)
  })
  it('re-aplicar la 0008 no duplica el parche', async () => {
    await base.admin.query(SQL.m0008())
    const def = (await base.admin.query(`select pg_get_functiondef('wms.editar_regulatorio(uuid, jsonb, text)'::regprocedure) d`)).rows[0].d as string
    expect(def.match(/v_catalogo text\[\]/g)).toHaveLength(1)
  })
})
