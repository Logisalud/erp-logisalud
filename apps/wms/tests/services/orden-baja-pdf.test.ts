// El PDF de la Orden de Baja lleva el código oficial LS-FR.56.01 y, bajo el V°/B°, el nombre de quien firma (Katia Zapata, DT 2026-10-23).
import { describe, expect, it } from 'vitest'
import { PARAMETROS_FORMATO_BAJA, contenidoDeOrden, type OrdenBajaVista } from '@/domain/bajas'
import { renderOrdenBaja } from '@/services/pdf/orden-baja'
import { textoDePdf } from '@/services/logger/leer-pdf'

const orden: OrdenBajaVista = {
  id: 'o1', numero: 'BJ-2026-00001', estado: 'EMITIDA', propietarioId: 'p', propietarioCodigo: 'LOGISSA', propietario: 'Logissa S.A.C.', solicitadaPor: 'Katia', solicitadaPorId: 'u1', solicitadaEn: '2026-10-23T10:00:00Z',
  lineas: [], unidades: 0,
}

describe('PDF de la Orden de Baja', () => {
  it('lleva el código oficial y el Visto Bueno con su nombre y cargo', async () => {
    const buf = await renderOrdenBaja(contenidoDeOrden(orden, '2026-10-23'), false, 'EMITIDA')
    expect(Buffer.from(buf).subarray(0, 5).toString()).toBe('%PDF-')
    const t = textoDePdf(Buffer.from(buf))
    expect(t).not.toBeNull()
    expect(t).toContain('Cód. Formato LS-FR.56.01')
    expect(t).toContain('V°/B°')
    expect(t).toMatch(/V°\/B° Katia Zapata Dirección Técnica/)
    expect(t).not.toContain('LS-POE.56.01')
  })

  it('con otro Visto Bueno en los parámetros, imprime ese', async () => {
    const buf = await renderOrdenBaja(contenidoDeOrden(orden, '2026-10-23', { ...PARAMETROS_FORMATO_BAJA, vistoBuenoNombre: 'Persona de Prueba' }), false, 'EMITIDA')
    expect(textoDePdf(Buffer.from(buf))).toContain('Persona de Prueba')
  })
})
