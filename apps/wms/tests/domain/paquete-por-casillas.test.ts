import { describe, expect, it } from 'vitest'
import { pedidosParaPaquete, seleccionDePaquete, type PaqueteSalida } from '@/domain/documentacion'

const paquete = (id: string, exigidos: ('COA' | 'BPM')[], completo = true): PaqueteSalida => ({
  salidaId: id, salidaNumero: `SAL-${id}`, pedidoNumero: `PED-${id}`, cliente: `Cliente ${id}`, conforme: true, guiasAnuladas: [], completo, faltantes: [], copias: 1,
  items: [{ lineaId: 'l', productoId: 'p', productoCodigo: 'X', producto: 'X', loteId: 'lt', lote: 'L1', cantidad: 1,
    requisitos: (['COA', 'REGISTRO_SANITARIO', 'BPM'] as const).map((tipo) => ({ tipo, exigido: (exigidos as string[]).includes(tipo), estado: (exigidos as string[]).includes(tipo) ? 'OK' : 'NO_EXIGIDO' })) }],
})

describe('paquete documental por casillas', () => {
  it('viene marcado el pedido cuyo cliente pide documentos, y dice cuáles', () => {
    const [a, b] = pedidosParaPaquete([paquete('1', ['COA', 'BPM']), paquete('2', [])])
    expect(a).toMatchObject({ marcado: true, exige: 'COA, BPM' })
    expect(b).toMatchObject({ marcado: false, exige: '' })
  })
  it('la selección solo acepta pedidos de la ruta, sin repetir y en el orden de las paradas', () => {
    expect(seleccionDePaquete('3,1,1,x', ['1', '2', '3'])).toEqual(['1', '3'])
    expect(seleccionDePaquete('', ['1', '2'])).toEqual([])
    expect(seleccionDePaquete(null, ['1', '2'])).toBeNull()
  })
})
