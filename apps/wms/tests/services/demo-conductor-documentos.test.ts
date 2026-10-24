// SB-A en demostración (D-153 a D-160): la ruta y la auditoría guardan al conductor real; la guía electrónica y el LS-FR.43.03 nombran a quien figura
// en el parámetro temporal «conductor en documentos» (por ahora Michele); solo el Jefe de Transporte lo cambia; cada uso se audita junto al conductor real.
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { SimuladorNubefact, reiniciarSimuladorNubefact } from '@/services/nubefact/simulador'
import { construirPayloadNubefact, faltantesDeGuia, type TrasladoGuia } from '@/domain/guia-electronica'
import type { Actor } from '@/services/repositorio'
import { imprimirYConformar } from './ayudas-orden'

const actor = (id: string, ...roles: Actor['roles']): Actor => ({ id: `demo:${id}`, nombre: `${id} (demo)`, roles })
const JT = actor('jefe_transporte', 'jefe_transporte', 'jefe_almacen'); const AUX = actor('auxiliar', 'auxiliar'); const SANDRA = actor('asistente_dt', 'asistente_dt', 'conformidad_despacho')
const traslado: TrasladoGuia = { fechaInicio: '2026-10-20', pesoKg: 12 }
const MICHELE = 'per-7'; const HANS = 'per-6'

let repo: RepositorioDemo
beforeEach(() => {
  ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined
  reiniciarSimuladorNubefact()
  repo = new RepositorioDemo()
})

const usos = async () => (await repo.auditoria(200)).filter((a) => a.evento === 'conductor_en_documento')

describe('el interruptor temporal en la demostración', () => {
  it('arranca con Michele en los documentos, y Hans, Michele y el vehículo BWO-902 existen', async () => {
    const p = await repo.panoramaRutas()
    expect(p.conductorEnDocumentos).toMatchObject({ personaId: MICHELE, nombre: 'Michele Yermain Mauriello Diaz' })
    const michele = p.personal.find((x) => x.id === MICHELE)!
    expect(michele).toMatchObject({ documentoTipo: 'CE', dni: '004780086', licencia: 'Q004780086' })
    const hans = p.personal.find((x) => x.id === HANS)!
    expect(hans).toMatchObject({ nombre: 'Hans', licencia: 'Q75084250' })
    expect(hans.dni).toBeUndefined()   // documento pendiente
    expect(p.vehiculos.find((v) => v.placa === 'BWO-902')).toMatchObject({ descripcion: 'DFSK K05S', activo: true })
  })

  it('la guía nombra a Michele con su carné de extranjería (tipo 4) aunque la ruta guarde a otro conductor, y se audita el uso con el conductor real', async () => {
    const [res] = await repo.listarSalidas()
    await imprimirYConformar(repo, res.id, { jt: JT, picker: AUX, conforme: SANDRA, bultos: 2 })
    const d = (await repo.datosGuia(res.id))!
    expect(d.ruta).toMatchObject({ conductor: 'Michele Yermain Mauriello Diaz', conductorReal: 'Luis Quispe', conductorDocumentoTipo: 'CE', conductorDni: '004780086', conductorLicencia: 'Q004780086' })
    expect(faltantesDeGuia(d, traslado, 'SIMULADOR')).toEqual([])
    const n = await repo.reservarNumeroGuia(d.serie, 'SIMULADOR', res.id)
    if (!n.ok) throw new Error(n.mensaje)
    const payload = construirPayloadNubefact(d, traslado, '2026-10-19', n.numero)
    expect(payload).toMatchObject({ conductor_documento_tipo: '4', conductor_documento_numero: '004780086', conductor_nombre: 'Michele Yermain', conductor_apellidos: 'Mauriello Diaz', conductor_numero_licencia: 'Q004780086' })
    const r = await new SimuladorNubefact().emitirGuia(payload)
    if (!r.ok) throw new Error(r.error)
    expect(await repo.registrarGuiaElectronica(res.id, r, traslado, payload, JT)).toMatchObject({ ok: true })
    const u = await usos()
    expect(u).toHaveLength(1)
    expect(u[0].detalle).toMatch(/Michele Yermain Mauriello Diaz/)
    expect(u[0].detalle).toMatch(/conductor real Luis Quispe/)
    // la ruta no cambió: sigue con el conductor real
    expect((await repo.panoramaRutas()).rutas[0].conductor).toMatchObject({ id: 'per-1', nombre: 'Luis Quispe' })
  })

  it('el LS-FR.43.03 nombra a quien figura en los documentos y guarda al real; imprimirlo audita el uso', async () => {
    const ruta = (await repo.panoramaRutas()).rutas[0]
    const antes = (await repo.registroLsFr(ruta.id))!
    expect(antes).toMatchObject({ conductor: 'Michele Yermain Mauriello Diaz', conductorReal: 'Luis Quispe' })
    expect(await repo.registrarImpresionLsFr(ruta.id, JT)).toMatchObject({ ok: true, impresiones: 1 })
    const u = await usos()
    expect(u).toHaveLength(1)
    expect(u[0].detalle).toMatch(/LS-FR\.43\.03 impreso/)
    expect(u[0].detalle).toMatch(/conductor real Luis Quispe/)
  })

  it('solo el Jefe de Transporte lo cambia, con motivo y a un conductor disponible; vacío vuelve al conductor real de cada ruta', async () => {
    expect(await repo.cambiarConductorEnDocumentos(HANS, 'prueba', AUX)).toMatchObject({ ok: false, mensaje: expect.stringContaining('No tienes permiso') })
    expect(await repo.cambiarConductorEnDocumentos(HANS, '  ', JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('Cuenta por qué') })
    expect(await repo.cambiarConductorEnDocumentos('per-3', 'prueba', JT)).toMatchObject({ ok: false, mensaje: 'Elige un conductor disponible' })      // auxiliar
    expect(await repo.cambiarConductorEnDocumentos('per-5', 'prueba', JT)).toMatchObject({ ok: false, mensaje: 'Elige un conductor disponible' })      // no disponible
    expect(await repo.cambiarConductorEnDocumentos(HANS, 'Michele no puede esta semana', JT)).toMatchObject({ ok: true })
    const p = await repo.panoramaRutas()
    expect(p.conductorEnDocumentos).toMatchObject({ personaId: HANS, nombre: 'Hans', cambio: expect.stringContaining('Michele no puede esta semana') })
    expect((await repo.registroLsFr(p.rutas[0].id))).toMatchObject({ conductor: 'Hans', conductorReal: 'Luis Quispe' })
    expect(await repo.cambiarConductorEnDocumentos(null, 'Volvemos al conductor real', JT)).toMatchObject({ ok: true })
    const sin = await repo.registroLsFr(p.rutas[0].id)
    expect(sin).toMatchObject({ conductor: 'Luis Quispe' })
    expect(sin!.conductorReal).toBeUndefined()
    const a = (await repo.auditoria(50)).filter((x) => x.evento === 'conductor_en_documentos_cambiado')
    expect(a.map((x) => x.motivo)).toEqual(['Volvemos al conductor real', 'Michele no puede esta semana'])
  })

  it('documento y licencia del personal: reglas por tipo de documento; vacío = pendiente', async () => {
    expect(await repo.guardarDocumentosPersonal({ id: HANS, documentoTipo: 'DNI', dni: '123', licencia: 'Q75084250' }, JT)).toMatchObject({ ok: false, mensaje: 'El DNI tiene 8 números.' })
    expect(await repo.guardarDocumentosPersonal({ id: HANS, documentoTipo: 'DNI', dni: '12345678', licencia: 'x' }, JT)).toMatchObject({ ok: false, mensaje: 'La licencia tiene 9 o 10 letras y números.' })
    expect(await repo.guardarDocumentosPersonal({ id: HANS, documentoTipo: 'DNI', dni: '12345678', licencia: 'Q75084250' }, AUX)).toMatchObject({ ok: false })
    expect(await repo.guardarDocumentosPersonal({ id: HANS, documentoTipo: 'DNI', dni: '12345678', licencia: 'q75084250' }, JT)).toMatchObject({ ok: true })
    expect((await repo.panoramaRutas()).personal.find((x) => x.id === HANS)).toMatchObject({ dni: '12345678', documentoTipo: 'DNI', licencia: 'Q75084250' })
    expect(await repo.guardarDocumentosPersonal({ id: HANS, documentoTipo: 'DNI', dni: '', licencia: 'Q75084250' }, JT)).toMatchObject({ ok: true })
    expect((await repo.panoramaRutas()).personal.find((x) => x.id === HANS)!.dni).toBeUndefined()
  })
})
