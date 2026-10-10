// El motor de entradas del modo demostración aplica las mismas reglas que la base de datos (migración 0005).
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { checklistConforme } from '@/services/demo/entradas-demo'
import type { Actor } from '@/services/repositorio'

const actor = (rol: Actor['roles'][number], nombre: string = rol): Actor => ({ id: `demo:${rol}`, nombre, roles: [rol] })
const CHARLIE = actor('jefe_almacen', 'Charlie')
const KATIA = actor('direccion_tecnica', 'Katia')
const SANDRA = actor('asistente_dt', 'Sandra')
const AUX = actor('auxiliar', 'Christians')
const IMG = 'data:image/png;base64,' + 'A'.repeat(200)

let repo: RepositorioDemo
beforeEach(() => {
  ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined
  repo = new RepositorioDemo()
})

const A6 = 'pos:A-6'
async function propietario(codigo: string) {
  return (await repo.panorama()).propietarios.find((p) => p.codigo === codigo)!.id
}
const exito = <T extends { ok: boolean }>(r: T) => { expect(r, JSON.stringify(r)).toMatchObject({ ok: true }); return r as Extract<T, { ok: true }> }
const porOc = async (codigo: string) => {
  const s = (await repo.listarSolicitudes()).find((x) => x.referencia === codigo)!
  return (await repo.obtenerSolicitud(s.id))!
}
const ocId = async (codigo: string) => (await repo.ocsPendientes()).find((o) => o.codigo === codigo)!
const datos = { temperaturaC: 20, bultos: 3, paletas: 1, placa: 'ABC-123', tipoConteo: 'TOTAL' as const }

async function firmarTodo(actaId: string) {
  exito(await repo.firmarActa(actaId, { rol: 'JEFE_ALMACEN' }, CHARLIE))
  exito(await repo.firmarActa(actaId, { rol: 'DIRECCION_TECNICA' }, KATIA))
  exito(await repo.firmarActa(actaId, { rol: 'RESPONSABLE_CONTEO' }, AUX))
  return exito(await repo.firmarActa(actaId, { rol: 'TRANSPORTISTA', nombre: 'Pedro Quispe', dni: '45678912', placa: 'ABC-123', imagen: IMG }, CHARLIE))
}

/** Crea una solicitud de compra desde la OC (Sandra) con un solo lote. */
async function solicitudDeCompra(codigoOc: string, cantidad: number, lote = 'T-1', autorizar = true) {
  const oc = await ocId(codigoOc)
  const r = exito(await repo.crearSolicitud({
    tipo: 'COMPRA_LOCAL', propietarioId: await propietario('LOGISSA'), ocId: oc.ocId, guiaNumero: 'T001-9',
    lineas: [{ ocItemId: oc.items[0].ocItemId, lote, vence: '30/06/2028', cantidad }],
  }, autorizar, SANDRA))
  const s = (await repo.obtenerSolicitud(r.id))!
  return { id: r.id, numero: r.numero, s, linea: s.lineas[0], oc }
}

/** Recibe: empieza la recepción, verifica (coincide o diferencia), datos, acta firmada y confirma. */
async function recibirTodo(id: string, opciones: { diferencia?: { cantidad: number; motivo: string }; pos?: string } = {}) {
  exito(await repo.iniciarRecepcion(id, CHARLIE))
  const s = (await repo.obtenerSolicitud(id))!
  for (const l of s.lineas) {
    exito(await repo.verificarLinea(id, l.id, opciones.diferencia
      ? { coincide: false, cantidad: opciones.diferencia.cantidad, motivo: opciones.diferencia.motivo, posicionId: opciones.pos ?? A6 }
      : { coincide: true, posicionId: opciones.pos ?? A6 }, CHARLIE))
  }
  exito(await repo.editarRecepcion(id, datos, CHARLIE))
  const g = exito(await repo.generarActa(id, CHARLIE))
  await firmarTodo(g.actaId)
  exito(await repo.confirmarIngreso(id, CHARLIE))
  return g.actaId
}

describe('datos de prueba de entradas', () => {
  it('hay solicitudes en varios pasos, alertas, una cola para Dirección Técnica y un expediente', async () => {
    const lista = await repo.listarSolicitudes()
    expect(new Set(lista.map((i) => i.paso))).toEqual(new Set(['POR_AUTORIZAR', 'POR_LLEGAR', 'ACTA', 'FIRMAS', 'CERRADA']))
    expect(lista.every((s) => /^SI-\d{4}-\d{5}$/.test(s.numero))).toBe(true)
    const cola = await repo.colaDireccionTecnica()
    expect(cola.organolepticas.length).toBeGreaterThanOrEqual(2)
    const tipos = (await repo.listarAlertas()).filter((a) => a.estado === 'ABIERTA').map((a) => a.tipo)
    expect(tipos).toEqual(expect.arrayContaining([
      'RS_VENCIDO', 'TEMPERATURA', 'POR_TRASLADAR_VENCIDO', 'SOLICITUD_AJUSTADA', 'EXCEDE_OC', 'NO_COINCIDE_CON_COMPRAS', 'POR_REGISTRAR_EN_COMPRAS',
    ]))
    expect((await repo.listarExpedientes()).length).toBeGreaterThan(0)
    expect((await repo.ocsPendientes()).length).toBeGreaterThanOrEqual(5)
  })

  it('la devolución de la demostración espera en Devoluciones, no en Cuarentena', async () => {
    const dev = (await repo.listarSolicitudes()).find((s) => s.tipo === 'DEVOLUCION')!
    expect(dev.paso).toBe('FIRMAS')
    const d = (await repo.obtenerSolicitud(dev.id))!
    expect(d.estadoInicial).toBe('DEVOLUCIONES')
    expect(d.lineas[0].posicionCodigo).toBeTruthy()
    const pos = (await repo.posicionesDestino('DEVOLUCION')).map((p) => p.id)
    expect(pos).toContain(d.lineas[0].posicionId)
    expect((await repo.posicionesDestino('COMPRA_LOCAL')).map((p) => p.codigo)).toEqual(['A-6', 'A-7', 'A-8', 'A-9'])
  })
})

describe('estabilidad de los datos de prueba entre instancias', () => {
  it('dos instancias del servidor arman los mismos ids y números: un enlace generado en una funciona en la otra', async () => {
    const ids = async (r: RepositorioDemo) => (await r.listarSolicitudes()).map((i) => `${i.numero}:${i.id}`).sort()
    const primera = await ids(repo)
    const alertas = (await repo.listarAlertas()).map((a) => a.id).sort()
    ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined
    const otra = new RepositorioDemo()
    expect(await ids(otra)).toEqual(primera)
    expect((await otra.listarAlertas()).map((a) => a.id).sort()).toEqual(alertas)
  })
})

describe('solicitud de ingreso (D-32, D-34)', () => {
  it('Sandra y Katia la preparan; el almacén no. El número es SI-AAAA-NNNNN y sigue al último', async () => {
    const oc = await ocId('OC-DEMO-0002')
    const entrada = { tipo: 'COMPRA_LOCAL' as const, propietarioId: await propietario('LOGISSA'), ocId: oc.ocId, lineas: [{ ocItemId: oc.items[0].ocItemId, lote: 'N-1', vence: '30/06/2028', cantidad: 6 }] }
    expect(await repo.crearSolicitud(entrada, true, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Sandra/) })
    expect(await repo.crearSolicitud(entrada, true, AUX)).toMatchObject({ ok: false })
    const ultimo = Math.max(...(await repo.listarSolicitudes()).map((s) => Number(s.numero.slice(-5))))
    const a = exito(await repo.crearSolicitud(entrada, false, SANDRA))
    expect(a.numero).toMatch(new RegExp(`^SI-${new Date().getUTCFullYear()}-0*${ultimo + 1}$`))
    expect((await repo.obtenerSolicitud(a.id))).toMatchObject({ estado: 'BORRADOR', paso: 'POR_AUTORIZAR' })
    // Sin inventario: nada nace hasta confirmar.
    expect((await repo.panorama()).lotes.find((l) => l.codigo === 'N-1')).toBeUndefined()
    exito(await repo.autorizarSolicitud(a.id, KATIA))
    expect(await repo.autorizarSolicitud(a.id, KATIA)).toMatchObject({ ok: false })
    const s = (await repo.obtenerSolicitud(a.id))!
    expect(s).toMatchObject({ estado: 'PROGRAMADA', autorizadoPor: 'Katia' })
    expect(s.lineas[0]).toMatchObject({ inicial: 6, cantidad: 6, ocPedida: 6 })
  })

  it('una línea de la OC se divide en lotes y no se repite un lote', async () => {
    const oc = await ocId('OC-DEMO-0004')
    const it = oc.items[0].ocItemId
    const r = exito(await repo.crearSolicitud({
      tipo: 'COMPRA_LOCAL', propietarioId: await propietario('LOGISSA'), ocId: oc.ocId,
      lineas: [{ ocItemId: it, lote: 'D-1', vence: '30/06/2028', cantidad: 200 }, { ocItemId: it, lote: 'D-2', vence: '12/2028', cantidad: 100 }],
    }, true, SANDRA))
    expect((await repo.obtenerSolicitud(r.id))!.lineas.map((l) => [l.lote, l.cantidad])).toEqual([['D-1', 200], ['D-2', 100]])
    expect(await repo.crearSolicitud({
      tipo: 'COMPRA_LOCAL', propietarioId: await propietario('LOGISSA'), ocId: oc.ocId,
      lineas: [{ ocItemId: it, lote: 'D-3', vence: '30/06/2028', cantidad: 1 }, { ocItemId: it, lote: 'D-3', vence: '30/06/2028', cantidad: 1 }],
    }, true, SANDRA)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/repetido/) })
  })

  it('no se empieza a recibir una solicitud sin autorizar; la recepción la hace el almacén', async () => {
    const b = await solicitudDeCompra('OC-DEMO-0002', 6, 'B-1', false)
    expect(await repo.iniciarRecepcion(b.id, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/solo una solicitud programada/) })
    exito(await repo.autorizarSolicitud(b.id, SANDRA))
    expect(await repo.iniciarRecepcion(b.id, actor('auditoria_lectura'))).toMatchObject({ ok: false })
    exito(await repo.iniciarRecepcion(b.id, CHARLIE))
    expect((await repo.obtenerSolicitud(b.id))!).toMatchObject({ estado: 'EN_RECEPCION', paso: 'VERIFICANDO' })
  })

  it('anular exige motivo, la deja en el historial y una cerrada no se anula', async () => {
    const b = await solicitudDeCompra('OC-DEMO-0002', 6, 'X-1')
    expect(await repo.anularSolicitud(b.id, ' ', SANDRA)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/motivo/) })
    expect(await repo.anularSolicitud(b.id, 'x', CHARLIE)).toMatchObject({ ok: false })
    exito(await repo.anularSolicitud(b.id, 'Se canceló el envío', SANDRA))
    expect((await repo.obtenerSolicitud(b.id))!.estado).toBe('ANULADA')
    const cerrada = await porOc('OC-DEMO-0001')
    expect(await repo.anularSolicitud(cerrada.id, 'tarde', SANDRA)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/ya está cerrada/) })
  })
})

describe('recepción: verificar contra la solicitud', () => {
  it('(1) coincide → acta prellenada → confirma y nace en Cuarentena en A-6..A-9', async () => {
    const x = await solicitudDeCompra('OC-DEMO-0002', 6, 'OK-1')
    await recibirTodo(x.id)
    const p = await repo.panorama()
    const nuevo = p.saldos.filter((s) => p.lotes.find((l) => l.id === s.loteId)?.codigo === 'OK-1')
    expect(nuevo.map((s) => [s.estado, s.cantidad])).toEqual([['CUARENTENA', 6]])
    expect(['pos:A-6', 'pos:A-7', 'pos:A-8', 'pos:A-9']).toContain(nuevo[0].posicionId)
    expect((await repo.obtenerSolicitud(x.id))!).toMatchObject({ estado: 'CERRADA', paso: 'CERRADA' })
  })

  it('sin verificar, sin posición o sin temperatura no hay acta', async () => {
    const x = await solicitudDeCompra('OC-DEMO-0002', 6, 'V-1')
    exito(await repo.iniciarRecepcion(x.id, CHARLIE))
    expect(await repo.generarActa(x.id, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Falta verificar/) })
    exito(await repo.verificarLinea(x.id, x.linea.id, { coincide: true }, CHARLIE))
    expect(await repo.generarActa(x.id, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Elige dónde se deja/) })
    exito(await repo.verificarLinea(x.id, x.linea.id, { coincide: true, posicionId: A6 }, CHARLIE))
    expect(await repo.generarActa(x.id, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/temperatura/) })
  })

  it('solo Cuarentena (A-6..A-9) recibe inventario de una compra; la devolución, solo Devoluciones', async () => {
    const x = await solicitudDeCompra('OC-DEMO-0002', 6, 'Z-1')
    exito(await repo.iniciarRecepcion(x.id, CHARLIE))
    expect(await repo.verificarLinea(x.id, x.linea.id, { coincide: true, posicionId: 'pos:A-10.2' }, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/nace en Cuarentena/) })
    const dev = exito(await repo.crearSolicitud({
      tipo: 'DEVOLUCION', propietarioId: await propietario('DIPHASAC'), docOriginalTipo: 'BOLETA', docOriginalNumero: 'B001-2',
      lineas: [{ productoId: 'prod:1', lote: 'DV-9', vence: '30/06/2028', cantidad: 3 }],
    }, true, SANDRA))
    exito(await repo.iniciarRecepcion(dev.id, CHARLIE))
    const d = (await repo.obtenerSolicitud(dev.id))!
    expect(await repo.verificarLinea(dev.id, d.lineas[0].id, { coincide: true, posicionId: A6 }, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/nunca pasa por Cuarentena/) })
  })

  it('(D-35) lote distinto al declarado: ajuste explícito con motivo, no rechazo automático', async () => {
    const x = await solicitudDeCompra('OC-DEMO-0002', 6, 'DECL')
    exito(await repo.iniciarRecepcion(x.id, CHARLIE))
    expect(await repo.verificarLinea(x.id, x.linea.id, { coincide: false, lote: 'REAL', posicionId: A6 }, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/motivo/) })
    exito(await repo.verificarLinea(x.id, x.linea.id, { coincide: false, lote: 'REAL', motivo: 'La etiqueta dice REAL', posicionId: A6 }, CHARLIE))
    const s = (await repo.obtenerSolicitud(x.id))!
    expect(s.lineas[0]).toMatchObject({ lote: 'REAL', verificacion: 'AJUSTADA', estadoLinea: 'AJUSTADA' })
    expect(s.cambios.find((c) => c.campo === 'lote')).toMatchObject({ antes: 'DECL', despues: 'REAL', motivo: 'La etiqueta dice REAL' })
  })

  it('un mismo lote no puede tener dos vencimientos: el camino es el ajuste explícito', async () => {
    const a = await solicitudDeCompra('OC-DEMO-0002', 2, 'DUP')
    await recibirTodo(a.id)
    const oc = await ocId('OC-DEMO-0004')
    const r = exito(await repo.crearSolicitud({ tipo: 'COMPRA_LOCAL', propietarioId: await propietario('LOGISSA'), ocId: oc.ocId, lineas: [{ ocItemId: oc.items[0].ocItemId, lote: 'DUP', vence: '31/01/2029', cantidad: 2 }] }, true, SANDRA))
    // Es otro producto: el lote DUP de otro producto no choca. Se prueba con el mismo producto (OC-0002).
    void r
    const oc2 = await ocId('OC-DEMO-0002')
    const b = exito(await repo.crearSolicitud({ tipo: 'COMPRA_LOCAL', propietarioId: await propietario('LOGISSA'), ocId: oc2.ocId, lineas: [{ ocItemId: oc2.items[0].ocItemId, lote: 'DUP', vence: '31/01/2029', cantidad: 2 }] }, true, SANDRA))
    exito(await repo.iniciarRecepcion(b.id, CHARLIE))
    const sb = (await repo.obtenerSolicitud(b.id))!
    exito(await repo.verificarLinea(b.id, sb.lineas[0].id, { coincide: true, posicionId: A6 }, CHARLIE))
    exito(await repo.editarRecepcion(b.id, datos, CHARLIE))
    const g = exito(await repo.generarActa(b.id, CHARLIE))
    await firmarTodo(g.actaId)
    expect(await repo.confirmarIngreso(b.id, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/otro vencimiento[\s\S]*Ajusta el dato de la solicitud/) })
  })
})

describe('ejemplos 20–23 del addendum', () => {
  it('(20) OC 50 · factura 45 · física 45: la solicitud pasa de 50 a 45; Compras debe registrar 45 y lo ve en el bloque', async () => {
    const x = await solicitudDeCompra('OC-DEMO-0004', 50, 'E20')
    await recibirTodo(x.id, { diferencia: { cantidad: 45, motivo: 'La factura y la caja traen 45' } })
    const s = (await repo.obtenerSolicitud(x.id))!
    expect(s.lineas[0]).toMatchObject({ ocPedida: 300, inicial: 50, cantidad: 45, fisica: 45, estadoLinea: 'AJUSTADA' })
    expect(s.cambios.filter((c) => c.campo === 'cantidad')).toEqual([expect.objectContaining({ antes: '50', despues: '45', usuario: 'Charlie', motivo: 'La factura y la caja traen 45' })])
    expect(s.cantidadFisica).toEqual([expect.objectContaining({ fisica: 45, estado: 'FALTA' })])
    // Alguien copia el valor a Compras (a mano).
    ;(globalThis as { __wmsDemo?: { compras: { items: { ocItemId: string; recibida: number }[] }[] } }).__wmsDemo!.compras.find((c) => c.items.some((i) => i.ocItemId === x.oc.items[0].ocItemId))!.items[0].recibida = 45
    expect((await repo.obtenerSolicitud(x.id))!.cantidadFisica[0].estado).toBe('OK')
  })

  it('(21) física 45 y Compras copió 50 → NO COINCIDE, con aviso al Jefe de Almacén y a Dirección Técnica', async () => {
    const x = await solicitudDeCompra('OC-DEMO-0004', 50, 'E21')
    await recibirTodo(x.id, { diferencia: { cantidad: 45, motivo: 'Faltaron 5' } })
    const g = (globalThis as { __wmsDemo?: { compras: { items: { ocItemId: string; recibida: number }[] }[] } }).__wmsDemo!
    g.compras.find((c) => c.items.some((i) => i.ocItemId === x.oc.items[0].ocItemId))!.items[0].recibida = 50
    expect((await repo.obtenerSolicitud(x.id))!.cantidadFisica[0]).toMatchObject({ esperado: 45, registrado: 50, estado: 'NO_COINCIDE' })
    const a = (await repo.listarAlertas()).filter((y) => y.tipo === 'NO_COINCIDE_CON_COMPRAS' && y.solicitudId === x.id)
    expect(a.map((y) => y.destinatario).sort()).toEqual(['direccion_tecnica', 'jefe_almacen'])
  })

  it('(22) coincide con la solicitud: sin cambios ni avisos de ajuste', async () => {
    const x = await solicitudDeCompra('OC-DEMO-0004', 50, 'E22')
    await recibirTodo(x.id)
    const s = (await repo.obtenerSolicitud(x.id))!
    expect(s.cambios.filter((c) => c.campo === 'cantidad')).toHaveLength(0)
    expect(s.conDiferencias).toBe(false)
    expect((await repo.listarAlertas()).filter((y) => y.tipo === 'SOLICITUD_AJUSTADA' && y.solicitudId === x.id)).toHaveLength(0)
  })

  it('(23) llega más que el saldo de la OC (6 → 11): se registra lo físico y se alerta EXCEDE_OC; el WMS no lo resuelve', async () => {
    const x = await solicitudDeCompra('OC-DEMO-0002', 6, 'E23')
    expect((await repo.listarAlertas()).filter((y) => y.tipo === 'EXCEDE_OC' && y.solicitudId === x.id)).toHaveLength(0)
    exito(await repo.iniciarRecepcion(x.id, CHARLIE))
    exito(await repo.verificarLinea(x.id, x.linea.id, { coincide: false, cantidad: 11, motivo: 'Llegaron 5 cajas de más', posicionId: A6 }, CHARLIE))
    exito(await repo.editarRecepcion(x.id, datos, CHARLIE))
    const g = exito(await repo.generarActa(x.id, CHARLIE))
    await firmarTodo(g.actaId)
    exito(await repo.confirmarIngreso(x.id, CHARLIE))
    const a = (await repo.listarAlertas()).filter((y) => y.tipo === 'EXCEDE_OC' && y.solicitudId === x.id)
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ destinatario: 'direccion_tecnica', mensaje: expect.stringMatching(/sobran 5/) })
    expect((await repo.obtenerSolicitud(x.id))!).toMatchObject({ estado: 'CERRADA' })
    const p = await repo.panorama()
    expect(p.saldos.filter((s) => p.lotes.find((l) => l.id === s.loteId)?.codigo === 'E23').map((s) => s.cantidad)).toEqual([11])
  })
})

describe('la solicitud se corrige en el mismo correlativo (D-34)', () => {
  it('cada vuelta queda campo a campo; avisa a Sandra y a Katia; lo anunciado no se reescribe', async () => {
    const x = await solicitudDeCompra('OC-DEMO-0004', 50, 'H-1')
    exito(await repo.iniciarRecepcion(x.id, CHARLIE))
    const verificar = (cantidad: number, motivo: string) => repo.verificarLinea(x.id, x.linea.id, { coincide: false, cantidad, motivo, posicionId: A6 }, CHARLIE)
    exito(await verificar(45, 'Faltaron 5'))
    exito(await verificar(44, 'Se rompió una caja'))
    const s = (await repo.obtenerSolicitud(x.id))!
    expect(s.numero).toBe(x.numero)
    expect(s.lineas[0]).toMatchObject({ inicial: 50, cantidad: 44 })
    expect(s.cambios.filter((c) => c.campo === 'cantidad').map((c) => [c.antes, c.despues]).reverse()).toEqual([['50', '45'], ['45', '44']])
    const avisos = (await repo.listarAlertas()).filter((y) => y.tipo === 'SOLICITUD_AJUSTADA' && y.solicitudId === x.id)
    expect(avisos.map((y) => y.destinatario).sort()).toEqual(['asistente_dt', 'asistente_dt', 'direccion_tecnica', 'direccion_tecnica'])
    expect(avisos[0].mensaje).toMatch(/cantidad 4[45] → 4[45]/)
    expect(s.versiones.length).toBeGreaterThanOrEqual(4)
  })

  it('después de autorizar, todo cambio necesita motivo; antes, no', async () => {
    const b = await solicitudDeCompra('OC-DEMO-0002', 6, 'M-1', false)
    exito(await repo.ajustarSolicitud(b.id, [{ op: 'LINEA', lineaId: b.linea.id, campo: 'cantidad', valor: '5' }], undefined, SANDRA))
    exito(await repo.autorizarSolicitud(b.id, KATIA))
    expect((await repo.obtenerSolicitud(b.id))!.lineas[0].inicial).toBe(5)
    expect(await repo.ajustarSolicitud(b.id, [{ op: 'LINEA', lineaId: b.linea.id, campo: 'cantidad', valor: '4' }], undefined, SANDRA)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/necesita su motivo/) })
    exito(await repo.ajustarSolicitud(b.id, [{ op: 'LINEA', lineaId: b.linea.id, campo: 'cantidad', valor: '4' }], 'El proveedor avisó', SANDRA))
    expect((await repo.obtenerSolicitud(b.id))!.lineas[0]).toMatchObject({ inicial: 5, cantidad: 4, estadoLinea: 'AJUSTADA' })
  })
})

describe('devolución e ingreso de cliente', () => {
  it('(3) la devolución sin factura o boleta de referencia no se registra', async () => {
    const r = await repo.crearSolicitud({
      tipo: 'DEVOLUCION', propietarioId: await propietario('TRIAMED'), guiaNumero: 'G-1', lineas: [{ productoId: 'prod:1', lote: 'D-1', vence: '30/06/2028', cantidad: 5 }],
    }, true, SANDRA)
    expect(r).toMatchObject({ ok: false, mensaje: expect.stringMatching(/factura o boleta original/) })
  })

  it('(D-31) la devolución nace en Devoluciones, nunca en Cuarentena, y su acta organoléptica la lleva a Aprobado', async () => {
    const dip = await propietario('DIPHASAC')
    const r = exito(await repo.crearSolicitud({
      tipo: 'DEVOLUCION', propietarioId: dip, contraparteNombre: 'Clínica', guiaNumero: 'G-2', docOriginalTipo: 'FACTURA', docOriginalNumero: 'F001-1', motivo: 'Sin rotación',
      lineas: [{ productoId: 'prod:1', lote: 'DEV-1', vence: '30/06/2028', cantidad: 5 }],
    }, true, SANDRA))
    const posDev = (await repo.posicionesDestino('DEVOLUCION'))[0].id
    await recibirTodo(r.id, { pos: posDev })
    const p = await repo.panorama()
    const saldos = p.saldos.filter((s) => p.lotes.find((l) => l.id === s.loteId)?.codigo === 'DEV-1')
    expect(saldos.map((s) => s.estado)).toEqual(['DEVOLUCIONES'])
    expect(saldos.some((s) => s.estado === 'CUARENTENA')).toBe(false)
    const o = (await repo.obtenerSolicitud(r.id))!.organolepticas[0]
    exito(await repo.guardarOrganoleptica(o.id, { certAnalisis: true, checklist: checklistConforme(), destinoSugerido: 'APROBADO', conclusion: 'CONFORME' }, true, SANDRA))
    exito(await repo.decidirOrganoleptica(o.id, 'APROBADO', undefined, KATIA))
    expect((await repo.panorama()).saldos.filter((s) => s.procedenciaId === o.ingresoLoteId).map((s) => s.estado)).toEqual(['APROBADO'])
  })

  it('(4) el ingreso de cliente cuadra contra su guía y queda a nombre del cliente', async () => {
    const dip = await propietario('DIPHASAC')
    expect(await repo.crearSolicitud({ tipo: 'INGRESO_CLIENTE', propietarioId: await propietario('LOGISSA'), guiaNumero: 'G', lineas: [{ productoId: 'prod:1', lote: 'C-1', vence: '30/06/2028', cantidad: 10 }] }, true, SANDRA))
      .toMatchObject({ ok: false, mensaje: expect.stringMatching(/a nombre del cliente/) })
    expect(await repo.crearSolicitud({ tipo: 'INGRESO_CLIENTE', propietarioId: dip, lineas: [{ productoId: 'prod:1', lote: 'C-1', vence: '30/06/2028', cantidad: 10 }] }, true, SANDRA))
      .toMatchObject({ ok: false, mensaje: expect.stringMatching(/guía del cliente/) })
    const r = exito(await repo.crearSolicitud({ tipo: 'INGRESO_CLIENTE', propietarioId: dip, guiaNumero: 'G-77', lineas: [{ productoId: 'prod:1', lote: 'C-1', vence: '30/06/2028', cantidad: 6 }, { productoId: 'prod:1', lote: 'C-2', vence: '30/06/2028', cantidad: 4 }] }, true, SANDRA))
    await recibirTodo(r.id)
    const p = await repo.panorama()
    const nuevos = p.saldos.filter((s) => ['C-1', 'C-2'].includes(p.lotes.find((l) => l.id === s.loteId)!.codigo))
    expect(nuevos.every((s) => s.propietarioId === dip && s.estado === 'CUARENTENA')).toBe(true)
  })
})

describe('acta de recepción', () => {
  it('prellenada desde la solicitud final: lleva su número, la cantidad inicial y la verificada', async () => {
    const x = await solicitudDeCompra('OC-DEMO-0004', 50, 'P-1')
    exito(await repo.iniciarRecepcion(x.id, CHARLIE))
    exito(await repo.verificarLinea(x.id, x.linea.id, { coincide: false, cantidad: 45, motivo: 'Faltaron 5', posicionId: A6 }, CHARLIE))
    exito(await repo.editarRecepcion(x.id, datos, CHARLIE))
    exito(await repo.generarActa(x.id, CHARLIE))
    const c = (await repo.obtenerSolicitud(x.id))!.actas[0].contenido
    expect(c.solicitud).toMatchObject({ numero: x.numero })
    expect(c.lineas[0]).toMatchObject({ cantidadEstablecida: 45, cantidadRecibida: 45 })
    expect(c.lineas[0].lotes[0]).toMatchObject({ lote: 'P-1', cantidad: 45, cantidadInicial: 50 })
  })

  it('numera I-AAAAMM-correlativo; cada rol firma con su rol; el transportista exige DNI, placa y firma', async () => {
    const x = await solicitudDeCompra('OC-DEMO-0002', 4, 'F-1')
    exito(await repo.iniciarRecepcion(x.id, CHARLIE))
    exito(await repo.verificarLinea(x.id, x.linea.id, { coincide: true, posicionId: A6 }, CHARLIE))
    exito(await repo.editarRecepcion(x.id, { temperaturaC: 22 }, CHARLIE))
    const a = exito(await repo.generarActa(x.id, CHARLIE))
    expect((await repo.obtenerSolicitud(x.id))!.actas[0].numero).toMatch(/^I-\d{6}-\d{4}$/)
    expect(await repo.firmarActa(a.actaId, { rol: 'JEFE_ALMACEN' }, AUX)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Jefe de Almacén/) })
    expect(await repo.firmarActa(a.actaId, { rol: 'DIRECCION_TECNICA' }, CHARLIE)).toMatchObject({ ok: false })
    expect(await repo.firmarActa(a.actaId, { rol: 'TRANSPORTISTA', nombre: 'P', dni: '12', placa: 'X', imagen: IMG }, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/8 dígitos/) })
    exito(await repo.firmarActa(a.actaId, { rol: 'JEFE_ALMACEN' }, CHARLIE))
    expect(await repo.firmarActa(a.actaId, { rol: 'JEFE_ALMACEN' }, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/ya firmó/) })
    // Con firmas, la recepción y la solicitud ya no se editan.
    expect(await repo.editarRecepcion(x.id, { temperaturaC: 18 }, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/anúlala con motivo/) })
    expect(await repo.ajustarSolicitud(x.id, [{ op: 'LINEA', lineaId: x.linea.id, campo: 'cantidad', valor: '3' }], 'x', SANDRA)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/anúlala con motivo/) })
    expect(await repo.confirmarIngreso(x.id, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/cuatro partes/) })
  })

  it('(5) firmada no se edita; anular y reemitir conserva ambas, vinculadas, con otro número', async () => {
    const x = await solicitudDeCompra('OC-DEMO-0002', 4, 'F-2')
    exito(await repo.iniciarRecepcion(x.id, CHARLIE))
    exito(await repo.verificarLinea(x.id, x.linea.id, { coincide: true, posicionId: A6 }, CHARLIE))
    exito(await repo.editarRecepcion(x.id, { temperaturaC: 22, placa: 'ABC-123' }, CHARLIE))
    const g = exito(await repo.generarActa(x.id, CHARLIE))
    await firmarTodo(g.actaId)
    expect((await repo.obtenerSolicitud(x.id))!.actas[0].estado).toBe('FIRMADA')
    expect(await repo.firmarActa(g.actaId, { rol: 'JEFE_ALMACEN' }, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/ya no admite firmas/) })
    expect(await repo.generarActa(x.id, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/ya tiene su acta firmada/) })
    expect(await repo.anularActa(g.actaId, ' ', CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/motivo/) })
    expect(await repo.anularActa(g.actaId, 'error', AUX)).toMatchObject({ ok: false })
    exito(await repo.anularActa(g.actaId, 'Placa mal escrita', CHARLIE))
    exito(await repo.editarRecepcion(x.id, { placa: 'XYZ-999' }, CHARLIE))
    const nueva = exito(await repo.reemitirActa(g.actaId, CHARLIE))
    const actas = (await repo.obtenerSolicitud(x.id))!.actas
    expect(actas).toHaveLength(2)
    const vieja = actas.find((a) => a.id === g.actaId)!
    const nuevaV = actas.find((a) => a.id === nueva.actaId)!
    expect(vieja).toMatchObject({ estado: 'ANULADA', motivoAnulacion: 'Placa mal escrita', reemplazadaPorNumero: nuevaV.numero })
    expect(nuevaV).toMatchObject({ estado: 'BORRADOR', reemplazaANumero: vieja.numero })
    expect(nuevaV.numero).not.toBe(vieja.numero)
    expect(vieja.contenido.ingreso.placa).toBe('ABC-123')
    expect(nuevaV.contenido.ingreso.placa).toBe('XYZ-999')
    expect(await repo.reemitirActa(g.actaId, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/ya fue reemitida/) })
  })
})

describe('calidad', () => {
  const pendiente = async () => (await repo.colaDireccionTecnica()).organolepticas.find((o) => o.productoCodigo !== 'DEMO-015')!
  const conRSVencido = async () => (await repo.colaDireccionTecnica()).organolepticas.find((o) => o.productoCodigo === 'DEMO-015')!

  it('(8) Katia aprueba con el acta firmada: pasa a Aprobado en su lugar (por trasladar)', async () => {
    const o = await pendiente()
    expect(await repo.decidirOrganoleptica(o.id, 'APROBADO', undefined, SANDRA)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Solo Dirección Técnica/) })
    exito(await repo.decidirOrganoleptica(o.id, 'APROBADO', undefined, KATIA))
    const f = (await repo.obtenerOrganoleptica(o.id))!
    expect(f).toMatchObject({ estado: 'FIRMADA', decision: 'APROBADO' })
    expect(f.hash).toMatch(/^[0-9a-f]{64}$/)
    expect((await repo.panorama()).saldos.filter((x) => x.procedenciaId === o.ingresoLoteId).map((x) => x.estado)).toEqual(['APROBADO'])
    expect(await repo.decidirOrganoleptica(o.id, 'BAJAS_RECHAZADOS', undefined, KATIA)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/ya está firmada/) })
  })

  it('(7) registro sanitario vencido: se alertó y la aprobación queda bloqueada; rechazar sí se puede', async () => {
    const o = await conRSVencido()
    expect((await repo.listarAlertas()).some((a) => a.tipo === 'RS_VENCIDO' && a.estado === 'ABIERTA')).toBe(true)
    expect(await repo.decidirOrganoleptica(o.id, 'APROBADO', undefined, KATIA)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/registro sanitario está vencido/) })
    expect((await repo.obtenerOrganoleptica(o.id))!.estado).toBe('PENDIENTE_DT')
    exito(await repo.decidirOrganoleptica(o.id, 'BAJAS_RECHAZADOS', 'RS vencido', KATIA))
    expect((await repo.panorama()).saldos.filter((x) => x.procedenciaId === o.ingresoLoteId).map((x) => x.estado)).toEqual(['BAJAS_RECHAZADOS'])
  })

  it('no se aprueba lo no conforme, y el acta incompleta no llega a Katia', async () => {
    const bor = (await repo.colaDireccionTecnica()).borradores[0]
    expect(await repo.guardarOrganoleptica(bor.id, {}, true, SANDRA)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Para enviarla a Dirección Técnica/) })
    expect(await repo.guardarOrganoleptica(bor.id, {}, false, AUX)).toMatchObject({ ok: false })
    exito(await repo.guardarOrganoleptica(bor.id, { certAnalisis: false, checklist: { ...checklistConforme(), emb_limpio: 'NC' }, destinoSugerido: 'DEVOLUCION', conclusion: 'NO_CONFORME' }, true, SANDRA))
    expect(await repo.decidirOrganoleptica(bor.id, 'APROBADO', undefined, KATIA)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/NO CONFORME/) })
    exito(await repo.decidirOrganoleptica(bor.id, 'BAJAS_RECHAZADOS', 'Embalaje sucio', KATIA))
  })
})

describe('alertas', () => {
  it('solo el destinatario (o Dirección Técnica) atiende; queda quién y cuándo', async () => {
    const alertas = (await repo.listarAlertas()).filter((a) => a.estado === 'ABIERTA')
    const temp = alertas.find((a) => a.tipo === 'TEMPERATURA')!
    expect(temp.mensaje).toMatch(/31\.5 °C/)
    expect(await repo.atenderAlerta(temp.id, 'ok', AUX)).toMatchObject({ ok: false })
    exito(await repo.atenderAlerta(temp.id, 'Producto no termolábil', KATIA))
    expect((await repo.listarAlertas()).find((a) => a.id === temp.id)!).toMatchObject({ estado: 'ATENDIDA', atendidaPor: 'Katia', nota: 'Producto no termolábil' })
    exito(await repo.atenderAlerta(alertas.find((a) => a.tipo === 'POR_TRASLADAR_VENCIDO')!.id, undefined, CHARLIE))
    const ajuste = alertas.find((a) => a.tipo === 'SOLICITUD_AJUSTADA' && a.destinatario === 'asistente_dt')!
    expect(await repo.atenderAlerta(ajuste.id, undefined, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Asistente/) })
    exito(await repo.atenderAlerta(ajuste.id, 'Visto', SANDRA))
  })

  it('integración manual con Compras: NO COINCIDE (WMS 120, Compras 118) y POR REGISTRAR pasado el plazo', async () => {
    const alertas = await repo.listarAlertas()
    const nc = alertas.find((a) => a.tipo === 'NO_COINCIDE_CON_COMPRAS' && a.destinatario === 'jefe_almacen')!
    expect(nc.mensaje).toMatch(/en WMS recibimos 120 y Compras muestra 118/)
    const falta = alertas.find((a) => a.tipo === 'POR_REGISTRAR_EN_COMPRAS')!
    expect(falta).toMatchObject({ destinatario: 'jefe_almacen' })
    expect(falta.mensaje).toMatch(/cantidad física confirmada es 200/)
    // Compras copia el valor correcto: la alerta se cierra sola.
    ;(globalThis as { __wmsDemo?: { compras: { codigo: string; items: { recibida: number }[] }[] } }).__wmsDemo!.compras.find((c) => c.codigo === 'OC-DEMO-0006')!.items[0].recibida = 200
    expect((await repo.listarAlertas()).find((a) => a.id === falta.id)!.estado).toBe('ATENDIDA')
  })

  it('la solicitud con la cantidad física registrada de otro modo se ve en la lista (para el aviso de Inicio)', async () => {
    const lista = await repo.listarSolicitudes()
    expect(lista.find((s) => s.referencia === 'OC-DEMO-0001')!.registroCompras).toBe('NO_COINCIDE')
    expect(lista.find((s) => s.referencia === 'OC-DEMO-0006')!.registroCompras).toBe('FALTA')
    expect(lista.find((s) => s.referencia === 'OC-DEMO-0003')!.registroCompras).toBe('OK')
    expect(lista.find((s) => s.referencia === 'OC-DEMO-0002')!.registroCompras).toBeUndefined()
  })
})

describe('vencimiento de lotes en el inventario (D-30)', () => {
  it('alerta de lote por vencer (Jefe de Almacén) y de lote vencido (Dirección Técnica)', async () => {
    const abiertas = (await repo.listarAlertas()).filter((a) => a.estado === 'ABIERTA')
    const pronto = abiertas.find((a) => a.tipo === 'LOTE_POR_VENCER' && a.mensaje.includes('L-VENCE-PRONTO'))!
    expect(pronto).toMatchObject({ destinatario: 'jefe_almacen' })
    expect(pronto.mensaje).toMatch(/L-VENCE-PRONTO.*en 38 días.*90 unidades/)
    const vencido = abiertas.find((a) => a.tipo === 'LOTE_VENCIDO')!
    expect(vencido).toMatchObject({ destinatario: 'direccion_tecnica' })
    expect(vencido.mensaje).toMatch(/L-VENCIDO.*hace 12 días.*sigue en el inventario/)
    expect(await repo.atenderAlerta(vencido.id, 'Se separó', AUX)).toMatchObject({ ok: false })
    exito(await repo.atenderAlerta(vencido.id, 'Se separó y se pasa a baja', KATIA))
    expect((await repo.listarAlertas()).filter((a) => a.tipo === 'LOTE_VENCIDO' && a.estado === 'ABIERTA')).toHaveLength(0)
  })
})

describe('expediente', () => {
  it('se arma al confirmar y Sandra lo cierra solo sin faltantes', async () => {
    const x = (await repo.listarExpedientes()).find((e) => e.clave === 'OC-DEMO-0001')!
    expect(x.faltantesAbiertos).toBeGreaterThan(0)
    expect(await repo.cerrarExpediente(x.id, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Sandra/) })
    expect(await repo.cerrarExpediente(x.id, SANDRA)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/faltante/) })
    const v = (await repo.obtenerExpediente(x.id))!
    expect(v.documentos.map((d) => d.tipo)).toEqual(expect.arrayContaining(['ACTA_RECEPCION', 'SOLICITUD_INGRESO', 'GUIA_REMISION']))
    expect(v.documentos.find((d) => d.tipo === 'SOLICITUD_INGRESO')!.descripcion).toMatch(/Solicitud de Ingreso SI-/)
    expect(v.ingresos[0].numero).toMatch(/^SI-/)
    for (const f of v.faltantes.filter((y) => y.estado === 'ABIERTO')) exito(await repo.resolverFaltante(f.id, 'Entregado', SANDRA))
    exito(await repo.cerrarExpediente(x.id, SANDRA))
    expect((await repo.obtenerExpediente(x.id))!.estado).toBe('CERRADO')
    exito(await repo.agregarFaltante(x.id, 'Certificado de análisis', 'Proveedor', SANDRA))
    expect((await repo.obtenerExpediente(x.id))!.estado).toBe('ABIERTO')
  })
})

describe('búsqueda de solicitudes, OC y actas', () => {
  it('encuentra la solicitud por su número y por su OC, el acta de recepción y el acta organoléptica', async () => {
    const s = (await repo.listarSolicitudes()).find((x) => x.referencia === 'OC-DEMO-0001')!
    expect((await repo.buscarEntradas(s.numero))[0]).toMatchObject({ tipo: 'oc', href: `/entradas/${s.id}` })
    expect((await repo.buscarEntradas('OC-DEMO-0001'))[0]).toMatchObject({ tipo: 'oc', href: `/entradas/${s.id}` })
    expect((await repo.buscarEntradas(s.actaNumero!))[0]).toMatchObject({ tipo: 'acta' })
    expect((await repo.buscarEntradas('O-2')).find((r) => r.href.startsWith('/calidad/'))).toMatchObject({ tipo: 'acta' })
    expect(await repo.buscarEntradas('zzzz')).toEqual([])
  })
})
