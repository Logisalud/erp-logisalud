// Cómo iniciar una Orden de Salida (SA-2), en memoria (modo demostración): desde la bandeja, y a mano (tipos A, B y C). Aplica las mismas reglas que la migración 0028
// (`crear_orden_salida_manual`, `crear_orden_de_pedido`, `crear_ordenes_pendientes`) y dice lo mismo con las mismas palabras.
import { puedePrepararSalidas } from '@/domain/despacho'
import { reglasDeEdicion, validarCambiosOrden, type CambiosOrden } from '@/domain/editar-orden'
import { MENSAJE_SIN_PERMISO_ENTREGA, puedeEntregarAlTransportistaCliente, validarEntrega, type EntradaEntrega } from '@/domain/entrega-transportista'
import {
  ETIQUETA_CODIGO, buscarProductosPorCodigos, mensajeAvisoSinMotivo, motivoNoPuedeCrear, normalizarNumeroPedido, mensajePedidoConOrden, mensajePedidoEnBandeja, partirPorMotivo, tipoDeClase, validarLineaSalidaCliente, validarOrdenManual,
  type CodigoProducto, type EntradaOrdenManual, type LineaOrdenManual, type LoteParaSalida, type ProductoHallado,
} from '@/domain/salida-manual'
import { requiereEmbalaje } from '@/domain/pedidos-despacho'
import { embalajeActivoDemo } from './ajustes'
import { normalizar } from '@/domain/busqueda'
import { DIAS_AVISO_DEVOLUCION_DEFECTO, type MotivoSalida } from '@/domain/salidas'
import { registrar, type EstadoDemo } from './estado'
import { ahora, alertar, estadoE, falla, nuevoId } from './entradas-demo'
import { cancelarSalidaPorPedido, soltarLineaDemo } from './cambio-pedido-demo'
import { MINIMO_MOTIVO_YA_NO_SALE, type ResultadoYaNoSale } from '@/domain/ya-no-sale'
import { asignarLineaDemo, desp, duenoDelAlmacen, liberarSalida, loteEnReserva, lotesDisponibles, ordenDelPedido, type LineaSalidaDemo, type SalidaDemo } from './despacho-demo'
import { LiberacionDemo } from './liberacion-demo'
import { numeroDe } from './libro'
import type { OrdenCreada, OrdenDelPedido, RepositorioSalidaManual, ResumenOrdenesPendientes } from '../repositorio-salida-manual'
import type { Actor, ResultadoAccion } from '../repositorio'

/**
 * Los códigos de cada producto en la demostración (en una base real viven en `wms.producto_codigos`): uno de barras para cada producto y el código propio de cada cliente de
 * almacenamiento para los productos que guarda. Se calculan del catálogo: no hay nada que sembrar ni que se desincronice.
 */
export function codigosDemo(e: EstadoDemo): CodigoProducto[] {
  const out: CodigoProducto[] = []
  const clientes = e.panorama.propietarios.filter((p) => !p.esDuenoAlmacen)
  const delCliente = new Set(e.panorama.lotes.map((l) => `${l.propietarioId}|${l.productoId}`))
  for (const p of e.panorama.productos) {
    const digitos = p.codigo.replace(/\D/g, '').padStart(5, '0').slice(-5)
    out.push({ productoId: p.id, tipo: 'BARRAS', codigo: `77500${digitos}0` })
    for (const c of clientes) if (delCliente.has(`${c.id}|${p.id}`)) out.push({ productoId: p.id, tipo: 'CLIENTE', codigo: `${c.codigo.slice(0, 4)}-${digitos}`, propietarioId: c.id })
  }
  return out
}

const PRIORIDAD_ERROR = ['avisoMotivo', 'pedidoNumero', 'ruc', 'razonSocial', 'direccion', 'ubigeo', 'propietarioId', 'motivo', 'greNumero', 'greArchivo', 'lineas']
const primerError = (errores: Record<string, string>, clase?: string) => {
  // en el tipo C la base pide primero a quién va (nombre) y después el RUC
  const orden = clase === 'C' ? ['razonSocial', 'ruc', ...PRIORIDAD_ERROR.filter((x) => x !== 'razonSocial' && x !== 'ruc')] : PRIORIDAD_ERROR
  const k = orden.find((x) => errores[x]) ?? Object.keys(errores)[0]
  return errores[k]
}

const NOTA_DESTRUCCION = 'Sale desde Bajas: se prepara con el picking de Bajas'

export class SalidaManualDemo extends LiberacionDemo implements RepositorioSalidaManual {
  // ── Lectura ───────────────────────────────────────────────────────────────────────────────────────────────────

  async buscarProductosParaSalida(consulta: string, propietarioId?: string): Promise<ProductoHallado[]> {
    const e = estadoE()
    return buscarProductosPorCodigos(e.panorama.productos, codigosDemo(e), consulta, propietarioId)
  }

  private lotesDe(e: EstadoDemo, ids: readonly string[]): LoteParaSalida[] {
    const propietarios = new Map(e.panorama.propietarios.map((p) => [p.id, p]))
    const pos = new Map(e.panorama.posiciones.map((p) => [p.id, p]))
    const disponibles = new Map<string, number>()
    const memo = new Map<string, Map<string, number>>()
    const dispDe = (productoId: string, propietarioId: string, loteId: string) => {
      const k = `${productoId}|${propietarioId}`
      if (!memo.has(k)) memo.set(k, new Map(lotesDisponibles(e, productoId, propietarioId).map((l) => [l.loteId, l.disponible])))
      return memo.get(k)!.get(loteId) ?? 0
    }
    void disponibles
    return e.panorama.lotes.filter((l) => ids.includes(l.id)).map((l) => ({
      loteId: l.id, codigo: l.codigo, productoId: l.productoId, propietarioId: l.propietarioId, propietario: propietarios.get(l.propietarioId)?.razonSocial ?? '', vence: l.vence ?? null,
      disponibleAprobado: dispDe(l.productoId, l.propietarioId, l.id),
      enBajas: e.panorama.saldos.filter((s) => s.loteId === l.id && s.propietarioId === l.propietarioId && s.estado === 'BAJAS_RECHAZADOS' && pos.get(s.posicionId)?.tipoArea === 'BAJAS_RECHAZADOS')
        .reduce((t, s) => t + s.cantidad, 0),
      enReserva: loteEnReserva(e, l.id),
    }))
  }

  async lotesParaSalida(propietarioId: string, productoId: string): Promise<LoteParaSalida[]> {
    const e = estadoE(); await this.sembrarDespacho(e)
    return structuredClone(this.lotesDe(e, e.panorama.lotes.filter((l) => l.propietarioId === propietarioId && l.productoId === productoId).map((l) => l.id)))
  }

  async diasAvisoDevolucion(): Promise<number> { return DIAS_AVISO_DEVOLUCION_DEFECTO }

  async lotesPorCodigo(codigo: string, _productoId: string): Promise<LoteParaSalida[]> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const q = normalizar(codigo)
    if (!q) return []
    return structuredClone(this.lotesDe(e, e.panorama.lotes.filter((l) => normalizar(l.codigo) === q).map((l) => l.id)))
  }

  async ordenDelPedido(numeroPedido: string): Promise<OrdenDelPedido | null> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const n = normalizarNumeroPedido(numeroPedido)
    if (!n) return null
    const s = desp(e).salidas.find((x) => x.estado !== 'CANCELADA' && normalizarNumeroPedido(x.pedidoNumero) === n)
    if (s) return { tipo: 'ORDEN', id: s.id, numero: s.numero, estado: s.estado as 'ABIERTA' | 'CONFIRMADA' }
    const f = e.pedidos?.filas.find((x) => x.vigente && normalizarNumeroPedido(x.snapshot.numero) === n)
    return f ? { tipo: 'EN_BANDEJA', pedidoNumero: f.snapshot.numero } : null
  }

  // ── Desde la bandeja ──────────────────────────────────────────────────────────────────────────────────────────

  async crearOrdenDePedido(pedidoId: string, actor: Actor): Promise<ResultadoAccion<{ id: string; numero: string; yaExistia: boolean; faltaStock: boolean }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedePrepararSalidas(actor.roles)) return falla('No tienes permiso para crear órdenes de salida')
    const fila = e.pedidos?.filas.find((f) => f.vigente && f.snapshot.pedidoId === pedidoId)
    if (!fila) return falla('No encontramos ese pedido en la bandeja')
    if (fila.cambioPendiente) return falla(`El pedido ${fila.snapshot.numero} cambió en Pedidos: revisa el cambio antes de crear su orden`)
    const antes = fila.salida && desp(e).salidas.some((s) => s.numero === fila.salida && s.estado !== 'CANCELADA') ? fila.salida : undefined
    const s = ordenDelPedido(e, pedidoId, actor, 'BANDEJA')
    if (typeof s === 'string') return falla(s)
    if (antes !== s.numero) registrar(e, actor, 'orden_creada_desde_bandeja', 'salidas', s.numero, `Orden creada desde la bandeja para el pedido ${fila.snapshot.numero}`)
    return { ok: true, id: s.id, numero: s.numero, yaExistia: antes === s.numero, faltaStock: s.lineas.some((l) => l.estado === 'SIN_STOCK') }
  }

  async crearOrdenesPendientes(actor: Actor): Promise<ResultadoAccion<{ resumen: ResumenOrdenesPendientes }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedePrepararSalidas(actor.roles)) return falla('No tienes permiso para crear órdenes de salida')
    const d = desp(e)
    const resumen: ResumenOrdenesPendientes = { creadas: 0, unidas: 0, conFaltaStock: 0, errores: [], ordenes: [] }
    const pendientes = (e.pedidos?.filas ?? []).filter((f) => f.vigente && !f.cambioPendiente && !(f.salida && d.salidas.some((s) => s.numero === f.salida && s.estado !== 'CANCELADA')))
      .sort((a, b) => a.snapshot.fecha.localeCompare(b.snapshot.fecha) || a.snapshot.numero.localeCompare(b.snapshot.numero))
    for (const f of pendientes) {
      const s = ordenDelPedido(e, f.snapshot.pedidoId, actor, 'BANDEJA')
      if (typeof s === 'string') { resumen.errores.push({ pedido: f.snapshot.numero, motivo: s }); continue }
      const unida = s.origen === 'MANUAL'
      const falta = s.lineas.some((l) => l.estado === 'SIN_STOCK')
      if (unida) resumen.unidas += 1; else resumen.creadas += 1
      if (falta) resumen.conFaltaStock += 1
      resumen.ordenes.push({ pedido: f.snapshot.numero, orden: s.numero, faltaStock: falta, unida })
      registrar(e, actor, 'orden_creada_desde_bandeja', 'salidas', s.numero, `Orden creada desde la bandeja para el pedido ${f.snapshot.numero}`, 'Todas las pendientes')
    }
    return { ok: true, resumen }
  }

  async yaNoSale(salidaId: string, motivo: string, rehacer: boolean, actor: Actor): Promise<ResultadoAccion<ResultadoYaNoSale>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedePrepararSalidas(actor.roles)) return falla('No tienes permiso para cancelar una salida')
    const mot = (motivo ?? '').trim()
    if (mot.length < MINIMO_MOTIVO_YA_NO_SALE) return falla('Cuenta por qué ya no sale (al menos 5 letras)', { motivo: 'Cuenta por qué ya no sale (al menos 5 letras).' })
    const s = desp(e).salidas.find((x) => x.id === salidaId)
    if (!s) return falla('No encontramos esa orden')
    if (s.estado !== 'ABIERTA') return falla('La orden ya no está abierta: si ya salió, el transportista marca el pedido como no entregado o rechazado')
    if (s.cancelacionPendiente) return falla('Esta orden ya está por cancelarse: falta devolver lo picado a su ubicación')
    if ((await this.paqueteSalida(salidaId))?.guia) return falla('La orden ya tiene su guía: anula la guía primero y después usa «Ya no sale»')
    const rutaDe = desp(e).rutas.find((r) => r.estado !== 'CANCELADA' && r.paradas.some((p) => p.activa && p.salidaId === s.id))
    const codigos = new Set(((desp(e).bultos ?? []).filter((b) => b.salidaId === s.id)).map((b) => b.codigo))
    if (Object.values(desp(e).carga ?? {}).some((c) => c.cargados.some((x) => x.estado === 'CARGADO' && codigos.has(x.codigo)))) return falla('Ya hay bultos de este pedido cargados en el vehículo: retíralos de la carga primero')
    if (rutaDe && ['EN_RUTA', 'PENDIENTE_CIERRE', 'CERRADA'].includes(rutaDe.estado)) return falla(`La ruta ${rutaDe.numero} ya salió: el transportista marca el pedido como no entregado o rechazado`)

    // 1. la pre-guía (si la hay) se cancela: su número no se reutiliza
    const pre = await this.preGuiaDe(salidaId)
    if (pre && pre.estado !== 'CANCELADA' && pre.estado !== 'ENVIADA') await this.cancelarPreGuia(salidaId, `Ya no sale: ${mot}`)
    // 2. en una ruta que todavía no sale, el pedido queda marcado «anulado»
    if (rutaDe && ['LISTA_PARA_CARGA', 'LIBERADA'].includes(rutaDe.estado)) {
      const carga = ((desp(e).carga ??= {})[rutaDe.id] ??= { cargados: [], exclusiones: [] })
      if (!carga.exclusiones.some((x) => x.salidaId === s.id)) carga.exclusiones.push({ salidaId: s.id, motivo: `Ya no sale: ${mot}`, por: actor.nombre, en: ahora(), tipo: 'ANULADO' })
    }
    // 3. lo que nadie pickeó se libera; lo pickeado queda por devolver, con verificación de otra persona
    s.rehacerAlCancelar = rehacer
    let liberadas = 0, porDevolver = 0
    for (const l of s.lineas.filter((x) => x.estado !== 'CANCELADA')) { const r = soltarLineaDemo(e, l, null, 'PEDIDO_CANCELADO', undefined); liberadas += r.liberadas; porDevolver += r.porDevolver }
    if (porDevolver === 0) cancelarSalidaPorPedido(e, s, `Ya no sale: ${mot}`, actor)
    else {
      s.cancelacionPendiente = true; s.motivoCancelacion = `Ya no sale: ${mot}`
      alertar(e, 'DEVOLUCION_PICKING', 'jefe_almacen', `La orden ${s.numero} ya no sale: tiene ${porDevolver} unidades ya picadas por devolver a su ubicación. El auxiliar las devuelve y otra persona lo verifica; después la orden se cancela sola.`, `devolucion:${s.id}`)
    }
    if (!rehacer) alertar(e, 'PEDIDO_CANCELADO', 'jefe_transporte', `El pedido ${s.pedidoNumero ?? '—'} ya no sale (orden ${s.numero}): avisa al área comercial para que lo cancele en Pedidos. Motivo: ${mot}`, `ya-no-sale:${s.id}`)
    registrar(e, actor, 'ya_no_sale', 'salidas', s.numero, `Orden ${s.numero}: ya no sale`, mot)
    return { ok: true, cancelada: porDevolver === 0, porDevolver, preGuia: pre && pre.estado !== 'CANCELADA' && pre.estado !== 'ENVIADA' ? pre.numeroCompleto : undefined }
  }

  async cancelarOrden(salidaId: string, motivo: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedePrepararSalidas(actor.roles)) return falla('No tienes permiso para preparar salidas')
    if (!motivo?.trim()) return falla('La cancelación necesita un motivo', { motivo: 'Escribe el motivo.' })
    const s = desp(e).salidas.find((x) => x.id === salidaId)
    if (!s) return falla('No encontramos esa salida')
    if (s.estado !== 'ABIERTA') return falla('La salida ya no está abierta')
    const ruta = desp(e).rutas.find((r) => r.estado !== 'CANCELADA' && r.paradas.some((p) => p.activa && p.salidaId === s.id))
    if (ruta) return falla(`La orden está en la ruta ${ruta.numero}: quita el pedido de la ruta antes de cancelarla`)
    const m = liberarSalida(e, salidaId, motivo.trim())
    if (m) return falla(m)
    for (const o of (desp(e).picking?.ordenes ?? [])) if (o.salidaId === salidaId && o.estado !== 'CANCELADA') o.estado = 'CANCELADA'
    const fila = e.pedidos?.filas.find((f) => f.salida === s.numero)
    if (fila) fila.salida = undefined
    registrar(e, actor, 'salida_cancelada', 'salidas', s.numero, `Orden ${s.numero} cancelada`, motivo.trim())
    return { ok: true }
  }

  // ── A mano ────────────────────────────────────────────────────────────────────────────────────────────────────

  async editarOrden(salidaId: string, cambios: CambiosOrden, motivo: string | undefined, actor: Actor): Promise<ResultadoAccion<{ cambios: string[]; sinStock: number }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedePrepararSalidas(actor.roles)) return falla('No tienes permiso para editar la orden')
    const s = desp(e).salidas.find((x) => x.id === salidaId)
    if (!s) return falla('No encontramos esa orden')
    if (s.estado !== 'ABIERTA') return falla('La orden ya no está abierta: no se edita')
    const reglas = reglasDeEdicion({
      estado: s.estado, creadaDesde: s.creadaDesde, origen: s.origen, clienteManual: s.clienteManual, sinPedido: undefined,
      conPedido: !!e.pedidos?.filas.some((f) => f.vigente && f.salida === s.numero),
      ordenPickingId: (desp(e).picking?.ordenes ?? []).some((o) => o.salidaId === s.id && o.estado !== 'CANCELADA') ? 'hay' : undefined,
      guia: (desp(e).guias ?? []).some((g) => g.salidaId === s.id && g.guia.estado === 'VIGENTE') ? 'hay' : undefined,
    }, actor.roles)
    if (!reglas.editable) return falla('Esta orden viene de un pedido: se cambia desde Pedidos (llega como versión nueva). Los lotes se cambian en cada línea')
    const tocaEstructura = !!cambios.destinatario || !!cambios.lineas?.length
    if (tocaEstructura && !reglas.estructura) return falla(reglas.motivoSinEstructura ?? 'Esta orden no admite ese cambio')
    const errores = validarCambiosOrden(cambios, motivo)
    const primero = Object.values(errores)[0]
    if (primero) return falla(primero, errores)
    const hechos: string[] = []
    if (cambios.nota !== undefined) {
      const nota = cambios.nota.trim() || undefined
      if (nota !== s.nota) { registrar(e, actor, 'orden_nota_editada', 'salidas', s.numero, `Nota de ${s.numero}`, motivo); s.nota = nota; hechos.push('nota') }
    }
    if (cambios.destinatario && s.clienteManual) {
      const d = cambios.destinatario
      const nuevo = { ...s.clienteManual, ...(d.ruc !== undefined ? { ruc: d.ruc.trim() } : {}), ...(d.razonSocial !== undefined ? { razonSocial: d.razonSocial.trim() } : {}), ...(d.direccion !== undefined ? { direccion: d.direccion.trim() } : {}), ...(d.ubigeo !== undefined ? { ubigeo: d.ubigeo.trim() } : {}) }
      if (JSON.stringify(nuevo) !== JSON.stringify(s.clienteManual)) { s.clienteManual = nuevo; registrar(e, actor, 'orden_destinatario_editado', 'salidas', s.numero, `Destinatario de ${s.numero}`, motivo); hechos.push('destinatario') }
    }
    for (const c of cambios.lineas ?? []) {
      const l = s.lineas.find((x) => x.id === c.lineaId)
      if (!l) return falla('Una de las líneas no es de esta orden')
      if (l.estado === 'CANCELADA') return falla('Una de las líneas ya está cancelada')
      if (c.cantidad === l.cantidad) continue
      if (c.cantidad < l.cantidad) {
        // se suelta primero lo que vence más tarde (lo que vence antes sigue reservado)
        let sobra = l.cantidad - c.cantidad
        const vence = (loteId: string) => e.panorama.lotes.find((x) => x.id === loteId)?.vence ?? ''
        const activas = desp(e).reservas.filter((r) => r.lineaId === l.id && r.estado === 'ACTIVA').sort((a, b) => vence(b.loteId).localeCompare(vence(a.loteId)))
        for (const r of activas) { if (sobra <= 0) break; const t = Math.min(r.cantidad, sobra); if (t === r.cantidad) r.estado = 'LIBERADA'; else r.cantidad -= t; sobra -= t }
      }
      const antes = l.cantidad
      l.cantidad = c.cantidad
      asignarLineaDemo(e, s, l)
      registrar(e, actor, 'orden_linea_editada', 'salida_lineas', l.id, `Línea de ${s.numero}: ${antes} → ${c.cantidad}`, motivo)
      hechos.push(`linea:${l.id}`)
    }
    return { ok: true, cambios: hechos, sinStock: s.lineas.filter((l) => l.estado === 'SIN_STOCK').length }
  }

  async crearOrdenManual(entrada: EntradaOrdenManual, actor: Actor): Promise<ResultadoAccion<{ ordenes: OrdenCreada[] }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    const grupos: { motivo: MotivoSalida | undefined; lineas: LineaOrdenManual[] }[] = entrada.clase === 'B' ? partirPorMotivo(entrada.lineas) : [{ motivo: entrada.motivo, lineas: entrada.lineas }]
    if (grupos.length === 0) return falla('Agrega al menos una línea', { lineas: 'Agrega al menos una línea.' })
    // Todo o nada: primero se arma y valida cada orden; recién entonces se crean (un fallo en la segunda no deja la primera)
    const armadas: SalidaDemo[] = []
    for (const [i, g] of grupos.entries()) {
      const token = entrada.token ? (grupos.length > 1 ? `${entrada.token}:${g.motivo}` : entrada.token) : undefined
      const previa = token ? desp(e).salidas.find((s) => s.creadaPor === actor.id && s.token === token) : undefined
      if (previa) { armadas.push(previa); continue }
      const r = this.armar(e, { ...entrada, motivo: g.motivo, lineas: g.lineas }, actor, token)
      if ('error' in r) return falla(r.error, r.errores)
      armadas.push(r.salida)
      void i
    }
    const nuevas = armadas.filter((s) => !desp(e).salidas.includes(s))
    for (const s of nuevas) { s.numero = numeroDe(e.inv, 'OS', e.panorama.hoy.slice(0, 4)); desp(e).salidas.push(s) }
    // A: el sistema propone FEFO; si se prefirió otro lote, se aplica con las reglas de la edición de lotes (60 días, Aprobado, sin Reserva, nunca negativo)
    const creadas: OrdenCreada[] = []
    for (const s of armadas) {
      if (nuevas.includes(s)) {
        for (const l of s.lineas) {
          if (s.tipo === 'CLIENTE' && s.motivo === 'DESTRUCCION') { l.estado = 'PENDIENTE'; l.nota = NOTA_DESTRUCCION; continue }
          const mal = asignarLineaDemo(e, s, l)
          if (mal && (s.tipo === 'CLIENTE' || s.tipo === 'PROVEEDOR')) { this.deshacer(e, nuevas); return falla(mal) }
        }
        if (s.tipo === 'DISTRIBUCION') {
          for (const pedida of entrada.lineas) {
            if (!pedida.loteId) continue
            const linea = s.lineas.find((l) => l.productoId === pedida.productoId)
            if (!linea) continue
            const unico = linea.estado === 'ASIGNADA' && linea.fefo.length === 1 && linea.fefo[0].loteId === pedida.loteId
            if (unico) continue
            const r = await this.editarAsignacion(linea.id, [{ loteId: pedida.loteId, cantidad: linea.cantidad }], undefined, actor)
            if (!r.ok) { this.deshacer(e, nuevas); return falla(r.mensaje, r.errores) }
          }
        }
        registrar(e, actor, 'orden_manual_creada', 'salidas', s.numero, `Orden manual ${s.numero} (${entrada.clase})`,
          entrada.clase === 'A' ? 'Venta manual por conciliar con Pedidos' : entrada.clase === 'B' ? 'Por cuenta de un cliente de almacenamiento' : 'Salida sin venta de Logissa')
      }
      creadas.push({ id: s.id, numero: s.numero, motivo: s.motivo, faltaStock: s.lineas.some((l) => l.estado === 'SIN_STOCK') })
    }
    return { ok: true, ordenes: creadas }
  }

  // ── Tipo B: entrega al transportista del cliente (SA-6) ──────────────────────────────────────────────────────────

  async registrarEntregaTransportistaCliente(entrada: EntradaEntrega, actor: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const e = estadoE(); await this.sembrarDespacho(e)
    if (!puedeEntregarAlTransportistaCliente(actor.roles)) return falla(MENSAJE_SIN_PERMISO_ENTREGA)
    const s = desp(e).salidas.find((x) => x.id === entrada.salidaId)
    if (!s) return falla('No encontramos esa orden')
    if ((s.tipo ?? 'DISTRIBUCION') !== 'CLIENTE') return falla('La entrega al transportista del cliente es solo para una orden por cuenta de un cliente de almacenamiento')
    if (s.entrega) return { ok: true, id: s.entrega.id }                                   // repetir devuelve la misma entrega
    if (s.estado === 'CANCELADA') return falla('La orden está cancelada')
    if (s.estado !== 'ABIERTA') return falla('La orden ya salió')
    const ruta = desp(e).rutas.find((r) => r.estado !== 'CANCELADA' && r.paradas.some((p) => p.activa && p.salidaId === s.id))
    if (ruta) return falla(`La orden está en la ruta ${ruta.numero}: esta orden se entrega al transportista del cliente, no va en una ruta de Logisalud`)
    const errores = validarEntrega(entrada, new Date().toISOString())
    if (Object.keys(errores).length) return falla(Object.values(errores)[0], errores)
    if (this.resumenSalida(e, s).etapa !== 'LISTA_PARA_CARGA') return falla('La orden todavía no está lista para entregarse: faltan la conformidad, la GRE del cliente registrada, el paquete documental completo o el embalaje')
    const id = nuevoId()
    this.descontar(e, s, actor)
    s.entrega = {
      id, transportista: entrada.transportista.trim(), placa: entrada.placa?.trim().toUpperCase() || undefined, documentoRecoge: entrada.documento?.trim() || undefined, entregadoEn: entrada.hora,
      entregaAlmacen: entrada.entregaAlmacen.trim(), cargoArchivo: entrada.cargoRef, cargoNombre: entrada.cargoNombre, nota: entrada.nota?.trim() || undefined, registradaPor: actor.nombre, registradaEn: ahora(),
    }
    registrar(e, actor, 'entrega_transportista_cliente', 'salidas', s.numero, `Entregada al transportista ${s.entrega.transportista}: la salida ${s.numero} quedó confirmada`, entrada.nota?.trim())
    return { ok: true, id }
  }

  /** Lo que haría la transacción de la base si algo falla a medias: no queda nada. */
  private deshacer(e: EstadoDemo, salidas: SalidaDemo[]) {
    const d = desp(e)
    for (const s of salidas) {
      d.reservas = d.reservas.filter((r) => r.salidaId !== s.id)
      d.salidas = d.salidas.filter((x) => x.id !== s.id)
    }
  }

  /** Valida (mismas reglas y mismas palabras que `crear_orden_salida_manual`) y arma la orden sin guardarla. Devuelve el texto del error. */
  private armar(e: EstadoDemo, entrada: EntradaOrdenManual, actor: Actor, token: string | undefined): { salida: SalidaDemo } | { error: string; errores?: Record<string, string> } {
    const d = desp(e)
    const propietarios = e.panorama.propietarios
    const no = motivoNoPuedeCrear(actor.roles, entrada.clase, entrada.motivo)
    if (no) return { error: no }
    const errores = validarOrdenManual(entrada, (id) => propietarios.some((p) => p.id === id && !p.esDuenoAlmacen))
    if (Object.keys(errores).length) return { error: primerError(errores, entrada.clase), errores }
    const tipo = tipoDeClase(entrada.clase, entrada.motivo)
    const motivo: MotivoSalida = entrada.clase === 'A' ? 'VENTA' : entrada.motivo!
    const dueno = duenoDelAlmacen(e)
    const propietarioId = entrada.clase === 'B' ? entrada.propietarioId! : dueno
    const prop = propietarios.find((p) => p.id === propietarioId)
    if (!prop) return { error: 'No encontramos ese propietario' }
    let numeroNorm = ''
    if (entrada.clase === 'A') {
      numeroNorm = normalizarNumeroPedido(entrada.pedidoNumero)
      const ya = d.salidas.find((s) => s.estado !== 'CANCELADA' && normalizarNumeroPedido(s.pedidoNumero) === numeroNorm)
      if (ya) { const m = mensajePedidoConOrden(entrada.pedidoNumero ?? '', ya.numero); return { error: m, errores: { pedidoNumero: m } } }
      if (e.pedidos?.filas.some((f) => f.vigente && normalizarNumeroPedido(f.snapshot.numero) === numeroNorm)) {
        const m = mensajePedidoEnBandeja(entrada.pedidoNumero ?? ''); return { error: m, errores: { pedidoNumero: m } }
      }
    }
    // Líneas con lote indicado (B y devolución al proveedor): se valida cada una; un mismo lote en varias líneas no se pasa del disponible
    const acumulado = new Map<string, number>()
    const lineas: LineaSalidaDemo[] = []
    let conAviso = 0
    for (const l of entrada.lineas) {
      if (!e.panorama.productos.some((p) => p.id === l.productoId)) return { error: 'No encontramos uno de los productos' }
      if (tipo === 'CLIENTE' || tipo === 'PROVEEDOR') {
        const lote = e.panorama.lotes.find((x) => x.id === l.loteId)
        if (!lote) return { error: 'No encontramos uno de los lotes' }
        const delCodigo = this.lotesDe(e, e.panorama.lotes.filter((x) => normalizar(x.codigo) === normalizar(lote.codigo)).map((x) => x.id))
        const r = validarLineaSalidaCliente({ tipo, motivo, propietarioId, productoId: l.productoId, loteCodigo: lote.codigo, cantidad: l.cantidad, hoy: e.panorama.hoy, lotes: delCodigo, yaPedidoDelLote: acumulado.get(lote.id) ?? 0 })
        if (!r.ok) return { error: r.mensaje, errores: { lineas: r.mensaje } }
        if (r.aviso) conAviso += 1
        acumulado.set(lote.id, (acumulado.get(lote.id) ?? 0) + l.cantidad)
        lineas.push({ id: nuevoId(), productoId: l.productoId, cantidad: l.cantidad, estado: 'PENDIENTE', fefo: [], loteIndicadoId: lote.id })
      } else {
        lineas.push({ id: nuevoId(), productoId: l.productoId, cantidad: l.cantidad, estado: 'PENDIENTE', fefo: [] })
      }
    }
    // D-161: una devolución con líneas a menos de 90 días de vencer avisa; se crea si quien la crea escribe el motivo (igual que la base)
    if (conAviso > 0 && !entrada.avisoMotivo?.trim()) { const m = mensajeAvisoSinMotivo(conAviso, DIAS_AVISO_DEVOLUCION_DEFECTO); return { error: m, errores: { avisoMotivo: m } } }
    const cm = entrada.cliente
    const esDni = entrada.clase === 'C' && entrada.motivo === 'MUESTRA' && cm?.tipoDocumento === 'DNI'
    const cliente = (entrada.clase === 'A' || entrada.clase === 'C') && cm ? { ruc: cm.ruc.trim(), razonSocial: cm.razonSocial.trim(), direccion: cm.direccion.trim(), ubigeo: cm.ubigeo.trim(), vendedor: cm.vendedor?.trim() || undefined, tipoDocumento: esDni ? ('DNI' as const) : ('RUC' as const) } : undefined
    const salida: SalidaDemo = {
      id: nuevoId(), numero: '', pedidoId: entrada.clase === 'A' ? `manual:${numeroNorm}` : '', propietarioId, estado: 'ABIERTA', lineas, creadaEn: ahora(), creadaPor: actor.id,
      requiereEmbalaje: cliente ? requiereEmbalaje(cliente.ubigeo, undefined, embalajeActivoDemo()) : embalajeActivoDemo(),
      tipo, motivo, origen: 'MANUAL', creadaDesde: 'MANUAL', token,
      pedidoNumero: entrada.clase === 'A' ? (entrada.pedidoNumero ?? '').trim() : undefined, porConciliar: entrada.clase === 'A', clienteManual: cliente,
      greNumero: entrada.clase === 'B' ? (entrada.greNumero ?? '').trim().toUpperCase() : undefined, greArchivo: entrada.clase === 'B' ? entrada.greArchivo : undefined,
      enNombreDe: entrada.clase === 'B' ? propietarioId : undefined,
      devolucionAvisoMotivo: conAviso > 0 ? entrada.avisoMotivo!.trim() : undefined,
    }
    return { salida }
  }
}
