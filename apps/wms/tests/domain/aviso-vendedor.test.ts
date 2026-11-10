// SA-3: «Copiar aviso para el vendedor» — el mensaje listo para WhatsApp (D-126).
import { describe, expect, it } from 'vitest'
import { explicarFaltante, type ExistenciaLote, type FaltanteLineaVista } from '@/domain/faltante'
import { avisoParaVendedor, DECISIONES_FALTA_STOCK } from '@/domain/aviso-vendedor'

const lote = (cantidad: number, extra: Partial<ExistenciaLote> = {}): ExistenciaLote => ({ loteId: 'l', codigo: 'L1', vence: '2028-01-31', estado: 'APROBADO', cantidad, ...extra })
const linea = (producto: string, codigo: string, pedido: number, existencias: ExistenciaLote[]): FaltanteLineaVista => ({ lineaId: codigo, producto, productoCodigo: codigo, explicacion: explicarFaltante({ pedido, hoy: '2026-10-14', existencias }) })

describe('avisoParaVendedor', () => {
  const lineas = [
    linea('Paracetamol 500 mg', 'PARA-500', 100, [lote(40), lote(25, { loteId: 'c', estado: 'CUARENTENA' }), lote(10, { loteId: 'r', reservado: true })]),
    linea('Ibuprofeno 400 mg', 'IBU-400', 10, [lote(50)]), // esta sí alcanza: no se menciona
  ]
  const texto = avisoParaVendedor({ pedidoNumero: 'PED-0104', cliente: 'Botica Salud Total SAC', vendedor: 'Rosa', lineas })

  it('lleva pedido, cliente, qué falta, por qué con cantidades y qué debe decidir; solo las líneas con falta', () => {
    expect(texto).toBe([
      'Hola Rosa, no podemos despachar completo el pedido PED-0104 de Botica Salud Total SAC: falta stock.',
      '',
      '• Paracetamol 500 mg (PARA-500): pide 100 y hay 40 disponibles. Faltan 60: 25 en Cuarentena, 10 en Reserva y 25 sin stock.',
      '',
      'Habla con el cliente y decide en Pedidos una de dos cosas:',
      '1) Quitar o reducir la línea: lo que falta se cancela y no queda pendiente.',
      '2) Cancelar el pedido.',
      '',
      'Apenas cambies el pedido en Pedidos, la orden de salida se actualiza sola. Gracias. — Almacén LOGISALUD',
    ].join('\n'))
    expect(texto).not.toMatch(/IBU-400/)
  })

  it('solo las dos decisiones permitidas, y se toman en Pedidos', () => {
    expect(DECISIONES_FALTA_STOCK).toHaveLength(2)
    expect(texto).toMatch(/decide en Pedidos/)
  })

  it('sin datos de más: ni RUC, ni dirección, ni precios', () => {
    expect(texto).not.toMatch(/RUC|Av\.|S\/|precio|dirección/i)
  })

  it('sin nombre del vendedor, el saludo es genérico; sin faltante, no hay aviso', () => {
    expect(avisoParaVendedor({ pedidoNumero: 'P', cliente: 'C', lineas })).toMatch(/^Hola, no podemos/)
    expect(avisoParaVendedor({ pedidoNumero: 'P', cliente: 'C', lineas: [lineas[1]] })).toBe('')
  })
})
