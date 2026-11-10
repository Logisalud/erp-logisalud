// Piloto · errores de la demo (E-1 y E-2): un movimiento interno solo va a posiciones del MISMO propietario del lote (o a áreas compartidas
// compatibles con su estado), y el motivo «Salida de Cuarentena» solo saca de Cuarentena hacia Aprobados del mismo propietario.
// La base de datos es la última palabra: lo que la pantalla filtra, la base también lo rechaza.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPosicion, idPropietario, sembrarStock } from './helpers'
import { ayudasDeIngreso } from './ingreso-ayudas'

let base: BaseDePrueba
let a: ReturnType<typeof ayudasDeIngreso>
beforeAll(async () => { base = await crearBaseDePrueba(); a = ayudasDeIngreso(base) }, 120_000)
afterAll(async () => { await base?.cerrar() })

const auxiliar = async () => { const id = randomUUID(); await base.admin.query('insert into auth.users (id) values ($1)', [id]); await base.admin.query(`insert into wms.usuario_roles (user_id, rol) values ($1, 'auxiliar')`, [id]); return id }
const mover = async (quien: string, desdeId: string, hasta: string, loteId: string, procedencia: string, estado: string, cantidad: number, motivo: string) =>
  base.como(quien, (c) => c.query('select wms.ejecutar_movimiento($1::jsonb, $2) as id', [JSON.stringify([{
    desde_posicion_id: desdeId, hasta_posicion_id: hasta, lote_id: loteId, estado, procedencia_id: procedencia, cantidad,
  }]), motivo]))
/** Una posición de rack Aprobados con asignación vigente a ese propietario (distinta de `excepto`). */
const rackDe = async (propietario: string, excepto: string[] = []) => (await base.admin.query(
  `select p.id, p.codigo from wms.posiciones p join wms.asignaciones_posicion s on s.posicion_id = p.id
    where p.tipo_area = 'APROBADOS' and p.activa and s.propietario_id = $1 and s.desde <= current_date and (s.hasta is null or current_date < s.hasta)
      and not exists (select 1 from wms.saldos x where x.posicion_id = p.id and x.cantidad > 0) and p.codigo <> all ($2) order by p.codigo limit 1`, [propietario, excepto])).rows[0] as { id: string; codigo: string }

describe('E-1 · el destino de un movimiento es del mismo propietario del lote', () => {
  it('un rack asignado a OTRO propietario, o sin asignación, se rechaza; el del propietario del lote y las áreas compartidas compatibles sí', async () => {
    const aux = await auxiliar()
    const diphasac = await idPropietario(base.admin, 'DIPHASAC'); const logissa = await idPropietario(base.admin, 'LOGISSA')
    const s = await sembrarStock(base, { posicion: 'A-15.1', producto: base.productos.dapa, lote: 'E1-1', propietario: 'DIPHASAC', cantidad: 10 })
    const ajeno = await rackDe(logissa)
    expect(ajeno, 'el seed trae racks de Logissa').toBeTruthy()
    const libreDeNadie = (await base.admin.query(`select p.id from wms.posiciones p where p.tipo_area = 'APROBADOS' and p.activa
      and not exists (select 1 from wms.asignaciones_posicion s where s.posicion_id = p.id) limit 1`)).rows[0]?.id as string | undefined
    expect((await falla(mover(aux, s.posicionId, ajeno.id, s.loteId, s.procedencia, 'APROBADO', 1, 'Reorganización'))).message).toMatch(/no acepta stock de ese propietario/)
    if (libreDeNadie) expect((await falla(mover(aux, s.posicionId, libreDeNadie, s.loteId, s.procedencia, 'APROBADO', 1, 'Reorganización'))).message).toMatch(/no acepta stock de ese propietario/)
    const propio = await rackDe(diphasac, ['A-15.1'])
    await mover(aux, s.posicionId, propio.id, s.loteId, s.procedencia, 'APROBADO', 1, 'Reorganización')
    expect((await base.admin.query(`select count(*)::int n from wms.ordenes_movimiento where motivo = 'Reorganización' and ejecutor_id = $1`, [aux])).rows[0].n).toBe(1)
  })
})

describe('E-2 · «Salida de Cuarentena»: sale de Cuarentena y entra a Aprobados del mismo propietario', () => {
  /** Lote Aprobado de Logissa que quedó en una posición de Cuarentena (A-6): el caso real de «salida de cuarentena». */
  async function aprobadoEnCuarentena(lote: string) {
    const x = await a.compra({ producto: await a.productoNuevo(), cantidad: 20, lote })
    await a.llenar(x.org)
    await a.decidir(x.org, 'APROBADO')
    const f = (await base.admin.query(`select s.posicion_id, s.lote_id, s.procedencia_id, s.estado, ps.tipo_area from wms.saldos s join wms.posiciones ps on ps.id = s.posicion_id
      join wms.ingreso_lotes il on il.id = s.procedencia_id where il.ingreso_id = $1 and s.cantidad > 0`, [x.ing])).rows[0]
    return { posicionId: f.posicion_id as string, loteId: f.lote_id as string, procedencia: f.procedencia_id as string, tipoArea: f.tipo_area as string, estado: f.estado as string }
  }

  it('desde Cuarentena hacia un rack Aprobados de Logissa: se puede', async () => {
    const aux = await auxiliar(); const logissa = await idPropietario(base.admin, 'LOGISSA')
    const f = await aprobadoEnCuarentena('E2-OK')
    expect(f).toMatchObject({ tipoArea: 'CUARENTENA', estado: 'APROBADO' })
    const rack = await rackDe(logissa)
    await mover(aux, f.posicionId, rack.id, f.loteId, f.procedencia, 'APROBADO', 5, 'Salida de Cuarentena')
  })

  it('el origen que NO es de Cuarentena se rechaza (un rack Aprobados no «sale de Cuarentena»)', async () => {
    const aux = await auxiliar(); const logissa = await idPropietario(base.admin, 'LOGISSA')
    const rack = await rackDe(logissa)
    const s = await sembrarStock(base, { posicion: rack.codigo, producto: base.productos.lizi, lote: 'E2-RACK', propietario: 'LOGISSA', cantidad: 10 })
    const otro = await rackDe(logissa, [rack.codigo])
    expect((await falla(mover(aux, s.posicionId, otro.id, s.loteId, s.procedencia, 'APROBADO', 1, 'Salida de Cuarentena'))).message).toMatch(/Salida de Cuarentena.*Cuarentena/)
    // con otro motivo el mismo movimiento es válido
    await mover(aux, s.posicionId, otro.id, s.loteId, s.procedencia, 'APROBADO', 1, 'Reorganización')
  })

  it('el destino que NO es Aprobados se rechaza (otra Cuarentena, aunque sea compartida)', async () => {
    const aux = await auxiliar()
    const f = await aprobadoEnCuarentena('E2-DEST')
    const otraCuarentena = await idPosicion(base.admin, 'A-7')
    expect((await falla(mover(aux, f.posicionId, otraCuarentena, f.loteId, f.procedencia, 'APROBADO', 1, 'Salida de Cuarentena'))).message).toMatch(/Salida de Cuarentena.*Aprobados/)
  })

  it('el destino de OTRO propietario se rechaza también con este motivo', async () => {
    const aux = await auxiliar(); const diphasac = await idPropietario(base.admin, 'DIPHASAC')
    const f = await aprobadoEnCuarentena('E2-AJENO')
    const ajeno = await rackDe(diphasac)
    expect((await falla(mover(aux, f.posicionId, ajeno.id, f.loteId, f.procedencia, 'APROBADO', 1, 'Salida de Cuarentena'))).message).toMatch(/no acepta stock de ese propietario/)
  })

  it('el motivo se reconoce sin importar mayúsculas, tildes ni espacios de más', async () => {
    const aux = await auxiliar(); const logissa = await idPropietario(base.admin, 'LOGISSA')
    const s = await sembrarStock(base, { posicion: (await rackDe(logissa)).codigo, producto: base.productos.dapa, lote: 'E2-TXT', propietario: 'LOGISSA', cantidad: 4 })
    const otro = await rackDe(logissa, [(await base.admin.query('select codigo from wms.posiciones where id = $1', [s.posicionId])).rows[0].codigo])
    expect((await falla(mover(aux, s.posicionId, otro.id, s.loteId, s.procedencia, 'APROBADO', 1, '  salida  DE cuarentena '))).message).toMatch(/Salida de Cuarentena/)
  })
})
