// SA-3 en la demostración: falta de stock (por qué falta, aviso para el vendedor, decide el vendedor), cambio y cancelación del pedido, devolución de lo picado.
import { beforeEach, describe, expect, it } from 'vitest'
import { avanceDeSalida } from '@/domain/pasos'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { actorDemo as actor, imprimirYConformar } from './ayudas-orden'

const JT = actor('jefe_transporte', 'jefe_transporte', 'jefe_almacen'); const AUX = actor('auxiliar', 'auxiliar'); const SANDRA = actor('asistente_dt', 'asistente_dt', 'conformidad_despacho')
const OTRO = actor('jefe_almacen', 'jefe_almacen', 'auxiliar')
const manana = () => new Date(Date.now() + 86_400_000 * 2).toISOString().slice(0, 10)

let repo: RepositorioDemo
beforeEach(() => {
  ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined
  repo = new RepositorioDemo()
})

const salidaDe = async (numero: string) => {
  const b = await repo.bandejaPedidos()
  const n = b.pedidos.find((p) => p.numero === numero)!.salida!
  return (await repo.listarSalidas()).find((s) => s.numero === n)!
}
async function planificar104() {
  await repo.actualizarBandeja(JT)
  const r = await repo.crearRuta({ fecha: manana() }, JT)
  if (!r.ok) throw new Error(r.mensaje)
  await repo.planificarRuta(r.id, { fecha: manana(), vehiculoId: 'veh-2', conductorId: 'per-2', paradas: [{ pedidoId: 'ped-demo-104', excepcionCorte: true, motivoExcepcion: 'Prueba' }] }, JT)
  return (await salidaDe('PED-DEMO-104')).id
}
const alertas = async (tipo: string) => (await repo.listarAlertas()).filter((a) => a.tipo === tipo)

describe('con falta de stock (demo)', () => {
  it('el aviso explica por qué falta, con cantidades; decide el vendedor del pedido y el Jefe de Transporte lo ve', async () => {
    const id = await planificar104()
    const v = (await repo.obtenerSalida(id))!
    expect(v.etapa).toBe('SIN_STOCK')
    expect(v.faltantes).toHaveLength(1)
    expect(v.faltantes![0].explicacion.texto).toMatch(/^Stock insuficiente: pide 250000 y hay \d+ disponibles\. Faltan \d+: .*sin stock\.$/)
    expect(v.vendedor).toBe('Vendedor demo')
    const a = (await alertas('STOCK_INSUFICIENTE'))[0]
    expect(a.mensaje).toContain(v.faltantes![0].explicacion.texto)
    expect(a.mensaje).toContain('Decide el vendedor del pedido, en Pedidos')
    const sig = avanceDeSalida(v.etapa, v.id, { vendedor: v.vendedor }).siguiente
    expect(sig.texto).toBe('el vendedor Vendedor demo decide con el cliente si se quita lo que falta o se cancela el pedido')
    const quiebres = await repo.listarQuiebresStock()
    expect(quiebres.every((q) => q.origen === 'DETECCION' && q.salidaNumero === v.numero && q.cantidadPedida === 250000)).toBe(true)
    expect(quiebres.reduce((t, q) => t + q.cantidadCausa, 0)).toBe(quiebres[0].cantidadFaltante)
  })

  it('«Copiar aviso para el vendedor»: el mensaje listo con pedido, cliente, qué falta, por qué y qué decidir, en la orden y en la bandeja', async () => {
    const id = await planificar104()
    const v = (await repo.obtenerSalida(id))!
    const ped = (await repo.bandejaPedidos()).pedidos.find((p) => p.numero === 'PED-DEMO-104')!
    expect(ped.avisoVendedor).toBe(v.avisoVendedor)
    expect(v.avisoVendedor).toMatch(/^Hola Vendedor demo, no podemos despachar completo el pedido PED-DEMO-104 de Botica Salud Total SAC: falta stock\./)
    expect(v.avisoVendedor).toMatch(/Faltan \d+: .*sin stock\./)
    expect(v.avisoVendedor).toContain('1) Quitar o reducir la línea: lo que falta se cancela y no queda pendiente.')
    expect(v.avisoVendedor).toContain('2) Cancelar el pedido.')
    expect(v.avisoVendedor).not.toMatch(/RUC|2051234567/)
    expect((await repo.bandejaPedidos()).pedidos.find((p) => p.numero === 'PED-DEMO-101')!.avisoVendedor).toBeUndefined()
  })

  it('el vendedor reduce la línea a lo que hay: la orden sigue su flujo, se avisa y queda el quiebre «línea reducida por el vendedor»', async () => {
    const id = await planificar104()
    const r = await repo.simularCambioEnPedidos('ped-demo-104', 'REDUCIR', JT)
    expect(r).toMatchObject({ ok: true })
    const v = (await repo.obtenerSalida(id))!
    expect(v.lineasDetalle[0]).toMatchObject({ estado: 'ASIGNADA' })
    expect(v.lineasDetalle[0].cantidad).toBeLessThan(250000)
    expect(v.faltantes).toEqual([])
    expect(v.etapa).toBe('ASIGNADA')
    const al = (await alertas('PEDIDO_CAMBIADO')).find((x) => x.mensaje.includes('PED-DEMO-104'))!
    expect(al.mensaje).toMatch(/se redujo .* de 250000 a \d+; se liberaron 0 unidades|se redujo .* de 250000 a \d+\. Ya no falta stock: la orden sigue su flujo\./)
    expect((await repo.listarQuiebresStock()).some((q) => q.causa === 'LINEA_REDUCIDA_POR_VENDEDOR' && q.origen === 'PEDIDOS' && q.vendedor === 'Vendedor demo')).toBe(true)
    expect((await repo.bandejaPedidos()).pedidos.find((p) => p.numero === 'PED-DEMO-104')).toMatchObject({ version: 2, estado: 'EN_SALIDA' })
  })

  it('el vendedor cancela el pedido con falta: la orden se cancela, queda «Cancelado en Pedidos» con su motivo y el quiebre «cancelado por el vendedor»', async () => {
    const id = await planificar104()
    await repo.simularCambioEnPedidos('ped-demo-104', 'CANCELAR', JT)
    expect((await repo.obtenerSalida(id))!).toMatchObject({ etapa: 'CANCELADA', estado: 'CANCELADA', pedidoCancelado: { motivo: expect.stringContaining('ya no lo necesita') } })
    expect((await repo.bandejaPedidos()).pedidos.find((p) => p.numero === 'PED-DEMO-104')).toMatchObject({ estado: 'CANCELADO_EN_PEDIDOS', motivoCancelacion: expect.stringContaining('ya no lo necesita') })
    expect((await repo.listarQuiebresStock()).some((q) => q.causa === 'CANCELADO_POR_VENDEDOR' && q.origen === 'PEDIDOS')).toBe(true)
    expect((await alertas('PEDIDO_CANCELADO'))[0].mensaje).toMatch(/^El pedido PED-DEMO-104 se canceló en Pedidos: .*Se canceló la orden y se liberaron 0 unidades\.$/)
  })
})

describe('el pedido cambia (sin picking)', () => {
  it('línea quitada: se cancela y libera sus reservas; la orden sigue', async () => {
    const s = await salidaDe('PED-DEMO-101')
    const antes = (await repo.obtenerSalida(s.id))!
    expect(antes.lineasDetalle).toHaveLength(2)
    expect(await repo.simularCambioEnPedidos('ped-demo-101', 'QUITAR', JT)).toMatchObject({ ok: true })
    const v = (await repo.obtenerSalida(s.id))!
    expect(v.lineasDetalle.map((l) => l.estado).sort()).toEqual(['ASIGNADA', 'CANCELADA'])
    expect(v.lineas).toBe(1)
    expect(v.unidades).toBe(6)
    expect(v.estado).toBe('ABIERTA')
    const al = (await alertas('PEDIDO_CAMBIADO')).find((x) => x.mensaje.startsWith('El pedido PED-DEMO-101 cambió'))!
    expect(al.mensaje).toMatch(/^El pedido PED-DEMO-101 cambió: se quitó .* \(\d+ u\.\); se liberaron 20 unidades\.$/)
  })

  it('cantidad reducida: libera lo sobrante; línea agregada: se agrega y se asigna', async () => {
    const s = await salidaDe('PED-DEMO-101')
    await repo.simularCambioEnPedidos('ped-demo-101', 'REDUCIR', JT)
    expect((await repo.obtenerSalida(s.id))!.lineasDetalle.map((l) => l.cantidad).sort((a, b) => a - b)).toEqual([6, 10])
    await repo.simularCambioEnPedidos('ped-demo-101', 'AGREGAR', JT)
    const v = (await repo.obtenerSalida(s.id))!
    expect(v.lineasDetalle).toHaveLength(3)
    expect(v.lineasDetalle.every((l) => l.estado === 'ASIGNADA')).toBe(true)
    expect(v.unidades).toBe(21)
  })

  it('pedido cancelado: la orden se cancela y libera todo; el pedido queda «Cancelado en Pedidos» con su motivo', async () => {
    const s = await salidaDe('PED-DEMO-101')
    await repo.simularCambioEnPedidos('ped-demo-101', 'CANCELAR', JT)
    const v = (await repo.obtenerSalida(s.id))!
    expect(v).toMatchObject({ estado: 'CANCELADA', etapa: 'CANCELADA' })
    expect(v.lineasDetalle.every((l) => l.estado === 'CANCELADA' && l.asignacion.length === 0)).toBe(true)
    expect((await repo.bandejaPedidos()).pedidos.find((p) => p.numero === 'PED-DEMO-101')).toMatchObject({ estado: 'CANCELADO_EN_PEDIDOS', canceladoPor: 'Vendedor demo' })
    expect(await repo.simularCambioEnPedidos('ped-demo-101', 'QUITAR', JT)).toMatchObject({ ok: false, mensaje: 'Pedidos ya canceló ese pedido' })
  })

  it('la factura es solo lectura: «Pendiente» hasta que Pedidos la envía; después, «Facturada» con su número', async () => {
    const s = await salidaDe('PED-DEMO-101')
    expect(await repo.obtenerSalida(s.id)).toMatchObject({ facturaEstado: 'PENDIENTE', factura: undefined })
    await repo.simularCambioEnPedidos('ped-demo-101', 'FACTURAR', JT)
    expect(await repo.obtenerSalida(s.id)).toMatchObject({ facturaEstado: 'FACTURADA', factura: 'F001-00045' })
  })

  it('solo el Jefe de Transporte y el Jefe de Almacén usan los controles; un auxiliar no', async () => {
    expect(await repo.simularCambioEnPedidos('ped-demo-101', 'QUITAR', AUX)).toMatchObject({ ok: false })
  })
})

describe('con el picking ya iniciado (demo): lo picado se devuelve con un movimiento verificado', () => {
  async function conforme() {
    const s = await salidaDe('PED-DEMO-101')
    await imprimirYConformar(repo, s.id, { jt: JT, picker: AUX, conforme: SANDRA })
    return s.id
  }

  it('línea quitada: queda «por devolver», la orden no sigue y se ve en «Dónde va y qué sigue»; el auxiliar devuelve y otra persona verifica', async () => {
    const id = await conforme()
    await repo.simularCambioEnPedidos('ped-demo-101', 'QUITAR', JT)
    const v = (await repo.obtenerSalida(id))!
    expect(v.etapa).toBe('POR_DEVOLVER_PICKING')
    expect(v.devoluciones).toMatchObject([{ estado: 'POR_DEVOLVER', estadoReserva: 'EN_STAGING', causa: 'CAMBIO_PEDIDO' }])
    expect(avanceDeSalida(v.etapa, id, { devolucion: 'POR_EJECUTAR' }).siguiente.texto).toBe('el auxiliar devuelve lo picado a su ubicación y otra persona lo verifica')
    expect(await repo.registrarGre(id, 'T001-00001', undefined, JT)).toMatchObject({ ok: false, mensaje: expect.stringContaining('por devolver a su ubicación') })
    expect(await repo.embalarSalida(id, [], AUX)).toMatchObject({ ok: false, mensaje: expect.stringContaining('por devolver') })
    expect(await repo.verificarDevolucionPicking(id, OTRO)).toMatchObject({ ok: false, mensaje: expect.stringContaining('Todavía no se devolvió nada') })
    const dev = await repo.ejecutarDevolucionPicking(id, AUX)
    expect(dev).toMatchObject({ ok: true, movimientoNumero: expect.stringMatching(/^MI-/) })
    expect((await repo.listarSalidas()).find((x) => x.id === id)).toMatchObject({ etapa: 'POR_DEVOLVER_PICKING', devolucion: 'POR_VERIFICAR' })
    expect(await repo.verificarDevolucionPicking(id, AUX)).toMatchObject({ ok: false, mensaje: expect.stringContaining('no puede ser quien devolvió') })
    const antes = (await repo.panorama()).saldos.reduce((t, x) => t + x.cantidad, 0)
    expect(await repo.verificarDevolucionPicking(id, OTRO)).toMatchObject({ ok: true })
    const p = await repo.panorama()
    expect(p.saldos.reduce((t, x) => t + x.cantidad, 0)).toBe(antes)
    const k1 = p.posiciones.find((x) => x.codigo === 'K-1')!
    expect(p.saldos.filter((x) => x.posicionId === k1.id).reduce((t, x) => t + x.cantidad, 0)).toBe(6) // quedó solo lo de la línea que sigue
    const final = (await repo.obtenerSalida(id))!
    expect(final.etapa).toBe('CONFORME')
    expect(final.lineasDetalle.map((l) => l.estado).sort()).toEqual(['CANCELADA', 'CONFORME'])
  })

  it('la verificación normal del movimiento (Movimientos internos) también completa la devolución', async () => {
    const id = await conforme()
    await repo.simularCambioEnPedidos('ped-demo-101', 'QUITAR', JT)
    const dev = await repo.ejecutarDevolucionPicking(id, AUX)
    if (!dev.ok || !dev.movimientoId) throw new Error('sin movimiento')
    expect(await repo.confirmarMovimiento(dev.movimientoId, OTRO)).toMatchObject({ ok: true })
    expect((await repo.obtenerSalida(id))!.devoluciones![0].estado).toBe('VERIFICADA')
  })

  it('si se anula el movimiento, vuelve a «por devolver»', async () => {
    const id = await conforme()
    await repo.simularCambioEnPedidos('ped-demo-101', 'QUITAR', JT)
    const dev = await repo.ejecutarDevolucionPicking(id, AUX)
    if (!dev.ok || !dev.movimientoId) throw new Error('sin movimiento')
    expect(await repo.anularMovimiento(dev.movimientoId, 'Me equivoqué', AUX)).toMatchObject({ ok: true })
    expect((await repo.obtenerSalida(id))!.devoluciones![0].estado).toBe('POR_DEVOLVER')
  })

  it('cantidad reducida por debajo de lo picado: solo lo que sobra se devuelve y el resto sigue', async () => {
    const id = await conforme()
    await repo.simularCambioEnPedidos('ped-demo-101', 'REDUCIR', JT)           // la línea de 20 baja a 10
    const v = (await repo.obtenerSalida(id))!
    expect(v.devoluciones).toMatchObject([{ cantidad: 10, estado: 'POR_DEVOLVER' }])
    expect(v.lineasDetalle.map((l) => l.cantidad).sort((a, b) => a - b)).toEqual([6, 10])
    await repo.ejecutarDevolucionPicking(id, AUX)
    await repo.verificarDevolucionPicking(id, OTRO)
    const p = await repo.panorama()
    expect(p.saldos.filter((x) => x.posicionId === p.posiciones.find((q) => q.codigo === 'K-1')!.id).reduce((t, x) => t + x.cantidad, 0)).toBe(16)
  })

  it('pedido cancelado: la orden NO se cierra hasta verificar la devolución; entonces se cancela y libera todo', async () => {
    const id = await conforme()
    await repo.simularCambioEnPedidos('ped-demo-101', 'CANCELAR', JT)
    expect(await repo.obtenerSalida(id)).toMatchObject({ estado: 'ABIERTA', etapa: 'POR_DEVOLVER_PICKING', cancelacionPendiente: true })
    expect((await alertas('PEDIDO_CANCELADO'))[0].mensaje).toMatch(/La orden se cancela cuando se devuelvan y verifiquen las 26 unidades ya picadas/)
    await repo.ejecutarDevolucionPicking(id, AUX)
    expect((await repo.obtenerSalida(id))!.estado).toBe('ABIERTA')
    await repo.verificarDevolucionPicking(id, OTRO)
    expect(await repo.obtenerSalida(id)).toMatchObject({ estado: 'CANCELADA', etapa: 'CANCELADA', cancelacionPendiente: false })
    const p = await repo.panorama()
    expect(p.saldos.filter((x) => x.posicionId === p.posiciones.find((q) => q.codigo === 'K-1')!.id).reduce((t, x) => t + x.cantidad, 0)).toBe(0)
  })

  it('picado por el celular, todavía en el rack: no mueve el libro pero también lo verifica otra persona', async () => {
    const s = await salidaDe('PED-DEMO-101')
    const g = await repo.generarOrdenPicking(s.id, JT, AUX.id)
    if (!g.ok) throw new Error(g.mensaje)
    const o = (await repo.obtenerOrdenPicking(g.id))!
    for (const l of o.lineasDetalle) await repo.registrarPicking(l.id, 'PICKEADA', undefined, AUX)
    await repo.simularCambioEnPedidos('ped-demo-101', 'CANCELAR', JT)
    expect((await repo.obtenerSalida(s.id))!.devoluciones!.every((d) => d.estadoReserva === 'EN_TRANSITO')).toBe(true)
    expect(await repo.ejecutarDevolucionPicking(s.id, AUX)).toMatchObject({ ok: true, movimientoId: undefined })
    expect(await repo.verificarDevolucionPicking(s.id, OTRO)).toMatchObject({ ok: true })
    expect((await repo.obtenerSalida(s.id))!.estado).toBe('CANCELADA')
  })
})
