/**
 * Los pedidos listos para despacho, con la forma exacta del contrato con el
 * WMS (docs/wms/salidas/contrato-pedidos-wms.md). Dominio puro: recibe filas
 * ya leídas y arma el JSON. No toca la base ni Next.
 *
 * Lo que Pedidos NO tiene hoy y por eso no se manda (el contrato lo marca
 * como opcional): coordenadas y ventana de cita del cliente. Tampoco hay una
 * columna de "versión" ni un estado CANCELLED: la versión se deriva del
 * historial de estados y la cancelación queda lista para cuando exista (ver
 * docs/wms-pedidos-listos-reversa.md).
 */

export type EstadoContrato = "READY_FOR_OPERATIONS" | "CANCELLED";

export const ESTADOS_PARA_WMS: EstadoContrato[] = ["READY_FOR_OPERATIONS", "CANCELLED"];

export type FilaPedido = {
  id: string;
  numero: number | null;
  estado: string;
  fecha_envio: string | null;
  fecha_creacion: string | null;
  updated_at: string;
  ubigeo_snapshot: string | null;
  direccion_snapshot: string | null;
  razon_social_snapshot: string | null;
  vendedor_snapshot: string | null;
  customer: { id: string; razon_social: string; ruc_o_documento: string | null } | null;
  payment_term: { nombre: string } | null;
  items: Array<{
    id: string;
    cantidad: number | string;
    product: { codigo_interno: string; descripcion: string; presentacion: string | null } | null;
  }>;
};

export type FilaHistorial = {
  order_id: string;
  estado_nuevo: string;
  motivo: string | null;
  fecha: string;
};

export type FilaObservacion = { order_id: string; comentario: string; fecha: string };

export type FilaFactura = { pedido_id: string; serie: string; numero: number };

export type DatosAuxiliares = {
  historial: FilaHistorial[];
  observaciones: FilaObservacion[];
  facturas: FilaFactura[];
  /** codigo_inei -> nombre del distrito */
  distritos: Record<string, string>;
};

export type LineaContrato = {
  lineaId: string;
  productoCodigo: string;
  descripcion: string;
  cantidad: number;
};

export type PedidoContrato = {
  pedidoId: string;
  numero: string;
  version: number;
  estado: EstadoContrato;
  fecha: string;
  modificadoEn: string;
  cliente: {
    id: string;
    nombre: string;
    ruc?: string;
    direccion?: string;
    distrito?: string;
  };
  vendedor?: string;
  condicionPago?: string;
  factura?: string;
  observaciones?: string;
  motivoCancelacion?: string;
  lineas: LineaContrato[];
};

export type RespuestaContrato = { generado_en: string; pedidos: PedidoContrato[] };

/** YYYY-MM-DD del día de Lima (UTC-5, sin horario de verano). */
export function diaEnLima(instante: string): string {
  const t = new Date(instante);
  if (Number.isNaN(t.getTime())) return instante.slice(0, 10);
  return new Date(t.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

export function numeroDeFactura(f: FilaFactura): string {
  return `${f.serie}-${String(f.numero).padStart(5, "0")}`;
}

const masReciente = (a: string, b: string) => (new Date(a).getTime() >= new Date(b).getTime() ? a : b);

export function armarPedidoContrato(p: FilaPedido, aux: DatosAuxiliares): PedidoContrato | null {
  if (p.estado !== "READY_FOR_OPERATIONS" && p.estado !== "CANCELLED") return null;
  const estado: EstadoContrato = p.estado;

  const historial = aux.historial
    .filter((h) => h.order_id === p.id)
    .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
  // Cada vez que el pedido entra a "listo" o a "cancelado" cuenta una versión.
  const version = Math.max(
    1,
    historial.filter((h) => h.estado_nuevo === "READY_FOR_OPERATIONS" || h.estado_nuevo === "CANCELLED")
      .length,
  );
  const modificadoEn = historial.reduce((m, h) => masReciente(m, h.fecha), p.updated_at);

  const observaciones = aux.observaciones
    .filter((o) => o.order_id === p.id)
    .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
    .map((o) => o.comentario.trim())
    .filter(Boolean)
    .join(" / ");

  const factura = aux.facturas.find((f) => f.pedido_id === p.id);
  const distrito = p.ubigeo_snapshot ? aux.distritos[p.ubigeo_snapshot] : undefined;
  const nombre = p.customer?.razon_social ?? p.razon_social_snapshot ?? "";
  const ruc = p.customer?.ruc_o_documento ?? undefined;

  const lineas: LineaContrato[] = [...p.items]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((i) => ({
      lineaId: i.id,
      productoCodigo: i.product?.codigo_interno ?? "",
      descripcion: i.product?.descripcion ?? "",
      cantidad: Number(i.cantidad),
    }));

  const pedido: PedidoContrato = {
    pedidoId: p.id,
    numero: p.numero == null ? "" : String(p.numero),
    version,
    estado,
    fecha: diaEnLima(p.fecha_envio ?? p.fecha_creacion ?? p.updated_at),
    modificadoEn,
    cliente: { id: p.customer?.id ?? "", nombre },
    lineas,
  };
  if (ruc) pedido.cliente.ruc = ruc;
  if (p.direccion_snapshot) pedido.cliente.direccion = p.direccion_snapshot;
  if (distrito) pedido.cliente.distrito = distrito;
  if (p.vendedor_snapshot) pedido.vendedor = p.vendedor_snapshot;
  if (p.payment_term?.nombre) pedido.condicionPago = p.payment_term.nombre;
  if (factura) pedido.factura = numeroDeFactura(factura);
  if (observaciones) pedido.observaciones = observaciones;
  if (estado === "CANCELLED") {
    const motivo = [...historial].reverse().find((h) => h.estado_nuevo === "CANCELLED")?.motivo?.trim();
    if (motivo) pedido.motivoCancelacion = motivo;
  }
  return pedido;
}

export function armarRespuestaContrato(
  filas: FilaPedido[],
  aux: DatosAuxiliares,
  ahora: Date = new Date(),
): RespuestaContrato {
  const pedidos = filas
    .map((f) => armarPedidoContrato(f, aux))
    .filter((p): p is PedidoContrato => p !== null);
  return { generado_en: ahora.toISOString(), pedidos };
}
