import 'server-only'

import type { FuentePedidos, ResultadoFuente } from './fuente-pedidos'

// La fuente del modo demostración: pedidos de mentira con la forma exacta del contrato con Pedidos. En la primera consulta trae tres pedidos;
// a partir de la segunda, uno de ellos cambia (versión 2), llega uno nuevo y uno mal formado, para ver el versionado, la alerta y el descarte.

export interface ProductoDemo { codigo: string; descripcion: string }

export function pedidosDemo(productos: readonly ProductoDemo[], consulta: number, hoy: string, simulados: Record<string, unknown> = {}): unknown[] {
  const p = (i: number): ProductoDemo => productos[i % productos.length] ?? { codigo: 'SIN-PRODUCTO', descripcion: 'Producto de prueba' }
  const linea = (id: string, prod: ProductoDemo, cantidad: number) => ({ lineaId: id, productoCodigo: prod.codigo, descripcion: prod.descripcion, cantidad })
  const botica = { id: 'cli-demo-1', nombre: 'Botica Salud Total SAC', ruc: '20512345671', direccion: 'Av. Giraldez 480, Huancayo', distrito: 'Huancayo', ubigeo: '120101', ventanaCita: 'L-V 8:00-12:00', vehiculoCalificado: 'Camioneta' }
  const farmacia = { id: 'cli-demo-2', nombre: 'Farmacia Los Ángeles EIRL', ruc: '20698765432', direccion: 'Calle Mercaderes 214, Arequipa', distrito: 'Arequipa', ubigeo: '040101', ventanaCita: 'L-S 9:00-13:00' }
  const clinica = { id: 'cli-demo-3', nombre: 'Clínica San Marcos SA', ruc: '20456789123', direccion: 'Av. Brasil 2100, Jesús María', distrito: 'Jesús María', ubigeo: '150113', ventanaCita: 'L-V 7:00-10:00', vehiculoCalificado: 'Furgón refrigerado' }
  const base = (n: number, version: number, cliente: object, lineas: object[], extra: object = {}) => ({
    pedidoId: `ped-demo-${n}`, numero: `PED-DEMO-${n}`, version, estado: 'READY_FOR_OPERATIONS', fecha: hoy, modificadoEn: `${hoy}T08:00:00Z`,
    cliente, vendedor: 'Vendedor demo', condicionPago: 'Contado', lineas, ...extra,
  })
  const lista: unknown[] = [
    base(101, 1, botica, [linea('l-1', p(0), 20), linea('l-2', p(1), 6)]),
    consulta === 0
      ? base(102, 1, farmacia, [linea('l-1', p(2), 40)])
      : base(102, 2, { ...farmacia, ventanaCita: 'L-S 14:00-18:00' }, [linea('l-1', p(2), 60)]),
    // un producto que el WMS no tiene en su catálogo: se avisa en la bandeja
    base(103, 1, clinica, [linea('l-1', p(0), 100), { lineaId: 'l-2', productoCodigo: 'SIN-CATALOGO-9', descripcion: 'Producto que el WMS no conoce', cantidad: 12 }], { observaciones: 'Entrega con cadena de frío.' }),
  ]
  if (consulta >= 1) {
    lista.push(base(104, 1, botica, [linea('l-1', p(3), 250_000)])) // más de lo que hay en el almacén: sirve para ver «sin stock suficiente»
    lista.push({ ...base(199, 1, botica, []), numero: 'PED-DEMO-199' }) // sin líneas: se descarta con su motivo
  }
  // Lo que «Pedidos» cambió en la demostración (controles de la bandeja) reemplaza la versión de base si es igual o más nueva
  return lista.map((p) => { const x = simulados[(p as { pedidoId: string }).pedidoId] as { version: number } | undefined; return x && x.version >= (p as { version: number }).version ? x : p })
}

export type CambioSimulado = 'REDUCIR' | 'QUITAR' | 'AGREGAR' | 'CANCELAR' | 'FACTURAR'
interface Crudo { pedidoId: string; version: number; estado: string; modificadoEn?: string; factura?: string; motivoCancelacion?: string; canceladoPor?: string; vendedor?: string; lineas: { lineaId: string; productoCodigo: string; descripcion: string; cantidad: number }[] }

/**
 * Lo que haría «Pedidos» al cambiar un pedido (puro): una versión nueva con una línea reducida, quitada o agregada, el pedido cancelado, o la factura registrada.
 * `preferida` = la línea sobre la que se actúa (la que falta stock); `disponible` = lo que hay para reducirla; `nuevoProducto` = qué producto se agrega.
 */
export function simularCambio(actual: Crudo, cambio: CambioSimulado, o: { preferida?: string; disponible?: number; nuevoProducto?: ProductoDemo; ahora?: string } = {}): { ok: true; pedido: Crudo } | { ok: false; mensaje: string } {
  const n: Crudo = JSON.parse(JSON.stringify(actual))
  n.version = actual.version + 1; n.modificadoEn = o.ahora ?? new Date().toISOString()
  const objetivo = n.lineas.find((l) => l.lineaId === o.preferida) ?? [...n.lineas].sort((a, b) => b.cantidad - a.cantidad)[0]
  switch (cambio) {
    case 'REDUCIR': {
      if (!objetivo || objetivo.cantidad < 2) return { ok: false, mensaje: 'Esa línea ya pide una sola unidad: quítala o cancela el pedido.' }
      const a = o.disponible !== undefined ? Math.min(objetivo.cantidad - 1, o.disponible) : Math.ceil(objetivo.cantidad / 2)
      if (a < 1) return { ok: false, mensaje: 'No hay stock disponible de esa línea: quítala o cancela el pedido.' }
      objetivo.cantidad = a; break
    }
    case 'QUITAR':
      if (n.lineas.length < 2) return { ok: false, mensaje: 'El pedido tiene una sola línea: para quitarla, cancela el pedido.' }
      n.lineas = n.lineas.filter((l) => l !== objetivo); break
    case 'AGREGAR': {
      const p = o.nuevoProducto
      if (!p) return { ok: false, mensaje: 'No hay otro producto para agregar.' }
      n.lineas.push({ lineaId: `l-sim-${n.version}`, productoCodigo: p.codigo, descripcion: p.descripcion, cantidad: 5 }); break
    }
    case 'CANCELAR':
      n.estado = 'CANCELLED'; n.motivoCancelacion = 'El cliente ya no lo necesita (simulado en la demostración)'; n.canceladoPor = n.vendedor ?? 'Vendedor demo'; break
    case 'FACTURAR':
      n.factura = `F001-${String(43 + n.version).padStart(5, '0')}`; break
  }
  return { ok: true, pedido: n }
}

export class FuenteDemo implements FuentePedidos {
  readonly origen = 'demostración'
  constructor(private readonly productos: readonly ProductoDemo[], private readonly consulta: number, private readonly hoy: string, private readonly simulados: Record<string, unknown> = {}, private readonly soloSimulados = false) {}
  async listarListos(): Promise<ResultadoFuente> {
    return { ok: true, pedidos: this.soloSimulados ? Object.values(this.simulados) : pedidosDemo(this.productos, this.consulta, this.hoy, this.simulados), generadoEn: new Date().toISOString() }
  }
}
