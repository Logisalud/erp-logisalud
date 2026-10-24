// Órdenes de ejemplo de la demostración (SA-1): al abrir Salidas (o cualquier pantalla de despacho) la demo ya trae una orden en cada etapa y de cada tipo, para recorrer
// todos los flujos sin generarlos uno por uno. NO inventa estados: llama a las mismas acciones que usan las pantallas (asignar, designar picker, picking, conformidad, guía con el
// simulador, COA, embalaje, ruta, carga, liberar y confirmar salida, cancelar). Qué se siembra lo dice la lista declarativa `EJEMPLOS_SALIDA` (domain/ejemplos.ts).
import { EJEMPLOS_SALIDA, type EjemploSalida } from '@/domain/ejemplos'
import { validarPedidos, type PedidoSnapshot } from '@/domain/pedidos-despacho'
import { construirConsulta, construirPayloadNubefact, faltantesDeGuia } from '@/domain/guia-electronica'
import { loteApto } from '@/domain/salidas'
import type { EntradaOrdenManual, LineaOrdenManual } from '@/domain/salida-manual'
import { modoEjemplos } from '@/lib/demo'
import { SimuladorNubefact, reiniciarSimuladorNubefact } from '../nubefact/simulador'
import { NotificadorDemo } from '../pedidos/notificar'
import { aplicar } from './pedidos-demo'
import { estadoE, conIdsDeterministas } from './entradas-demo'
import { desp, duenoDelAlmacen, lotesDisponibles, type SalidaDemo } from './despacho-demo'
import { sembrarInventario } from './inventario-demo'
import type { EstadoDemo } from './estado'
import { SalidaManualDemo } from './salida-manual-demo'
import type { Actor } from '../repositorio'

const actor = (clave: string, ...roles: Actor['roles']): Actor => ({ id: `demo:${clave}`, nombre: `${clave} (demo)`, roles })
const JT = actor('jefe_transporte', 'jefe_transporte', 'jefe_almacen')
const DT = actor('direccion_tecnica', 'direccion_tecnica')
const AUX = actor('auxiliar', 'auxiliar')
const CONFORMIDAD = actor('asistente_dt', 'asistente_dt', 'conformidad_despacho')
const JA = actor('jefe_almacen', 'jefe_almacen', 'jefe_transporte')
const MUESTRAS = actor('autoriza_salidas_sin_venta', 'autoriza_salidas_sin_venta')
const CHECKLIST = [{ item: 'Vehículo limpio', ok: true, nota: '' }, { item: 'Termómetro', ok: true, nota: '' }]

/** Los ids de las órdenes de ejemplo no chocan con los de la siembra inicial (que empiezan en 1). */
const BASE_IDS = 500_000

let enBase = false
class Falla extends Error {}
const exigir = <T extends { ok: boolean }>(r: T, donde: string): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Falla(`Ejemplo «${donde}»: ${(r as unknown as { mensaje?: string }).mensaje ?? 'falló'}`)
  return r as Extract<T, { ok: true }>
}

const sumarDias = (fecha: string, n: number) => new Date(Date.parse(`${fecha}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** Una ruta por ejemplo que llega a carga (cada una lleva solo su pedido): fecha, vehículo y personal distintos para no chocar con la ruta de siempre ni entre sí. */
const RUTAS: Record<string, { dias: number; vehiculoId: string; conductorId: string; auxiliarId: string }> = {
  'a-guia': { dias: 2, vehiculoId: 'veh-5', conductorId: 'per-6', auxiliarId: 'per-3' },
  'a-lista-carga': { dias: 3, vehiculoId: 'veh-1', conductorId: 'per-1', auxiliarId: 'per-3' },
  'a-confirmada': { dias: 0, vehiculoId: 'veh-2', conductorId: 'per-2', auxiliarId: 'per-4' },
  'a-manual-lista-carga': { dias: 4, vehiculoId: 'veh-1', conductorId: 'per-1', auxiliarId: 'per-3' },
  'c-muestra-lista-carga': { dias: 5, vehiculoId: 'veh-1', conductorId: 'per-1', auxiliarId: 'per-3' },
  'a-manual-confirmada': { dias: 1, vehiculoId: 'veh-2', conductorId: 'per-2', auxiliarId: 'per-4' },
  'c-proveedor-confirmada': { dias: 2, vehiculoId: 'veh-2', conductorId: 'per-2', auxiliarId: 'per-4' },
}

/** Cada orden por cuenta de un cliente trae su propia GRE (el mismo número no se repite entre órdenes). */
const GRE_DE: Record<string, string> = { 'b-asignada': 'EG01-00000200', 'b-conforme': 'EG01-00000201', 'b-embalada': 'EG01-00000202', 'b-entregada': 'EG01-00000203' }

const CLIENTES: Record<string, { ruc: string; direccion: string; distrito: string; ubigeo: string }> = {
  lima: { ruc: '20100000011', direccion: 'Av. de Ejemplo 100, Lima', distrito: 'Lima', ubigeo: '150101' },
  provincia: { ruc: '20100000029', direccion: 'Jr. de Ejemplo 200, Huancayo', distrito: 'Huancayo', ubigeo: '120101' },
}

/** Lo que el ejemplo necesita saber del stock: dos productos distintos con stock sobrado por ejemplo, tomados del catálogo en orden fijo (determinista). */
interface ProductoStock { id: string; codigo: string; descripcion: string; total: number }

function productosConStock(e: EstadoDemo, propietarioId: string, minimo: number): ProductoStock[] {
  const out: ProductoStock[] = []
  for (const p of e.panorama.productos) {
    if (p.estado !== 'activo') continue
    const total = lotesDisponibles(e, p.id, propietarioId).filter((l) => !l.bloqueado && loteApto(l.vence, 'DISTRIBUCION', 'VENTA', e.panorama.hoy).apto).reduce((t, l) => t + l.disponible, 0)
    if (total >= minimo) out.push({ id: p.id, codigo: p.codigo, descripcion: p.descripcion, total })
  }
  // los del final del catálogo primero: los pedidos de siempre (101…104) usan los primeros y así no compiten por el mismo stock
  return out.sort((a, b) => b.codigo.localeCompare(a.codigo, 'es', { numeric: true }))
}

export class EjemplosDemo extends SalidaManualDemo {
  /** Las órdenes de ejemplo se siembran una sola vez, después del despacho de siempre. Con `WMS_DEMO_EJEMPLOS=0` (o `vacio`) no se siembra nada. */
  protected override async sembrarDespacho(e: EstadoDemo) {
    // la ruta de siempre (PED-DEMO-101) se arma dentro de `super` y vuelve a pasar por aquí: los ejemplos esperan a que termine para conservar su numeración
    if (enBase) return super.sembrarDespacho(e)
    enBase = true
    try { await super.sembrarDespacho(e) } finally { enBase = false }
    if (e.ejemplosSembrados) return
    e.ejemplosSembrados = true
    if (modoEjemplos() !== 'si') return
    sembrarInventario(e)
    // el simulador de Nubefact guarda sus guías aparte del estado de la demo: arranca limpio junto con él (si no, el correlativo de la demo chocaría con guías ya emitidas)
    reiniciarSimuladorNubefact()
    try {
      await conIdsDeterministas(BASE_IDS, () => this.sembrarEjemplos(e))
    } catch (err) {
      // una siembra rota no debe tumbar las pantallas: se avisa en el log del servidor y la demo sigue con lo que alcanzó a sembrar
      console.error('[demo] no se pudieron sembrar todas las órdenes de ejemplo:', err instanceof Error ? err.message : err)
    }
  }

  /** El punto único de siembra: recorre la lista declarativa en orden. */
  protected async sembrarEjemplos(e: EstadoDemo) {
    const dueno = duenoDelAlmacen(e)
    const pool = productosConStock(e, dueno, 60)
    // Los clientes de ejemplo piden solo el COA de cada lote (así el paquete documental se completa cargando los COA, como en el cliente de siempre «Solo COA por lote»)
    for (const c of Object.values(CLIENTES)) exigir(await this.guardarPerfilDocumental({ ruc: c.ruc, exigeCoa: true, exigeRegistroSanitario: false, exigeBpm: false, copias: 1, nota: 'Cliente de ejemplo: solo COA por lote' }, DT), 'perfiles')
    const pedidosA = EJEMPLOS_SALIDA.filter((x) => x.clase === 'A_BANDEJA')
    await this.ej_traerPedidosDeEjemplo(e, pedidosA, pool)
    for (const [i, ej] of EJEMPLOS_SALIDA.entries()) {
      const antes = new Set(desp(e).salidas.map((s) => s.id))
      const salida = await this.ej_sembrarUno(e, ej, i, pool)
      for (const s of desp(e).salidas) if (!antes.has(s.id)) s.ejemplo = true
      void salida
    }
  }

  // ── Los pedidos de la bandeja ───────────────────────────────────────────────────────────────────────────────

  /** Productos de un ejemplo A: dos del pool (cada ejemplo usa los suyos). Cantidades chicas frente al stock. */
  private ej_lineasDePedido(ej: EjemploSalida, indice: number, pool: ProductoStock[]): { producto: ProductoStock; cantidad: number }[] {
    const n = Math.max(1, pool.length)
    const a = pool[(indice * 2) % n]; const b = pool[(indice * 2 + 1) % n]
    if (ej.hasta === 'SIN_STOCK') return [{ producto: a, cantidad: 6 }, { producto: b, cantidad: b.total + 5_000 }]
    return [{ producto: a, cantidad: 8 }, { producto: b, cantidad: 4 }]
  }

  private async ej_traerPedidosDeEjemplo(e: EstadoDemo, lista: readonly EjemploSalida[], pool: ProductoStock[]) {
    if (pool.length < 2) throw new Falla('no hay productos con stock para armar los pedidos de ejemplo')
    const crudos = lista.map((ej, i) => {
      const numero = ej.pedido!
      const c = CLIENTES[ej.provincia ? 'provincia' : 'lima']
      return {
        pedidoId: `ped-demo-${numero.slice(-3)}`, numero, version: 1, estado: 'READY_FOR_OPERATIONS', fecha: e.panorama.hoy, modificadoEn: `${e.panorama.hoy}T08:00:00Z`,
        cliente: { id: `cli-ej-${numero.slice(-3)}`, nombre: ej.cliente, ruc: c.ruc, direccion: c.direccion, distrito: c.distrito, ubigeo: c.ubigeo, ventanaCita: 'L-V 8:00-12:00' },
        vendedor: 'Rosa Paredes', condicionPago: 'Contado',
        lineas: this.ej_lineasDePedido(ej, i, pool).map((l, k) => ({ lineaId: `l-${k + 1}`, productoCodigo: l.producto.codigo, descripcion: l.producto.descripcion, cantidad: l.cantidad })),
      }
    })
    const v = validarPedidos(crudos)
    const ayer = new Date(Date.parse(`${e.panorama.hoy}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
    aplicar(e, v.pedidos as PedidoSnapshot[], `${ayer}T15:30:00Z`)
  }

  // ── Una orden ─────────────────────────────────────────────────────────────────────────────────────────────────

  private ej_salidaDe(e: EstadoDemo, numero: string): SalidaDemo {
    const s = desp(e).salidas.find((x) => x.pedidoNumero === numero && x.estado !== 'CANCELADA') ?? desp(e).salidas.find((x) => x.pedidoNumero === numero)
    if (!s) throw new Falla(`No se encontró la orden de ${numero}`)
    return s
  }

  private async ej_sembrarUno(e: EstadoDemo, ej: EjemploSalida, indice: number, pool: ProductoStock[]): Promise<SalidaDemo | undefined> {
    switch (ej.clase) {
      case 'A_BANDEJA': return this.ej_sembrarDeBandeja(e, ej)
      case 'A_MANUAL': return this.ej_sembrarManualA(e, ej, indice, pool)
      case 'B': return this.ej_sembrarPorCliente(e, ej)
      case 'C_MUESTRA': case 'C_PROVEEDOR': return this.ej_sembrarSinVenta(e, ej)
    }
  }

  private async ej_sembrarDeBandeja(e: EstadoDemo, ej: EjemploSalida): Promise<SalidaDemo> {
    const pedidoId = `ped-demo-${ej.pedido!.slice(-3)}`
    const creada = exigir(await this.crearOrdenDePedido(pedidoId, JT), ej.clave)
    const salida = desp(e).salidas.find((s) => s.id === creada.id)!
    if (ej.hasta === 'ASIGNADA' || ej.hasta === 'SIN_STOCK') return salida
    if (ej.hasta === 'CANCELADA') { exigir(await this.cancelarOrden(salida.id, 'Ejemplo: el vendedor se equivocó de cliente y pidió cancelarla', JT), ej.clave); return salida }
    if (ej.hasta === 'PEDIDO_CANCELADO') { exigir(await this.simularCambioEnPedidos(pedidoId, 'CANCELAR', JT), ej.clave); return salida }
    await this.ej_avanzar(e, ej, salida)
    return salida
  }

  /** Lleva una orden con stock asignado hasta donde dice `hasta` (picking, conformidad, guía, embalaje, carga, salida). Las mismas acciones de las pantallas. */
  private async ej_avanzar(e: EstadoDemo, ej: EjemploSalida, salida: SalidaDemo) {
    if (ej.hasta === 'ASIGNADA') return
    const g = exigir(await this.generarOrdenPicking(salida.id, JT, AUX.id), ej.clave)
    let orden = (await this.obtenerOrdenPicking(g.id))!
    if (ej.hasta === 'EN_PICKING') {
      exigir(await this.registrarPicking(orden.lineasDetalle[0].id, 'PICKEADA', undefined, AUX), ej.clave)
      return
    }
    for (const l of orden.lineasDetalle) exigir(await this.registrarPicking(l.id, 'PICKEADA', undefined, AUX), ej.clave)
    if (ej.hasta === 'PENDIENTE_CONFORMIDAD') return
    if (ej.hasta === 'CAMBIO_CON_PICKING') { exigir(await this.simularCambioEnPedidos(`ped-demo-${ej.pedido!.slice(-3)}`, 'REDUCIR', JT), ej.clave); return }
    exigir(await this.conformarOrden(orden.id, [], 2, undefined, CONFORMIDAD), ej.clave)
    // por cuenta de un cliente (B): no hay guía del WMS ni ruta; se registra la GRE que trajo el cliente
    if (salida.tipo === 'CLIENTE') { await this.ej_cierreB(salida, ej); return }
    if (ej.hasta === 'CONFORME') return
    if (ej.hasta === 'EMBALADA') { await this.ej_embalar(salida, ej); return }
    // desde aquí hace falta una ruta (la guía la toma de la ruta: vehículo y conductor)
    const rutaId = await this.ej_armarRuta(e, ej, salida)
    await this.ej_emitirGuia(e, salida, ej)
    await this.ej_cargarCoa(salida, ej)
    if (ej.hasta === 'GUIA_EMITIDA') return
    await this.ej_embalar(salida, ej)
    if (ej.hasta === 'LISTA_PARA_CARGA') return
    const carga = (await this.cargaRuta(rutaId))!
    exigir(await this.guardarChecklist(rutaId, CHECKLIST, AUX), ej.clave)
    for (const b of carga.pedidosDetalle.flatMap((p) => p.bultos)) exigir(await this.cargarBulto(rutaId, b.codigo, AUX), ej.clave)
    exigir(await this.liberarUnidad(rutaId, JT), ej.clave)
    exigir(await this.confirmarSalidaRuta(rutaId, JT), ej.clave)
    void orden
  }

  /** B: GRE del cliente registrada → COA → embalaje → entrega al transportista del cliente. */
  private async ej_cierreB(salida: SalidaDemo, ej: EjemploSalida) {
    exigir(await this.registrarGre(salida.id, salida.greNumero!, 'Ejemplo: GRE del cliente', JT, salida.greArchivo), ej.clave)
    if (ej.hasta === 'CONFORME') return
    // el cliente de almacenamiento pide solo el COA de cada lote (como los clientes de ejemplo de distribución)
    const ruc = estadoE().panorama.propietarios.find((p) => p.id === salida.propietarioId)?.ruc
    if (ruc) exigir(await this.guardarPerfilDocumental({ ruc, exigeCoa: true, exigeRegistroSanitario: false, exigeBpm: false, copias: 1, nota: 'Cliente de ejemplo: solo COA por lote' }, DT), ej.clave)
    await this.ej_cargarCoa(salida, ej)
    await this.ej_embalar(salida, ej)
    if (ej.hasta === 'LISTA_PARA_CARGA') return
    exigir(await this.registrarEntregaTransportistaCliente({
      salidaId: salida.id, transportista: 'Transportes Ejemplo del Cliente SAC', placa: 'ABC123', hora: new Date().toISOString(), entregaAlmacen: 'Jefe de Almacén (demo)', nota: 'Ejemplo: entrega con la GRE del cliente',
    }, JA), ej.clave)
  }

  private async ej_armarRuta(e: EstadoDemo, ej: EjemploSalida, salida: SalidaDemo): Promise<string> {
    const r = RUTAS[ej.clave]
    const fecha = sumarDias(e.panorama.hoy, r.dias)
    const c = exigir(await this.crearRuta({ fecha, vehiculoId: r.vehiculoId, conductorId: r.conductorId, auxiliarId: r.auxiliarId }, JT), ej.clave)
    exigir(await this.planificarRuta(c.id, { fecha, vehiculoId: r.vehiculoId, conductorId: r.conductorId, auxiliarId: r.auxiliarId, paradas: [salida.origen === 'MANUAL' ? { salidaId: salida.id } : { pedidoId: salida.pedidoId }] }, JT), ej.clave)
    exigir(await this.confirmarRuta(c.id, JT), ej.clave)
    return c.id
  }

  private async ej_emitirGuia(e: EstadoDemo, salida: SalidaDemo, ej: EjemploSalida) {
    const datos = (await this.datosGuia(salida.id))!
    const traslado = { fechaInicio: e.panorama.hoy, pesoKg: 12 }
    const faltan = faltantesDeGuia(datos, traslado, 'SIMULADOR')
    if (faltan.length) throw new Falla(`Ejemplo «${ej.clave}»: a la guía le falta ${faltan.join('; ')}`)
    const n = exigir(await this.siguienteNumeroGuia(datos.serie), ej.clave)
    const payload = construirPayloadNubefact(datos, traslado, e.panorama.hoy, n.numero)
    const sim = SimuladorNubefact.compartido()
    const r = await sim.emitirGuia(payload)
    if (!r.ok) throw new Falla(`Ejemplo «${ej.clave}»: ${r.error}`)
    const reg = exigir(await this.registrarGuiaElectronica(salida.id, r, traslado, payload, JT), ej.clave)
    const c = await sim.consultarGuia(construirConsulta(datos.serie, n.numero))
    if (c.ok) exigir(await this.actualizarEstadoGuia(reg.id, c, JT), ej.clave)
    // «Pedidos» recibe el aviso de la guía emitida (en la demo, en memoria), como al emitirla desde la pantalla
    const notificador = new NotificadorDemo()
    for (const ev of await this.eventosPedidos({ salidaId: salida.id, soloPendientes: true })) {
      const env = await notificador.enviar(ev)
      await this.marcarEventoPedidos(ev.id, env.ok, env.ok ? undefined : env.mensaje, JT)
    }
  }

  /** Sube el COA de cada lote que lo necesita (por su id de lote: en la demo de Odoo un mismo código de lote puede repetirse entre productos). */
  private async ej_cargarCoa(salida: SalidaDemo, ej: EjemploSalida) {
    const pq = (await this.paqueteSalida(salida.id))!
    const hoy = estadoE().panorama.hoy
    for (const i of pq.items) {
      const falta = (tipo: string) => i.requisitos.some((r) => r.tipo === tipo && r.exigido && r.estado !== 'OK')
      if (falta('COA')) exigir(await this.subirDocumento({ tipo: 'COA', alcanceId: i.loteId, nombreArchivo: `COA_${i.lote}.pdf`, archivoRef: `demo/ejemplo-COA-${i.loteId}.pdf`, hash: `h-ejemplo-${i.loteId}`, bytes: 1000, vigenteDesde: sumarDias(hoy, -30) }, CONFORMIDAD), ej.clave)
      // un propietario sin RUC en los datos de prueba no tiene perfil: se le cumple también el registro sanitario del producto
      if (falta('REGISTRO_SANITARIO')) exigir(await this.subirDocumento({ tipo: 'REGISTRO_SANITARIO', alcanceId: i.productoId, nombreArchivo: `RS-${i.productoCodigo}.pdf`, archivoRef: `demo/ejemplo-RS-${i.productoId}.pdf`, hash: `h-ejemplo-rs-${i.productoId}`, bytes: 1000, vigenteDesde: sumarDias(hoy, -300), vigenteHasta: sumarDias(hoy, 400) }, DT), ej.clave)
    }
  }

  private async ej_embalar(salida: SalidaDemo, ej: EjemploSalida) {
    const emb = (await this.embalajeSalida(salida.id))!
    const [a, ...resto] = emb.porEmbalar
    if (!a) throw new Falla(`Ejemplo «${ej.clave}»: no hay nada por embalar`)
    // 2 bultos, como los que contó la conformidad: una unidad de la primera línea va sola en el segundo
    const primero = [{ lineaId: a.lineaId, loteId: a.loteId, cantidad: a.cantidad - 1 }, ...resto.map((x) => ({ lineaId: x.lineaId, loteId: x.loteId, cantidad: x.cantidad }))].filter((x) => x.cantidad > 0)
    exigir(await this.embalarSalida(salida.id, [{ contenido: primero }, { contenido: [{ lineaId: a.lineaId, loteId: a.loteId, cantidad: 1 }] }], AUX), ej.clave)
  }

  // ── Las manuales ──────────────────────────────────────────────────────────────────────────────────────────────

  private async ej_sembrarManualA(e: EstadoDemo, ej: EjemploSalida, indice: number, pool: ProductoStock[]): Promise<SalidaDemo> {
    const c = CLIENTES[ej.provincia ? 'provincia' : 'lima']
    const n = Math.max(1, pool.length)
    const lineas: LineaOrdenManual[] = [{ productoId: pool[(indice * 2) % n].id, cantidad: 8 }, { productoId: pool[(indice * 2 + 1) % n].id, cantidad: 4 }]
    const entrada: EntradaOrdenManual = {
      clase: 'A', pedidoNumero: ej.pedido, lineas, token: `ejemplo:${ej.clave}`,
      cliente: { ruc: c.ruc, razonSocial: ej.cliente, direccion: c.direccion, ubigeo: c.ubigeo, vendedor: 'Rosa Paredes' },
    }
    const r = exigir(await this.crearOrdenManual(entrada, JT), ej.clave)
    const salida = desp(e).salidas.find((s) => s.id === r.ordenes[0].id)!
    await this.ej_avanzar(e, ej, salida)
    return salida
  }

  /** B: el lote que indica el cliente en su guía; el stock es solo de ese propietario. */
  private async ej_sembrarPorCliente(e: EstadoDemo, ej: EjemploSalida): Promise<SalidaDemo> {
    // El cliente preferido del ejemplo; si en este juego de datos no tiene un lote apto, el primer cliente de almacenamiento que lo tenga
    const clientes = e.panorama.propietarios.filter((p) => !p.esDuenoAlmacen)
    const preferido = clientes.find((p) => p.razonSocial.toLowerCase().includes(ej.cliente.toLowerCase().split(' ')[0]))
    let prop = preferido; let hallado: { producto: string; lote: string } | undefined
    for (const c of [...(preferido ? [preferido] : []), ...clientes.filter((x) => x !== preferido)]) {
      try { hallado = await this.ej_loteParaCliente(e, c.id, 'VENTA', 10); prop = c; break } catch { /* el siguiente */ }
    }
    if (!prop || !hallado) throw new Falla(`Ejemplo «${ej.clave}»: ningún cliente de almacenamiento tiene un lote apto`)
    const { producto, lote } = hallado
    const entrada: EntradaOrdenManual = {
      clase: 'B', propietarioId: prop.id, greNumero: GRE_DE[ej.clave] ?? 'EG01-00000299', greArchivo: `demo/gre-ejemplo-${ej.clave}.pdf`,
      lineas: [{ productoId: producto, cantidad: 5, loteId: lote, motivo: 'VENTA' }], token: `ejemplo:${ej.clave}`,
    }
    const r = exigir(await this.crearOrdenManual(entrada, JT), ej.clave)
    const salida = desp(e).salidas.find((s) => s.id === r.ordenes[0].id)!
    await this.ej_avanzar(e, ej, salida)
    return salida
  }

  private async ej_sembrarSinVenta(e: EstadoDemo, ej: EjemploSalida): Promise<SalidaDemo> {
    const dueno = duenoDelAlmacen(e)
    let entrada: EntradaOrdenManual
    // desde SA-6 una salida sin venta dice a quién va (RUC, dirección y ubigeo): es el destinatario de su guía y de su parada en la ruta
    const c = CLIENTES[ej.provincia ? 'provincia' : 'lima']
    const cliente = { ruc: c.ruc, razonSocial: ej.cliente, direccion: c.direccion, ubigeo: c.ubigeo }
    if (ej.clase === 'C_MUESTRA') {
      const p = productosConStock(e, dueno, 60)
      const prod = p[p.length > 6 ? 6 : 0]
      entrada = { clase: 'C', motivo: 'MUESTRA', lineas: [{ productoId: prod.id, cantidad: 6 }], cliente, token: `ejemplo:${ej.clave}` }
    } else {
      const { producto, lote } = await this.ej_loteParaCliente(e, dueno, 'DEVOLUCION_PROVEEDOR', 10)
      entrada = { clase: 'C', motivo: 'DEVOLUCION_PROVEEDOR', lineas: [{ productoId: producto, cantidad: 4, loteId: lote }], cliente, token: `ejemplo:${ej.clave}` }
    }
    const r = exigir(await this.crearOrdenManual(entrada, ej.clase === 'C_MUESTRA' ? MUESTRAS : JT), ej.clave)
    const salida = desp(e).salidas.find((s) => s.id === r.ordenes[0].id)!
    await this.ej_avanzar(e, ej, salida)
    return salida
  }

  /** Un lote del propietario que cumple las reglas del motivo (vigente, Aprobado, sin Reserva) y con cantidad de sobra. El primero en orden fijo. */
  private async ej_loteParaCliente(e: EstadoDemo, propietarioId: string, motivo: 'VENTA' | 'DEVOLUCION_PROVEEDOR', minimo: number): Promise<{ producto: string; lote: string }> {
    const tipo = propietarioId === duenoDelAlmacen(e) ? 'PROVEEDOR' : 'CLIENTE'
    const productos = [...new Set(e.panorama.lotes.filter((l) => l.propietarioId === propietarioId).map((l) => l.productoId))].sort()
    for (const productoId of productos) {
      for (const l of await this.lotesParaSalida(propietarioId, productoId)) {
        if (l.enReserva || l.disponibleAprobado < minimo) continue
        if (!loteApto(l.vence, tipo, motivo, e.panorama.hoy).apto) continue
        return { producto: productoId, lote: l.loteId }
      }
    }
    throw new Falla(`no hay un lote apto de ${propietarioId} para el ejemplo (${motivo})`)
  }
}
