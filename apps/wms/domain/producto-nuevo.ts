// «Producto nuevo» y «proveedor nuevo» (D-171, D-172). Los usa el muestreo (LS-TB.02.02): un producto o un proveedor nuevo se evalúa con la tabla NORMAL; uno conocido, con la
// SIMPLIFICADA. Puro: la demo y las pruebas lo usan; la base de datos aplica el mismo criterio (`wms.es_producto_nuevo`, `wms.es_proveedor_nuevo`, migración 0033) y es la que manda.
//
// Criterio de Dirección Técnica (2026-10-23): nuevo = SIN recepciones históricas.
//  · No existe «el mismo producto con otro laboratorio»: cada producto del catálogo se evalúa por sí solo.
//  · Cuenta como historia el STOCK INICIAL de Odoo (la carga inicial): un producto con stock inicial NO es nuevo. También el libro mayor del WMS.
//  · Cuentan las recepciones previas de Compras: líneas de OC con `cantidad_recibida > 0` (y recepciones físicas de almacén), leídas por las vistas `wms.v_oc_lineas`.
//  · La recepción que se está evaluando no es su propia historia: Compras puede haber copiado ya esta misma recepción; de esas líneas vale lo que Compras mostraba ANTES.

/** Una línea de OC de Compras, tal como la lee el WMS (`wms.v_oc_lineas`). */
export interface LineaOcCompras {
  ocItemId: string
  productoId: string
  proveedorRuc?: string
  proveedorNombre?: string
  /** Lo que Compras tiene registrado como recibido hoy. */
  recibida: number
}

/** Lo que Compras mostraba ANTES de la recepción que se evalúa, por línea de OC (`compras_recibida_antes` de cada línea de la solicitud). */
export type RecibidoAntes = ReadonlyMap<string, number>

/** Lo que Compras ya había recibido de esa línea sin contar la recepción que se evalúa. */
export const recibidoSinEstaRecepcion = (l: LineaOcCompras, propias: RecibidoAntes = new Map()) => (propias.has(l.ocItemId) ? Math.max(0, propias.get(l.ocItemId) ?? 0) : l.recibida)

export interface EntradaProductoNuevo {
  productoId: string
  /** El WMS tiene algo de este producto fuera de la recepción que se evalúa: lotes o movimientos del libro mayor, y el stock inicial de Odoo (carga inicial). */
  historiaWms: boolean
  lineasOc: readonly LineaOcCompras[]
  propias?: RecibidoAntes
}

export const esProductoNuevo = (e: EntradaProductoNuevo): boolean =>
  !e.historiaWms && !e.lineasOc.some((l) => l.productoId === e.productoId && recibidoSinEstaRecepcion(l, e.propias) > 0)

const norm = (t?: string) => (t ?? '').trim().toLowerCase()

export interface EntradaProveedorNuevo {
  /** Solo una compra local tiene proveedor que pueda ser «nuevo». */
  esCompraLocal: boolean
  ruc?: string
  nombre?: string
  /** Otras compras locales ya confirmadas en el WMS (no esta). */
  otrasCompras: readonly { ruc?: string; nombre?: string }[]
  lineasOc: readonly LineaOcCompras[]
  propias?: RecibidoAntes
}

/** Mismo proveedor: por RUC o, si la recepción no trae RUC, por nombre. */
export function esProveedorNuevo(e: EntradaProveedorNuevo): boolean {
  const ruc = e.ruc?.trim() || undefined; const nombre = e.nombre?.trim() || undefined
  if (!e.esCompraLocal || (!ruc && !nombre)) return false
  if (e.otrasCompras.some((x) => (ruc ? x.ruc?.trim() === ruc : norm(x.nombre) === norm(nombre)))) return false
  return !e.lineasOc.some((l) => (ruc ? l.proveedorRuc?.trim() === ruc : norm(l.proveedorNombre) === norm(nombre)) && recibidoSinEstaRecepcion(l, e.propias) > 0)
}

/** Por qué un producto o un proveedor es nuevo o conocido, en palabras (pantalla del acta y de la configuración). */
export const AYUDA_PRODUCTO_NUEVO =
  'Un producto o un proveedor es nuevo solo si nunca se recibió: ni en el WMS (la carga inicial de Odoo cuenta) ni en Compras. Cada producto del catálogo se evalúa por sí solo: no existe «el mismo producto con otro laboratorio».'
