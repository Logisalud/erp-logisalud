// OS-5: retornos de una Orden de Salida como recepción tipo devolución.
import { describe, expect, it } from 'vitest'
import { AYUDA_REPROGRAMAR, puedeOriginarRetorno, retornable, siguienteTrasRetorno, validarRetorno, type LineaRetornable } from '@/domain/retornos'

const linea = (loteId: string, despachado: number, yaRetornado = 0): LineaRetornable => ({
  productoId: 'p1', productoCodigo: 'P-1', producto: 'Dapagliflozina 10 mg', loteId, lote: `L-${loteId}`, despachado, yaRetornado, retornable: retornable(despachado, yaRetornado),
})
const salida = { confirmada: true, numero: 'SAL-2026-00001', lineas: [linea('a', 20), linea('b', 10, 4)] }
const entrada = { salidaId: 's1', motivo: 'RECHAZADO_CLIENTE' as const, docOriginalTipo: 'FACTURA' as const, docOriginalNumero: 'F001-1', lineas: [{ loteId: 'a', cantidad: 5 }] }

describe('validarRetorno', () => {
  it('acepta un retorno con motivo, factura original y cantidades dentro de lo que salió', () => {
    expect(validarRetorno(entrada, salida)).toEqual({ ok: true, lineas: [{ loteId: 'a', cantidad: 5 }] })
    expect(validarRetorno({ ...entrada, lineas: [{ loteId: 'a', cantidad: '20' }, { loteId: 'b', cantidad: 6 }] }, salida)).toMatchObject({ ok: true })
  })
  it('una Orden de Salida que todavía no salió no tiene retorno', () => {
    const r = validarRetorno(entrada, { ...salida, confirmada: false })
    expect(r).toMatchObject({ ok: false }); if (!r.ok) expect(r.mensaje).toMatch(/todavía no salió/)
  })
  it('exige motivo y la factura o boleta original (como toda devolución)', () => {
    const r = validarRetorno({ ...entrada, motivo: '', docOriginalNumero: ' ' }, salida)
    expect(r.ok).toBe(false); if (!r.ok) expect(Object.keys(r.errores)).toEqual(expect.arrayContaining(['motivo', 'docOriginal']))
  })
  it('nunca vuelve más de lo que salió, y descuenta lo ya anunciado en otros retornos', () => {
    const r = validarRetorno({ ...entrada, lineas: [{ loteId: 'a', cantidad: 21 }] }, salida)
    expect(r.ok).toBe(false); if (!r.ok) expect(r.mensaje).toMatch(/solo puede volver 20: salieron 20/)
    const r2 = validarRetorno({ ...entrada, lineas: [{ loteId: 'b', cantidad: 7 }] }, salida)
    expect(r2.ok).toBe(false); if (!r2.ok) expect(r2.mensaje).toMatch(/solo puede volver 6: salieron 10 y ya se anunció el retorno de 4/)
    const lleno = validarRetorno({ ...entrada, lineas: [{ loteId: 'c', cantidad: 1 }] }, salida)
    expect(lleno.ok).toBe(false)
  })
  it('pide al menos una línea con unidades y números enteros', () => {
    expect(validarRetorno({ ...entrada, lineas: [{ loteId: 'a', cantidad: '' }, { loteId: 'b', cantidad: 0 }] }, salida)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/al menos un lote/) })
    expect(validarRetorno({ ...entrada, lineas: [{ loteId: 'a', cantidad: 2.5 }] }, salida)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/número entero/) })
    expect(validarRetorno({ ...entrada, lineas: [{ loteId: 'a', cantidad: -1 }] }, salida)).toMatchObject({ ok: false })
  })
})

describe('permiso y textos', () => {
  it('originan un retorno Sandra, Katia y los dos jefes; el auxiliar y la auditoría no', () => {
    for (const r of ['asistente_dt', 'direccion_tecnica', 'jefe_almacen', 'jefe_transporte'] as const) expect(puedeOriginarRetorno([r]), r).toBe(true)
    for (const r of ['auxiliar', 'auditoria_lectura', 'conformidad_despacho'] as const) expect(puedeOriginarRetorno([r]), r).toBe(false)
  })
  it('deja escrito que un pedido que se reprograma es una nueva Orden de Salida', () => {
    expect(AYUDA_REPROGRAMAR).toMatch(/nueva Orden de Salida/)
    expect(AYUDA_REPROGRAMAR).toMatch(/no se reabre/)
    expect(siguienteTrasRetorno(false)).toMatch(/autorizan/)
    expect(siguienteTrasRetorno(true)).toMatch(/devolución/)
  })
})
