// SB-E (D-196): el Administrador hace todo lo operativo y de configuración en el modo demostración, con las mismas reglas que la base (migración 0035).
// Lo que sigue reservado a Dirección Técnica: aprobar, dar de baja, autorizar ajustes y validar producto.
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { checklistConforme } from '@/services/demo/entradas-demo'
import { rolesEfectivos } from '@/domain/permisos'
import type { Actor } from '@/services/repositorio'

const actor = (rol: Actor['roles'][number], nombre: string = rol): Actor => ({ id: `demo:${rol}`, nombre, roles: [rol] })
const ADMIN: Actor = { id: 'demo:admin_wms', nombre: 'Sebastián', roles: rolesEfectivos(['admin_wms']) }
const KATIA = actor('direccion_tecnica', 'Katia')
const SANDRA = actor('asistente_dt', 'Sandra')
const CHARLIE = actor('jefe_almacen', 'Charlie')
const AUX = actor('auxiliar', 'Christians')
const IMG = 'data:image/png;base64,' + 'A'.repeat(200)
const exito = <T extends { ok: boolean }>(r: T) => { expect(r, JSON.stringify(r)).toMatchObject({ ok: true }); return r as Extract<T, { ok: true }> }

let repo: RepositorioDemo
beforeEach(() => {
  ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined
  repo = new RepositorioDemo()
})

const producto = async (id: string) => (await repo.panorama()).productos.find((p) => p.id === id)!

describe('el Administrador da de alta productos, pero no los valida', () => {
  const entrada = { codigo: 'ADM-001', descripcion: 'Producto del Administrador', registroSanitario: 'EG-9001', rsVence: '31/12/2031' }
  it('el alta del Administrador queda por validar y la valida Dirección Técnica; el alta de la asistente rige de inmediato', async () => {
    const r = exito(await repo.crearProducto(entrada, ADMIN))
    expect((await producto(r.id)).reg?.estadoValidacion).toBe('PENDIENTE')
    expect(await repo.validarProducto(r.id, ADMIN)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Solo Dirección Técnica/) })
    expect(await repo.validarProducto(r.id, CHARLIE)).toMatchObject({ ok: false })
    exito(await repo.validarProducto(r.id, KATIA))
    expect((await producto(r.id)).reg?.estadoValidacion).toBe('VALIDADO')
    const s = exito(await repo.crearProducto({ ...entrada, codigo: 'ADM-002' }, SANDRA))
    expect((await producto(s.id)).reg?.estadoValidacion).toBe('VALIDADO')
    const auditoria = (await repo.auditoria(50)).map((e) => e.evento)
    expect(auditoria).toEqual(expect.arrayContaining(['producto_creado', 'producto_validado']))
  })
  it('si el Administrador cambia datos de un producto validado, vuelve a estar por validar; Dirección Técnica lo valida de nuevo', async () => {
    expect((await producto('prod:1')).reg?.estadoValidacion).not.toBe('PENDIENTE')
    exito(await repo.editarRegulatorio('prod:1', { fabricante: 'Otro laboratorio' }, 'Corrección del Administrador', ADMIN))
    expect((await producto('prod:1')).reg?.estadoValidacion).toBe('PENDIENTE')
    exito(await repo.validarProducto('prod:1', KATIA))
    expect((await producto('prod:1')).reg?.estadoValidacion).toBe('VALIDADO')
    exito(await repo.editarRegulatorio('prod:1', { fabricante: 'Otro más' }, 'Lo cambia la asistente', SANDRA))
    expect((await producto('prod:1')).reg?.estadoValidacion).toBe('VALIDADO')
  })
})

describe('el Administrador hace lo operativo de las entradas', () => {
  it('prepara y autoriza una solicitud, y firma el acta como Jefe de Almacén (junto a Dirección Técnica y el resto)', async () => {
    const oc = (await repo.ocsPendientes())[0]
    const propietario = (await repo.panorama()).propietarios.find((p) => p.codigo === 'LOGISSA')!.id
    const r = exito(await repo.crearSolicitud({
      tipo: 'COMPRA_LOCAL', propietarioId: propietario, ocId: oc.ocId, guiaNumero: 'T001-9',
      lineas: [{ ocItemId: oc.items[0].ocItemId, lote: 'ADM-1', vence: '30/06/2028', cantidad: 10 }],
    }, true, ADMIN))
    exito(await repo.iniciarRecepcion(r.id, CHARLIE))
    const s = (await repo.obtenerSolicitud(r.id))!
    for (const l of s.lineas) exito(await repo.verificarLinea(r.id, l.id, { coincide: true, posicionId: 'pos:A-6' }, CHARLIE))
    exito(await repo.editarRecepcion(r.id, { temperaturaC: 20, bultos: 3, paletas: 1, placa: 'ABC-123', tipoConteo: 'TOTAL' }, CHARLIE))
    const g = exito(await repo.generarActa(r.id, CHARLIE))
    // El Administrador firma como Jefe de Almacén.
    exito(await repo.firmarActa(g.actaId, { rol: 'JEFE_ALMACEN' }, ADMIN))
    // Pero no como Dirección Técnica.
    expect(await repo.firmarActa(g.actaId, { rol: 'DIRECCION_TECNICA' }, ADMIN)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Dirección Técnica/) })
    exito(await repo.firmarActa(g.actaId, { rol: 'DIRECCION_TECNICA' }, KATIA))
    exito(await repo.firmarActa(g.actaId, { rol: 'RESPONSABLE_CONTEO' }, AUX))
    exito(await repo.firmarActa(g.actaId, { rol: 'TRANSPORTISTA', nombre: 'Pedro Quispe', dni: '45678912', placa: 'ABC-123', imagen: IMG }, CHARLIE))
  })
  it('llena el acta organoléptica, pero la decisión (Aprobado o Bajas) sigue siendo solo de Dirección Técnica', async () => {
    const cola = await repo.colaDireccionTecnica()
    const bor = cola.borradores[0]
    exito(await repo.guardarOrganoleptica(bor.id, { certAnalisis: true, checklist: checklistConforme(), destinoSugerido: 'APROBADO', conclusion: 'CONFORME' }, true, ADMIN))
    expect(await repo.decidirOrganoleptica(bor.id, 'APROBADO', undefined, ADMIN)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Solo Dirección Técnica/) })
  })
})

describe('el Administrador gestiona los documentos regulatorios', () => {
  const archivo = (nombre: string) => ({ nombreArchivo: nombre, archivoRef: `coa/${nombre}`, hash: `h-${nombre}`, bytes: 10 })
  it('sube y reemplaza un COA, crea un fabricante y sube el BPM; todo queda auditado', async () => {
    const lote = (await repo.panoramaDocumentos()).lotesSinCoa.find((l) => l.lote === 'L-VENCIDO')!
    const a = exito(await repo.subirDocumento({ tipo: 'COA', alcanceId: lote.loteId, ...archivo('a.pdf') }, ADMIN))
    exito(await repo.subirDocumento({ tipo: 'COA', alcanceId: lote.loteId, ...archivo('b.pdf'), reemplazaA: a.id, motivo: 'Corregido' }, ADMIN))
    const f = exito(await repo.crearFabricante('Laboratorio del Administrador', ADMIN))
    exito(await repo.subirDocumento({ tipo: 'BPM', alcanceId: f.id, ...archivo('bpm.pdf') }, ADMIN))
    expect((await repo.auditoria(50)).map((e) => e.evento)).toEqual(expect.arrayContaining(['documento_subido', 'documento_reemplazado', 'fabricante_creado']))
  })
})
