// Piloto C y F en la demostración (espejo de tests/db/firma-y-reglas-f.test.ts): firma en orden con la firma dibujada guardada aparte, avisos de vencimiento,
// corrección auditada de la fecha, proveedor «solo mes y año», «sin material de envase» y formato versionado.
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { checklistConforme } from '@/services/demo/entradas-demo'
import { FIRMA_PNG_EJEMPLO, huellaDeReferencia } from '@/services/firma-imagen'
import { archivosEnMemoria } from '@/services/archivos-memoria'
import { hoyEnLima } from '@/domain/fechas'
import type { Actor } from '@/services/repositorio'

const actor = (rol: Actor['roles'][number], nombre: string = rol): Actor => ({ id: `demo:${rol}`, nombre, roles: [rol] })
const CHARLIE = actor('jefe_almacen', 'Charlie'); const KATIA = actor('direccion_tecnica', 'Katia'); const SANDRA = actor('asistente_dt', 'Sandra')
const AUX = actor('auxiliar', 'Christians'); const ADMIN = actor('admin_wms', 'Sebastián')
const A6 = 'pos:A-6'
const TRANSP = { rol: 'TRANSPORTISTA' as const, nombre: 'Pedro Quispe', dni: '45678912', placa: 'ABC-123', imagen: FIRMA_PNG_EJEMPLO }

let repo: RepositorioDemo
beforeEach(() => { ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined; repo = new RepositorioDemo() })
const exito = <T extends { ok: boolean }>(r: T) => { expect(r, JSON.stringify(r)).toMatchObject({ ok: true }); return r as Extract<T, { ok: true }> }

async function compra(codigoOc: string, vence: string, lote: string) {
  const oc = (await repo.ocsPendientes()).find((o) => o.codigo === codigoOc)!
  const logissa = (await repo.panorama()).propietarios.find((p) => p.codigo === 'LOGISSA')!.id
  const r = exito(await repo.crearSolicitud({ tipo: 'COMPRA_LOCAL', propietarioId: logissa, ocId: oc.ocId, guiaNumero: 'T001-9', lineas: [{ ocItemId: oc.items[0].ocItemId, lote, vence, cantidad: 10 }] }, true, SANDRA))
  exito(await repo.iniciarRecepcion(r.id, CHARLIE))
  const s = (await repo.obtenerSolicitud(r.id))!
  return { id: r.id, linea: s.lineas[0] }
}
const verificar = async (x: { id: string; linea: { id: string } }) => exito(await repo.verificarLinea(x.id, x.linea.id, { coincide: true, posicionId: A6 }, CHARLIE))

describe('C · firma en orden (demo)', () => {
  async function acta() {
    const x = await compra('OC-DEMO-0002', '30/06/2031', 'F-1')
    await verificar(x)
    exito(await repo.editarRecepcion(x.id, { temperaturaC: 20, bultos: 3, paletas: 1, placa: 'ABC-123', tipoConteo: 'TOTAL' }, CHARLIE))
    return exito(await repo.generarActa(x.id, CHARLIE)).actaId
  }
  it('rechaza una firma fuera de orden con el mensaje de a quién le toca', async () => {
    const a = await acta()
    expect(await repo.firmarActa(a, { rol: 'DIRECCION_TECNICA' }, KATIA)).toMatchObject({ ok: false, mensaje: 'Todavía no le toca a Dirección Técnica. Le toca a Transportista.' })
    exito(await repo.firmarActa(a, TRANSP, AUX))
    expect(await repo.firmarActa(a, { rol: 'JEFE_ALMACEN' }, CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Le toca a Responsable de conteo/) })
    exito(await repo.firmarActa(a, { rol: 'RESPONSABLE_CONTEO' }, AUX))
    exito(await repo.firmarActa(a, { rol: 'JEFE_ALMACEN' }, CHARLIE))
    expect(exito(await repo.firmarActa(a, { rol: 'DIRECCION_TECNICA' }, KATIA)).completa).toBe(true)
  })
  it('guarda quién capturó, quién firmó (nombre, DNI, placa) y la imagen aparte con su huella', async () => {
    const a = await acta()
    exito(await repo.firmarActa(a, TRANSP, AUX))
    const s = (await repo.listarSolicitudes())
    const f = (await Promise.all(s.map((x) => repo.obtenerSolicitud(x.id)))).flatMap((x) => x!.actas).find((y) => y.id === a)!.firmas[0]
    expect(f).toMatchObject({ rol: 'TRANSPORTISTA', nombre: 'Pedro Quispe', dni: '45678912', placa: 'ABC-123', capturadoPor: 'Christians' })
    expect(f.imagen).toBeUndefined()
    expect(huellaDeReferencia(f.imagenRef)).toBe(f.imagenHash)
    expect(archivosEnMemoria.get(f.imagenRef!)?.length).toBeGreaterThan(10)
  })
  it('exige una imagen PNG válida para la firma del transportista', async () => {
    const a = await acta()
    expect(await repo.firmarActa(a, { ...TRANSP, imagen: 'data:image/png;base64,' + 'A'.repeat(200) }, AUX)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/no es una imagen válida/) })
  })
})

describe('F · avisos al recibir (demo)', () => {
  it('la compra anunciada a Daré Pharma (solo mes y año) muestra «MM/AAAA (solo mes y año)» y, al verificar, nacen las dos alertas', async () => {
    const s = (await repo.listarSolicitudes()).find((x) => x.referencia === 'OC-DEMO-0050')!
    const d = (await repo.obtenerSolicitud(s.id))!
    expect(d.lineas[0]).toMatchObject({ lote: 'DP2611', vence: '2028-06-01', venceTexto: '06/2028' })
    exito(await repo.iniciarRecepcion(s.id, CHARLIE))
    const l = (await repo.obtenerSolicitud(s.id))!.lineas[0]
    expect(l.avisosVencimiento?.map((a) => a.tipo).sort()).toEqual(['VENCIMIENTO_VERIFICAR', 'VIDA_UTIL_CORTA'])
    exito(await repo.verificarLinea(s.id, l.id, { coincide: true, posicionId: A6 }, CHARLIE))
    const alertas = (await repo.listarAlertas()).filter((a) => a.solicitudId === s.id)
    expect(alertas.find((a) => a.tipo === 'VENCIMIENTO_VERIFICAR')).toMatchObject({ destinatario: 'jefe_almacen', mensaje: expect.stringMatching(/Daré Pharma solo imprime mes y año/) })
    expect(alertas.find((a) => a.tipo === 'VIDA_UTIL_CORTA')).toMatchObject({ destinatario: 'direccion_tecnica' })
  })
  it('un proveedor sin marca y con vida útil suficiente no genera alertas; marcarlo exige rol y motivo', async () => {
    const x = await compra('OC-DEMO-0002', '30/06/2031', 'F-2')
    await verificar(x)
    expect((await repo.listarAlertas()).filter((a) => a.solicitudId === x.id && (a.tipo === 'VENCIMIENTO_VERIFICAR' || a.tipo === 'VIDA_UTIL_CORTA'))).toEqual([])
    const prov = (await repo.proveedoresVencimiento()).find((p) => p.nombre.startsWith('Droguería Pacífico'))!
    expect(await repo.marcarProveedorVencimiento(prov.ruc, prov.nombre, true, 'x', AUX)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Solo Dirección Técnica/) })
    expect(await repo.marcarProveedorVencimiento(prov.ruc, prov.nombre, true, ' ', KATIA)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/motivo/) })
    exito(await repo.marcarProveedorVencimiento(prov.ruc, prov.nombre, true, 'Solo imprime mes y año', SANDRA))
    expect((await repo.proveedoresVencimiento()).find((p) => p.ruc === prov.ruc)?.soloMesAnio).toBe(true)
    expect((await repo.proveedoresVencimiento()).find((p) => p.nombre === 'Daré Pharma')?.soloMesAnio).toBe(true)
  })
  it('menos de 24 meses de vida útil avisa y 24 o más no', async () => {
    const hoy = hoyEnLima(); const [y, m, d] = hoy.split('-').map(Number)
    const f = (meses: number) => { const t = new Date(Date.UTC(y, m - 1 + meses, d)); return `${String(t.getUTCDate()).padStart(2, '0')}/${String(t.getUTCMonth() + 1).padStart(2, '0')}/${t.getUTCFullYear()}` }
    const corta = await compra('OC-DEMO-0002', f(22), 'F-C')
    const justa = await compra('OC-DEMO-0004', f(24), 'F-J')
    expect((await repo.obtenerSolicitud(corta.id))!.lineas[0].avisosVencimiento?.map((a) => a.tipo)).toEqual(['VIDA_UTIL_CORTA'])
    expect((await repo.obtenerSolicitud(justa.id))!.lineas[0].avisosVencimiento).toEqual([])
  })
})

describe('F · corregir la fecha del lote (demo)', () => {
  it('la corrige el Jefe de Almacén o DT con motivo; queda el historial; Sandra y el auxiliar no', async () => {
    const lote = (await repo.panorama()).lotes.find((l) => l.vence)!
    expect(await repo.corregirVencimientoLote(lote.id, '30/06/2030', 'El envase dice 30', AUX)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Solo el Jefe de Almacén/) })
    expect(await repo.corregirVencimientoLote(lote.id, '30/06/2030', 'x', SANDRA)).toMatchObject({ ok: false })
    expect(await repo.corregirVencimientoLote(lote.id, '30/06/2030', ' ', CHARLIE)).toMatchObject({ ok: false, errores: { motivo: expect.any(String) } })
    const antes = lote.vence
    exito(await repo.corregirVencimientoLote(lote.id, '30/06/2030', 'El envase dice 30', CHARLIE))
    exito(await repo.corregirVencimientoLote(lote.id, '15/06/2030', 'Lo revisé en el protocolo', KATIA))
    const h = await repo.historialVencimientoLote(lote.id)
    expect(h.map((c) => [c.antes, c.despues, c.usuario])).toEqual(expect.arrayContaining([[antes, '2030-06-30', 'Charlie'], ['2030-06-30', '2030-06-15', 'Katia']]))
    expect((await repo.panorama()).lotes.find((l) => l.id === lote.id)?.vence).toBe('2030-06-15')
    expect(await repo.corregirVencimientoLote(lote.id, '15/06/2030', 'igual', CHARLIE)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/nada que corregir/) })
  })
})

describe('F · «sin material de envase» y formato versionado (demo)', () => {
  const ocultoEnActa = async () => {
    const o = (await repo.colaDireccionTecnica()).organolepticas[0]
    return { o, v: (await repo.obtenerOrganoleptica(o.id))! }
  }
  it('solo Dirección Técnica lo marca y queda en el historial regulatorio', async () => {
    const p = (await repo.panorama()).productos[0]
    expect(await repo.editarRegulatorio(p.id, { sinMaterialEnvase: 'si' }, 'Es una crema', SANDRA)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Solo Dirección Técnica marca/) })
    expect(exito(await repo.editarRegulatorio(p.id, { sinMaterialEnvase: 'si' }, 'Es una crema', KATIA)).cambios).toBe(1)
    expect((await repo.panorama()).productos.find((x) => x.id === p.id)?.reg?.sinMaterialEnvase).toBe(true)
    expect((await repo.historialRegulatorio(p.id))[0]).toMatchObject({ campo: 'sin_material_envase', antes: 'false', despues: 'true', motivo: 'Es una crema' })
    expect(exito(await repo.editarRegulatorio(p.id, { sinMaterialEnvase: 'si' }, 'otra vez', KATIA)).cambios).toBe(0)
  })
  it('con la versión 1 vigente el material siempre se pide; al aprobar la 2, las actas nuevas lo ocultan si el producto está marcado', async () => {
    const { o, v } = await ocultoEnActa()
    expect(v.formatoVersion).toBe(1)
    exito(await repo.editarRegulatorio(o.productoId, { sinMaterialEnvase: 'si' }, 'Sin envase', KATIA))
    expect((await repo.obtenerOrganoleptica(o.id))).toMatchObject({ sinMaterialEnvase: true, materialEnvaseOculto: false })
    expect((await repo.versionesFormato('ACTA_ORGANOLEPTICA')).map((x) => [x.version, x.estado])).toEqual([[1, 'APROBADA'], [2, 'PENDIENTE']])
    expect(await repo.aprobarVersionFormato('ACTA_ORGANOLEPTICA', 2, SANDRA)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Solo Dirección Técnica aprueba/) })
    exito(await repo.aprobarVersionFormato('ACTA_ORGANOLEPTICA', 2, KATIA))
    expect(await repo.aprobarVersionFormato('ACTA_ORGANOLEPTICA', 2, KATIA)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/ya está aprobada/) })
    // El acta que ya existía conserva su versión (1): sigue pidiendo el material.
    expect(await repo.obtenerOrganoleptica(o.id)).toMatchObject({ formatoVersion: 1, materialEnvaseOculto: false })
    // Un acta nueva nace en la versión 2 y, con el producto marcado, no pide el material para enviarla.
    const x = await compra('OC-DEMO-0002', '30/06/2031', 'F-ORG')
    await verificar(x)
    const prod = (await repo.obtenerSolicitud(x.id))!.lineas[0].productoId
    exito(await repo.editarRegulatorio(prod, { sinMaterialEnvase: 'si' }, 'Sin envase', KATIA))
    exito(await repo.editarRecepcion(x.id, { temperaturaC: 20, bultos: 3, paletas: 1, placa: 'ABC-123', tipoConteo: 'TOTAL' }, CHARLIE))
    const a = exito(await repo.generarActa(x.id, CHARLIE)).actaId
    exito(await repo.firmarActa(a, TRANSP, CHARLIE)); exito(await repo.firmarActa(a, { rol: 'RESPONSABLE_CONTEO' }, AUX))
    exito(await repo.firmarActa(a, { rol: 'JEFE_ALMACEN' }, CHARLIE)); exito(await repo.firmarActa(a, { rol: 'DIRECCION_TECNICA' }, KATIA))
    exito(await repo.confirmarIngreso(x.id, CHARLIE))
    const nueva = (await repo.obtenerSolicitud(x.id))!.organolepticas[0]
    expect(nueva).toMatchObject({ formatoVersion: 2, materialEnvaseOculto: true })
    const sinMaterial = checklistConforme()
    for (const k of Object.keys(sinMaterial)) if (k.startsWith('pla_')) delete sinMaterial[k]
    exito(await repo.guardarOrganoleptica(nueva.id, { certAnalisis: true, checklist: sinMaterial, destinoSugerido: 'APROBADO', conclusion: 'CONFORME' }, true, SANDRA))
  })
})
