// OS-5 en el modo demostración: muestreo LS-TB.02.02, liberación LS-POE.04.05 y retornos. Mismas reglas y mismos mensajes que la migración 0025 (tests/db/os5-*.test.ts).
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { checklistConforme } from '@/services/demo/entradas-demo'
import type { Actor } from '@/services/repositorio'

const actor = (rol: Actor['roles'][number], nombre: string = rol): Actor => ({ id: `demo:${rol}`, nombre, roles: [rol] })
const CHARLIE = actor('jefe_almacen', 'Charlie')
const KATIA = actor('direccion_tecnica', 'Katia')
const SANDRA = actor('asistente_dt', 'Sandra')
const AUX = actor('auxiliar', 'Christians')
const ROBERTO = actor('jefe_transporte', 'Roberto')
const IMG = 'data:image/png;base64,' + 'A'.repeat(200)
const DOC = { ref: 'dictamen_cliente/abc-dictamen.pdf', nombre: 'dictamen.pdf', tipo: 'application/pdf', hash: 'a'.repeat(64) }

let repo: RepositorioDemo
beforeEach(() => { ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined; repo = new RepositorioDemo() })

const exito = <T extends { ok: boolean }>(r: T) => { expect(r, JSON.stringify(r)).toMatchObject({ ok: true }); return r as Extract<T, { ok: true }> }
const falla = <T extends { ok: boolean }>(r: T) => { expect(r.ok).toBe(false); return (r as unknown as { mensaje: string }).mensaje }
const propietario = async (codigo: string) => (await repo.panorama()).propietarios.find((p) => p.codigo === codigo)!.id

async function recibirTodo(id: string, pos: string) {
  exito(await repo.iniciarRecepcion(id, CHARLIE))
  const s = (await repo.obtenerSolicitud(id))!
  for (const l of s.lineas) exito(await repo.verificarLinea(id, l.id, { coincide: true, posicionId: pos }, CHARLIE))
  exito(await repo.editarRecepcion(id, { temperaturaC: 20, bultos: 3, paletas: 1, placa: 'ABC-123', tipoConteo: 'MUESTREO' }, CHARLIE))
  const g = exito(await repo.generarActa(id, CHARLIE))
  exito(await repo.firmarActa(g.actaId, { rol: 'JEFE_ALMACEN' }, CHARLIE))
  exito(await repo.firmarActa(g.actaId, { rol: 'DIRECCION_TECNICA' }, KATIA))
  exito(await repo.firmarActa(g.actaId, { rol: 'RESPONSABLE_CONTEO' }, AUX))
  exito(await repo.firmarActa(g.actaId, { rol: 'TRANSPORTISTA', nombre: 'Pedro Quispe', dni: '45678912', placa: 'ABC-123', imagen: IMG }, CHARLIE))
  exito(await repo.confirmarIngreso(id, CHARLIE))
  return (await repo.obtenerSolicitud(id))!
}

/** Un ingreso de cliente (AJR) de `cantidad` unidades, con su acta organoléptica ya enviada a Dirección Técnica. */
async function ingresoDeCliente(cantidad: number, lote: string) {
  const r = exito(await repo.crearSolicitud({ tipo: 'INGRESO_CLIENTE', propietarioId: await propietario('AJR_LABS'), guiaNumero: 'G-1', contraparteNombre: 'AJR', lineas: [{ productoId: 'prod:1', lote, vence: '30/06/2028', cantidad }] }, true, SANDRA))
  const s = await recibirTodo(r.id, (await repo.posicionesDestino('INGRESO_CLIENTE'))[0].id)
  const o = s.organolepticas[0]
  exito(await repo.guardarOrganoleptica(o.id, { certAnalisis: true, checklist: checklistConforme(), destinoSugerido: 'APROBADO', conclusion: 'CONFORME' }, true, SANDRA))
  return o.id
}
const acta = async (id: string) => (await repo.obtenerOrganoleptica(id))!
const estados = async (ingresoLoteId: string) => (await repo.panorama()).saldos.filter((s) => s.procedenciaId === ingresoLoteId).map((s) => [s.estado, s.cantidad]).sort()

describe('muestreo LS-TB.02.02 en la demo', () => {
  it('la tabla es un parámetro con código y vigencia, y está vigente hoy', async () => {
    const p = await repo.panoramaMuestreo()
    expect(p.tablas).toHaveLength(1)
    expect(p.tablas[0]).toMatchObject({ codigo: 'LS-TB.02.02', vigenteDesde: '2026-09-01', vigenteHasta: '2028-09-01', umbralTotal: 100, vigente: true })
    expect(p.tablas[0].simplificada.map((t) => t.muestra)).toEqual([20, 30, 80, 150])
    expect(p.tablas[0].normal.map((t) => t.muestra)).toEqual([50, 150, 300, 500])
  })

  it('un lote de menos de 100 unidades se evalúa al 100 % y el acta guarda su régimen y su tabla', async () => {
    const o = await acta(await ingresoDeCliente(4, 'M-4'))
    expect(o).toMatchObject({ cantidadLote: 4, cantidadMuestra: 4, regimenMuestreo: 'LOTE_MENOR', tablaMuestreo: 'LS-TB.02.02' })
  })

  it('producto nuevo y lote grande: normal; la segunda recepción del mismo producto: simplificada; con antecedentes: estricta (100 %)', async () => {
    const nuevo = await repo.crearProducto({ codigo: 'OS5-NUEVO', descripcion: 'Producto nuevo OS-5', unidadMedida: 'TAB' }, KATIA)
    const id = exito(nuevo).id
    const ingreso = async (lote: string, cantidad: number) => {
      const r = exito(await repo.crearSolicitud({ tipo: 'INGRESO_CLIENTE', propietarioId: await propietario('AJR_LABS'), guiaNumero: 'G-2', contraparteNombre: 'AJR', lineas: [{ productoId: id, lote, vence: '30/06/2028', cantidad }] }, true, SANDRA))
      return (await recibirTodo(r.id, (await repo.posicionesDestino('INGRESO_CLIENTE'))[0].id)).organolepticas[0]
    }
    expect(await ingreso('N-1', 500)).toMatchObject({ regimenMuestreo: 'NORMAL', cantidadMuestra: 50 })
    expect(await ingreso('N-2', 500)).toMatchObject({ regimenMuestreo: 'SIMPLIFICADA', cantidadMuestra: 20 })
    exito(await repo.marcarAntecedentes(id, 'Rechazado dos veces por su proveedor', KATIA))
    expect(await ingreso('N-3', 500)).toMatchObject({ regimenMuestreo: 'ESTRICTA', cantidadMuestra: 500 })
    exito(await repo.quitarAntecedentes(id, 'Corrigió su proceso', KATIA))
    expect(await ingreso('N-4', 500)).toMatchObject({ regimenMuestreo: 'SIMPLIFICADA', cantidadMuestra: 20 })
  })

  it('solo Dirección Técnica marca y quita antecedentes, con motivo; no se marca dos veces', async () => {
    expect(falla(await repo.marcarAntecedentes('prod:1', 'x', SANDRA))).toMatch(/Solo Dirección Técnica/)
    expect(falla(await repo.marcarAntecedentes('prod:1', ' ', KATIA))).toMatch(/qué antecedentes/)
    exito(await repo.marcarAntecedentes('prod:1', 'Reclamos de clientes', KATIA))
    expect(falla(await repo.marcarAntecedentes('prod:1', 'otra vez', KATIA))).toMatch(/ya está marcado/)
    expect(falla(await repo.quitarAntecedentes('prod:1', '', KATIA))).toMatch(/por qué se quita/)
    exito(await repo.quitarAntecedentes('prod:1', 'Resuelto', KATIA))
    const p = await repo.panoramaMuestreo()
    expect(p.antecedentes).toHaveLength(1)
    expect(p.antecedentes[0].quitadoEn).toBeTruthy()
  })
})

describe('liberación LS-POE.04.05 en la demo', () => {
  it('el producto de un cliente no lo firma Katia por sí sola: hace falta el dictamen del DT del cliente', async () => {
    const id = await ingresoDeCliente(100, 'CL-1')
    expect((await acta(id)).esDeCliente).toBe(true)
    expect(falla(await repo.decidirOrganoleptica(id, 'APROBADO', undefined, KATIA))).toMatch(/lo libera el DT del cliente/)
  })

  it('registrar no cambia nada; confirmar divide el lote entre Aprobado y Bajas y firma el acta', async () => {
    const id = await ingresoDeCliente(100, 'CL-2')
    const il = (await acta(id)).ingresoLoteId
    const d = exito(await repo.registrarDictamen(id, { liberada: 90, rechazada: 10, fechaDictamen: '2026-10-15', documento: DOC }, SANDRA))
    expect(await estados(il)).toEqual([['CUARENTENA', 100]])
    expect((await repo.listarAlertas()).some((a) => a.tipo === 'DICTAMEN_POR_CONFIRMAR' && a.destinatario === 'direccion_tecnica' && a.estado === 'ABIERTA')).toBe(true)
    expect(exito(await repo.confirmarDictamen(d.id, KATIA)).firmada).toBe(true)
    expect(await estados(il)).toEqual([['APROBADO', 90], ['BAJAS_RECHAZADOS', 10]])
    expect(await acta(id)).toMatchObject({ estado: 'FIRMADA', decision: 'APROBADO', pendienteDecision: 0 })
  })

  it('un dictamen parcial deja el resto esperando; no se pasa de lo que espera; todo rechazado va a Bajas', async () => {
    const id = await ingresoDeCliente(100, 'CL-3')
    const il = (await acta(id)).ingresoLoteId
    exito(await repo.confirmarDictamen(exito(await repo.registrarDictamen(id, { liberada: 60, rechazada: 0, fechaDictamen: '2026-10-15', documento: DOC }, KATIA)).id, SANDRA))
    expect(await estados(il)).toEqual([['APROBADO', 60], ['CUARENTENA', 40]])
    expect((await acta(id)).estado).toBe('PENDIENTE_DT')
    expect(falla(await repo.registrarDictamen(id, { liberada: 41, rechazada: 0, fechaDictamen: '2026-10-15', documento: DOC }, SANDRA))).toMatch(/solo hay 40 unidades esperando decisión/)
    exito(await repo.confirmarDictamen(exito(await repo.registrarDictamen(id, { liberada: 0, rechazada: 40, fechaDictamen: '2026-10-15', documento: DOC }, SANDRA)).id, SANDRA))
    expect(await estados(il)).toEqual([['APROBADO', 60], ['BAJAS_RECHAZADOS', 40]])
    const y = await ingresoDeCliente(20, 'CL-4')
    exito(await repo.confirmarDictamen(exito(await repo.registrarDictamen(y, { liberada: 0, rechazada: 20, fechaDictamen: '2026-10-15', documento: DOC }, SANDRA)).id, SANDRA))
    expect(await acta(y)).toMatchObject({ estado: 'FIRMADA', decision: 'BAJAS_RECHAZADOS' })
  })

  it('exige documento válido y fecha, uno a la vez, y solo Sandra o Katia lo registran, lo confirman y lo anulan', async () => {
    const id = await ingresoDeCliente(50, 'CL-5')
    expect(falla(await repo.registrarDictamen(id, { liberada: 10, rechazada: 0, fechaDictamen: '2026-10-15', documento: { ...DOC, ref: '' } }, SANDRA))).toMatch(/Adjunta el documento/)
    expect(falla(await repo.registrarDictamen(id, { liberada: 10, rechazada: 0, fechaDictamen: '2026-10-15', documento: { ...DOC, tipo: 'application/zip' } }, SANDRA))).toMatch(/PDF o una imagen/)
    expect(falla(await repo.registrarDictamen(id, { liberada: 10, rechazada: 0, fechaDictamen: '2999-01-01', documento: DOC }, SANDRA))).toMatch(/no puede ser futura/)
    for (const quien of [CHARLIE, AUX, ROBERTO]) expect(falla(await repo.registrarDictamen(id, { liberada: 10, rechazada: 0, fechaDictamen: '2026-10-15', documento: DOC }, quien))).toMatch(/Solo Sandra o Dirección Técnica registran/)
    const d = exito(await repo.registrarDictamen(id, { liberada: 10, rechazada: 0, fechaDictamen: '2026-10-15', documento: DOC }, SANDRA))
    expect(falla(await repo.registrarDictamen(id, { liberada: 10, rechazada: 0, fechaDictamen: '2026-10-15', documento: DOC }, SANDRA))).toMatch(/Ya hay un dictamen registrado/)
    expect(falla(await repo.confirmarDictamen(d.id, CHARLIE))).toMatch(/Solo Sandra o Dirección Técnica confirman/)
    expect(falla(await repo.anularDictamen(d.id, 'x', CHARLIE))).toMatch(/Solo Sandra o Dirección Técnica anulan/)
  })

  it('anular exige motivo y solo vale antes de confirmar; el producto de Logissa no admite dictamen de cliente', async () => {
    const id = await ingresoDeCliente(50, 'CL-6')
    const d = exito(await repo.registrarDictamen(id, { liberada: 50, rechazada: 0, fechaDictamen: '2026-10-15', documento: DOC }, SANDRA))
    expect(falla(await repo.anularDictamen(d.id, ' ', SANDRA))).toMatch(/por qué se anula/)
    exito(await repo.anularDictamen(d.id, 'Era de otro lote', SANDRA))
    expect(falla(await repo.confirmarDictamen(d.id, KATIA))).toMatch(/ya está anulado/)
    const d2 = exito(await repo.registrarDictamen(id, { liberada: 50, rechazada: 0, fechaDictamen: '2026-10-15', documento: DOC }, SANDRA))
    exito(await repo.confirmarDictamen(d2.id, KATIA))
    expect(falla(await repo.anularDictamen(d2.id, 'Tarde', SANDRA))).toMatch(/ya cambió el estado/)
  })

  it('observación reversible: solo Katia en un producto de Logissa; Sandra o Katia en el de un cliente; el producto sigue en Cuarentena y la decisión la cierra', async () => {
    const id = await ingresoDeCliente(50, 'CL-7')
    expect(falla(await repo.observarActa(id, 'x', CHARLIE))).toMatch(/Solo Sandra o Dirección Técnica registran la observación/)
    exito(await repo.observarActa(id, 'Rótulo ilegible', SANDRA))
    expect(falla(await repo.observarActa(id, 'otra', SANDRA))).toMatch(/ya está Observada/)
    expect(await estados((await acta(id)).ingresoLoteId)).toEqual([['CUARENTENA', 50]])
    exito(await repo.levantarObservacion(id, 'Corregido', SANDRA))
    expect(falla(await repo.levantarObservacion(id, 'Corregido', SANDRA))).toMatch(/no está Observada/)
    // de Logissa
    const cola = (await repo.colaDireccionTecnica()).organolepticas.find((o) => !o.esDeCliente)!
    expect(falla(await repo.observarActa(cola.id, 'x', SANDRA))).toMatch(/Solo Dirección Técnica deja un producto Observado/)
    exito(await repo.observarActa(cola.id, 'Falta el certificado', KATIA))
    exito(await repo.decidirOrganoleptica(cola.id, 'BAJAS_RECHAZADOS', 'No llegó el certificado', KATIA))
    expect((await acta(cola.id)).observaciones![0].nota).toBe('Disposición final: Bajas/Rechazados')
  })
})

describe('retornos en la demo', () => {
  const DOCS = { docOriginalTipo: 'FACTURA' as const, docOriginalNumero: 'F001-5501' }
  const primera = async () => { const s = (await repo.salidasConRetorno())[0]; return (await repo.salidaParaRetorno(s.salidaId))! }

  it('hay una Orden de Salida ya despachada con lotes y cuánto de cada uno puede volver', async () => {
    const lista = await repo.salidasConRetorno()
    expect(lista.length).toBeGreaterThanOrEqual(1)
    const s = await primera()
    expect(s.confirmada).toBe(true)
    expect(s.lineas.length).toBeGreaterThan(0)
    for (const l of s.lineas) expect(l).toMatchObject({ despachado: 30, yaRetornado: 0, retornable: 30 })
  })

  it('Roberto lo registra: nace como devolución «por autorizar» con la salida y el motivo; Sandra lo autoriza; la recepción se cuenta al 100 % y nace en Devoluciones', async () => {
    const s = await primera()
    const l = s.lineas[0]
    const r = exito(await repo.crearRetorno({ salidaId: s.salidaId, motivo: 'RECHAZADO_CLIENTE', ...DOCS, lineas: [{ loteId: l.loteId, cantidad: 12 }] }, true, ROBERTO))
    expect(r.autorizada).toBe(false)
    const sol = (await repo.obtenerSolicitud(r.id))!
    expect(sol).toMatchObject({ tipo: 'DEVOLUCION', estado: 'ENVIADA', creadoPor: 'Roberto', retorno: { salidaId: s.salidaId, salidaNumero: s.numero, motivo: 'RECHAZADO_CLIENTE' } })
    expect((await repo.listarAlertas()).some((a) => a.tipo === 'RETORNO_POR_AUTORIZAR' && a.estado === 'ABIERTA')).toBe(true)
    expect(falla(await repo.autorizarSolicitud(r.id, ROBERTO))).toMatch(/Solo Sandra/)
    exito(await repo.autorizarSolicitud(r.id, SANDRA))
    const cerrada = await recibirTodo(r.id, (await repo.posicionesDestino('DEVOLUCION'))[0].id)
    expect(cerrada.recepcion?.tipoConteo).toBe('TOTAL')
    expect((await repo.panorama()).saldos.filter((x) => x.procedenciaId === cerrada.organolepticas[0].ingresoLoteId).map((x) => x.estado)).toEqual(['DEVOLUCIONES'])
    expect(cerrada.organolepticas[0]).toMatchObject({ cantidadLote: 12, cantidadMuestra: 12, regimenMuestreo: 'DEVOLUCION' })
  })

  it('Sandra puede autorizar de una vez; el auxiliar y quien no tiene rol no originan', async () => {
    const s = await primera()
    const l = s.lineas[0]
    expect(exito(await repo.crearRetorno({ salidaId: s.salidaId, motivo: 'NO_ENTREGADO', ...DOCS, lineas: [{ loteId: l.loteId, cantidad: 5 }] }, true, SANDRA)).autorizada).toBe(true)
    expect(falla(await repo.crearRetorno({ salidaId: s.salidaId, motivo: 'NO_ENTREGADO', ...DOCS, lineas: [{ loteId: l.loteId, cantidad: 5 }] }, false, AUX))).toMatch(/No tienes permiso para registrar el retorno/)
  })

  it('pide motivo, factura o boleta y unidades; nunca más de lo que salió, sumando los retornos anteriores', async () => {
    const s = await primera()
    const l = s.lineas[0]
    expect(falla(await repo.crearRetorno({ salidaId: s.salidaId, motivo: '', ...DOCS, lineas: [{ loteId: l.loteId, cantidad: 1 }] }, false, ROBERTO))).toMatch(/Elige por qué vuelve/)
    expect(falla(await repo.crearRetorno({ salidaId: s.salidaId, motivo: 'NO_ENTREGADO', lineas: [{ loteId: l.loteId, cantidad: 1 }] }, false, ROBERTO))).toMatch(/factura o boleta original/)
    expect(falla(await repo.crearRetorno({ salidaId: s.salidaId, motivo: 'NO_ENTREGADO', ...DOCS, lineas: [] }, false, ROBERTO))).toMatch(/al menos un lote/)
    expect(falla(await repo.crearRetorno({ salidaId: s.salidaId, motivo: 'NO_ENTREGADO', ...DOCS, lineas: [{ loteId: l.loteId, cantidad: 31 }] }, false, ROBERTO))).toMatch(/solo puede volver 30/)
    const primero = exito(await repo.crearRetorno({ salidaId: s.salidaId, motivo: 'NO_ENTREGADO', ...DOCS, lineas: [{ loteId: l.loteId, cantidad: 25 }] }, false, ROBERTO))
    expect(falla(await repo.crearRetorno({ salidaId: s.salidaId, motivo: 'NO_ENTREGADO', ...DOCS, lineas: [{ loteId: l.loteId, cantidad: 6 }] }, false, ROBERTO))).toMatch(/solo puede volver 5: salieron 30 y ya se anunció el retorno de 25/)
    exito(await repo.anularSolicitud(primero.id, 'Se anunció por error', SANDRA))
    exito(await repo.crearRetorno({ salidaId: s.salidaId, motivo: 'NO_ENTREGADO', ...DOCS, lineas: [{ loteId: l.loteId, cantidad: 30 }] }, false, ROBERTO))
  })

  it('el stock vuelve a su sitio como Devoluciones y, al aprobarse, a Aprobado: el ledger no se rompe', async () => {
    const s = await primera()
    const l = s.lineas[0]
    const r = exito(await repo.crearRetorno({ salidaId: s.salidaId, motivo: 'RECHAZADO_CLIENTE', ...DOCS, lineas: [{ loteId: l.loteId, cantidad: 7 }] }, true, KATIA))
    const cerrada = await recibirTodo(r.id, (await repo.posicionesDestino('DEVOLUCION'))[0].id)
    const o = cerrada.organolepticas[0]
    exito(await repo.guardarOrganoleptica(o.id, { certAnalisis: true, checklist: checklistConforme(), destinoSugerido: 'APROBADO', conclusion: 'CONFORME' }, true, SANDRA))
    exito(await repo.decidirOrganoleptica(o.id, 'APROBADO', undefined, KATIA))
    expect(await estados(o.ingresoLoteId)).toEqual([['APROBADO', 7]])
  })
})
