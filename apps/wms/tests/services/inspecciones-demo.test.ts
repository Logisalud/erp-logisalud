// Inspecciones de la unidad en la demostración (espejo de tests/db/inspecciones.test.ts) y el Word mensual.
import JSZip from 'jszip'
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { hoyEnLima } from '@/domain/fechas'
import { itemsTodoSi, mesDe, sumarDias } from '@/domain/inspecciones'
import { documentoWord, nombreArchivoWord } from '@/services/docx/inspeccion-docx'
import type { Actor } from '@/services/repositorio'

const actor = (id: string, ...roles: Actor['roles']): Actor => ({ id: `demo:${id}`, nombre: `${id} (demo)`, roles })
const HANS = actor('hans', 'conductor'); const MICHELE = actor('michele', 'conductor'); const AUX = actor('aux', 'auxiliar')
let repo: RepositorioDemo
beforeEach(() => { ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined; repo = new RepositorioDemo() })

describe('inspecciones de la unidad (demo)', () => {
  it('quien conduce ve los vehículos; quien no tiene el permiso, no', async () => {
    expect((await repo.vehiculosParaInspeccion(HANS)).length).toBeGreaterThan(0)
    expect(await repo.vehiculosParaInspeccion(AUX)).toEqual([])
    const v = (await repo.vehiculosParaInspeccion(HANS))[0]
    expect(await repo.registrarInspeccion({ tipo: 'VEHICULO', vehiculoId: v.id, fecha: hoyEnLima(), items: itemsTodoSi('VEHICULO') }, AUX)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/permiso/) })
  })

  it('registra una por vehículo, tipo y día; no conforme pide nota; otra persona la supervisa, nunca quien la hizo, y una sola vez', async () => {
    const v = (await repo.vehiculosParaInspeccion(HANS))[0]; const hoy = hoyEnLima()
    const datos = { tipo: 'VEHICULO' as const, vehiculoId: v.id, fecha: hoy, items: itemsTodoSi('VEHICULO') }
    expect(await repo.registrarInspeccion({ ...datos, fecha: sumarDias(hoy, 1) }, HANS)).toMatchObject({ ok: false, mensaje: expect.stringContaining('futura') })
    expect(await repo.registrarInspeccion({ ...datos, items: { ...datos.items, luces: 'NO' } }, HANS)).toMatchObject({ ok: false, mensaje: expect.stringContaining('cuéntanos qué pasó') })
    const r = await repo.registrarInspeccion(datos, HANS); if (!r.ok) throw new Error(r.mensaje)
    expect(await repo.registrarInspeccion(datos, MICHELE)).toMatchObject({ ok: false, mensaje: expect.stringContaining('Ya hay una inspección') })
    expect(await repo.registrarInspeccion({ ...datos, tipo: 'LIMPIEZA', items: itemsTodoSi('LIMPIEZA') }, HANS)).toMatchObject({ ok: true })   // la limpieza es otro formato
    expect(await repo.supervisarInspeccion(r.id, HANS)).toMatchObject({ ok: false, mensaje: expect.stringContaining('otra persona') })
    expect(await repo.supervisarInspeccion(r.id, MICHELE)).toEqual({ ok: true })
    expect(await repo.supervisarInspeccion(r.id, MICHELE)).toMatchObject({ ok: false, mensaje: expect.stringContaining('ya fue supervisada') })
    const mes = await repo.inspeccionesDelMes('VEHICULO', v.id, mesDe(hoy), HANS)
    expect(mes).toEqual([expect.objectContaining({ id: r.id, conforme: true, realizadaNombre: 'hans (demo)', supervisadaNombre: 'michele (demo)' })])
  })

  it('el Word del mes es un .docx válido con el código, la placa, las marcas y las firmas', async () => {
    const v = (await repo.vehiculosParaInspeccion(HANS))[0]; const hoy = hoyEnLima()
    const r = await repo.registrarInspeccion({ tipo: 'VEHICULO', vehiculoId: v.id, fecha: hoy, items: { ...itemsTodoSi('VEHICULO'), luces: 'NO' }, observaciones: 'Luz trasera rota & sin repuesto' }, HANS); if (!r.ok) throw new Error(r.mensaje)
    const inspecciones = await repo.inspeccionesDelMes('VEHICULO', v.id, mesDe(hoy), HANS)
    const zip = await JSZip.loadAsync(documentoWord({ tipo: 'VEHICULO', placa: v.placa, mes: mesDe(hoy), inspecciones }))
    expect(Object.keys(zip.files).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'word/document.xml'])
    const xml = await zip.file('word/document.xml')!.async('string')
    for (const t of ['LS-FR.49.03', 'INSPECCIÓN DE LA UNIDAD DE TRANSPORTE', v.placa, 'CONDUCTOR', 'DIRECTOR TÉCNICO', 'Luz trasera rota &amp; sin repuesto', '✗', '✓', 'NO CONFORME']) expect(xml, t).toContain(t)
    const limpieza = await JSZip.loadAsync(documentoWord({ tipo: 'LIMPIEZA', placa: v.placa, mes: mesDe(hoy), inspecciones: [] }))
    const xml2 = await limpieza.file('word/document.xml')!.async('string')
    for (const t of ['LS-FR.52.03', 'LS-POE.36.03', 'Desde 01-09-2026 hasta 01-09-2028', 'Lejía (L)']) expect(xml2, t).toContain(t)
    expect(nombreArchivoWord('VEHICULO', 'ABC-123', '2026-11')).toBe('LS-FR.49.03_ABC-123_2026-11.docx')
  })
})
