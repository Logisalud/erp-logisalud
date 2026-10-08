// Datos regulatorios (D-37): solo Katia y Sandra los editan, sin segunda validación, con historial y motivo obligatorio.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla } from './helpers'

let base: BaseDePrueba
beforeAll(async () => { base = await crearBaseDePrueba() }, 60_000)
afterAll(async () => { await base?.cerrar() })
const P = () => base.personas

const alta = (quien: string, codigo: string, rs: string | null = 'EG-5001', vence: string | null = '2030-06-30') =>
  base.como(quien, async (c) => (await c.query(
    `select wms.crear_producto($1, 'Producto de prueba', 'Caja x 10', 'Marca', 'Principio', 'TABLETA', $2, $3, 'Fabricante', 'Tableta', '500 mg', 'Menos de 30 °C') as id`,
    [codigo, rs, vence])).rows[0].id as string)

const editar = (quien: string, id: string, datos: object, motivo: string | null = 'Renovación del registro') =>
  base.como(quien, (c) => c.query('select wms.editar_regulatorio($1, $2::jsonb, $3) as n', [id, JSON.stringify(datos), motivo]))

const historial = async (id: string) =>
  (await base.admin.query('select * from wms.producto_regulatorio_cambios where producto_id = $1 order by id', [id])).rows

describe('alta de producto', () => {
  it('Sandra crea el producto con sus datos regulatorios, ya vigentes y a su nombre', async () => {
    const id = await alta(P().sandra.id, 'ALTA-1')
    const r = (await base.admin.query('select * from wms.producto_regulatorio where producto_id = $1', [id])).rows[0]
    expect(r).toMatchObject({ registro_sanitario: 'EG-5001', concentracion: '500 mg', condicion_almacenamiento: 'Menos de 30 °C', creado_por: P().sandra.id })
    const p = (await base.admin.query('select * from catalogo.productos where id = $1', [id])).rows[0]
    expect(p).toMatchObject({ codigo: 'ALTA-1', unidad_medida: 'TABLETA' })
  })

  it('Katia también da de alta; un auxiliar o el Jefe de Almacén no', async () => {
    await alta(P().katia.id, 'ALTA-K')
    expect((await falla(alta(P().aux.id, 'ALTA-2'))).code).toBe('42501')
    expect((await falla(alta(P().charlie.id, 'ALTA-3'))).code).toBe('42501')
  })

  it('el código no se repite; código y descripción son obligatorios', async () => {
    await alta(P().sandra.id, 'ALTA-4')
    const e = await falla(alta(P().sandra.id, 'ALTA-4'))
    expect(e.code).toBe('23505')
    expect((await falla(base.como(P().sandra.id, (c) => c.query(`select wms.crear_producto('  ', 'x')`)))).message).toMatch(/necesita código y descripción/)
  })

  it('con registro sanitario hace falta su vencimiento', async () => {
    expect((await falla(alta(P().sandra.id, 'ALTA-5', 'EG-1', null))).message).toMatch(/Falta el vencimiento/)
  })

  it('es atómico: si falla no queda un producto a medias', async () => {
    const antes = (await base.admin.query('select count(*)::int n from catalogo.productos')).rows[0].n
    await falla(base.como(P().sandra.id, (c) => c.query(`select wms.crear_producto('ATOM-1', 'Atómico', null, null, null, 'UND', null, 'no-es-fecha')`)))
    expect((await base.admin.query('select count(*)::int n from catalogo.productos')).rows[0].n).toBe(antes)
  })

  it('el alta deja su historial campo por campo con quién y por qué', async () => {
    const id = await alta(P().sandra.id, 'ALTA-6')
    const h = await historial(id)
    expect(h.map((x) => x.campo).sort()).toEqual(['concentracion', 'condicion_almacenamiento', 'fabricante', 'forma_presentacion', 'registro_sanitario', 'rs_vence'])
    expect(h.every((x) => x.antes === null && x.usuario === P().sandra.id && x.motivo === 'Alta del producto')).toBe(true)
  })
})

describe('edición de datos regulatorios', () => {
  it('Sandra y Katia tienen la misma autoridad y el cambio rige de inmediato (sin segunda validación)', async () => {
    const id = await alta(P().sandra.id, 'EDI-1')
    expect((await editar(P().sandra.id, id, { registro_sanitario: 'EG-7000' })).rows[0].n).toBe(1)
    expect((await editar(P().katia.id, id, { fabricante: 'Otro laboratorio' })).rows[0].n).toBe(1)
    const r = (await base.admin.query('select * from wms.producto_regulatorio where producto_id = $1', [id])).rows[0]
    expect(r).toMatchObject({ registro_sanitario: 'EG-7000', fabricante: 'Otro laboratorio', estado_validacion: 'VALIDADO' })
  })

  it('nadie más edita: ni el auxiliar, ni el Jefe de Almacén, ni compras', async () => {
    const id = await alta(P().sandra.id, 'EDI-2')
    for (const quien of [P().aux.id, P().charlie.id]) {
      expect((await falla(editar(quien, id, { fabricante: 'X' }))).code).toBe('42501')
    }
    expect((await base.admin.query('select fabricante from wms.producto_regulatorio where producto_id = $1', [id])).rows[0].fabricante).toBe('Fabricante')
  })

  it('el motivo es obligatorio', async () => {
    const id = await alta(P().sandra.id, 'EDI-3')
    expect((await falla(editar(P().sandra.id, id, { fabricante: 'X' }, null))).message).toMatch(/necesita su motivo/)
    expect((await falla(editar(P().sandra.id, id, { fabricante: 'X' }, '   '))).message).toMatch(/necesita su motivo/)
  })

  it('cada cambio guarda campo, valor anterior, valor nuevo, usuario, fecha y motivo; lo que no cambia no se registra', async () => {
    const id = await alta(P().sandra.id, 'EDI-4')
    await editar(P().katia.id, id, { registro_sanitario: 'EG-9999', rs_vence: '2032-12-31', fabricante: 'Fabricante' }, 'Renovación ante DIGEMID')
    const h = (await historial(id)).filter((x) => x.motivo === 'Renovación ante DIGEMID')
    expect(h.map((x) => x.campo).sort()).toEqual(['registro_sanitario', 'rs_vence'])
    const rs = h.find((x) => x.campo === 'registro_sanitario')
    expect(rs).toMatchObject({ antes: 'EG-5001', despues: 'EG-9999', usuario: P().katia.id })
    expect(rs.ts).toBeInstanceOf(Date)
  })

  it('solo se editan los campos regulatorios (presentación y principio activo son de Compras)', async () => {
    const id = await alta(P().sandra.id, 'EDI-5')
    expect((await falla(editar(P().sandra.id, id, { principio_activo: 'otro' }))).message).toMatch(/no se edita aquí/)
    expect((await falla(editar(P().sandra.id, id, { presentacion: 'otra' }))).message).toMatch(/no se edita aquí/)
  })

  it('no se puede quitar el vencimiento si queda un registro sanitario', async () => {
    const id = await alta(P().sandra.id, 'EDI-6')
    expect((await falla(editar(P().sandra.id, id, { rs_vence: null }))).message).toMatch(/Falta el vencimiento/)
  })

  it('el historial no se edita ni se borra, ni siquiera con acceso directo', async () => {
    const id = await alta(P().sandra.id, 'EDI-7')
    expect((await falla(base.admin.query('update wms.producto_regulatorio_cambios set motivo = $1 where producto_id = $2', ['x', id]))).message).toMatch(/no se (modifica|borra|edita)|inmutable|append/i)
    expect((await falla(base.admin.query('delete from wms.producto_regulatorio_cambios where producto_id = $1', [id]))).message).toMatch(/no se (modifica|borra|edita)|inmutable|append/i)
  })

  it('sin la función no hay escritura: el DML directo está cerrado para todos los usuarios', async () => {
    const id = await alta(P().sandra.id, 'EDI-8')
    for (const quien of [P().sandra.id, P().katia.id]) {
      const e = await falla(base.como(quien, (c) => c.query(`update wms.producto_regulatorio set fabricante = 'Directo' where producto_id = $1`, [id])))
      expect(e.code).toBe('42501')
    }
    expect((await falla(base.como(P().katia.id, (c) => c.query(`insert into wms.producto_regulatorio_cambios (producto_id, campo, usuario, motivo) values ($1, 'x', $2, 'x')`, [id, P().katia.id])))).code).toBe('42501')
  })

  it('queda en la auditoría con quién lo hizo', async () => {
    const id = await alta(P().sandra.id, 'EDI-9')
    await editar(P().katia.id, id, { fabricante: 'Auditado' })
    const a = await base.admin.query(`select actor from wms.audit_events where evento = 'regulatorio_editado' and entidad_id = $1`, [id])
    expect(a.rows[0].actor).toBe(P().katia.id)
  })
})
