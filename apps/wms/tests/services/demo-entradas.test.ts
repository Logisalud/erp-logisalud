// El motor de entradas del modo demostración aplica las mismas reglas que la base de datos.
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

async function firmarTodo(actaId: string) {
  exito(await repo.firmarActa(actaId, { rol: 'JEFE_ALMACEN' }, CHARLIE))
  exito(await repo.firmarActa(actaId, { rol: 'DIRECCION_TECNICA' }, KATIA))
  exito(await repo.firmarActa(actaId, { rol: 'RESPONSABLE_CONTEO' }, AUX))
  return exito(await repo.firmarActa(actaId, { rol: 'TRANSPORTISTA', nombre: 'Pedro Quispe', dni: '45678912', placa: 'ABC-123', imagen: IMG }, CHARLIE))
}

describe('datos de prueba de entradas', () => {
  it('hay ingresos en varios pasos, alertas, una cola para Dirección Técnica y un expediente', async () => {
    const lista = await repo.listarIngresos()
    expect(new Set(lista.map((i) => i.paso))).toEqual(new Set(['DATOS_Y_LOTES', 'FIRMAS', 'CONFIRMADO']))
    const cola = await repo.colaDireccionTecnica()
    expect(cola.organolepticas.length).toBeGreaterThanOrEqual(2)
    const tipos = (await repo.listarAlertas()).filter((a) => a.estado === 'ABIERTA').map((a) => a.tipo).sort()
    expect(tipos).toEqual(expect.arrayContaining(['DIVERGENCIA_COMPRAS', 'POR_TRASLADAR_VENCIDO', 'RS_VENCIDO', 'TEMPERATURA']))
    expect((await repo.listarExpedientes()).length).toBeGreaterThan(0)
    expect((await repo.recepcionesDeCompra()).filter((r) => !r.ingresoId).length).toBeGreaterThanOrEqual(3)
  })
})

describe('compra local', () => {
  async function nuevaCompra(recepcion: string) {
    const r = exito(await repo.crearIngreso({ tipo: 'COMPRA_LOCAL', propietarioId: await propietario('LOGISSA'), compraRecepcionId: recepcion }, CHARLIE))
    const d = (await repo.obtenerIngreso(r.id))!
    return { id: r.id, d }
  }
  const datos = { temperaturaC: 20, bultos: 3, paletas: 1, placa: 'ABC-123', tipoConteo: 'TOTAL' as const }

  it('(1) compra de 300; lotes 200 + 100 → confirma y nace en Cuarentena en A-6..A-9', async () => {
        const rec = (await repo.recepcionesDeCompra()).find((r) => !r.ingresoId && r.lineas.length === 1 && r.lineas[0].cantidad === 300)!
    expect(rec).toBeTruthy()
    const { id, d } = await nuevaCompra(rec.recepcionId)
    expect(d.lineas[0].cantidadReferencia).toBe(300)
    exito(await repo.guardarLotes(id, d.lineas[0].id, [
      { codigo: 'T-1', cantidad: 200, vence: '30/06/2028', posicionId: A6 }, { codigo: 'T-2', cantidad: 100, vence: '06/2028', posicionId: 'pos:A-7' },
    ], CHARLIE))
    exito(await repo.editarIngreso(id, datos, CHARLIE))
    const g = exito(await repo.generarActa(id, CHARLIE))
    expect((await firmarTodo(g.actaId)).completa).toBe(true)
    exito(await repo.confirmarIngreso(id, CHARLIE))
    const p = await repo.panorama()
    const nuevos = p.saldos.filter((s) => p.lotes.find((l) => l.id === s.loteId)?.codigo.startsWith('T-'))
    expect(nuevos.map((s) => [s.estado, s.cantidad]).sort()).toEqual([['CUARENTENA', 100], ['CUARENTENA', 200]])
    for (const s of nuevos) expect(['pos:A-6', 'pos:A-7', 'pos:A-8', 'pos:A-9']).toContain(s.posicionId)
    // Vencimiento solo mes/año → último día del mes (junio 2028 tiene 30; 06/2028 → 2028-06-30).
    expect(p.lotes.find((l) => l.codigo === 'T-2')?.vence).toBe('2028-06-30')
    expect((await repo.obtenerIngreso(id))!.paso).toBe('CONFIRMADO')
  })

  it('(2) lotes que no suman la referencia: no genera el acta y dice cuánto falta o sobra', async () => {
    const rec = (await repo.recepcionesDeCompra()).find((r) => !r.ingresoId && r.lineas.length === 1 && r.lineas[0].cantidad === 300)!
    const { id, d } = await nuevaCompra(rec.recepcionId)
    exito(await repo.guardarLotes(id, d.lineas[0].id, [
      { codigo: 'T-3', cantidad: 200, vence: '30/06/2028', posicionId: A6 }, { codigo: 'T-4', cantidad: 101, vence: '30/06/2028', posicionId: A6 },
    ], CHARLIE))
    exito(await repo.editarIngreso(id, datos, CHARLIE))
    const r = await repo.generarActa(id, CHARLIE)
    expect(r).toMatchObject({ ok: false, mensaje: expect.stringMatching(/suman 301 y la referencia es 300: sobran 1/) })
    const c = await repo.confirmarIngreso(id, CHARLIE)
    expect(c.ok).toBe(false)
    const d2 = (await repo.obtenerIngreso(id))!
    expect(d2.paso).toBe('DATOS_Y_LOTES')
    expect(d2.cuadra).toBe(false)
  })

  it('no se repite una recepción de Compras ni un lote con otro vencimiento', async () => {
    const rec = (await repo.recepcionesDeCompra()).find((r) => !r.ingresoId)!
    const { id, d } = await nuevaCompra(rec.recepcionId)
    expect(await repo.crearIngreso({ tipo: 'COMPRA_LOCAL', propietarioId: await propietario('LOGISSA'), compraRecepcionId: rec.recepcionId }, CHARLIE))
      .toMatchObject({ ok: false, mensaje: expect.stringMatching(/ya tiene su ingreso/) })
    exito(await repo.guardarLotes(id, d.lineas[0].id, [{ codigo: 'T-DUP', cantidad: 1, vence: '30/06/2028', posicionId: A6 }], CHARLIE))
    const otra = (await repo.recepcionesDeCompra()).find((r) => !r.ingresoId)!
    const n = await nuevaCompra(otra.recepcionId)
    const mismoProducto = n.d.lineas.find((l) => l.productoId === d.lineas[0].productoId)
    if (mismoProducto) {
      expect(await repo.guardarLotes(n.id, mismoProducto.id, [{ codigo: 'T-DUP', cantidad: 1, vence: '31/12/2029', posicionId: A6 }], CHARLIE))
        .toMatchObject({ ok: false, mensaje: expect.stringMatching(/otro vencimiento/) })
    }
  })

  it('solo Cuarentena (A-6..A-9) recibe inventario nuevo', async () => {
    const rec = (await repo.recepcionesDeCompra()).find((r) => !r.ingresoId)!
    const { id, d } = await nuevaCompra(rec.recepcionId)
    expect(await repo.guardarLotes(id, d.lineas[0].id, [{ codigo: 'T-X', cantidad: 1, vence: '30/06/2028', posicionId: 'pos:A-10.2' }], CHARLIE))
      .toMatchObject({ ok: false, mensaje: expect.stringMatching(/nace en Cuarentena/) })
  })
})

describe('devolución e ingreso de cliente', () => {
  it('(3) la devolución sin factura o boleta de referencia no se registra', async () => {
    const r = await repo.crearIngreso({
      tipo: 'DEVOLUCION', propietarioId: await propietario('TRIAMED'), guiaNumero: 'G-1', lineas: [{ productoId: 'prod:1', cantidadReferencia: 5 }],
    }, CHARLIE)
    expect(r).toMatchObject({ ok: false, mensaje: expect.stringMatching(/factura o boleta original/) })
  })

  it('(4) el ingreso de cliente cuadra contra la guía y queda a nombre del cliente', async () => {
    const dip = await propietario('DIPHASAC')
    const r = exito(await repo.crearIngreso({ tipo: 'INGRESO_CLIENTE', propietarioId: dip, guiaNumero: 'G-77', lineas: [{ productoId: 'prod:1', cantidadReferencia: 10 }] }, CHARLIE))
    const d = (await repo.obtenerIngreso(r.id))!
    exito(await repo.guardarLotes(r.id, d.lineas[0].id, [{ codigo: 'C-1', cantidad: 6, vence: '30/06/2028', posicionId: A6 }, { codigo: 'C-2', cantidad: 4, vence: '30/06/2028', posicionId: A6 }], CHARLIE))
    exito(await repo.editarIngreso(r.id, { temperaturaC: 19 }, CHARLIE))
    exito(await repo.generarActa(r.id, CHARLIE))
    const g = (await repo.obtenerIngreso(r.id))!.actas[0]
    await firmarTodo(g.id)
    exito(await repo.confirmarIngreso(r.id, CHARLIE))
    const p = await repo.panorama()
    expect(p.saldos.filter((s) => ['C-1', 'C-2'].includes(p.lotes.find((l) => l.id === s.loteId)!.codigo)).every((s) => s.propietarioId === dip)).toBe(true)
  })
})

describe('acta de recepción', () => {
  async function ingresoFirmado() {
    const dip = await propietario('DIPHASAC')
    const r = exito(await repo.crearIngreso({ tipo: 'INGRESO_CLIENTE', propietarioId: dip, guiaNumero: 'G-5', lineas: [{ productoId: 'prod:2', cantidadReferencia: 4 }] }, CHARLIE))
    const d = (await repo.obtenerIngreso(r.id))!
    exito(await repo.guardarLotes(r.id, d.lineas[0].id, [{ codigo: 'F-1', cantidad: 4, vence: '30/06/2028', posicionId: A6 }], CHARLIE))
    exito(await repo.editarIngreso(r.id, { temperaturaC: 22, placa: 'ABC-123' }, CHARLIE))
    const a = exito(await repo.generarActa(r.id, CHARLIE))
    await firmarTodo(a.actaId)
    return { id: r.id, actaId: a.actaId }
  }

  it('numera I-AAAAMM-correlativo; cada rol firma con su rol; el transportista exige DNI, placa y firma', async () => {
    const dip = await propietario('DIPHASAC')
    const r = exito(await repo.crearIngreso({ tipo: 'INGRESO_CLIENTE', propietarioId: dip, guiaNumero: 'G-6', lineas: [{ productoId: 'prod:2', cantidadReferencia: 4 }] }, CHARLIE))
    const d = (await repo.obtenerIngreso(r.id))!
    exito(await repo.guardarLotes(r.id, d.lineas[0].id, [{ codigo: 'F-2', cantidad: 4, vence: '30/06/2028', posicionId: A6 }], CHARLIE))
    exito(await repo.editarIngreso(r.id, { temperaturaC: 22 }, CHARLIE))
    const a = exito(await repo.generarActa(r.id, CHARLIE))
    const acta = (await repo.obtenerIngreso(r.id))!.actas[0]
    expect(acta.numero).toMatch(/^I-\d{6}-\d{4}$/)
    expect(await repo.firmarActa(a.actaId, { rol: 'JEFE_ALMACEN' }, AUX)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Jefe de Almacén/) })
    expect(await repo.firmarActa(a.actaId, { rol: 'DIRECCION_TECNICA' }, CHARLIE)).toMatchObject({ ok: false })
    expect(await repo.firmarActa(a.actaId, { rol: 'TRANSPORTISTA', nombre: 'P', dni: '12', placa: 'X', imagen: IMG }, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/8 dígitos/) })
    exito(await repo.firmarActa(a.actaId, { rol: 'JEFE_ALMACEN' }, CHARLIE))
    expect(await repo.firmarActa(a.actaId, { rol: 'JEFE_ALMACEN' }, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/ya firmó/) })
    // Con firmas, el ingreso ya no se edita.
    expect(await repo.editarIngreso(r.id, { temperaturaC: 18 }, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/anúlala con motivo/) })
    expect(await repo.confirmarIngreso(r.id, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/cuatro partes/) })
  })

  it('(5) firmada no se edita; anular y reemitir conserva ambas, vinculadas', async () => {
    const { id, actaId } = await ingresoFirmado()
    expect((await repo.obtenerIngreso(id))!.actas[0].estado).toBe('FIRMADA')
    expect(await repo.firmarActa(actaId, { rol: 'JEFE_ALMACEN' }, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/ya no admite firmas/) })
    expect(await repo.generarActa(id, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/ya tiene su acta firmada/) })
    expect(await repo.anularActa(actaId, ' ', CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/motivo/) })
    expect(await repo.anularActa(actaId, 'error', AUX)).toMatchObject({ ok: false })
    exito(await repo.anularActa(actaId, 'Placa mal escrita', CHARLIE))
    exito(await repo.editarIngreso(id, { placa: 'XYZ-999' }, CHARLIE))
    const nueva = exito(await repo.reemitirActa(actaId, CHARLIE))
    const actas = (await repo.obtenerIngreso(id))!.actas
    expect(actas).toHaveLength(2)
    const vieja = actas.find((a) => a.id === actaId)!
    const nuevaV = actas.find((a) => a.id === nueva.actaId)!
    expect(vieja).toMatchObject({ estado: 'ANULADA', motivoAnulacion: 'Placa mal escrita', reemplazadaPorNumero: nuevaV.numero })
    expect(nuevaV).toMatchObject({ estado: 'BORRADOR', reemplazaANumero: vieja.numero })
    expect(vieja.contenido.ingreso.placa).toBe('ABC-123')
    expect(nuevaV.contenido.ingreso.placa).toBe('XYZ-999')
    expect(await repo.reemitirActa(actaId, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/ya fue reemitida/) })
  })

  it('la solicitud de ingreso guarda cada versión', async () => {
    const lista = await repo.listarIngresos()
    const id = lista[0].id
    const antes = (await repo.obtenerIngreso(id))!.solicitudVersion
    exito(await repo.editarSolicitud(id, { observaciones: 'Llegó con retraso' }, 'Se agregó la observación', CHARLIE))
    const d = (await repo.obtenerIngreso(id))!
    expect(d.solicitudVersion).toBe(antes + 1)
    expect(d.versiones[0]).toMatchObject({ version: antes + 1, motivo: 'Se agregó la observación' })
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
    const p = await repo.panorama()
    const s = p.saldos.filter((x) => x.procedenciaId === o.ingresoLoteId)
    expect(s.map((x) => x.estado)).toEqual(['APROBADO'])
    // Firmada: no se vuelve a decidir.
    expect(await repo.decidirOrganoleptica(o.id, 'BAJAS_RECHAZADOS', undefined, KATIA)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/ya está firmada/) })
  })

  it('(7) registro sanitario vencido: se alertó y la aprobación queda bloqueada; rechazar sí se puede', async () => {
    const o = await conRSVencido()
    expect((await repo.listarAlertas()).some((a) => a.tipo === 'RS_VENCIDO' && a.estado === 'ABIERTA')).toBe(true)
    expect(await repo.decidirOrganoleptica(o.id, 'APROBADO', undefined, KATIA)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/registro sanitario está vencido/) })
    expect((await repo.obtenerOrganoleptica(o.id))!.estado).toBe('PENDIENTE_DT')
    exito(await repo.decidirOrganoleptica(o.id, 'BAJAS_RECHAZADOS', 'RS vencido', KATIA))
    const p = await repo.panorama()
    expect(p.saldos.filter((x) => x.procedenciaId === o.ingresoLoteId).map((x) => x.estado)).toEqual(['BAJAS_RECHAZADOS'])
  })

  it('no se aprueba lo no conforme, y el acta incompleta no llega a Katia', async () => {
    const cola = await repo.colaDireccionTecnica()
    const bor = (await repo.colaDireccionTecnica()).borradores[0]
    expect(await repo.guardarOrganoleptica(bor.id, {}, true, SANDRA)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Para enviarla a Dirección Técnica/) })
    expect(await repo.guardarOrganoleptica(bor.id, {}, false, AUX)).toMatchObject({ ok: false })
    exito(await repo.guardarOrganoleptica(bor.id, { certAnalisis: false, checklist: { ...checklistConforme(), emb_limpio: 'NC' }, destinoSugerido: 'DEVOLUCION', conclusion: 'NO_CONFORME' }, true, SANDRA))
    expect(await repo.decidirOrganoleptica(bor.id, 'APROBADO', undefined, KATIA)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/NO CONFORME/) })
    exito(await repo.decidirOrganoleptica(bor.id, 'BAJAS_RECHAZADOS', 'Embalaje sucio', KATIA))
    expect(cola.organolepticas.length).toBeGreaterThan(0)
  })
})

describe('alertas', () => {
  it('solo el destinatario (o Dirección Técnica) atiende; queda quién y cuándo', async () => {
    const alertas = (await repo.listarAlertas()).filter((a) => a.estado === 'ABIERTA')
    const temp = alertas.find((a) => a.tipo === 'TEMPERATURA')!
    expect(temp.mensaje).toMatch(/31\.5 °C/)
    expect(await repo.atenderAlerta(temp.id, 'ok', AUX)).toMatchObject({ ok: false })
    exito(await repo.atenderAlerta(temp.id, 'Producto no termolábil', KATIA))
    const despues = (await repo.listarAlertas()).find((a) => a.id === temp.id)!
    expect(despues).toMatchObject({ estado: 'ATENDIDA', atendidaPor: 'Katia', nota: 'Producto no termolábil' })
    const traslado = alertas.find((a) => a.tipo === 'POR_TRASLADAR_VENCIDO')!
    exito(await repo.atenderAlerta(traslado.id, undefined, CHARLIE))
  })
  it('(D-19) la divergencia con Compras se alerta; el stock no cambia solo', async () => {
    const div = (await repo.listarAlertas()).find((a) => a.tipo === 'DIVERGENCIA_COMPRAS')!
    expect(div.mensaje).toMatch(/recibió 120 y Compras ahora dice 118/)
    expect(div.destinatario).toBe('jefe_almacen')
  })
})

describe('expediente', () => {
  it('se arma al confirmar y Sandra lo cierra solo sin faltantes', async () => {
    const exps = await repo.listarExpedientes()
    const x = exps.find((e) => e.clave === 'OC-DEMO-0001')!
    expect(x.faltantesAbiertos).toBeGreaterThan(0)
    expect(await repo.cerrarExpediente(x.id, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Sandra/) })
    expect(await repo.cerrarExpediente(x.id, SANDRA)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/faltante/) })
    const v = (await repo.obtenerExpediente(x.id))!
    expect(v.documentos.map((d) => d.tipo)).toEqual(expect.arrayContaining(['ACTA_RECEPCION', 'SOLICITUD_INGRESO', 'GUIA_REMISION']))
    for (const f of v.faltantes.filter((y) => y.estado === 'ABIERTO')) exito(await repo.resolverFaltante(f.id, 'Entregado', SANDRA))
    exito(await repo.cerrarExpediente(x.id, SANDRA))
    expect((await repo.obtenerExpediente(x.id))!.estado).toBe('CERRADO')
    exito(await repo.agregarFaltante(x.id, 'Certificado de análisis', 'Proveedor', SANDRA))
    expect((await repo.obtenerExpediente(x.id))!.estado).toBe('ABIERTO')
  })
})

describe('búsqueda de OC y actas', () => {
  it('encuentra la OC, el acta de recepción y el acta organoléptica', async () => {
    expect((await repo.buscarEntradas('OC-DEMO-0001'))[0]).toMatchObject({ tipo: 'oc', href: expect.stringMatching(/^\/entradas\//) })
    const acta = (await repo.listarIngresos()).find((i) => i.actaNumero)!.actaNumero!
    expect((await repo.buscarEntradas(acta))[0]).toMatchObject({ tipo: 'acta' })
    expect((await repo.buscarEntradas('O-2')).find((r) => r.href.startsWith('/calidad/'))).toMatchObject({ tipo: 'acta' })
    expect(await repo.buscarEntradas('zzzz')).toEqual([])
  })
})
