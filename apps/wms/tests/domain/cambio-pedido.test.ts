// SA-3: qué cambió en el pedido, de dónde se libera y cómo se cuenta (D-127, D-128).
import { describe, expect, it } from 'vitest'
import { diferenciasDeLineas, repartirLiberacion, textoAlertaCambio, textoCambioLinea, type ReservaParaLiberar } from '@/domain/cambio-pedido'
import type { LineaPedido } from '@/domain/pedidos-despacho'

const l = (lineaId: string, descripcion: string, cantidad: number): LineaPedido => ({ lineaId, productoCodigo: lineaId.toUpperCase(), descripcion, cantidad })

describe('diferenciasDeLineas', () => {
  const v1 = [l('a', 'Paracetamol', 40), l('b', 'Ibuprofeno', 10), l('c', 'Omeprazol', 5), l('d', 'Lizinopril', 8)]
  it('línea quitada, reducida, aumentada y agregada, en ese orden; lo que no cambia no aparece', () => {
    const v2 = [l('a', 'Paracetamol', 25), l('b', 'Ibuprofeno', 10), l('d', 'Lizinopril', 12), l('e', 'Dapagliflozina', 3)]
    const r = diferenciasDeLineas(v1, v2)
    expect(r.map((x) => [x.tipo, x.lineaId, x.antes, x.despues])).toEqual([['QUITADA', 'c', 5, 0], ['REDUCIDA', 'a', 40, 25], ['AUMENTADA', 'd', 8, 12], ['AGREGADA', 'e', 0, 3]])
    expect(r.map(textoCambioLinea)).toEqual(['se quitó Omeprazol (5 u.)', 'se redujo Paracetamol de 40 a 25', 'se aumentó Lizinopril de 8 a 12', 'se agregó Dapagliflozina (3 u.)'])
  })
  it('sin cambios de líneas no hay diferencias', () => expect(diferenciasDeLineas(v1, [...v1])).toEqual([]))
})

describe('repartirLiberacion: de dónde sale lo que sobra', () => {
  const r = (id: string, vence: string | null, cantidad: number, estado: ReservaParaLiberar['estado'] = 'ACTIVA'): ReservaParaLiberar => ({ id, vence, cantidad, estado })
  it('se suelta primero lo que vence DESPUÉS (la asignación que queda sigue siendo FEFO) y se parte la última reserva si hace falta', () => {
    const p = repartirLiberacion([r('1', '2027-01-31', 10), r('2', '2027-06-30', 20)], 25)
    expect(p).toEqual([
      { reservaId: '2', cantidad: 20, accion: 'LIBERAR', completa: true },
      { reservaId: '1', cantidad: 5, accion: 'LIBERAR', completa: false },
    ])
  })
  it('lo que nadie picó se suelta antes que lo ya picado; lo ya picado exige devolución', () => {
    const p = repartirLiberacion([r('picada', '2027-06-30', 10, 'EN_TRANSITO'), r('rack', '2027-01-31', 10), r('despacho', '2027-12-31', 10, 'EN_STAGING')], 25)
    expect(p.map((x) => [x.reservaId, x.cantidad, x.accion])).toEqual([['rack', 10, 'LIBERAR'], ['picada', 10, 'DEVOLVER'], ['despacho', 5, 'DEVOLVER']])
  })
  it('una reducción que solo toca lo no picado no pide devolver nada', () => {
    expect(repartirLiberacion([r('1', '2027-01-31', 10), r('2', '2027-06-30', 10, 'EN_STAGING')], 4).every((x) => x.accion === 'LIBERAR')).toBe(true)
  })
  it('nada que liberar, o más de lo que hay: se suelta todo lo que hay', () => {
    expect(repartirLiberacion([r('1', null, 5)], 0)).toEqual([])
    expect(repartirLiberacion([r('1', null, 5)], 99)).toEqual([{ reservaId: '1', cantidad: 5, accion: 'LIBERAR', completa: true }])
  })
})

describe('textoAlertaCambio', () => {
  const base = { numeroPedido: 'PED-0104', liberadas: 0, porDevolver: 0, yaNoFalta: 0, conFalta: 0 }
  it('«El pedido PED-… cambió: se quitó X; se liberaron N unidades.»', () => {
    const cambios = diferenciasDeLineas([l('a', 'Paracetamol', 40)], [])
    expect(textoAlertaCambio({ ...base, cambios, liberadas: 40 })).toBe('El pedido PED-0104 cambió: se quitó Paracetamol (40 u.); se liberaron 40 unidades.')
  })
  it('si ya no falta stock, avisa que la orden sigue su flujo; si todavía falta, que decide el vendedor', () => {
    const cambios = diferenciasDeLineas([l('a', 'Paracetamol', 40)], [l('a', 'Paracetamol', 10)])
    expect(textoAlertaCambio({ ...base, cambios, liberadas: 0, yaNoFalta: 1 })).toMatch(/Ya no falta stock: la orden sigue su flujo\.$/)
    expect(textoAlertaCambio({ ...base, cambios, conFalta: 1 })).toMatch(/el vendedor decide en Pedidos\.$/)
  })
  it('con picking iniciado pide devolver lo picado y que otra persona lo verifique', () => {
    const cambios = diferenciasDeLineas([l('a', 'Paracetamol', 40)], [])
    expect(textoAlertaCambio({ ...base, cambios, liberadas: 10, porDevolver: 30 })).toMatch(/30 unidades ya picadas que se devuelven a su ubicación: otra persona lo verifica antes de seguir\./)
  })
  it('un pedido cancelado: libera todo; con picking iniciado, se cancela al verificar la devolución; si ya salió, se coordina el retorno', () => {
    const c = { ...base, cambios: [], cancelado: { motivo: 'El cliente ya no lo necesita', por: 'Rosa' } }
    expect(textoAlertaCambio({ ...c, liberadas: 50 })).toBe('El pedido PED-0104 se canceló en Pedidos: El cliente ya no lo necesita. Se canceló la orden y se liberaron 50 unidades.')
    expect(textoAlertaCambio({ ...c, liberadas: 20, porDevolver: 30 })).toMatch(/se cancela cuando se devuelvan y verifiquen las 30 unidades ya picadas; se liberaron 20 unidades/)
    expect(textoAlertaCambio({ ...c, yaSalio: true })).toMatch(/La orden ya salió: coordina el retorno/)
  })
})
