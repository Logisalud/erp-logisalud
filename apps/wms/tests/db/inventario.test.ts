// Batch 3 (migración 0007): Kardex e historia del lote, movimientos internos (INV-02, D-15), conteos cíclicos con ajuste
// autorizado (INV-05) y carga inicial (D-09).
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPosicion, sembrarStock } from './helpers'

let base: BaseDePrueba
beforeAll(async () => { base = await crearBaseDePrueba() }, 60_000)
afterAll(async () => { await base?.cerrar() })
const P = () => base.personas

async function persona(rol: string): Promise<string> {
  const id = randomUUID()
  await base.admin.query('insert into auth.users (id) values ($1)', [id])
  await base.admin.query('insert into wms.usuario_roles (user_id, rol) values ($1, $2)', [id, rol])
  return id
}
const rpc = <T = unknown>(quien: string, sql: string, args: unknown[] = []) =>
  base.como(quien, async (c) => (await c.query(sql, args)).rows as T[])

/** Deja stock Aprobado de Diphasac y devuelve lo necesario para armar líneas de movimiento. */
async function stock(posicion: string, lote: string, cantidad = 10) {
  const s = await sembrarStock(base, { posicion, producto: base.productos.dapa, lote, propietario: 'DIPHASAC', cantidad })
  return { ...s, posicion }
}
const linea = (s: Awaited<ReturnType<typeof stock>>, hasta: string, cantidad: number) =>
  idPosicion(base.admin, hasta).then((h) => ({
    desde_posicion_id: s.posicionId, hasta_posicion_id: h, lote_id: s.loteId, estado: 'APROBADO', procedencia_id: s.procedencia, cantidad,
  }))
const preparar = async (quien: string, s: Awaited<ReturnType<typeof stock>>, hasta: string, cantidad: number, motivo = 'Acomodo') =>
  (await rpc<{ id: string }>(quien, 'select wms.preparar_movimiento($1::jsonb, $2) as id', [JSON.stringify([await linea(s, hasta, cantidad)]), motivo]))[0].id
const orden = async (id: string) => (await base.admin.query('select * from wms.ordenes_movimiento where id = $1', [id])).rows[0]

describe('Kardex e historia del lote', () => {
  it('solo entradas y salidas, con saldo corrido; el movimiento interno no aparece, pero sí en la historia', async () => {
    const aux1 = await persona('auxiliar')
    const aux2 = await persona('auxiliar')
    const s = await stock('A-15.1', 'KX-1', 10)
    const id = await preparar(aux1, s, 'A-16.1', 4)
    await rpc(P().charlie.id, 'select wms.autorizar_movimiento($1)', [id])
    await rpc(aux1, 'select wms.ejecutar_movimiento($1)', [id])
    await rpc(aux2, 'select wms.confirmar_movimiento($1)', [id])
    const k = await rpc<{ tipo_documento: string; entrada: number; salida: number; saldo: number }>(
      P().auditor.id, 'select * from wms.kardex_filas($1, $2) where not es_saldo_inicial', [base.productos.dapa, s.loteId])
    expect(k).toHaveLength(1)
    expect(k[0]).toMatchObject({ tipo_documento: 'Carga inicial', entrada: 10, salida: 0, saldo: 10 })
    const h = await rpc<{ tipo: string; delta: number; saldo_lote: number }>(P().auditor.id, 'select * from wms.historia_lote($1)', [s.loteId])
    expect(h.map((x) => x.tipo)).toEqual(['CARGA_INICIAL', 'MOVIMIENTO', 'MOVIMIENTO'])
    expect(h[h.length - 1].saldo_lote).toBe(10)
  })

  it('el saldo final del Kardex coincide con wms.saldos (solo del ledger)', async () => {
    const r = await base.admin.query(`
      select (select coalesce(sum(saldo), 0) from (select distinct on (1) 1, saldo from wms.kardex_filas($1) where not es_saldo_inicial order by 1, orden desc) x)::int as kardex,
             (select coalesce(sum(cantidad), 0) from wms.saldos where producto_id = $1)::int as saldos`, [base.productos.dapa])
    expect(r.rows[0].kardex).toBe(r.rows[0].saldos)
  })

  it('con rango de fechas arranca con el saldo inicial; una reversa aparece como fila vinculada', async () => {
    const s = await stock('A-17.1', 'KX-2', 7)
    const futuro = await rpc<{ saldo: number; es_saldo_inicial: boolean; tipo_documento: string }>(
      P().auditor.id, `select * from wms.kardex_filas($1, $2, null, current_date + 1, null)`, [base.productos.dapa, s.loteId])
    expect(futuro).toEqual([expect.objectContaining({ es_saldo_inicial: true, tipo_documento: 'Saldo inicial', saldo: 7 })])
    const mov = (await base.admin.query(`select movimiento_id from wms.partidas where lote_id = $1`, [s.loteId])).rows[0].movimiento_id
    await rpc(P().charlie.id, 'select wms.revertir_movimiento($1, $2)', [mov, 'Se cargó por error'])
    const k = await rpc<{ tipo_documento: string; es_reversa: boolean; salida: number; saldo: number }>(
      P().auditor.id, 'select * from wms.kardex_filas($1, $2) where not es_saldo_inicial', [base.productos.dapa, s.loteId])
    expect(k.map((x) => x.tipo_documento)).toEqual(['Carga inicial', 'Reversa de carga inicial'])
    expect(k[1]).toMatchObject({ es_reversa: true, salida: 7, saldo: 0 })
  })
})

describe('movimientos internos (INV-02, D-15)', () => {
  it('flujo completo: preparar → autorizar → ejecutar → otra persona verifica → el ledger guarda a las tres', async () => {
    const aux1 = await persona('auxiliar'); const aux2 = await persona('auxiliar')
    const s = await stock('A-14.1', 'MI-1', 10)
    const id = await preparar(aux1, s, 'A-16.1', 4)
    expect((await orden(id)).numero).toMatch(/^MI-\d{4}-\d{5}$/)
    // todavía no mueve nada
    expect((await base.admin.query(`select coalesce(sum(cantidad),0)::int n from wms.saldos where lote_id = $1 and posicion_id = $2`, [s.loteId, s.posicionId])).rows[0].n).toBe(10)
    await rpc(P().charlie.id, 'select wms.autorizar_movimiento($1)', [id])
    await rpc(aux1, 'select wms.ejecutar_movimiento($1)', [id])
    const mov = (await rpc<{ id: string }>(aux2, 'select wms.confirmar_movimiento($1) as id', [id]))[0].id
    const m = (await base.admin.query('select * from wms.movimientos where id = $1', [mov])).rows[0]
    expect(m).toMatchObject({ tipo: 'MOVIMIENTO', preparador_id: aux1, ejecutor_id: aux1, verificador_id: aux2 })
    expect((await orden(id)).estado).toBe('CONFIRMADO')
    expect((await base.admin.query(`select coalesce(sum(cantidad),0)::int n from wms.saldos where lote_id = $1 and posicion_id = $2`, [s.loteId, s.posicionId])).rows[0].n).toBe(6)
  })

  it('D-15: quien preparó o ejecutó no verifica', async () => {
    const aux1 = await persona('auxiliar'); const aux2 = await persona('auxiliar'); const aux3 = await persona('auxiliar')
    const s = await stock('A-15.1', 'MI-2', 10)
    const id = await preparar(aux1, s, 'A-16.1', 2)
    await rpc(P().charlie.id, 'select wms.autorizar_movimiento($1)', [id])
    await rpc(aux2, 'select wms.ejecutar_movimiento($1)', [id])
    expect((await falla(rpc(aux1, 'select wms.confirmar_movimiento($1)', [id]))).message).toMatch(/no puede ser quien preparó/)
    expect((await falla(rpc(aux2, 'select wms.confirmar_movimiento($1)', [id]))).message).toMatch(/no puede ser quien ejecutó/)
    await rpc(aux3, 'select wms.confirmar_movimiento($1)', [id])
    // y la base lo impide aunque se salten la función
    const e = await falla(base.admin.query(`update wms.ordenes_movimiento set verificador_id = preparador_id where id = $1`, [id]))
    expect(e.message).toMatch(/check constraint/i)
  })

  it('solo el Jefe autoriza; sin autorizar no se mueve; el verificador necesita permiso', async () => {
    const aux1 = await persona('auxiliar')
    const s = await stock('A-14.1', 'MI-3', 10)
    const id = await preparar(aux1, s, 'A-16.1', 1)
    expect((await falla(rpc(aux1, 'select wms.autorizar_movimiento($1)', [id]))).code).toBe('42501')
    expect((await falla(rpc(aux1, 'select wms.ejecutar_movimiento($1)', [id]))).message).toMatch(/autorizado/)
    expect((await falla(rpc(P().auditor.id, 'select wms.preparar_movimiento($1::jsonb, $2)', [JSON.stringify([await linea(s, 'A-16.1', 1)]), 'x']))).code).toBe('42501')
  })

  it('solo el personal de almacén verifica: Dirección Técnica no confirma movimientos', async () => {
    const aux1 = await persona('auxiliar')
    const s = await stock('A-14.1', 'MI-7', 10)
    const id = await preparar(aux1, s, 'A-16.1', 1)
    await rpc(P().charlie.id, 'select wms.autorizar_movimiento($1)', [id])
    await rpc(aux1, 'select wms.ejecutar_movimiento($1)', [id])
    expect((await falla(rpc(P().katia.id, 'select wms.confirmar_movimiento($1)', [id]))).code).toBe('42501')
  })

  it('con diferencia no se confirma ni se cuadra: queda abierta, avisa al Jefe y se reintenta o se anula', async () => {
    const aux1 = await persona('auxiliar'); const aux2 = await persona('auxiliar')
    const s = await stock('A-15.1', 'MI-4', 10)
    const id = await preparar(aux1, s, 'A-16.1', 3)
    await rpc(P().charlie.id, 'select wms.autorizar_movimiento($1)', [id])
    await rpc(aux1, 'select wms.ejecutar_movimiento($1)', [id])
    expect((await falla(rpc(aux2, 'select wms.registrar_diferencia_movimiento($1, $2)', [id, '  ']))).message).toMatch(/qué no coincide/)
    await rpc(aux2, 'select wms.registrar_diferencia_movimiento($1, $2)', [id, 'Faltan 2 cajas en el destino'])
    expect((await orden(id)).estado).toBe('CON_DIFERENCIA')
    expect((await base.admin.query(`select count(*)::int n from wms.alertas where tipo = 'MOVIMIENTO_CON_DIFERENCIA' and estado = 'ABIERTA' and clave = $1`, ['mov-dif:' + id])).rows[0].n).toBe(1)
    expect((await base.admin.query(`select coalesce(sum(cantidad),0)::int n from wms.saldos where lote_id = $1 and posicion_id = $2`, [s.loteId, s.posicionId])).rows[0].n).toBe(10)
    expect((await falla(rpc(aux1, 'select wms.resolver_movimiento($1, $2, $3)', [id, 'ANULAR', 'x']))).code).toBe('42501')
    await rpc(P().charlie.id, 'select wms.resolver_movimiento($1, $2, $3)', [id, 'REINTENTAR', 'Se vuelve a mover'])
    expect((await orden(id)).estado).toBe('AUTORIZADO')
    expect((await base.admin.query(`select estado from wms.alertas where clave = $1`, ['mov-dif:' + id])).rows[0].estado).toBe('ATENDIDA')
  })

  it('no se reservan dos veces las mismas unidades ni se mueve a una zona que no corresponde', async () => {
    const aux1 = await persona('auxiliar')
    const s = await stock('A-14.1', 'MI-5', 10)
    await preparar(aux1, s, 'A-16.1', 8)
    expect((await falla(preparar(aux1, s, 'A-16.1', 5))).message).toMatch(/No hay suficientes unidades/)
    expect((await falla(preparar(aux1, s, 'A-6', 1))).message).toMatch(/no admite unidades en estado APROBADO/)
    expect((await falla(preparar(aux1, s, 'F-1.1', 1))).message).toMatch(/sin asignación vigente/)
  })

  it('el contexto de orden no se puede usar fuera de confirmar_movimiento', async () => {
    const aux1 = await persona('auxiliar')
    const s = await stock('A-14.1', 'MI-6', 10)
    const e = await falla(base.como(aux1, async (c) => {
      await c.query(`select set_config('wms.orden_ctx', '{"orden":"${randomUUID()}"}', true)`)
      await c.query(`select wms.postear_movimiento('MOVIMIENTO', 'x', $1::jsonb)`, [JSON.stringify([
        { posicion_id: s.posicionId, producto_id: base.productos.dapa, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: s.procedencia, delta: -1 },
      ])])
    }))
    expect(e.message).toMatch(/Contexto de movimiento interno inválido/)
  })
})

describe('conteos cíclicos y ajustes (INV-05)', () => {
  async function conteoConDiferencia(codigoPos: string, lote: string, sistema = 10) {
    const s = await stock(codigoPos, lote, sistema)
    const conteo = (await rpc<{ id: string }>(P().charlie.id, 'select wms.programar_conteo(array[$1]::uuid[], $2) as id', [s.posicionId, 'Semana 41']))[0].id
    const linea = (await base.admin.query('select id from wms.conteo_lineas where conteo_id = $1', [conteo])).rows[0].id as string
    return { s, conteo, linea }
  }

  it('el contador no ve el saldo del sistema (ni leyendo la tabla ni por la función)', async () => {
    const aux1 = await persona('auxiliar')
    const { conteo, linea } = await conteoConDiferencia('A-25.1', 'CT-1')
    expect((await falla(rpc(aux1, 'select * from wms.conteo_lineas', []))).code).toBe('42501')
    const vista = await rpc<{ cantidad_sistema: number | null; puede_contar: boolean; conteo1: number | null }>(aux1, 'select * from wms.conteo_lineas_para($1)', [conteo])
    expect(vista[0].cantidad_sistema).toBeNull()
    expect(vista[0].puede_contar).toBe(true)
    await rpc(aux1, 'select wms.registrar_conteo($1, $2)', [linea, 9])
    const despues = await rpc<{ cantidad_sistema: number | null; mi_conteo: number | null }>(aux1, 'select * from wms.conteo_lineas_para($1)', [conteo])
    expect(despues[0]).toMatchObject({ cantidad_sistema: null, mi_conteo: 9 })
    // el Jefe lo ve recién cuando el primer conteo terminó
    const jefe = await rpc<{ cantidad_sistema: number | null }>(P().charlie.id, 'select * from wms.conteo_lineas_para($1)', [conteo])
    expect(jefe[0].cantidad_sistema).toBe(10)
  })

  it('el Jefe no ve el saldo antes del primer conteo', async () => {
    const { conteo } = await conteoConDiferencia('A-26.1', 'CT-2')
    const jefe = await rpc<{ cantidad_sistema: number | null }>(P().charlie.id, 'select * from wms.conteo_lineas_para($1)', [conteo])
    expect(jefe[0].cantidad_sistema).toBeNull()
  })

  it('coincide al primer conteo: no necesita más; cierra sin diferencias', async () => {
    const aux1 = await persona('auxiliar')
    const { conteo, linea } = await conteoConDiferencia('A-20.1', 'CT-3')
    expect((await rpc<{ r: string }>(aux1, 'select wms.registrar_conteo($1, 10) as r', [linea]))[0].r).toBe('COINCIDE')
    expect((await base.admin.query('select estado from wms.conteos where id = $1', [conteo])).rows[0].estado).toBe('EN_REVISION')
    await rpc(P().charlie.id, 'select wms.cerrar_conteo($1, null, null)', [conteo])
    expect((await base.admin.query('select estado, resultado from wms.conteos where id = $1', [conteo])).rows[0]).toMatchObject({ estado: 'CERRADO', resultado: 'COINCIDE' })
  })

  it('una diferencia pide un segundo conteo de OTRA persona; con causa, el Jefe propone y Dirección Técnica autoriza el ajuste', async () => {
    const aux1 = await persona('auxiliar'); const aux2 = await persona('auxiliar')
    const { s, conteo, linea } = await conteoConDiferencia('A-21.1', 'CT-4')
    expect((await rpc<{ r: string }>(aux1, 'select wms.registrar_conteo($1, 8) as r', [linea]))[0].r).toBe('PENDIENTE_RECONTEO')
    expect((await base.admin.query('select estado from wms.conteos where id = $1', [conteo])).rows[0].estado).toBe('POR_RECONTAR')
    expect((await falla(rpc(aux1, 'select wms.registrar_conteo($1, 8)', [linea]))).message).toMatch(/otra persona/)
    expect((await rpc<{ r: string }>(aux2, 'select wms.registrar_conteo($1, 8) as r', [linea]))[0].r).toBe('DIFERENCIA_CONFIRMADA')
    expect((await base.admin.query(`select count(*)::int n from wms.alertas where tipo = 'CONTEO_CON_DIFERENCIA' and estado = 'ABIERTA'`)).rows[0].n).toBeGreaterThan(0)
    // no se cierra ni se ajusta sin causa
    expect((await falla(rpc(P().charlie.id, 'select wms.cerrar_conteo($1, null, null)', [conteo]))).message).toMatch(/Quedan 1 líneas sin resolver/)
    expect((await falla(rpc(P().charlie.id, 'select wms.proponer_ajuste($1, $2)', [linea, 'Ajustar']))).message).toMatch(/causa/)
    await rpc(P().charlie.id, 'select wms.registrar_causa_conteo($1, $2)', [linea, 'Se despachó sin registrar en una salida antigua'])
    const aj = (await rpc<{ id: string }>(P().charlie.id, 'select wms.proponer_ajuste($1, $2) as id', [linea, 'Ajustar -2 con evidencia del despacho']))[0].id
    // el saldo sigue igual hasta que Dirección Técnica decide; nadie más autoriza
    expect((await base.admin.query(`select coalesce(sum(cantidad),0)::int n from wms.saldos where lote_id = $1`, [s.loteId])).rows[0].n).toBe(10)
    expect((await falla(rpc(P().charlie.id, 'select wms.decidir_ajuste($1, $2)', [aj, 'AUTORIZAR']))).code).toBe('42501')
    await rpc(P().katia.id, 'select wms.decidir_ajuste($1, $2, $3)', [aj, 'AUTORIZAR', 'Conforme con la evidencia'])
    expect((await base.admin.query(`select coalesce(sum(cantidad),0)::int n from wms.saldos where lote_id = $1`, [s.loteId])).rows[0].n).toBe(8)
    const k = await rpc<{ tipo_documento: string; salida: number }>(P().auditor.id, 'select * from wms.kardex_filas($1, $2) where not es_saldo_inicial', [base.productos.dapa, s.loteId])
    expect(k.map((x) => x.tipo_documento)).toEqual(['Carga inicial', 'Ajuste autorizado'])
    await rpc(P().charlie.id, 'select wms.cerrar_conteo($1, $2, $3)', [conteo, 'Despacho sin registrar', 'Ajuste AJ autorizado por Dirección Técnica'])
    expect((await base.admin.query('select resultado from wms.conteos where id = $1', [conteo])).rows[0].resultado).toBe('CORREGIDO')
  })

  it('un ajuste rechazado queda escalado; una ubicación en conteo no se mueve', async () => {
    const aux1 = await persona('auxiliar'); const aux2 = await persona('auxiliar')
    const { s, conteo, linea } = await conteoConDiferencia('A-22.1', 'CT-5')
    const e = await falla(preparar(aux1, s, 'A-24.1', 1))
    expect(e.message).toMatch(/está en conteo/)
    const e2 = await falla(base.como(P().charlie.id, (c) => c.query(`select wms.postear_movimiento('MOVIMIENTO', 'x', $1::jsonb)`, [JSON.stringify([
      { posicion_id: s.posicionId, producto_id: base.productos.dapa, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: s.procedencia, delta: -1 },
      { posicion_id: s.posicionId, producto_id: base.productos.dapa, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: s.procedencia, delta: 1 },
    ])])))
    expect(e2.message).toMatch(/está en conteo/)
    await rpc(aux1, 'select wms.registrar_conteo($1, 12)', [linea])
    await rpc(aux2, 'select wms.registrar_conteo($1, 12)', [linea])
    await rpc(P().charlie.id, 'select wms.registrar_causa_conteo($1, $2)', [linea, 'Entrada sin registrar'])
    const aj = (await rpc<{ id: string }>(P().charlie.id, 'select wms.proponer_ajuste($1, $2) as id', [linea, 'Sumar 2']))[0].id
    expect((await falla(rpc(P().katia.id, 'select wms.decidir_ajuste($1, $2, null)', [aj, 'RECHAZAR']))).message).toMatch(/por qué no se autoriza/)
    await rpc(P().katia.id, 'select wms.decidir_ajuste($1, $2, $3)', [aj, 'RECHAZAR', 'Falta evidencia de la entrada'])
    expect((await base.admin.query('select resultado from wms.conteo_lineas where id = $1', [linea])).rows[0].resultado).toBe('ESCALADA')
    await rpc(P().charlie.id, 'select wms.cerrar_conteo($1, $2, $3)', [conteo, 'Sin explicar', 'Escalado a Dirección Técnica con la evidencia'])
    expect((await base.admin.query('select resultado from wms.conteos where id = $1', [conteo])).rows[0].resultado).toBe('ESCALADO')
    // cerrado, la ubicación se puede mover otra vez
    await preparar(aux1, s, 'A-24.1', 1)
  })

  it('solo el Jefe programa conteos', async () => {
    const aux1 = await persona('auxiliar')
    const s = await stock('A-23.1', 'CT-6', 3)
    expect((await falla(rpc(aux1, 'select wms.programar_conteo(array[$1]::uuid[], null)', [s.posicionId]))).code).toBe('42501')
    expect((await falla(rpc(P().charlie.id, 'select wms.programar_conteo(array[$1]::uuid[], null)', [await idPosicion(base.admin, 'A-27.1')]))).message).toMatch(/no tienen unidades/)
  })
})

describe('carga inicial (D-09)', () => {
  const filas = (extra: object[] = []) => [
    { producto: 'T-DAPA', lote: 'CI-L1', vence: '2029-05-31', propietario: 'DIPHASAC', posicion: 'A-18.1', estado: 'APROBADO', cantidad: 25 },
    { producto: 'T-LIZI', lote: 'CI-L2', vence: '2029-06-30', propietario: 'DIPHASAC', posicion: 'A-19.1', estado: 'APROBADO', cantidad: 12 },
    ...extra,
  ]

  it('la vista previa explica cada fila con error y solo administración la usa', async () => {
    const r = await rpc<{ fila: number; error: string }>(P().admin.id, 'select * from wms.validar_carga_inicial($1::jsonb)', [JSON.stringify(filas([
      { producto: 'NO-EXISTE', lote: 'X', propietario: 'DIPHASAC', posicion: 'A-18.1', estado: 'APROBADO', cantidad: 1 },
      { producto: 'T-DAPA', lote: 'X', propietario: 'DIPHASAC', posicion: 'A-6', estado: 'APROBADO', cantidad: 1 },
      { producto: 'T-DAPA', lote: 'X', propietario: 'DIPHASAC', posicion: 'A-18.1', estado: 'APROBADO', cantidad: 0 },
    ]))])
    expect(r.map((x) => x.fila)).toEqual([3, 4, 5])
    expect(r[0].error).toMatch(/no existe en el catálogo/)
    expect(r[1].error).toMatch(/no admite unidades/)
    expect(r[2].error).toMatch(/cantidad/)
    expect((await falla(rpc(P().charlie.id, 'select * from wms.validar_carga_inicial($1::jsonb)', [JSON.stringify(filas())]))).code).toBe('42501')
  })

  it('no se confirma sin la decisión de Dirección Técnica sobre el estado; con ella, deja el saldo y el kardex', async () => {
    expect((await falla(rpc(P().admin.id, 'select wms.crear_carga_inicial($1::jsonb, null)', [JSON.stringify(filas([{ producto: 'X', lote: 'Y', propietario: 'DIPHASAC', posicion: 'A-18.1', estado: 'APROBADO', cantidad: 1 }]))]))).message).toMatch(/1 filas con errores/)
    const carga = (await rpc<{ id: string }>(P().admin.id, 'select wms.crear_carga_inicial($1::jsonb, $2) as id', [JSON.stringify(filas()), 'Inventario general']))[0].id
    expect((await falla(rpc(P().admin.id, 'select wms.confirmar_carga_inicial($1)', [carga]))).message).toMatch(/Falta la decisión de Dirección Técnica/)
    expect((await falla(rpc(P().admin.id, `select wms.decidir_estado_carga_inicial('APROBADO')`))).code).toBe('42501')
    await rpc(P().katia.id, `select wms.decidir_estado_carga_inicial('APROBADO')`)
    await rpc(P().admin.id, 'select wms.confirmar_carga_inicial($1)', [carga])
    expect((await base.admin.query(`select coalesce(sum(cantidad),0)::int n from wms.saldos s join wms.lotes l on l.id = s.lote_id where l.codigo in ('CI-L1','CI-L2')`)).rows[0].n).toBe(37)
    expect((await base.admin.query('select estado from wms.cargas_iniciales where id = $1', [carga])).rows[0].estado).toBe('CONFIRMADA')
    expect((await falla(rpc(P().admin.id, 'select wms.confirmar_carga_inicial($1)', [carga]))).message).toMatch(/ya no está en borrador/)
    const v = await base.admin.query('select count(*)::int n from wms.verificar_saldos()')
    expect(v.rows[0].n).toBe(0)
  })

  it('una fila en un estado distinto al decidido se rechaza (salvo lo ya rechazado)', async () => {
    const carga = (await rpc<{ id: string }>(P().admin.id, 'select wms.crear_carga_inicial($1::jsonb, null) as id', [JSON.stringify([
      { producto: 'T-DAPA', lote: 'CI-L9', vence: '2029-05-31', propietario: 'DIPHASAC', posicion: 'A-6', estado: 'CUARENTENA', cantidad: 3 },
    ])]))[0].id
    expect((await falla(rpc(P().admin.id, 'select wms.confirmar_carga_inicial($1)', [carga]))).message).toMatch(/decidió APROBADO/)
  })
})
