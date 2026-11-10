// Fase 4 · P3 (migración 0042): carga de ENSAYO del piloto. Marca «piloto», informe de validación obligatorio antes de cargar, mismo flujo que la carga definitiva.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPropietario } from './helpers'

let base: BaseDePrueba
let logissa: string
let posAprobado: string
const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
const como = <T>(id: string, fn: (c: import('pg').Client) => Promise<T>) => base.como(id, fn)
const f = (extra: Record<string, unknown> = {}) => ({ producto: 'T-DAPA', lote: 'ENS-1', vence: '2029-05-31', propietario: 'LOGISSA', posicion: posAprobado, estado: 'APROBADO', cantidad: 20, ...extra })
const informar = (quien: string, filas: object[], veredicto = 'LISTA') => como(quien, async (c) => (await c.query('select wms.registrar_informe_carga($1::jsonb, $2) id', [JSON.stringify(filas), veredicto])).rows[0].id as string)
const cargar = (quien: string, filas: object[]) => como(quien, async (c) => (await c.query('select wms.crear_carga_ensayo($1::jsonb, $2) id', [JSON.stringify(filas), 'Ensayo'])).rows[0].id as string)

beforeAll(async () => {
  base = await crearBaseDePrueba({ piloto: true })
  logissa = await idPropietario(base.admin, 'LOGISSA')
  posAprobado = (await uno(`select p.codigo from wms.posiciones p where p.tipo_area = 'APROBADOS' and p.activa and wms.posicion_acepta(p.id, $1, current_date) order by p.codigo limit 1`, [logissa])).codigo
})
afterAll(async () => { await base?.cerrar() })

describe('carga de ensayo del piloto', () => {
  it('sin informe no se carga; el informe es de ESE archivo, de ESA persona y debe decir «Lista»', async () => {
    const filas = [f()]
    expect((await falla(cargar(base.personas.admin.id, filas))).message).toMatch(/Primero arma el informe/)
    await informar(base.personas.admin.id, [f({ lote: 'OTRO' })])
    expect((await falla(cargar(base.personas.admin.id, filas))).message).toMatch(/Primero arma el informe/)   // informe de otro archivo
    await informar(base.personas.katia.id, filas)
    expect((await falla(cargar(base.personas.admin.id, filas))).message).toMatch(/Primero arma el informe/)    // informe de otra persona
    await informar(base.personas.admin.id, filas, 'NO_LISTA')
    expect((await falla(cargar(base.personas.admin.id, filas))).message).toMatch(/Primero arma el informe/)    // veredicto «no lista»
  })
  it('un informe «Lista» de un archivo con errores lo asienta la base como NO_LISTA (el cliente no puede mentir)', async () => {
    const mala = [f({ producto: 'NO-EXISTE' })]
    await informar(base.personas.admin.id, mala, 'LISTA')
    expect((await uno(`select veredicto from wms.cargas_informes order by en desc limit 1`)).veredicto).toBe('NO_LISTA')
    expect((await falla(cargar(base.personas.admin.id, mala))).message).toMatch(/Primero arma el informe/)
  })
  it('con informe «Lista» la carga nace marcada «piloto», Dirección Técnica la confirma y el stock queda en el libro', async () => {
    const filas = [f({ lote: 'ENS-OK', cantidad: 12 })]
    await informar(base.personas.admin.id, filas)
    const id = await cargar(base.personas.admin.id, filas)
    expect((await uno('select piloto, estado from wms.cargas_iniciales where id = $1', [id]))).toMatchObject({ piloto: true, estado: 'BORRADOR' })
    await como(base.personas.katia.id, (c) => c.query('select wms.confirmar_carga_inicial($1)', [id]))
    expect(Number((await uno(`select coalesce(sum(s.cantidad),0)::int n from wms.saldos s join wms.lotes l on l.id = s.lote_id where l.codigo = 'ENS-OK'`)).n)).toBe(12)
    expect((await q('select * from wms.verificar_saldos()')).length).toBe(0)
  })
  it('la marca «piloto» no se cambia, la constancia de informes solo se agrega y crear_carga_inicial ya no se llama directo', async () => {
    const id = (await uno('select id from wms.cargas_iniciales limit 1')).id
    expect((await falla(base.admin.query('update wms.cargas_iniciales set piloto = false where id = $1', [id]))).message).toMatch(/no se cambia/)
    expect((await falla(base.admin.query('delete from wms.cargas_informes'))).message).toMatch(/solo admite agregar/)
    expect((await falla(como(base.personas.admin.id, (c) => c.query('select wms.crear_carga_inicial($1::jsonb, null)', [JSON.stringify([f()])])))).code).toBe('42501')
  })
  it('sin permiso (jefe de almacén) ni el informe ni la carga', async () => {
    expect((await falla(informar(base.personas.charlie.id, [f()]))).code).toBe('42501')
    expect((await falla(cargar(base.personas.charlie.id, [f()]))).code).toBe('42501')
  })
  it('fuera del piloto (go-live) la carga definitiva nace sin la marca; el flujo es el mismo', async () => {
    await base.admin.query(`update wms.parametros set valor = 'no' where clave = 'modo_piloto'`)
    try {
      const filas = [f({ lote: 'DEF-1' })]
      await informar(base.personas.admin.id, filas)
      const id = await cargar(base.personas.admin.id, filas)
      expect((await uno('select piloto from wms.cargas_iniciales where id = $1', [id])).piloto).toBe(false)
    } finally { await base.admin.query(`update wms.parametros set valor = 'si' where clave = 'modo_piloto'`) }
  })
})
