// SA-2: quién crea cada tipo de orden manual, el número de pedido, el cliente de la venta manual y la validación inmediata de cada línea.
import { describe, expect, it } from 'vitest'
import {
  clasesQuePuede, etiquetasDeOrigen, motivoNoPuedeCrear, motivosDeCQuePuede, normalizarNumeroPedido, partirPorMotivo, tipoDeClase, validarClienteManual, validarLineaSalidaCliente,
  validarOrdenManual, type EntradaOrdenManual, type LoteParaSalida,
} from '@/domain/salida-manual'

const HOY = '2026-10-19'
const lote = (x: Partial<LoteParaSalida> = {}): LoteParaSalida => ({ loteId: 'l1', codigo: 'L-100', productoId: 'p1', propietarioId: 'diphasac', propietario: 'Diphasac', vence: '2027-12-31', disponibleAprobado: 50, enBajas: 0, enReserva: false, ...x })
const linea = (e: Partial<Parameters<typeof validarLineaSalidaCliente>[0]> = {}) => validarLineaSalidaCliente({
  tipo: 'CLIENTE', motivo: 'VENTA', propietarioId: 'diphasac', productoId: 'p1', loteCodigo: 'L-100', cantidad: 10, hoy: HOY, lotes: [lote()], ...e,
})

describe('quién crea cada tipo (cada rol ve solo lo que puede crear)', () => {
  it('A solo el Jefe de Transporte; B los dos jefes; C la muestra quien autoriza y la devolución los jefes', () => {
    expect(clasesQuePuede(['jefe_transporte'])).toEqual(['A', 'B', 'C'])
    expect(clasesQuePuede(['jefe_almacen'])).toEqual(['B', 'C'])
    expect(clasesQuePuede(['autoriza_salidas_sin_venta'])).toEqual(['C'])
    expect(clasesQuePuede(['auxiliar'])).toEqual([])
    expect(clasesQuePuede(['direccion_tecnica'])).toEqual([])
    expect(clasesQuePuede(['usuario_cliente'])).toEqual([])
  })
  it('los motivos de C que puede cada rol', () => {
    expect(motivosDeCQuePuede(['autoriza_salidas_sin_venta'])).toEqual(['MUESTRA'])
    expect(motivosDeCQuePuede(['jefe_almacen'])).toEqual(['DEVOLUCION_PROVEEDOR'])
    expect(motivosDeCQuePuede(['jefe_transporte', 'autoriza_salidas_sin_venta'])).toEqual(['MUESTRA', 'DEVOLUCION_PROVEEDOR'])
  })
  it('sin el rol, el mismo mensaje que la base', () => {
    expect(motivoNoPuedeCrear(['jefe_almacen'], 'A')).toBe('Solo el Jefe de Transporte crea una venta manual')
    expect(motivoNoPuedeCrear(['jefe_transporte'], 'A')).toBeNull()
    expect(motivoNoPuedeCrear(['jefe_transporte'], 'C', 'MUESTRA')).toBe('Solo quien autoriza salidas sin venta registra una muestra')
    expect(motivoNoPuedeCrear(['autoriza_salidas_sin_venta'], 'C', 'MUESTRA')).toBeNull()
    expect(motivoNoPuedeCrear(['autoriza_salidas_sin_venta'], 'C', 'DEVOLUCION_PROVEEDOR')).toBe('No tienes permiso para preparar salidas')
    expect(motivoNoPuedeCrear(['auxiliar'], 'B')).toBe('No tienes permiso para crear una salida por cuenta de un cliente')
  })
  it('el tipo de la base de datos que corresponde', () => {
    expect([tipoDeClase('A'), tipoDeClase('B'), tipoDeClase('C', 'MUESTRA'), tipoDeClase('C', 'DEVOLUCION_PROVEEDOR')]).toEqual(['DISTRIBUCION', 'CLIENTE', 'MUESTRA', 'PROVEEDOR'])
  })
})

describe('tipo A: número de pedido y cliente', () => {
  it('el número se compara sin espacios ni mayúsculas', () => {
    expect(normalizarNumeroPedido(' ped 0012 ')).toBe('PED0012')
    expect(normalizarNumeroPedido(undefined)).toBe('')
  })
  it('el número de pedido es obligatorio', () => {
    const e = validarOrdenManual({ clase: 'A', lineas: [{ productoId: 'p1', cantidad: 3 }], cliente: { ruc: '20123456789', razonSocial: 'Botica', direccion: 'Av. X 1', ubigeo: '150101' } })
    expect(e.pedidoNumero).toBe('El número de pedido es obligatorio: la orden queda ligada a ese pedido')
    expect(validarOrdenManual({ clase: 'A', pedidoNumero: 'PED-1', lineas: [{ productoId: 'p1', cantidad: 3 }], cliente: { ruc: '20123456789', razonSocial: 'Botica', direccion: 'Av. X 1', ubigeo: '150101' } })).toEqual({})
  })
  it('RUC de 11 números, razón social, dirección y ubigeo de 6 números', () => {
    expect(validarClienteManual({ ruc: '2012', razonSocial: '', direccion: ' ', ubigeo: '15' })).toEqual({
      ruc: 'El RUC tiene 11 números', razonSocial: 'Escribe la razón social del cliente', direccion: 'Escribe la dirección de entrega', ubigeo: 'El ubigeo tiene 6 números (el código del distrito de entrega)',
    })
    expect(validarClienteManual({ ruc: '20123456789', razonSocial: 'Botica Salud', direccion: 'Av. Lima 123', ubigeo: '150101' })).toEqual({})
  })
  it('un producto no se repite en la venta manual (se junta la cantidad)', () => {
    const e = validarOrdenManual({ clase: 'A', pedidoNumero: 'P1', lineas: [{ productoId: 'p1', cantidad: 3 }, { productoId: 'p1', cantidad: 2 }], cliente: { ruc: '20123456789', razonSocial: 'B', direccion: 'D', ubigeo: '150101' } })
    expect(e.lineas).toBe('Un producto aparece una sola vez: junta sus cantidades')
  })
})

describe('tipo B: validación inmediata de cada línea', () => {
  it('una línea buena valida y trae el vencimiento del lote', () => {
    const r = linea()
    expect(r).toMatchObject({ ok: true, vence: '2027-12-31' })
  })
  it('lote que no existe', () => expect(linea({ loteCodigo: 'ZZ-9' })).toEqual({ ok: false, campo: 'lote', mensaje: 'No encontramos el lote ZZ-9' }))
  it('lote de otro propietario rechazado', () => {
    expect(linea({ lotes: [lote({ propietarioId: 'triamed', propietario: 'Triamed' })] })).toEqual({ ok: false, campo: 'lote', mensaje: 'El lote L-100 no es de este propietario' })
  })
  it('lote de otro producto', () => expect(linea({ productoId: 'p2' })).toEqual({ ok: false, campo: 'lote', mensaje: 'El lote L-100 no corresponde al producto de la línea' }))
  it('lote insuficiente, contando lo que ya piden otras líneas', () => {
    expect(linea({ cantidad: 51 })).toEqual({ ok: false, campo: 'cantidad', mensaje: 'No hay en el lote L-100 con 51 unidades disponibles (hay 50)' })
    expect(linea({ cantidad: 10, yaPedidoDelLote: 45 })).toMatchObject({ ok: false, campo: 'cantidad', mensaje: expect.stringContaining('(hay 5)') })
  })
  it('lote vencido: solo sale a destrucción desde Bajas', () => {
    const v = lote({ vence: '2026-09-01' })
    expect(linea({ lotes: [v] })).toMatchObject({ ok: false, campo: 'lote', mensaje: expect.stringContaining('lo vencido solo va a Bajas') })
    expect(linea({ lotes: [v], motivo: 'PESQUISA_DIGEMID' })).toMatchObject({ ok: false, mensaje: expect.stringContaining('la pesquisa DIGEMID nunca es de lotes vencidos') })
  })
  it('lote en Reserva', () => expect(linea({ lotes: [lote({ enReserva: true })] })).toMatchObject({ ok: false, campo: 'lote', mensaje: 'El lote L-100 está en Reserva: no sale hasta que se quite la Reserva' }))
  it('destrucción: solo lo que ya está en Bajas', () => {
    expect(linea({ motivo: 'DESTRUCCION', cantidad: 5 })).toMatchObject({ ok: false, campo: 'cantidad', mensaje: expect.stringContaining('La destrucción sale solo desde Bajas: del lote L-100 hay 0 unidades en el área de Bajas y la línea pide 5') })
    expect(linea({ motivo: 'DESTRUCCION', cantidad: 5, lotes: [lote({ enBajas: 8, disponibleAprobado: 0, vence: '2026-09-01' })] })).toMatchObject({ ok: true })
    expect(linea({ motivo: 'DESTRUCCION', cantidad: 5, yaPedidoDelLote: 4, lotes: [lote({ enBajas: 8 })] })).toMatchObject({ ok: false, mensaje: expect.stringContaining('hay 4 unidades') })
  })
  it('la devolución al proveedor es de Logissa, no de un cliente', () => {
    expect(linea({ motivo: 'DEVOLUCION_PROVEEDOR' })).toMatchObject({ ok: false, campo: 'motivo', mensaje: expect.stringContaining('La devolución al proveedor es del stock de Logissa') })
  })
  it('devolución al proveedor (tipo C): solo antes del vencimiento', () => {
    const base = { tipo: 'PROVEEDOR' as const, motivo: 'DEVOLUCION_PROVEEDOR' as const, propietarioId: 'logissa' }
    expect(linea({ ...base, lotes: [lote({ propietarioId: 'logissa', vence: '2027-03-01' })] })).toMatchObject({ ok: true })
    expect(linea({ ...base, lotes: [lote({ propietarioId: 'logissa', vence: '2026-10-01' })] })).toMatchObject({ ok: false, mensaje: expect.stringContaining('no se devuelve vencido a nadie') })
  })
  it('sin lote, sin producto o con cantidad cero', () => {
    expect(linea({ loteCodigo: ' ' })).toMatchObject({ ok: false, campo: 'lote', mensaje: 'Indica el lote de cada línea' })
    expect(linea({ productoId: undefined })).toMatchObject({ ok: false, campo: 'producto' })
    expect(linea({ cantidad: 0 })).toMatchObject({ ok: false, campo: 'cantidad', mensaje: 'La cantidad de cada línea debe ser mayor que cero' })
  })
})

describe('la orden manual completa', () => {
  const B = (x: Partial<EntradaOrdenManual> = {}): EntradaOrdenManual => ({ clase: 'B', propietarioId: 'diphasac', greNumero: 'T001-00001234', greArchivo: 'gre-cliente/x.pdf', lineas: [{ productoId: 'p1', cantidad: 2, loteId: 'l1', motivo: 'VENTA' }], ...x })
  it('B pide propietario de almacenamiento, número de GRE con formato, PDF y el motivo y lote de cada línea', () => {
    expect(validarOrdenManual(B(), (id) => id !== 'logissa')).toEqual({})
    expect(validarOrdenManual(B({ propietarioId: 'logissa' }), (id) => id !== 'logissa').propietarioId).toMatch(/cliente de almacenamiento/)
    expect(validarOrdenManual(B({ greNumero: '123' })).greNumero).toBe('El número de la guía se escribe como T001-00001234 (serie, guion y número)')
    expect(validarOrdenManual(B({ greArchivo: undefined })).greArchivo).toBe('Adjunta el PDF de la guía de remisión del cliente')
    expect(validarOrdenManual(B({ lineas: [{ productoId: 'p1', cantidad: 2, loteId: 'l1' }] })).lineas).toBe('Elige el motivo de cada línea')
  })
  it('C: muestra o devolución; la devolución exige el lote', () => {
    expect(validarOrdenManual({ clase: 'C', lineas: [{ productoId: 'p1', cantidad: 1 }] }).motivo).toBeTruthy()
    const dest = { ruc: '20123456789', razonSocial: 'Clínica Destino', direccion: 'Av. Lima 123', ubigeo: '150101' }
    expect(validarOrdenManual({ clase: 'C', motivo: 'MUESTRA', cliente: dest, lineas: [{ productoId: 'p1', cantidad: 1 }] })).toEqual({})
    expect(validarOrdenManual({ clase: 'C', motivo: 'DEVOLUCION_PROVEEDOR', cliente: dest, lineas: [{ productoId: 'p1', cantidad: 1 }] }).lineas).toBe('Indica el lote de cada línea')
    // SA-6: el destinatario es obligatorio (a quién va la muestra o qué proveedor recibe la devolución)
    expect(validarOrdenManual({ clase: 'C', motivo: 'MUESTRA', lineas: [{ productoId: 'p1', cantidad: 1 }] })).toMatchObject({ razonSocial: 'Escribe a quién va la muestra', ruc: 'El RUC tiene 11 números', direccion: 'Escribe la dirección de entrega' })
    expect(validarOrdenManual({ clase: 'C', motivo: 'DEVOLUCION_PROVEEDOR', cliente: { ...dest, razonSocial: ' ', ubigeo: '12' }, lineas: [{ productoId: 'p1', cantidad: 1, loteId: 'l' }] })).toMatchObject({ razonSocial: 'Escribe el nombre del proveedor', ubigeo: 'El ubigeo tiene 6 números (el código del distrito de entrega)' })
  })
  it('una guía con motivos mezclados se parte en una orden por motivo', () => {
    const p = partirPorMotivo([{ productoId: 'a', cantidad: 1, motivo: 'VENTA' }, { productoId: 'b', cantidad: 1, motivo: 'DESTRUCCION' }, { productoId: 'c', cantidad: 1, motivo: 'VENTA' }])
    expect(p.map((x) => [x.motivo, x.lineas.length])).toEqual([['VENTA', 2], ['DESTRUCCION', 1]])
  })
  it('las etiquetas de origen de la lista', () => {
    expect(etiquetasDeOrigen({ origen: 'PEDIDO' })).toEqual([])
    expect(etiquetasDeOrigen({ origen: 'MANUAL', porConciliar: true }).map((x) => x.texto)).toEqual(['Manual', 'Por conciliar con Pedidos'])
    expect(etiquetasDeOrigen({ origen: 'MANUAL', creadaPor: 'Roberto', enNombreDe: 'Diphasac' }).map((x) => x.texto)).toEqual(['Manual', 'Creada por Roberto en nombre de Diphasac'])
  })
})
