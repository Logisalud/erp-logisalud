// Fase 4 · P9: reglas puras del seguimiento para el cliente.
import { describe, expect, it } from 'vitest'
import { ETIQUETA_HITO, ipDe, lineaDeTiempo, normalizarPedido, textoEspera, TEXTO_ENLACE_INVALIDO, TEXTO_NO_DISPONIBLE, TEXTO_NO_ENCONTRADO, validarConsulta } from '@/domain/seguimiento'

const h = (estado: Parameters<typeof lineaDeTiempo>[0][number]['estado'], en: string) => ({ estado, en })

describe('línea de tiempo', () => {
  it('muestra todos los pasos: los que ya ocurrieron con su hora y los demás pendientes; el último hecho es el actual', () => {
    const l = lineaDeTiempo([h('RECIBIDO', '2026-11-03T15:00:00Z'), h('EN_PREPARACION', '2026-11-04T14:00:00Z')])
    expect(l.map((p) => p.estado)).toEqual(['RECIBIDO', 'EN_PREPARACION', 'LISTO', 'EN_RUTA', 'ENTREGADO'])
    expect(l.map((p) => p.hecho)).toEqual([true, true, false, false, false])
    expect(l.find((p) => p.actual)!.estado).toBe('EN_PREPARACION')
    expect(l[2].en).toBeUndefined()
  })
  it('entregado cierra la línea; no entregado y cancelado reemplazan el último paso y se marcan como problema', () => {
    expect(lineaDeTiempo([h('RECIBIDO', 'a'), h('ENTREGADO', 'z')]).find((p) => p.actual)!.estado).toBe('ENTREGADO')
    const ne = lineaDeTiempo([h('RECIBIDO', 'a'), h('EN_RUTA', 'b'), h('NO_ENTREGADO', 'c')])
    expect(ne.map((p) => p.estado)).toEqual(['RECIBIDO', 'EN_PREPARACION', 'LISTO', 'EN_RUTA', 'NO_ENTREGADO'])
    expect(ne.at(-1)).toMatchObject({ hecho: true, actual: true, problema: true })
    expect(lineaDeTiempo([h('RECIBIDO', 'a'), h('CANCELADO', 'b')]).at(-1)).toMatchObject({ estado: 'CANCELADO', problema: true })
  })
  it('solo trae estados con fecha y hora: ninguna etiqueta habla de hora estimada, precios, lotes ni personal', () => {
    const todo = [...Object.values(ETIQUETA_HITO), TEXTO_NO_DISPONIBLE, TEXTO_NO_ENCONTRADO, TEXTO_ENLACE_INVALIDO, textoEspera(60)].join(' ').toLowerCase()
    for (const prohibida of ['estimad', 'precio', 'lote', 'conductor', 'chofer', 'auxiliar', 'placa']) expect(todo).not.toContain(prohibida)
  })
})

describe('lo que se escribe', () => {
  it('pide el número de pedido y un RUC de 11 números; normaliza mayúsculas y espacios', () => {
    expect(validarConsulta('', '')).toEqual({ pedido: 'Escribe el número de tu pedido.', ruc: 'El RUC tiene 11 números.' })
    expect(validarConsulta('PED-1', '123')).toEqual({ ruc: 'El RUC tiene 11 números.' })
    expect(validarConsulta(' ped-0123 ', '2051 2345 671')).toEqual({})
    expect(normalizarPedido(' ped 0123 ')).toBe('PED0123')
  })
  it('la espera se dice en minutos, en lenguaje llano', () => {
    expect(textoEspera(30)).toBe('Hiciste demasiados intentos. Por seguridad, espera 1 minuto y vuelve a intentar.')
    expect(textoEspera(14 * 60 + 5)).toContain('15 minutos')
  })
  it('la IP es la primera de x-forwarded-for', () => {
    expect(ipDe('1.2.3.4, 10.0.0.1')).toBe('1.2.3.4'); expect(ipDe(null, '9.9.9.9')).toBe('9.9.9.9'); expect(ipDe(undefined)).toBe('')
  })
})
