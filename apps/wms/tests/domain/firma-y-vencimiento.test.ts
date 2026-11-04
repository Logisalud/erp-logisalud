// Piloto C y F en el dominio: orden de las firmas del acta, avisos de vencimiento, vida útil, formato versionado y checklist sin material de envase.
import { describe, expect, it } from 'vitest'
import { ROLES_FIRMA, faltantesParaEnviar, itemsPendientes, siguienteEnFirmar, verificarOrdenDeFirma, CHECKLIST_ORGANOLEPTICO } from '@/domain/entradas'
import { DIA_POR_DEFECTO_INICIAL, diaPorDefectoDe, esSoloMesAnio, mesesDeVidaRestante, textoVencimiento } from '@/domain/fechas'
import { avisosDeVencimiento, validarCorreccionVencimiento, validarVidaUtilMinima } from '@/domain/vencimiento'
import { ocultaMaterialEnvase, versionVigente } from '@/domain/formatos'
import { construirMenu } from '@/domain/menu'
import { huellaDeReferencia, procesarFirmaPng, FIRMA_PNG_EJEMPLO } from '@/services/firma-imagen'

describe('orden de las firmas del acta (C)', () => {
  it('es transportista → responsable de conteo → Jefe de Almacén → Dirección Técnica', () => {
    expect(ROLES_FIRMA).toEqual(['TRANSPORTISTA', 'RESPONSABLE_CONTEO', 'JEFE_ALMACEN', 'DIRECCION_TECNICA'])
    expect(siguienteEnFirmar([])).toBe('TRANSPORTISTA')
    expect(siguienteEnFirmar(['TRANSPORTISTA', 'RESPONSABLE_CONTEO'])).toBe('JEFE_ALMACEN')
    expect(siguienteEnFirmar([...ROLES_FIRMA])).toBeNull()
  })
  it('una firma fuera de orden se rechaza y el mensaje dice a quién le toca; la que sí toca y la repetida', () => {
    expect(verificarOrdenDeFirma('DIRECCION_TECNICA', [])).toEqual({ ok: false, mensaje: 'Todavía no le toca a Dirección Técnica. Le toca a Transportista.' })
    expect(verificarOrdenDeFirma('JEFE_ALMACEN', ['TRANSPORTISTA'])).toEqual({ ok: false, mensaje: 'Todavía no le toca a Jefe de Almacén. Le toca a Responsable de conteo.' })
    expect(verificarOrdenDeFirma('TRANSPORTISTA', [])).toEqual({ ok: true })
    expect(verificarOrdenDeFirma('TRANSPORTISTA', ['TRANSPORTISTA'])).toEqual({ ok: false, mensaje: 'Ese rol ya firmó esta acta' })
  })
  it('la firma dibujada: solo PNG, con su huella dentro de la referencia', () => {
    const p = procesarFirmaPng(FIRMA_PNG_EJEMPLO)
    if ('error' in p) throw new Error(p.error)
    expect(p.ref).toMatch(/^firmas\/[0-9a-f]{16}-[0-9a-f]{64}\.png$/)
    expect(huellaDeReferencia(p.ref)).toBe(p.hash)
    expect(huellaDeReferencia('firmas/corta.png')).toBeNull()
    expect(procesarFirmaPng('data:image/png;base64,' + 'A'.repeat(200))).toMatchObject({ error: expect.stringMatching(/no es una imagen válida/) })
    expect(procesarFirmaPng('')).toMatchObject({ error: expect.stringMatching(/Falta la firma/) })
  })
})

describe('vencimiento con solo mes y año (F1)', () => {
  it('el día por defecto nace en «primero»; el parámetro se normaliza', () => {
    expect(DIA_POR_DEFECTO_INICIAL).toBe('primero')
    expect(diaPorDefectoDe(' ULTIMO ')).toBe('ultimo')
    expect(diaPorDefectoDe('cualquier cosa')).toBe('primero')
    expect(diaPorDefectoDe(undefined)).toBe('primero')
  })
  it('el lote muestra «MM/AAAA (solo mes y año)» solo si se escribió mes y año', () => {
    expect(esSoloMesAnio('06/2028')).toBe(true)
    expect(esSoloMesAnio('2028-06')).toBe(true)
    expect(esSoloMesAnio('30/06/2028')).toBe(false)
    expect(textoVencimiento('2028-06-01', '06/2028')).toBe('06/2028 (solo mes y año)')
    expect(textoVencimiento('2028-06-30', undefined)).toBe('30 jun 2028')
    expect(textoVencimiento(undefined)).toBe('—')
  })
  it('corregir la fecha pide fecha y motivo', () => {
    expect(validarCorreccionVencimiento('', ' ')).toMatchObject({ ok: false, errores: { fecha: expect.any(String), motivo: expect.any(String) } })
    expect(validarCorreccionVencimiento('30/06/2028', 'El envase dice 30')).toEqual({ ok: true })
  })
})

describe('vida útil al recibir (F2)', () => {
  it('cuenta meses completos como age() de Postgres', () => {
    expect(mesesDeVidaRestante('2028-11-04', '2026-11-04')).toBe(24)
    expect(mesesDeVidaRestante('2028-11-03', '2026-11-04')).toBe(23)
    expect(mesesDeVidaRestante('2028-12-01', '2026-11-04')).toBe(24)
    expect(mesesDeVidaRestante('2027-01-15', '2026-11-04')).toBe(2)
  })
  it('menos de 24 meses → alerta; 24 o más → nada; el mínimo se puede cambiar; vencido avisa distinto', () => {
    const base = { lote: 'L1', hoy: '2026-11-04' }
    expect(avisosDeVencimiento({ ...base, vence: '2028-11-03' })).toEqual([expect.objectContaining({ tipo: 'VIDA_UTIL_CORTA', texto: expect.stringMatching(/le quedan 23 meses.*24 mínimos/) })])
    expect(avisosDeVencimiento({ ...base, vence: '2028-11-04' })).toEqual([])
    expect(avisosDeVencimiento({ ...base, vence: '2028-11-04', minimoMeses: 30 })).toHaveLength(1)
    expect(avisosDeVencimiento({ ...base, vence: '2026-10-01' })[0].texto).toMatch(/llega vencido/)
  })
  it('el proveedor «solo mes y año» pide verificar la fecha en el envase', () => {
    const a = avisosDeVencimiento({ lote: 'DP1', vence: '2031-01-01', hoy: '2026-11-04', proveedorSoloMesAnio: true, proveedorNombre: 'Daré Pharma' })
    expect(a).toEqual([expect.objectContaining({ tipo: 'VENCIMIENTO_VERIFICAR', texto: expect.stringMatching(/Daré Pharma solo imprime mes y año.*lote DP1/) })])
  })
  it('el parámetro son meses enteros de 1 a 120', () => {
    expect(validarVidaUtilMinima('24')).toBeNull()
    for (const malo of ['0', '121', 'abc', '2.5', '']) expect(validarVidaUtilMinima(malo)).toMatch(/1 a 120/)
  })
})

describe('formato organoléptico versionado y «sin material de envase» (F3)', () => {
  it('el material del envase solo se oculta con la versión 2 y un producto marcado', () => {
    expect(ocultaMaterialEnvase(1, true)).toBe(false)
    expect(ocultaMaterialEnvase(2, false)).toBe(false)
    expect(ocultaMaterialEnvase(2, true)).toBe(true)
  })
  it('rige la versión aprobada más alta; la pendiente no cuenta', () => {
    expect(versionVigente([{ version: 1, estado: 'APROBADA' }, { version: 2, estado: 'PENDIENTE' }])).toBe(1)
    expect(versionVigente([{ version: 1, estado: 'APROBADA' }, { version: 2, estado: 'APROBADA' }])).toBe(2)
  })
  it('sin material de envase, el checklist no lo pide', () => {
    const c: Record<string, 'C'> = {}
    for (const g of CHECKLIST_ORGANOLEPTICO) if (!g.opcional) for (const i of g.items) c[i.id] = 'C'
    expect(itemsPendientes(c)).toEqual(['material'])
    expect(itemsPendientes(c, true)).toEqual([])
    const d = { certAnalisis: true, checklist: c, destinoSugerido: 'APROBADO' as const, conclusion: 'CONFORME' as const }
    expect(faltantesParaEnviar(d)).toHaveLength(1)
    expect(faltantesParaEnviar(d, true)).toEqual([])
  })
})

describe('menú', () => {
  it('«Proveedores» lo ven Dirección Técnica, su asistente, el Administrador y el Jefe de Almacén; el auxiliar no', () => {
    const ve = (rol: string) => construirMenu([rol as never]).flatMap((s) => s.items).some((i) => i.href === '/proveedores')
    expect(['direccion_tecnica', 'asistente_dt', 'admin_wms', 'jefe_almacen'].map(ve)).toEqual([true, true, true, true])
    expect(ve('auxiliar')).toBe(false)
  })
})
