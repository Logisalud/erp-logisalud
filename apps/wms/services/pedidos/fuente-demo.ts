import 'server-only'

import type { FuentePedidos, ResultadoFuente } from './fuente-pedidos'

// La fuente del modo demostración: pedidos de mentira con la forma exacta del contrato con Pedidos. En la primera consulta trae tres pedidos;
// a partir de la segunda, uno de ellos cambia (versión 2), llega uno nuevo y uno mal formado, para ver el versionado, la alerta y el descarte.

export interface ProductoDemo { codigo: string; descripcion: string }

export function pedidosDemo(productos: readonly ProductoDemo[], consulta: number, hoy: string): unknown[] {
  const p = (i: number): ProductoDemo => productos[i % productos.length] ?? { codigo: 'SIN-PRODUCTO', descripcion: 'Producto de prueba' }
  const linea = (id: string, prod: ProductoDemo, cantidad: number) => ({ lineaId: id, productoCodigo: prod.codigo, descripcion: prod.descripcion, cantidad })
  const botica = { id: 'cli-demo-1', nombre: 'Botica Salud Total SAC', ruc: '20512345671', direccion: 'Av. Arequipa 1450, Lince', distrito: 'Lince', ubigeo: '150116', ventanaCita: 'L-V 8:00-12:00', vehiculoCalificado: 'Camioneta' }
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
  return lista
}

export class FuenteDemo implements FuentePedidos {
  readonly origen = 'demostración'
  constructor(private readonly productos: readonly ProductoDemo[], private readonly consulta: number, private readonly hoy: string) {}
  async listarListos(): Promise<ResultadoFuente> {
    return { ok: true, pedidos: pedidosDemo(this.productos, this.consulta, this.hoy), generadoEn: new Date().toISOString() }
  }
}
