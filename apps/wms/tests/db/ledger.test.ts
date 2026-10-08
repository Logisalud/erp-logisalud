// Pruebas de base de datos del ledger, saldos, zonas, propietario, estado y concurrencia.
// Numeración de los tests del prompt entre paréntesis cuando aplica.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type BaseDePrueba, crearBaseDePrueba, crearLote, falla, idPosicion, idPropietario, postear, saldoDe,
  sembrarStock,
} from './helpers'

let base: BaseDePrueba
beforeAll(async () => { base = await crearBaseDePrueba() }, 60_000)
afterAll(async () => { await base?.cerrar() })

const P = () => base.personas

describe('ingreso: todo nace en Cuarentena (zona y estado)', () => {
  it('un ingreso nace en Cuarentena en A-6 y deja su saldo', async () => {
    const logissa = await idPropietario(base.admin, 'LOGISSA')
    const a6 = await idPosicion(base.admin, 'A-6')
    const lote = await crearLote(base.admin, base.productos.dapa, 'ING-1', '2028-01-31', logissa)
    const proc = randomUUID()
    await base.como(P().charlie.id, (c) => postear(c, 'INGRESO', [{
      posicion_id: a6, producto_id: base.productos.dapa, lote_id: lote, propietario_id: logissa,
      estado: 'CUARENTENA', origen: 'COMPRA_LOCAL', procedencia_id: proc, delta: 6,
    }]))
    expect(await saldoDe(base.admin, { lote_id: lote, estado: 'CUARENTENA' })).toBe(6)
  })

  it('un ingreso no puede nacer Aprobado', async () => {
    const logissa = await idPropietario(base.admin, 'LOGISSA')
    const lote = await crearLote(base.admin, base.productos.dapa, 'ING-2', '2028-01-31', logissa)
    const e = await falla(base.como(P().charlie.id, async (c) => postear(c, 'INGRESO', [{
      posicion_id: await idPosicion(c, 'B-1'), producto_id: base.productos.dapa, lote_id: lote,
      propietario_id: logissa, estado: 'APROBADO', origen: 'COMPRA_LOCAL', procedencia_id: randomUUID(), delta: 3,
    }])))
    expect(e.message).toMatch(/nace en Cuarentena/i)
  })

  it('(10) Cuarentena hacia un rack de Aprobados queda bloqueado', async () => {
    const diphasac = await idPropietario(base.admin, 'DIPHASAC')
    const lote = await crearLote(base.admin, base.productos.dapa, 'ING-3', '2028-01-31', diphasac)
    const e = await falla(base.como(P().charlie.id, async (c) => postear(c, 'INGRESO', [{
      posicion_id: await idPosicion(c, 'A-14.1'), producto_id: base.productos.dapa, lote_id: lote,
      propietario_id: diphasac, estado: 'CUARENTENA', origen: 'COMPRA_LOCAL', procedencia_id: randomUUID(), delta: 4,
    }])))
    expect(e.message).toMatch(/no admite unidades en estado CUARENTENA/i)
  })

  it('Recepción es tránsito: no admite stock', async () => {
    const logissa = await idPropietario(base.admin, 'LOGISSA')
    const lote = await crearLote(base.admin, base.productos.dapa, 'ING-4', '2028-01-31', logissa)
    const e = await falla(base.como(P().charlie.id, async (c) => postear(c, 'INGRESO', [{
      posicion_id: await idPosicion(c, 'A-1'), producto_id: base.productos.dapa, lote_id: lote,
      propietario_id: logissa, estado: 'CUARENTENA', origen: 'COMPRA_LOCAL', procedencia_id: randomUUID(), delta: 1,
    }])))
    expect(e.message).toMatch(/RECEPCION no admite/i)
  })

  it('Devoluciones admite el estado Devoluciones solo con origen devolución; nunca Cuarentena', async () => {
    const diphasac = await idPropietario(base.admin, 'DIPHASAC')
    const lote = await crearLote(base.admin, base.productos.dapa, 'DEV-1', '2028-01-31', diphasac)
    const mk = (origen: string, estado: 'CUARENTENA' | 'DEVOLUCIONES') => base.como(P().charlie.id, async (c) => postear(c, 'INGRESO', [{
      posicion_id: await idPosicion(c, 'A-10.1'), producto_id: base.productos.dapa, lote_id: lote,
      propietario_id: diphasac, estado, origen, procedencia_id: randomUUID(), delta: 2,
    }]))
    expect((await falla(mk('COMPRA_LOCAL', 'DEVOLUCIONES'))).message).toMatch(/no admite|devoluci/i)
    expect((await falla(mk('DEVOLUCION', 'CUARENTENA'))).message).toMatch(/devoluci/i)
    await mk('DEVOLUCION', 'DEVOLUCIONES')
  })
})

describe('movimientos internos: zona, propietario y estado', () => {
  it('(11) mover hacia una posición de otro propietario se bloquea', async () => {
    const s = await sembrarStock(base, { posicion: 'A-14.1', producto: base.productos.dapa, lote: 'M-1', propietario: 'DIPHASAC', cantidad: 10 })
    const e = await falla(base.como(P().charlie.id, async (c) => postear(c, 'MOVIMIENTO', [
      { posicion_id: s.posicionId, producto_id: base.productos.dapa, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: s.procedencia, delta: -4 },
      { posicion_id: await idPosicion(c, 'F-1.1'), producto_id: base.productos.dapa, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: s.procedencia, delta: 4 },
    ])))
    expect(e.message).toMatch(/sin asignación vigente/i)
  })

  it('un movimiento válido mueve parte de un lote y conserva el estado', async () => {
    const s = await sembrarStock(base, { posicion: 'A-15.1', producto: base.productos.dapa, lote: 'M-2', propietario: 'DIPHASAC', cantidad: 10 })
    await base.como(P().charlie.id, async (c) => postear(c, 'MOVIMIENTO', [
      { posicion_id: s.posicionId, producto_id: base.productos.dapa, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: s.procedencia, delta: -4 },
      { posicion_id: await idPosicion(c, 'A-16.1'), producto_id: base.productos.dapa, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: s.procedencia, delta: 4 },
    ]))
    expect(await saldoDe(base.admin, { posicion_id: s.posicionId, lote_id: s.loteId })).toBe(6)
    expect(await saldoDe(base.admin, { posicion_id: await idPosicion(base.admin, 'A-16.1'), lote_id: s.loteId })).toBe(4)
  })

  it('(12) un Rechazado solo puede ir a Bajas/Rechazados de su propietario', async () => {
    const s = await sembrarStock(base, { posicion: 'J-12.1', producto: base.productos.dapa, lote: 'R-1', propietario: 'DIPHASAC', estado: 'BAJAS_RECHAZADOS', cantidad: 5 })
    const mover = (destino: string) => base.como(P().charlie.id, async (c) => postear(c, 'MOVIMIENTO', [
      { posicion_id: s.posicionId, producto_id: base.productos.dapa, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'BAJAS_RECHAZADOS', origen: 'CARGA_INICIAL', procedencia_id: s.procedencia, delta: -2 },
      { posicion_id: await idPosicion(c, destino), producto_id: base.productos.dapa, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'BAJAS_RECHAZADOS', origen: 'CARGA_INICIAL', procedencia_id: s.procedencia, delta: 2 },
    ]))
    expect((await falla(mover('A-17.1'))).message).toMatch(/no admite unidades en estado BAJAS_RECHAZADOS/i) // rack de Aprobados
    expect((await falla(mover('E-8.1.2'))).message).toMatch(/sin asignación vigente/i) // Bajas de OTRO propietario (Logissa)
    await mover('J-13.2') // Bajas de Diphasac
  })

  it('un movimiento no puede disfrazar un cambio de estado', async () => {
    const s = await sembrarStock(base, { posicion: 'A-18.1', producto: base.productos.dapa, lote: 'M-3', propietario: 'DIPHASAC', cantidad: 5 })
    const e = await falla(base.como(P().charlie.id, async (c) => postear(c, 'MOVIMIENTO', [
      { posicion_id: s.posicionId, producto_id: base.productos.dapa, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: s.procedencia, delta: -5 },
      { posicion_id: await idPosicion(c, 'A-7'), producto_id: base.productos.dapa, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'CUARENTENA', origen: 'CARGA_INICIAL', procedencia_id: s.procedencia, delta: 5 },
    ])))
    expect(e.message).toMatch(/no puede cambiar el estado/i)
    expect(await saldoDe(base.admin, { lote_id: s.loteId, estado: 'APROBADO' })).toBe(5) // nada se movió
  })

  it('no se puede mover más de lo que hay', async () => {
    const s = await sembrarStock(base, { posicion: 'A-19.1', producto: base.productos.dapa, lote: 'M-4', propietario: 'DIPHASAC', cantidad: 3 })
    const e = await falla(base.como(P().charlie.id, async (c) => postear(c, 'MOVIMIENTO', [
      { posicion_id: s.posicionId, producto_id: base.productos.dapa, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: s.procedencia, delta: -9 },
      { posicion_id: await idPosicion(c, 'A-20.1'), producto_id: base.productos.dapa, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: s.procedencia, delta: 9 },
    ])))
    expect(e.code).toBe('P0002')
    expect(await saldoDe(base.admin, { lote_id: s.loteId })).toBe(3)
  })

  it('el verificador no puede ser el ejecutor (restricción de la tabla)', async () => {
    const e = await falla(base.admin.query(
      `insert into wms.movimientos (tipo, ejecutor_id, verificador_id) values ('MOVIMIENTO', $1, $1)`, [P().charlie.id]))
    expect(e.message).toMatch(/movimientos_check|check constraint/i)
  })
})

describe('cambio de estado sanitario', () => {
  async function ingresarACuarentena(codigoLote: string, producto = base.productos.dapa, cantidad = 6) {
    const logissa = await idPropietario(base.admin, 'LOGISSA')
    const a6 = await idPosicion(base.admin, 'A-6')
    const lote = await crearLote(base.admin, producto, codigoLote, '2028-06-30', logissa)
    const proc = randomUUID()
    await base.como(P().charlie.id, (c) => postear(c, 'INGRESO', [{
      posicion_id: a6, producto_id: producto, lote_id: lote, propietario_id: logissa, estado: 'CUARENTENA',
      origen: 'COMPRA_LOCAL', procedencia_id: proc, delta: cantidad,
    }]))
    return { a6, lote, logissa, proc, producto, cantidad }
  }
  const aprobar = (x: Awaited<ReturnType<typeof ingresarACuarentena>>, quien = P().katia.id, sustento: string | null = 'ACTA-1', cant = x.cantidad) =>
    base.como(quien, (c) => postear(c, 'CAMBIO_ESTADO', [
      { posicion_id: x.a6, producto_id: x.producto, lote_id: x.lote, propietario_id: x.logissa, estado: 'CUARENTENA', origen: 'COMPRA_LOCAL', procedencia_id: x.proc, delta: -cant },
      { posicion_id: x.a6, producto_id: x.producto, lote_id: x.lote, propietario_id: x.logissa, estado: 'APROBADO', origen: 'COMPRA_LOCAL', procedencia_id: x.proc, delta: cant },
    ], { sustentoId: sustento }))

  it('(8) Cuarentena → Aprobado con sustento lo registra Katia', async () => {
    const x = await ingresarACuarentena('CE-1')
    await aprobar(x)
    expect(await saldoDe(base.admin, { lote_id: x.lote, estado: 'APROBADO' })).toBe(6)
    expect(await saldoDe(base.admin, { lote_id: x.lote, estado: 'CUARENTENA' })).toBe(0)
  })

  it('Charlie (Jefe de Almacén) NO puede registrar el cambio de estado', async () => {
    const x = await ingresarACuarentena('CE-2')
    const e = await falla(aprobar(x, P().charlie.id))
    expect(e.code).toBe('42501')
    expect(e.message).toMatch(/Solo Dirección Técnica/i)
  })

  it('sin sustento (acta firmada) no se aprueba', async () => {
    const x = await ingresarACuarentena('CE-3')
    expect((await falla(aprobar(x, P().katia.id, null))).message).toMatch(/necesita su sustento/i)
  })

  it('(7) con el registro sanitario vencido la aprobación se bloquea', async () => {
    const x = await ingresarACuarentena('CE-4', base.productos.lizi)
    expect((await falla(aprobar(x))).message).toMatch(/registro sanitario está vencido/i)
  })

  it('un producto sin registro sanitario ni vencimiento cargados no se aprueba', async () => {
    const nuevo = randomUUID()
    await base.admin.query(`insert into catalogo.productos (id, codigo, descripcion) values ($1, 'T-NUEVO', 'Producto nuevo (prueba)')`, [nuevo])
    await base.admin.query(`insert into wms.producto_regulatorio (producto_id, creado_por) values ($1, $2)`, [nuevo, P().sandra.id])
    const x = await ingresarACuarentena('CE-5', nuevo)
    expect((await falla(aprobar(x))).message).toMatch(/no tiene su registro sanitario y su vencimiento cargados/i)
  })

  it('al cargar el registro sanitario con Sandra el producto ya se aprueba (sin segunda validación)', async () => {
    const nuevo = randomUUID()
    await base.admin.query(`insert into catalogo.productos (id, codigo, descripcion) values ($1, 'T-NUEVO2', 'Producto nuevo 2 (prueba)')`, [nuevo])
    await base.admin.query(`insert into wms.producto_regulatorio (producto_id, creado_por) values ($1, $2)`, [nuevo, P().sandra.id])
    await base.como(P().sandra.id, (c) => c.query(`select wms.editar_regulatorio($1, '{"registro_sanitario":"EG-77","rs_vence":"2031-01-01"}'::jsonb, 'Carga inicial')`, [nuevo]))
    const x = await ingresarACuarentena('CE-5B', nuevo)
    await aprobar(x)
  })

  it('(D-15) el verificador no puede ser quien preparó ni quien ejecutó el movimiento (restricciones de la tabla)', async () => {
    const e1 = await falla(base.admin.query(
      `insert into wms.movimientos (tipo, ejecutor_id, preparador_id, verificador_id) values ('MOVIMIENTO', $1, $2, $2)`, [P().charlie.id, P().aux.id]))
    expect(e1.message).toMatch(/movimientos_verificador_distinto_preparador/)
    const e2 = await falla(base.admin.query(
      `insert into wms.movimientos (tipo, ejecutor_id, preparador_id, verificador_id) values ('MOVIMIENTO', $1, $2, $1)`, [P().charlie.id, P().aux.id]))
    expect(e2.message).toMatch(/check constraint/i)
    // con tres personas distintas sí
    await base.admin.query(
      `insert into wms.movimientos (tipo, ejecutor_id, preparador_id, verificador_id) values ('MOVIMIENTO', $1, $2, $3)`, [P().charlie.id, P().aux.id, P().katia.id])
  })

  it('(9) Aprobado → Cuarentena se rechaza en la base de datos', async () => {
    const x = await ingresarACuarentena('CE-6')
    await aprobar(x)
    const e = await falla(base.como(P().katia.id, (c) => postear(c, 'CAMBIO_ESTADO', [
      { posicion_id: x.a6, producto_id: x.producto, lote_id: x.lote, propietario_id: x.logissa, estado: 'APROBADO', origen: 'COMPRA_LOCAL', procedencia_id: x.proc, delta: -6 },
      { posicion_id: x.a6, producto_id: x.producto, lote_id: x.lote, propietario_id: x.logissa, estado: 'CUARENTENA', origen: 'COMPRA_LOCAL', procedencia_id: x.proc, delta: 6 },
    ], { sustentoId: 'ACTA-X' })))
    expect(e.message).toMatch(/Transición no permitida: APROBADO → CUARENTENA/)
    // y la tabla de transiciones no deja agregarla
    const t = await falla(base.admin.query(`insert into wms.transiciones_estado (desde, hasta) values ('APROBADO', 'CUARENTENA')`))
    expect(t.message).toMatch(/prohibido siempre/i)
  })

  it('un cambio de estado no se revierte', async () => {
    const x = await ingresarACuarentena('CE-7')
    const id = await aprobar(x)
    const e = await falla(base.como(P().charlie.id, (c) => c.query('select wms.revertir_movimiento($1, $2)', [id, 'me equivoqué'])))
    expect(e.message).toMatch(/no se revierte/i)
  })

  it('Aprobado → Bajas/Rechazados lo registra Katia con sustento', async () => {
    const x = await ingresarACuarentena('CE-8')
    await aprobar(x)
    await base.como(P().katia.id, (c) => postear(c, 'CAMBIO_ESTADO', [
      { posicion_id: x.a6, producto_id: x.producto, lote_id: x.lote, propietario_id: x.logissa, estado: 'APROBADO', origen: 'COMPRA_LOCAL', procedencia_id: x.proc, delta: -2 },
      { posicion_id: x.a6, producto_id: x.producto, lote_id: x.lote, propietario_id: x.logissa, estado: 'BAJAS_RECHAZADOS', origen: 'COMPRA_LOCAL', procedencia_id: x.proc, delta: 2 },
    ], { sustentoId: 'BAJA-1' }))
    expect(await saldoDe(base.admin, { lote_id: x.lote, estado: 'BAJAS_RECHAZADOS' })).toBe(2)
  })
})

describe('el lote ABC: la aprobación vive en cada entrega, no en el lote', () => {
  it('una nueva entrega del mismo lote nace en Cuarentena; la anterior sigue Aprobada y la nueva no hereda', async () => {
    const diphasac = await idPropietario(base.admin, 'DIPHASAC')
    const a7 = await idPosicion(base.admin, 'A-7')
    const a21 = await idPosicion(base.admin, 'A-21.1')
    const lote = await crearLote(base.admin, base.productos.dapa, 'ABC', '2028-03-31', diphasac)
    const p1 = randomUUID() // primera entrega
    const p2 = randomUUID() // segunda entrega

    // Entrega 1: ingresa, se aprueba y queda en su rack.
    await base.como(P().charlie.id, (c) => postear(c, 'INGRESO', [{
      posicion_id: a7, producto_id: base.productos.dapa, lote_id: lote, propietario_id: diphasac,
      estado: 'CUARENTENA', origen: 'COMPRA_LOCAL', procedencia_id: p1, delta: 10 }]))
    await base.como(P().katia.id, (c) => postear(c, 'CAMBIO_ESTADO', [
      { posicion_id: a7, producto_id: base.productos.dapa, lote_id: lote, propietario_id: diphasac, estado: 'CUARENTENA', origen: 'COMPRA_LOCAL', procedencia_id: p1, delta: -10 },
      { posicion_id: a7, producto_id: base.productos.dapa, lote_id: lote, propietario_id: diphasac, estado: 'APROBADO', origen: 'COMPRA_LOCAL', procedencia_id: p1, delta: 10 },
    ], { sustentoId: 'ACTA-ABC-1' }))
    await base.como(P().charlie.id, (c) => postear(c, 'MOVIMIENTO', [
      { posicion_id: a7, producto_id: base.productos.dapa, lote_id: lote, propietario_id: diphasac, estado: 'APROBADO', origen: 'COMPRA_LOCAL', procedencia_id: p1, delta: -10 },
      { posicion_id: a21, producto_id: base.productos.dapa, lote_id: lote, propietario_id: diphasac, estado: 'APROBADO', origen: 'COMPRA_LOCAL', procedencia_id: p1, delta: 10 },
    ]))

    // Entrega 2 del MISMO lote: nace en Cuarentena. Nada de la anterior se toca.
    await base.como(P().charlie.id, (c) => postear(c, 'INGRESO', [{
      posicion_id: a7, producto_id: base.productos.dapa, lote_id: lote, propietario_id: diphasac,
      estado: 'CUARENTENA', origen: 'COMPRA_LOCAL', procedencia_id: p2, delta: 4 }]))

    expect(await saldoDe(base.admin, { lote_id: lote, estado: 'APROBADO' })).toBe(10)
    expect(await saldoDe(base.admin, { lote_id: lote, estado: 'CUARENTENA' })).toBe(4)
    // La entrega 2 NO hereda la aprobación: sus unidades siguen en Cuarentena con su propia procedencia.
    expect(await saldoDe(base.admin, { lote_id: lote, procedencia_id: p2, estado: 'APROBADO' })).toBe(0)

    // Aprobar la entrega 2 (con su propia acta) solo mueve las unidades de la entrega 2.
    await base.como(P().katia.id, (c) => postear(c, 'CAMBIO_ESTADO', [
      { posicion_id: a7, producto_id: base.productos.dapa, lote_id: lote, propietario_id: diphasac, estado: 'CUARENTENA', origen: 'COMPRA_LOCAL', procedencia_id: p2, delta: -4 },
      { posicion_id: a7, producto_id: base.productos.dapa, lote_id: lote, propietario_id: diphasac, estado: 'APROBADO', origen: 'COMPRA_LOCAL', procedencia_id: p2, delta: 4 },
    ], { sustentoId: 'ACTA-ABC-2' }))
    expect(await saldoDe(base.admin, { lote_id: lote, estado: 'APROBADO', posicion_id: a21 })).toBe(10)
    expect(await saldoDe(base.admin, { lote_id: lote, estado: 'CUARENTENA' })).toBe(0)

    // No se puede aprobar más de lo que la entrega 2 tiene en Cuarentena (ya quedó en 0).
    const e = await falla(base.como(P().katia.id, (c) => postear(c, 'CAMBIO_ESTADO', [
      { posicion_id: a7, producto_id: base.productos.dapa, lote_id: lote, propietario_id: diphasac, estado: 'CUARENTENA', origen: 'COMPRA_LOCAL', procedencia_id: p2, delta: -1 },
      { posicion_id: a7, producto_id: base.productos.dapa, lote_id: lote, propietario_id: diphasac, estado: 'APROBADO', origen: 'COMPRA_LOCAL', procedencia_id: p2, delta: 1 },
    ], { sustentoId: 'ACTA-ABC-2' })))
    expect(e.code).toBe('P0002')
  })

  it('el mismo lote no puede tener dos vencimientos distintos', async () => {
    const logissa = await idPropietario(base.admin, 'LOGISSA')
    const id1 = await base.como(P().charlie.id, async (c) =>
      (await c.query('select wms.asegurar_lote($1, $2, $3, $4) as id', [base.productos.dapa, 'XYZ', '2028-05-31', logissa])).rows[0].id)
    const id2 = await base.como(P().charlie.id, async (c) =>
      (await c.query('select wms.asegurar_lote($1, $2, $3, $4) as id', [base.productos.dapa, 'XYZ', '2028-05-31', logissa])).rows[0].id)
    expect(id2).toBe(id1) // misma entrega de otro día: se reutiliza el lote
    const e = await falla(base.como(P().charlie.id, (c) =>
      c.query('select wms.asegurar_lote($1, $2, $3, $4)', [base.productos.dapa, 'XYZ', '2029-05-31', logissa])))
    expect(e.message).toMatch(/otro vencimiento/i)
  })
})

describe('(14) concurrencia: dos personas sobre las mismas unidades', () => {
  it('una sola gana; la otra recibe "saldo insuficiente"', async () => {
    const s = await sembrarStock(base, { posicion: 'A-22.1', producto: base.productos.dapa, lote: 'CONC-1', propietario: 'DIPHASAC', cantidad: 5 })
    const destino = await idPosicion(base.admin, 'A-23.1')
    const partidas = (n: number) => [
      { posicion_id: s.posicionId, producto_id: base.productos.dapa, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'APROBADO' as const, origen: 'CARGA_INICIAL', procedencia_id: s.procedencia, delta: -n },
      { posicion_id: destino, producto_id: base.productos.dapa, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'APROBADO' as const, origen: 'CARGA_INICIAL', procedencia_id: s.procedencia, delta: n },
    ]
    const a = await base.transaccionComo(P().charlie.id)
    const b = await base.transaccionComo(P().aux.id)
    await postear(a.cliente, 'MOVIMIENTO', partidas(5)) // A toma el candado y mueve las 5
    const pendienteB = falla(postear(b.cliente, 'MOVIMIENTO', partidas(5))) // B espera el candado
    await new Promise((r) => setTimeout(r, 300))
    await a.commit() // A confirma → B se desbloquea y ve el saldo real (0)
    const e = await pendienteB
    await b.rollback()
    expect(e.code).toBe('P0002')
    expect(e.message).toMatch(/alguien más ya movió/i)
    expect(await saldoDe(base.admin, { posicion_id: s.posicionId, lote_id: s.loteId })).toBe(0)
    expect(await saldoDe(base.admin, { posicion_id: destino, lote_id: s.loteId })).toBe(5)
  })
})

describe('(13) reversas y ledger inmutable', () => {
  it('la reversa deja el original intacto y restituye los saldos', async () => {
    const s = await sembrarStock(base, { posicion: 'A-24.1', producto: base.productos.dapa, lote: 'REV-1', propietario: 'DIPHASAC', cantidad: 8 })
    const destino = await idPosicion(base.admin, 'A-25.1')
    const mov = await base.como(P().charlie.id, (c) => postear(c, 'MOVIMIENTO', [
      { posicion_id: s.posicionId, producto_id: base.productos.dapa, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: s.procedencia, delta: -3 },
      { posicion_id: destino, producto_id: base.productos.dapa, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: s.procedencia, delta: 3 },
    ]))
    const rev = await base.como(P().charlie.id, async (c) =>
      (await c.query('select wms.revertir_movimiento($1, $2) as id', [mov, 'Se movió a la posición equivocada'])).rows[0].id)
    expect(await saldoDe(base.admin, { posicion_id: s.posicionId, lote_id: s.loteId })).toBe(8)
    expect(await saldoDe(base.admin, { posicion_id: destino, lote_id: s.loteId })).toBe(0)
    const filas = await base.admin.query('select id, reversa_de from wms.movimientos where id in ($1, $2) order by creado_en', [mov, rev])
    expect(filas.rows).toHaveLength(2) // el original sigue ahí
    expect(filas.rows[1].reversa_de).toBe(mov)
    expect((await base.admin.query('select count(*)::int n from wms.partidas where movimiento_id = $1', [mov])).rows[0].n).toBe(2)
  })

  it('una reversa necesita motivo y no se repite', async () => {
    const s = await sembrarStock(base, { posicion: 'A-26.1', producto: base.productos.dapa, lote: 'REV-2', propietario: 'DIPHASAC', cantidad: 8 })
    const destino = await idPosicion(base.admin, 'A-27.1')
    const mov = await base.como(P().charlie.id, (c) => postear(c, 'MOVIMIENTO', [
      { posicion_id: s.posicionId, producto_id: base.productos.dapa, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: s.procedencia, delta: -3 },
      { posicion_id: destino, producto_id: base.productos.dapa, lote_id: s.loteId, propietario_id: s.propietarioId, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: s.procedencia, delta: 3 },
    ]))
    expect((await falla(base.como(P().charlie.id, (c) => c.query('select wms.revertir_movimiento($1, $2)', [mov, '  '])))).message).toMatch(/necesita un motivo/i)
    await base.como(P().charlie.id, (c) => c.query('select wms.revertir_movimiento($1, $2)', [mov, 'error de dedo']))
    const otra = await falla(base.como(P().charlie.id, (c) => c.query('select wms.revertir_movimiento($1, $2)', [mov, 'otra vez'])))
    expect(otra.message).toMatch(/duplicate|unique|movimientos_una_reversa/i)
  })

  it('el ledger no se edita ni se borra, ni siquiera como superusuario', async () => {
    expect((await falla(base.admin.query('update wms.partidas set delta = delta + 1'))).message).toMatch(/inmutable/i)
    expect((await falla(base.admin.query('delete from wms.partidas'))).message).toMatch(/inmutable/i)
    expect((await falla(base.admin.query('truncate wms.partidas cascade'))).message).toMatch(/inmutable/i)
    expect((await falla(base.admin.query('update wms.movimientos set motivo = null'))).message).toMatch(/inmutable/i)
    expect((await falla(base.admin.query('delete from wms.audit_events'))).message).toMatch(/inmutable/i)
  })

  it('(19) el kardex reconstruye el saldo de cada lote desde sus movimientos', async () => {
    const k = await base.admin.query(`
      select lote_id, max(saldo_acumulado_lote)::int as ultimo_max, (array_agg(saldo_acumulado_lote order by partida_id desc))[1]::int as final
        from wms.v_kardex group by lote_id`)
    expect(k.rows.length).toBeGreaterThan(5)
    for (const fila of k.rows) {
      const real = (await base.admin.query('select coalesce(sum(cantidad),0)::int n from wms.saldos where lote_id = $1', [fila.lote_id])).rows[0].n
      expect(fila.final).toBe(real)
    }
  })

  it('los saldos coinciden exactamente con la suma del ledger', async () => {
    const r = await base.admin.query('select * from wms.verificar_saldos()')
    expect(r.rows).toEqual([])
  })
})

describe('(17) asignación vencida', () => {
  it('la posición deja de aceptar stock del propietario anterior sin mover lo existente', async () => {
    const s = await sembrarStock(base, { posicion: 'J-5.1', producto: base.productos.dapa, lote: 'VIG-1', propietario: 'DIPHASAC', cantidad: 6 })
    // Se vence la asignación de J-5.1 (Diphasac) ayer.
    await base.admin.query(
      `update wms.asignaciones_posicion set hasta = current_date - 1, desde = least(desde, current_date - 30)
        where posicion_id = $1`, [s.posicionId])
    // Lo existente se queda.
    expect(await saldoDe(base.admin, { posicion_id: s.posicionId, lote_id: s.loteId })).toBe(6)
    // Pero ya no entra stock nuevo de Diphasac a esa posición.
    const origen = await sembrarStock(base, { posicion: 'J-6.1', producto: base.productos.dapa, lote: 'VIG-2', propietario: 'DIPHASAC', cantidad: 3 })
    const e = await falla(base.como(P().charlie.id, (c) => postear(c, 'MOVIMIENTO', [
      { posicion_id: origen.posicionId, producto_id: base.productos.dapa, lote_id: origen.loteId, propietario_id: origen.propietarioId, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: origen.procedencia, delta: -3 },
      { posicion_id: s.posicionId, producto_id: base.productos.dapa, lote_id: origen.loteId, propietario_id: origen.propietarioId, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: origen.procedencia, delta: 3 },
    ])))
    expect(e.message).toMatch(/sin asignación vigente/i)
  })

  it('dos asignaciones solapadas en una posición exclusiva se rechazan; en áreas compartidas no aplica', async () => {
    const logissa = await idPropietario(base.admin, 'LOGISSA')
    const j7 = await idPosicion(base.admin, 'J-7.1')
    const e = await falla(base.admin.query(
      `insert into wms.asignaciones_posicion (posicion_id, propietario_id, desde) values ($1, $2, current_date)`, [j7, logissa]))
    expect(e.message).toMatch(/asignaciones_sin_solape|conflicting key/i)
    // Cuarentena es compartida: puede tener varias asignaciones a la vez.
    const a8 = await idPosicion(base.admin, 'A-8')
    const triamed = await idPropietario(base.admin, 'TRIAMED')
    await base.admin.query(`insert into wms.asignaciones_posicion (posicion_id, propietario_id, desde) values ($1, $2, current_date), ($1, $3, current_date)`, [a8, logissa, triamed])
  })
})
