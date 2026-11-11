import { describe, expect, it } from 'vitest'
import { FORMATOS, FORMATO_LIMPIEZA, FORMATO_VEHICULO, armarMes, diasDelMes, esConforme, itemsTodoSi, marcaImpresa, mesDe, mesLargo, motivoNoPuedeSupervisar, productoDeLimpieza, puedeVerInspecciones, puntosNoConformes, validarInspeccion, type InspeccionVista } from '@/domain/inspecciones'

const insp = (p: Partial<InspeccionVista> = {}): InspeccionVista => ({ id: 'i1', tipo: 'VEHICULO', vehiculoId: 'v1', fecha: '2026-11-05', items: itemsTodoSi('VEHICULO'), conforme: true, realizadaPor: 'u1', realizadaNombre: 'Hans Astoyauri', realizadaEn: '2026-11-05T13:00:00Z', ...p })

describe('formatos de inspección', () => {
  it('LS-FR.49.03 tiene 34 puntos (16 de inspección y 18 de documentos y condiciones) y LS-FR.52.03 tiene 12', () => {
    expect(FORMATO_VEHICULO.puntos).toHaveLength(34); expect(FORMATO_VEHICULO.puntos.filter((p) => p.grupo === 'Puntos de inspección')).toHaveLength(16)
    expect(FORMATO_LIMPIEZA.puntos).toHaveLength(12); expect(FORMATO_LIMPIEZA.codigo).toBe('LS-FR.52.03'); expect(FORMATO_LIMPIEZA.poe).toBe('LS-POE.36.03')
    for (const f of Object.values(FORMATOS)) expect(new Set(f.puntos.map((p) => p.clave)).size).toBe(f.puntos.length)
  })
  it('las claves son las mismas que usa la base (migración 0058)', async () => {
    const { readFileSync } = await import('node:fs'); const sql = readFileSync('supabase/migrations/0058_wms_inspecciones_de_la_unidad.sql', 'utf8')
    for (const f of Object.values(FORMATOS)) for (const p of f.puntos) expect(sql, p.clave).toContain(`'${p.clave}'`)
  })
})

describe('conformidad y validación', () => {
  it('todo en «Sí» es conforme; un «No» lo vuelve no conforme; «No aplica» no cuenta; en la limpieza el derrame no cuenta', () => {
    expect(esConforme('VEHICULO', itemsTodoSi('VEHICULO'))).toBe(true)
    expect(esConforme('VEHICULO', { ...itemsTodoSi('VEHICULO'), soat: 'NO' })).toBe(false)
    expect(puntosNoConformes('VEHICULO', { ...itemsTodoSi('VEHICULO'), soat: 'NO' }).map((p) => p.clave)).toEqual(['soat'])
    expect(esConforme('VEHICULO', { ...itemsTodoSi('VEHICULO'), datalogger: 'NA' })).toBe(true)
    expect(itemsTodoSi('LIMPIEZA').derrame).toBe('NO'); expect(esConforme('LIMPIEZA', itemsTodoSi('LIMPIEZA'))).toBe(true)
    expect(esConforme('LIMPIEZA', { ...itemsTodoSi('LIMPIEZA'), derrame: 'SI' })).toBe(true)
    expect(esConforme('LIMPIEZA', { ...itemsTodoSi('LIMPIEZA'), piso: 'NO' })).toBe(false)
  })
  it('valida vehículo, fecha (hoy y 3 días atrás), todos los puntos y la nota cuando no es conforme', () => {
    const ok = { tipo: 'VEHICULO' as const, vehiculoId: 'v1', fecha: '2026-11-10', hoy: '2026-11-10', items: itemsTodoSi('VEHICULO') }
    expect(validarInspeccion(ok)).toEqual([])
    expect(validarInspeccion({ ...ok, vehiculoId: undefined })).toEqual(['Elige un vehículo disponible'])
    expect(validarInspeccion({ ...ok, fecha: '2026-11-11' })).toEqual(['La fecha de la inspección no puede ser futura'])
    expect(validarInspeccion({ ...ok, fecha: '2026-11-07' })).toEqual([]); expect(validarInspeccion({ ...ok, fecha: '2026-11-06' })).toEqual(['Solo se registran inspecciones de hoy y de los últimos 3 días'])
    expect(validarInspeccion({ ...ok, items: { ...ok.items, soat: undefined as never } })).toEqual(['Falta marcar un punto de la inspección (Sí, No o No aplica)'])
    const mal = { ...ok, items: { ...ok.items, luces: 'NO' as const } }
    expect(validarInspeccion(mal)).toEqual(['Hay puntos no conformes: cuéntanos qué pasó (al menos 5 letras)']); expect(validarInspeccion({ ...mal, observaciones: 'Luz trasera rota' })).toEqual([])
  })
})

describe('el mes y la limpieza', () => {
  it('arma los días del mes con su inspección', () => {
    expect(diasDelMes('2026-11')).toBe(30); expect(diasDelMes('2028-02')).toBe(29); expect(mesDe('2026-11-05')).toBe('2026-11'); expect(mesLargo('2026-11')).toBe('noviembre 2026')
    const dias = armarMes('2026-11', [insp()])
    expect(dias).toHaveLength(30); expect(dias[4].inspeccion?.id).toBe('i1'); expect(dias[0].inspeccion).toBeUndefined()
  })
  it('lejía la 1.ª y 3.ª semana, glutaraldehído la 2.ª y 4.ª (la 5.ª sigue a la 4.ª)', () => {
    expect(['2026-11-01', '2026-11-07', '2026-11-15', '2026-11-21'].map(productoDeLimpieza)).toEqual(['L', 'L', 'L', 'L'])
    expect(['2026-11-08', '2026-11-14', '2026-11-22', '2026-11-28', '2026-11-30'].map(productoDeLimpieza)).toEqual(['G', 'G', 'G', 'G', 'G'])
  })
  it('lo que se imprime en cada celda', () => {
    expect(marcaImpresa('VEHICULO', 'soat', 'SI', '2026-11-05')).toBe('✓'); expect(marcaImpresa('VEHICULO', 'soat', 'NO', '2026-11-05')).toBe('✗'); expect(marcaImpresa('VEHICULO', 'soat', 'NA', '2026-11-05')).toBe('N.A.')
    expect(marcaImpresa('VEHICULO', 'soat', undefined, '2026-11-05')).toBe('')
    expect(marcaImpresa('LIMPIEZA', 'piso', 'SI', '2026-11-05')).toBe('L'); expect(marcaImpresa('LIMPIEZA', 'piso', 'SI', '2026-11-10')).toBe('G'); expect(marcaImpresa('LIMPIEZA', 'llantas', 'SI', '2026-11-10')).toBe('✓')
    expect(marcaImpresa('LIMPIEZA', 'derrame', 'NO', '2026-11-05')).toBe(''); expect(marcaImpresa('LIMPIEZA', 'derrame', 'SI', '2026-11-05')).toBe('✓')
  })
})

describe('quién supervisa', () => {
  it('otra persona con permiso, nunca quien la hizo, y una sola vez', () => {
    expect(puedeVerInspecciones(['conductor'])).toBe(true); expect(puedeVerInspecciones(['auxiliar'])).toBe(false)
    expect(motivoNoPuedeSupervisar(['conductor'], 'u2', insp())).toBeNull()
    expect(motivoNoPuedeSupervisar(['conductor'], 'u1', insp())).toBe('La supervisa otra persona, no quien la hizo')
    expect(motivoNoPuedeSupervisar(['conductor'], 'u2', insp({ supervisadaPor: 'u3' }))).toBe('Ya fue supervisada')
    expect(motivoNoPuedeSupervisar(['auxiliar'], 'u2', insp())).toMatch(/permiso/)
  })
})
