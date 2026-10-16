// El repositorio de documentos del modo demostración aplica las mismas reglas que la migración 0016.
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import type { Actor } from '@/services/repositorio'

const actor = (rol: Actor['roles'][number]): Actor => ({ id: `demo:${rol}`, nombre: `${rol} (demo)`, roles: [rol] })
const DT = actor('direccion_tecnica'); const AUX = actor('auxiliar'); const JEFE = actor('jefe_almacen')
const archivo = (nombre: string, n = 1) => ({ nombre, hash: `h${nombre}${n}`, bytes: 1000, ref: `coa/${nombre}` })

let repo: RepositorioDemo
beforeEach(() => {
  ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined
  repo = new RepositorioDemo()
})

describe('documentos regulatorios (demo)', () => {
  it('arranca con documentos vigentes, uno por vencer, uno vencido y lotes sin COA que se muestran como pendientes', async () => {
    const p = await repo.panoramaDocumentos()
    expect(p.resumen.vencidos).toBe(1)
    expect(p.resumen.porVencer).toBe(1)
    expect(p.resumen.porRevisar).toBe(3)
    expect(p.lotesSinCoa.map((l) => l.lote)).toEqual(expect.arrayContaining(['L-VENCIDO', 'L-VENCE-PRONTO']))
  })

  it('quien recibe adjunta el COA solo si el lote no tiene uno; reemplazarlo es de Dirección Técnica y deja el historial', async () => {
    const lote = (await repo.panoramaDocumentos()).lotesSinCoa.find((l) => l.lote === 'L-VENCIDO')!
    const sube = (a: Actor, nombre: string, extra = {}) => repo.subirDocumento({ tipo: 'COA', alcanceId: lote.loteId, nombreArchivo: nombre, archivoRef: `coa/${nombre}`, hash: `h-${nombre}`, bytes: 10, ...extra }, a)
    const r1 = await sube(AUX, 'a.pdf')
    expect(r1.ok).toBe(true)
    expect((await repo.panoramaDocumentos()).lotesSinCoa.some((l) => l.loteId === lote.loteId)).toBe(false)
    const r2 = await sube(AUX, 'b.pdf', { reemplazaA: r1.ok ? r1.id : undefined })
    expect(r2).toMatchObject({ ok: false })
    const r3 = await sube(DT, 'b.pdf', { reemplazaA: r1.ok ? r1.id : undefined, motivo: 'Corregido' })
    expect(r3.ok).toBe(true)
    const docs = (await repo.panoramaDocumentos()).documentos.filter((d) => d.alcanceId === lote.loteId)
    expect(docs.map((d) => [d.nombreArchivo, d.estado]).sort()).toEqual([['a.pdf', 'REEMPLAZADO'], ['b.pdf', 'VIGENTE']])
  })

  it('el registro sanitario y el BPM los sube solo Dirección Técnica, y una vigencia al revés se rechaza', async () => {
    const p = await repo.panoramaDocumentos()
    const fab = p.fabricantes[0]
    const base = { tipo: 'BPM' as const, alcanceId: fab.id, nombreArchivo: 'bpm.pdf', archivoRef: 'bpm/x', hash: 'hb', bytes: 5 }
    expect(await repo.subirDocumento(base, JEFE)).toMatchObject({ ok: false })
    const doc = p.documentos.find((d) => d.tipo === 'BPM')!
    expect(await repo.subirDocumento({ ...base, alcanceId: doc.alcanceId, reemplazaA: doc.id, vigenteDesde: '2026-05-01', vigenteHasta: '2026-04-01' }, DT)).toMatchObject({ ok: false })
  })

  it('la carga en bloque relaciona por el nombre del archivo, no adivina, y no repite el mismo archivo', async () => {
    const r = await repo.cargarCoaEnBloque([archivo('COA_L-VENCE-PRONTO_Losartan.pdf'), archivo('scan9999.pdf'), archivo('COA_L-VENCE-PRONTO_Losartan.pdf')], JEFE)
    expect(r).toMatchObject({ ok: true, resumen: { total: 3, importados: 1, porRevisar: 1, duplicados: 1 } })
    const p = await repo.panoramaDocumentos()
    expect(p.lotesSinCoa.some((l) => l.lote === 'L-VENCE-PRONTO')).toBe(false)
    expect(p.itemsCoa.filter((i) => i.estado === 'POR_REVISAR')).toHaveLength(4)
  })

  it('un archivo por revisar se asigna a mano a un lote o se descarta', async () => {
    const p = await repo.panoramaDocumentos()
    const item = p.itemsCoa.find((i) => i.nombreArchivo === 'scan0001.pdf')!
    const lote = p.lotesSinCoa.find((l) => l.lote === 'L-VENCE-2-MESES')!
    expect(await repo.asignarItemCoa(item.id, lote.loteId, JEFE)).toMatchObject({ ok: true })
    const otro = p.itemsCoa.find((i) => i.nombreArchivo === 'COA lote X-9999 pendiente.pdf')!
    expect(await repo.descartarItemCoa(otro.id, 'No es un COA', JEFE)).toMatchObject({ ok: true })
    const d = await repo.panoramaDocumentos()
    expect(d.resumen.porRevisar).toBe(1)
    expect(d.lotesSinCoa.some((l) => l.lote === 'L-VENCE-2-MESES')).toBe(false)
  })

  it('sin perfil del cliente se exigen COA y registro sanitario; con perfil, solo lo que pide', async () => {
    const lote = (await repo.panoramaDocumentos()).lotesSinCoa[0]
    const sin = await repo.requisitosDocumentales(lote.loteId, '20999999991')
    expect(sin.filter((x) => x.exigido).map((x) => x.tipo).sort()).toEqual(['COA', 'REGISTRO_SANITARIO'])
    expect(sin.find((x) => x.tipo === 'COA')!.estado).toBe('FALTA')
    expect(await repo.guardarPerfilDocumental({ ruc: '20999999991', exigeCoa: false, exigeRegistroSanitario: false, exigeBpm: false, copias: 2 }, actor('jefe_transporte'))).toMatchObject({ ok: true })
    const con = await repo.requisitosDocumentales(lote.loteId, '20999999991')
    expect(con.every((x) => !x.exigido)).toBe(true)
    expect(await repo.guardarPerfilDocumental({ ruc: '20999999992', exigeCoa: true, exigeRegistroSanitario: true, exigeBpm: false, copias: 1 }, AUX)).toMatchObject({ ok: false })
  })
})
