import "server-only";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "./audit-log";
import { generateElectronicDocumentDrafts } from "./electronic-documents";
import { resumirDiferencias, type LineaPreparada } from "@/domain/fulfillment";

export type OperationsQueueRow = {
  id: string;
  numero: number;
  fecha_envio: string | null;
  razon_social_snapshot: string | null;
  zona_snapshot: string | null;
  vendedor_snapshot: string | null;
  customer: { razon_social: string } | null;
};

/**
 * Cola de Operaciones. La RLS de orders ya limita a
 * READY_FOR_OPERATIONS/DISPATCHED para el rol operaciones; el filtro
 * explícito es para no mostrarle los ya despachados en la cola de
 * pendientes.
 */
export async function listOperationsQueue(): Promise<OperationsQueueRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, numero, fecha_envio, razon_social_snapshot, zona_snapshot, vendedor_snapshot,
       customer:customers(razon_social)`,
    )
    .eq("estado", "READY_FOR_OPERATIONS")
    .order("fecha_envio", { ascending: true });

  if (error) throw new Error(error.message);
  return data as unknown as OperationsQueueRow[];
}

export type DispatchedRow = {
  id: string;
  numero: number;
  razon_social_snapshot: string | null;
  fulfillments: Array<{ fecha_despacho: string | null }>;
};

export async function listRecentlyDispatched(limit = 20): Promise<DispatchedRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, numero, razon_social_snapshot, fulfillments(fecha_despacho)")
    .eq("estado", "DISPATCHED")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data as unknown as DispatchedRow[];
}

export type FulfillmentItemRow = {
  order_item_id: string;
  codigo: string;
  descripcion: string;
  unidad_medida: string;
  cantidad_pedida: number;
  controla_lote: boolean;
  controla_vencimiento: boolean;
};

export type OrderForFulfillment = {
  id: string;
  numero: number;
  estado: string;
  fecha_envio: string | null;
  razonSocial: string;
  rucODocumento: string;
  direccionEntrega: string | null;
  direccionEntregaActiva: boolean;
  canal: string | null;
  zona: string | null;
  vendedor: string | null;
  condicionPago: string | null;
  items: FulfillmentItemRow[];
};

function num(v: number | string | null | undefined): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}

export async function getOrderForFulfillment(orderId: string): Promise<OrderForFulfillment | null> {
  const supabase = createClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      `id, numero, estado, fecha_envio, customer_address_id,
       razon_social_snapshot, direccion_snapshot, canal_snapshot, zona_snapshot, vendedor_snapshot,
       customer:customers(razon_social, ruc_o_documento),
       payment_terms:payment_terms(nombre)`,
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!order) return null;

  const o = order as unknown as {
    id: string;
    numero: number;
    estado: string;
    fecha_envio: string | null;
    customer_address_id: string;
    razon_social_snapshot: string | null;
    direccion_snapshot: string | null;
    canal_snapshot: string | null;
    zona_snapshot: string | null;
    vendedor_snapshot: string | null;
    customer: { razon_social: string; ruc_o_documento: string } | null;
    payment_terms: { nombre: string } | null;
  };

  const [itemsResult, addressResult] = await Promise.all([
    supabase
      .from("order_items")
      .select(
        "id, cantidad, product:products(codigo_interno, descripcion, unidad_medida, controla_lote, controla_vencimiento)",
      )
      .eq("order_id", orderId),
    // La dirección viva, no el snapshot: lo que importa para despachar es
    // que siga activa hoy.
    supabase
      .from("customer_addresses")
      .select("id, estado")
      .eq("id", o.customer_address_id)
      .maybeSingle(),
  ]);

  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (addressResult.error) throw new Error(addressResult.error.message);

  const items: FulfillmentItemRow[] = (
    (itemsResult.data ?? []) as unknown as Array<{
      id: string;
      cantidad: number | string;
      product: {
        codigo_interno: string;
        descripcion: string;
        unidad_medida: string;
        controla_lote: boolean;
        controla_vencimiento: boolean;
      } | null;
    }>
  ).map((i) => ({
    order_item_id: i.id,
    codigo: i.product?.codigo_interno ?? "—",
    descripcion: i.product?.descripcion ?? "—",
    unidad_medida: i.product?.unidad_medida ?? "UND",
    cantidad_pedida: num(i.cantidad),
    controla_lote: i.product?.controla_lote ?? false,
    controla_vencimiento: i.product?.controla_vencimiento ?? false,
  }));

  const address = addressResult.data as { id: string; estado: string } | null;

  return {
    id: o.id,
    numero: o.numero,
    estado: o.estado,
    fecha_envio: o.fecha_envio,
    razonSocial: o.razon_social_snapshot ?? o.customer?.razon_social ?? "—",
    rucODocumento: o.customer?.ruc_o_documento ?? "—",
    direccionEntrega: o.direccion_snapshot,
    direccionEntregaActiva: address?.estado === "activo",
    canal: o.canal_snapshot,
    zona: o.zona_snapshot,
    vendedor: o.vendedor_snapshot,
    condicionPago: o.payment_terms?.nombre ?? null,
    items,
  };
}

export type DispatchCatalogs = {
  inventorySources: Array<{ id: number; nombre: string; tipo: string }>;
  warehouses: Array<{ id: number; nombre: string }>;
  vehicles: Array<{ id: number; nombre: string }>;
  drivers: Array<{ id: number; nombre: string }>;
  transporters: Array<{ id: number; nombre: string }>;
};

export async function listDispatchCatalogs(): Promise<DispatchCatalogs> {
  const supabase = createClient();
  const activos = (table: string, columns: string) =>
    supabase.from(table).select(columns).eq("estado", "activo").order("nombre");

  const [sources, warehouses, vehicles, drivers, transporters] = await Promise.all([
    activos("inventory_sources", "id, nombre, tipo"),
    activos("warehouses", "id, nombre"),
    activos("vehicles", "id, nombre"),
    activos("drivers", "id, nombre"),
    activos("transporters", "id, nombre"),
  ]);

  for (const r of [sources, warehouses, vehicles, drivers, transporters]) {
    if (r.error) throw new Error(r.error.message);
  }

  // El helper genérico sobre nombres de tabla pierde el tipado de
  // supabase-js, así que la forma se afirma acá (el select de arriba es
  // la fuente de verdad de las columnas).
  return {
    inventorySources: (sources.data ?? []) as unknown as DispatchCatalogs["inventorySources"],
    warehouses: (warehouses.data ?? []) as unknown as DispatchCatalogs["warehouses"],
    vehicles: (vehicles.data ?? []) as unknown as DispatchCatalogs["vehicles"],
    drivers: (drivers.data ?? []) as unknown as DispatchCatalogs["drivers"],
    transporters: (transporters.data ?? []) as unknown as DispatchCatalogs["transporters"],
  };
}

/**
 * Stock registrado de una fuente para un conjunto de productos. Es
 * informativo: no bloquea el despacho (registro manual, puede estar
 * desfasado). Devuelve un mapa por order_item_id para que la UI muestre
 * el disponible al lado de cada línea.
 */
export async function getStockForOrder(
  orderId: string,
  inventorySourceId: number,
): Promise<Record<string, number | null>> {
  const supabase = createClient();

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("id, product_id")
    .eq("order_id", orderId);
  if (itemsError) throw new Error(itemsError.message);

  const rows = (items ?? []) as Array<{ id: string; product_id: string }>;
  if (rows.length === 0) return {};

  const { data: stock, error: stockError } = await supabase
    .from("stock_levels")
    .select("product_id, cantidad_disponible")
    .eq("inventory_source_id", inventorySourceId)
    .in(
      "product_id",
      rows.map((r) => r.product_id),
    );
  if (stockError) throw new Error(stockError.message);

  const porProducto = new Map<string, number>();
  for (const s of (stock ?? []) as Array<{ product_id: string; cantidad_disponible: number | string }>) {
    porProducto.set(s.product_id, num(s.cantidad_disponible));
  }

  const result: Record<string, number | null> = {};
  for (const r of rows) {
    result[r.id] = porProducto.has(r.product_id) ? (porProducto.get(r.product_id) as number) : null;
  }
  return result;
}

export type ConfirmDispatchInput = {
  orderId: string;
  inventorySourceId: number;
  warehouseId: number;
  vehicleId: number | null;
  driverId: number | null;
  transporterId: number | null;
  lineas: LineaPreparada[];
  motivo: string | null;
};

export type ConfirmDispatchResult = {
  fulfillmentId: string;
  diferencias: Array<{
    orderItemId: string;
    codigo: string;
    cantidadPedida: number;
    cantidadPreparada: number;
    motivo: string | null;
  }>;
  /**
   * Desenlace de la generación de borradores de documentación electrónica.
   * Informativo: nunca bloquea el despacho.
   */
  borradores?: { ok: boolean; advertencias: string[]; error?: string };
};

/**
 * Confirma el despacho. La validación real (rol, estado, dirección
 * activa, lote/vencimiento obligatorios, motivo de diferencia) la hace
 * pedidos.confirm_dispatch en el servidor, en una sola transacción con la
 * transición a DISPATCHED — acá no se re-implementa, solo se traduce el
 * error para la UI.
 */
export async function confirmDispatch(
  input: ConfirmDispatchInput,
  actor: string,
): Promise<ConfirmDispatchResult> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("confirm_dispatch", {
    p_order_id: input.orderId,
    p_inventory_source_id: input.inventorySourceId,
    p_warehouse_id: input.warehouseId,
    p_vehicle_id: input.vehicleId,
    p_driver_id: input.driverId,
    p_transporter_id: input.transporterId,
    p_items: input.lineas.map((l) => ({
      orderItemId: l.orderItemId,
      cantidadPreparada: l.cantidadPreparada,
      lote: l.lote,
      fechaVencimiento: l.fechaVencimiento,
      motivoDiferencia: l.motivoDiferencia,
      pendienteDeStock: l.pendienteDeStock,
      comentarioStock: l.comentarioStock,
    })),
    p_motivo: input.motivo,
  });

  if (error) throw new Error(error.message);

  const result = data as unknown as ConfirmDispatchResult;
  const diferencias = resumirDiferencias(input.lineas);

  // Auditoría de negocio: confirmación de despacho, fuente de stock
  // elegida, y toda diferencia entre lo pedido y lo preparado.
  await logAudit({
    actor,
    accion: "confirmar_despacho",
    entidad: "orders",
    entidadId: input.orderId,
    datosDespues: {
      fulfillmentId: result.fulfillmentId,
      inventorySourceId: input.inventorySourceId,
      warehouseId: input.warehouseId,
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      transporterId: input.transporterId,
      lineasPreparadas: input.lineas.length,
      diferencias,
      lineasPendientesDeStock: input.lineas
        .filter((l) => l.pendienteDeStock)
        .map((l) => ({ codigo: l.codigo, comentario: l.comentarioStock })),
    },
  });

  // Documentación electrónica: por ahora solo BORRADORES para revisión
  // humana, no se llama a ningún servicio externo.
  //
  // TODO — Pendiente: reemplazar generación de borrador por llamada real a
  // la API de NubeFact (POST a la ruta configurada con el token), una vez
  // confirmada la estructura exacta de campos contra el manual oficial y
  // rotado el token de forma segura (variables de entorno NUBEFACT_API_URL
  // y NUBEFACT_API_TOKEN, nunca en el repo).
  //
  // Va DESPUÉS de que el despacho quedó grabado y el pedido pasó a
  // DISPATCHED, y generateElectronicDocumentDrafts no lanza nunca: un fallo
  // acá no puede revertir un despacho físico ya hecho.
  const borradores = await generateElectronicDocumentDrafts(input.orderId, actor);

  return { ...result, diferencias, borradores };
}

export type FulfillmentSummary = {
  id: string;
  estado: string;
  fecha_despacho: string | null;
  inventory_source: { nombre: string; tipo: string } | null;
  warehouse: { nombre: string } | null;
  vehicle: { nombre: string } | null;
  driver: { nombre: string } | null;
  transporter: { nombre: string } | null;
  fulfillment_items: Array<{
    cantidad_preparada: number;
    lote: string | null;
    fecha_vencimiento: string | null;
    motivo_diferencia: string | null;
    pendiente_de_stock: boolean;
    comentario_stock: string | null;
    order_item: { cantidad: number; product: { codigo_interno: string; descripcion: string } | null } | null;
  }>;
};

/** Despacho de un pedido, para mostrarlo en el detalle (incluido al vendedor). */
export async function getFulfillmentForOrder(orderId: string): Promise<FulfillmentSummary | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("fulfillments")
    .select(
      `id, estado, fecha_despacho,
       inventory_source:inventory_sources(nombre, tipo),
       warehouse:warehouses(nombre),
       vehicle:vehicles(nombre),
       driver:drivers(nombre),
       transporter:transporters(nombre),
       fulfillment_items(
         cantidad_preparada, lote, fecha_vencimiento, motivo_diferencia,
         pendiente_de_stock, comentario_stock,
         order_item:order_items(cantidad, product:products(codigo_interno, descripcion))
       )`,
    )
    .eq("order_id", orderId)
    .order("fecha_preparacion", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as unknown as FulfillmentSummary) ?? null;
}
