import "server-only";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "./audit-log";
import { notifyDiscountRequested, notifyOrderSubmitted, type NotifyResult } from "./order-notifications";
import { calculateLineItem, canEditPaymentTerms } from "@/domain/orders";
import { admitePrecioCero } from "@/domain/products";
import { MENSAJE_SIN_DIRECCION } from "@/domain/customers";
import { evaluarCambioDeCliente, type ConflictoDePrecio } from "@/domain/order-header";

export type OrderSummary = {
  id: string;
  numero: number;
  estado: string;
  fecha_creacion: string;
  fecha_envio: string | null;
  customer: { razon_social: string } | null;
  seller: { nombre_completo: string } | null;
};

export type OrderItemRow = {
  id: string;
  product_id: string;
  cantidad: number;
  precio_unitario: number;
  afectacion_tributaria: string;
  tasa_igv: number;
  subtotal: number;
  igv: number;
  total: number;
  precio_fijado_por_admin: boolean;
  precio_lista_original: number | null;
  motivo_precio_especial: string | null;
  origen_precio: string;
  promocion_ref: string | null;
  es_linea_gratis: boolean;
  product: { descripcion: string; codigo_interno: string } | null;
};

export type OrderStatusHistoryRow = {
  id: number;
  estado_anterior: string | null;
  estado_nuevo: string;
  motivo: string | null;
  fecha: string;
};

export type OrderObservationRow = {
  id: string;
  comentario: string;
  contexto: string | null;
  fecha: string;
  autor: string;
};

export type OrderDetail = OrderSummary & {
  seller_id: string;
  customer_id: string;
  customer_address_id: string;
  payment_terms_id: number;
  dias_credito_solicitados: number | null;
  customer: {
    razon_social: string;
    ruc_o_documento: string;
    canal_id: number | null;
    condicion_pago_habitual_id: number | null;
  } | null;
  address: { direccion: string } | null;
  payment_terms: { nombre: string; permite_dias_libres: boolean } | null;
  items: OrderItemRow[];
  history: OrderStatusHistoryRow[];
  observations: OrderObservationRow[];
};

const ORDER_SUMMARY_SELECT =
  "id, numero, estado, fecha_creacion, fecha_envio, customer:customers(razon_social), seller:sellers(nombre_completo)";

/** Cuántos pedidos entran en una página de la lista. */
export const PAGE_SIZE = 20;

export type OrdersPage = {
  orders: OrderSummary[];
  /** Si hay al menos una fila más después de esta página. */
  hayMas: boolean;
};

/**
 * Los pedidos de un vendedor, paginados y filtrables por estado.
 *
 * **Paginado desde el día uno, aunque hoy sean cuatro pedidos.** Este listado
 * crece para siempre —un vendedor activo suma pedidos todas las semanas y
 * ninguno se borra— y PostgREST corta la respuesta en 1.000 filas sin decir
 * nada: la lista simplemente dejaría de mostrar lo viejo, sin error y sin
 * señal. Ya nos pasó con la cartera de clientes (ver el combobox en
 * CLAUDE.md); no lo repetimos.
 *
 * Para saber si hay página siguiente se pide una fila de más en vez de un
 * `count` exacto: son dos consultas menos y el número total no se muestra
 * en ningún lado.
 */
export async function listOrdersForSeller(
  sellerId: string,
  opciones: { estados?: string[] | null; page?: number } = {},
): Promise<OrdersPage> {
  const page = Math.max(1, Math.trunc(opciones.page ?? 1));
  const desde = (page - 1) * PAGE_SIZE;

  const supabase = createClient();
  let query = supabase
    .from("orders")
    .select(ORDER_SUMMARY_SELECT)
    .eq("seller_id", sellerId)
    // Más reciente primero. `numero` desempata: dos pedidos creados en el
    // mismo instante tendrían orden arbitrario, y una fila que baila entre
    // páginas se ve dos veces o ninguna.
    .order("fecha_creacion", { ascending: false })
    .order("numero", { ascending: false })
    .range(desde, desde + PAGE_SIZE);

  if (opciones.estados && opciones.estados.length > 0) {
    query = query.in("estado", opciones.estados);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const filas = (data ?? []) as unknown as OrderSummary[];
  return { orders: filas.slice(0, PAGE_SIZE), hayMas: filas.length > PAGE_SIZE };
}

export async function createDraftOrder(input: {
  sellerId: string;
  creadoPor: string;
  customerId: string;
  customerAddressId: string;
  paymentTermsId: number;
  /** Sólo con la condición de pago de días libres; con las estándar va null. */
  diasCreditoSolicitados?: number | null;
}) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("orders")
    .insert({
      seller_id: input.sellerId,
      creado_por: input.creadoPor,
      customer_id: input.customerId,
      customer_address_id: input.customerAddressId,
      payment_terms_id: input.paymentTermsId,
      dias_credito_solicitados: input.diasCreditoSolicitados ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getOrderDetail(orderId: string): Promise<OrderDetail | null> {
  const supabase = createClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(
      `id, numero, estado, fecha_creacion, fecha_envio, seller_id, customer_id, customer_address_id, payment_terms_id,
      dias_credito_solicitados,
      seller:sellers(nombre_completo),
      customer:customers(razon_social, ruc_o_documento, canal_id, condicion_pago_habitual_id),
      address:customer_addresses(direccion),
      payment_terms:payment_terms(nombre, permite_dias_libres)`,
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) throw new Error(orderError.message);
  if (!order) return null;

  const [{ data: items, error: itemsError }, { data: history, error: historyError }, { data: observations, error: observationsError }] =
    await Promise.all([
      supabase
        .from("order_items")
        .select(
          "id, product_id, cantidad, precio_unitario, afectacion_tributaria, tasa_igv, subtotal, igv, total, " +
            "precio_fijado_por_admin, precio_lista_original, motivo_precio_especial, " +
            "origen_precio, promocion_ref, es_linea_gratis, " +
            "product:products(descripcion, codigo_interno)",
        )
        .eq("order_id", orderId),
      supabase
        .from("order_status_history")
        .select("id, estado_anterior, estado_nuevo, motivo, fecha")
        .eq("order_id", orderId)
        .order("fecha", { ascending: true }),
      supabase
        .from("order_observations")
        .select("id, comentario, contexto, fecha, autor")
        .eq("order_id", orderId)
        .order("fecha", { ascending: false }),
    ]);

  if (itemsError) throw new Error(itemsError.message);
  if (historyError) throw new Error(historyError.message);
  if (observationsError) throw new Error(observationsError.message);

  return {
    ...(order as unknown as OrderDetail),
    items: (items ?? []) as unknown as OrderItemRow[],
    history: (history ?? []) as unknown as OrderStatusHistoryRow[],
    observations: (observations ?? []) as unknown as OrderObservationRow[],
  };
}

export type AddOrderItemResult =
  | { ok: true; itemId: string }
  | { ok: false; reason: "NO_PRICE" | "NO_TAX_PROFILE" | "NO_CHANNEL" | "PRODUCTO_INACTIVO" };

/**
 * Agrega una línea al pedido en DRAFT. El precio mostrado acá es solo
 * para que el vendedor vea una referencia mientras arma el pedido — el
 * valor que realmente queda grabado lo decide pedidos.submit_order() en
 * el servidor al momento de enviar (ver domain/orders.ts).
 */
/**
 * Recalcula las promociones automáticas del pedido.
 *
 * Se llama después de cada cambio de línea, y `submit_order` lo llama otra
 * vez por su cuenta: el motor vive en SQL justamente para que las dos
 * puertas den el mismo resultado. Es idempotente —borra y regenera las
 * líneas gratis, deshace y vuelve a aplicar los descuentos—, así que
 * llamarlo de más no acumula nada.
 *
 * Un error acá sí interrumpe la acción: dejar el pedido con la línea
 * agregada y las promociones a medio aplicar es peor que fallar y que el
 * vendedor lo intente de nuevo.
 */
export async function aplicarPromociones(orderId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("aplicar_promociones", { p_order_id: orderId });
  if (error) throw new Error(error.message);
}

export async function addOrderItem(input: {
  orderId: string;
  customerId: string;
  productId: string;
  cantidad: number;
}): Promise<AddOrderItemResult> {
  const supabase = createClient();

  // Un producto inactivo no se puede facturar, así que tampoco se puede
  // pedir. La pantalla ya no lo ofrece —filtra por estado— pero la Server
  // Action recibe un productId cualquiera, y sin esto una petición armada a
  // mano metería al pedido algo que después no se puede emitir.
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("estado, codigo_interno")
    .eq("id", input.productId)
    .maybeSingle();
  if (productError) throw new Error(productError.message);
  if (!product) throw new Error("El producto no existe o no es visible.");
  if (product.estado !== "activo") return { ok: false, reason: "PRODUCTO_INACTIVO" };

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("canal_id")
    .eq("id", input.customerId)
    .single();
  if (customerError) throw new Error(customerError.message);
  if (!customer.canal_id) return { ok: false, reason: "NO_CHANNEL" };

  const { data: priceRow } = await supabase
    .from("price_list_items")
    .select("precio")
    .eq("product_id", input.productId)
    .eq("sales_channel_id", customer.canal_id)
    .is("vigente_hasta", null)
    .maybeSingle();

  // Una bonificación se entrega gratis y casi nunca tiene precio propio en
  // la lista del canal: entra a S/ 0.00 explícito en vez de bloquearse.
  // Para cualquier otro producto, sin precio no hay línea.
  const precio = priceRow
    ? priceRow.precio
    : admitePrecioCero(product.codigo_interno)
      ? 0
      : null;
  if (precio === null) return { ok: false, reason: "NO_PRICE" };

  const { data: taxProfile } = await supabase
    .from("product_tax_profiles")
    .select("afectacion_tributaria, tasa_aplicable")
    .eq("product_id", input.productId)
    .is("vigente_hasta", null)
    .maybeSingle();
  if (!taxProfile) return { ok: false, reason: "NO_TAX_PROFILE" };

  const line = calculateLineItem({
    cantidad: input.cantidad,
    precioVigente: precio,
    afectacionTributaria: taxProfile.afectacion_tributaria as "GRAVADO" | "INAFECTO",
    tasaAplicable: taxProfile.tasa_aplicable,
  });
  if (!line.ok) return { ok: false, reason: "NO_PRICE" };

  const { data, error } = await supabase
    .from("order_items")
    .insert({
      order_id: input.orderId,
      product_id: input.productId,
      cantidad: input.cantidad,
      precio_unitario: precio,
      afectacion_tributaria: taxProfile.afectacion_tributaria,
      tasa_igv: taxProfile.tasa_aplicable,
      subtotal: line.subtotal,
      igv: line.igv,
      total: line.total,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  // El producto recién agregado puede disparar una bonificación, alcanzar
  // el umbral de una escala o completar el par de un descuento
  // condicionado. El vendedor tiene que verlo ahora, no al enviar.
  await aplicarPromociones(input.orderId);

  return { ok: true, itemId: data.id };
}

/**
 * El administrador fija el precio de una línea, directo.
 *
 * Un vendedor que quiere otro precio abre una solicitud y el pedido espera
 * (COMMERCIAL_EXCEPTION). El administrador no: ya tiene la autoridad, así
 * que pedírsela a sí mismo solo agrega un paso y un pedido frenado. El
 * precio se aplica a la línea y el pedido sigue su curso normal.
 *
 * La autoridad la verifica el RPC con `pedidos.is_admin()`, sobre los roles
 * reales de la sesión: esta función no decide nada de permisos, y una
 * llamada armada a mano por un vendedor rebota en la base.
 *
 * Queda auditado en pedidos.audit_logs con los dos precios y el motivo,
 * porque es exactamente el caso donde después alguien va a preguntar por
 * qué esta línea salió a este precio.
 */
export async function setItemSpecialPriceAsAdmin(input: {
  orderId: string;
  itemId: string;
  precio: number;
  motivo?: string | null;
  actor: string;
}): Promise<{ precioAnterior: number; precioLista: number; precioNuevo: number }> {
  if (!Number.isFinite(input.precio) || input.precio <= 0) {
    throw new Error("El precio tiene que ser mayor que cero.");
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc("set_item_special_price", {
    p_order_item_id: input.itemId,
    p_precio: input.precio,
    p_motivo: input.motivo ?? null,
  });
  if (error) throw new Error(error.message);

  const resultado = data as {
    orderId: string;
    precioAnterior: number;
    precioLista: number;
    precioNuevo: number;
  };

  await logAudit({
    actor: input.actor,
    accion: "fijar_precio_especial_admin",
    entidad: "order_items",
    entidadId: input.itemId,
    datosAntes: { precio_unitario: resultado.precioAnterior },
    datosDespues: {
      order_id: resultado.orderId,
      precio_unitario: resultado.precioNuevo,
      precio_lista_original: resultado.precioLista,
      motivo: input.motivo?.trim() || null,
      sin_aprobacion_comercial: true,
    },
  });

  return {
    precioAnterior: resultado.precioAnterior,
    precioLista: resultado.precioLista,
    precioNuevo: resultado.precioNuevo,
  };
}

/**
 * Marca unidades de un producto como bonificación manual: entran al pedido
 * a S/ 0.00, en una línea aparte.
 *
 * Es discrecional y no tiene nada que ver con el motor de promociones. Un
 * vendedor puede pedirlo —al enviar el pedido, `submit_order` le abre una
 * solicitud de aprobación por cada línea manual y el pedido queda en
 * COMMERCIAL_EXCEPTION, porque regalar unidades es un descuento del 100%—.
 * Un administrador la aplica directo, igual que un precio especial.
 *
 * Quién es quién lo decide el RPC con `is_admin()`/`current_seller_id()`
 * sobre los roles reales de la sesión: esta función no decide permisos.
 */
export async function marcarBonificacionManual(input: {
  orderId: string;
  itemId: string;
  cantidad: number;
  motivo: string;
  actor: string;
}): Promise<{
  itemId: string;
  cantidad: number;
  precioLista: number;
  motivo: string;
  requiereAprobacion: boolean;
}> {
  if (!Number.isInteger(input.cantidad) || input.cantidad < 1) {
    throw new Error("La cantidad bonificada tiene que ser un número entero de 1 o más.");
  }
  const motivo = input.motivo.trim();
  if (!motivo) {
    throw new Error("Escribí el motivo de la bonificación: es lo que va a revisar el aprobador.");
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc("marcar_bonificacion_manual", {
    p_order_item_id: input.itemId,
    p_cantidad: input.cantidad,
    p_motivo: motivo,
  });
  if (error) throw new Error(error.message);

  const resultado = data as {
    orderId: string;
    orderItemId: string;
    productId: string;
    cantidad: number;
    precioLista: number;
    motivo: string;
    requiereAprobacion: boolean;
  };

  await logAudit({
    actor: input.actor,
    accion: "marcar_bonificacion_manual",
    entidad: "order_items",
    entidadId: resultado.orderItemId,
    datosDespues: {
      order_id: resultado.orderId,
      product_id: resultado.productId,
      cantidad: resultado.cantidad,
      precio_unitario: 0,
      precio_lista_original: resultado.precioLista,
      motivo: resultado.motivo,
      requiere_aprobacion_comercial: resultado.requiereAprobacion,
    },
  });

  return {
    itemId: resultado.orderItemId,
    cantidad: resultado.cantidad,
    precioLista: resultado.precioLista,
    motivo: resultado.motivo,
    requiereAprobacion: resultado.requiereAprobacion,
  };
}

/** Deshace la bonificación manual: la línea gratis se va del pedido. */
export async function quitarBonificacionManual(input: {
  itemId: string;
  actor: string;
}): Promise<void> {
  const supabase = createClient();

  const { data: item } = await supabase
    .from("order_items")
    .select("order_id, product_id, cantidad, motivo_precio_especial")
    .eq("id", input.itemId)
    .maybeSingle();

  const { error } = await supabase.rpc("quitar_bonificacion_manual", {
    p_order_item_id: input.itemId,
  });
  if (error) throw new Error(error.message);

  await logAudit({
    actor: input.actor,
    accion: "quitar_bonificacion_manual",
    entidad: "order_items",
    entidadId: input.itemId,
    datosAntes: item ?? null,
  });
}

export async function removeOrderItem(itemId: string) {
  const supabase = createClient();

  // Hay que saber a qué pedido pertenecía antes de borrarla: quitar una
  // línea también puede quitar una promoción (la bonificación que dependía
  // de ella, o el par del descuento condicionado).
  const { data: item, error: itemError } = await supabase
    .from("order_items")
    .select("order_id")
    .eq("id", itemId)
    .maybeSingle();
  if (itemError) throw new Error(itemError.message);

  const { error } = await supabase.from("order_items").delete().eq("id", itemId);
  if (error) throw new Error(error.message);

  if (item?.order_id) await aplicarPromociones(item.order_id);
}

export async function updatePaymentTerms(
  orderId: string,
  paymentTermsId: number,
  actor: string,
  diasCreditoSolicitados: number | null = null,
) {
  const supabase = createClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("estado, payment_terms_id, dias_credito_solicitados")
    .eq("id", orderId)
    .single();
  if (orderError) throw new Error(orderError.message);
  if (!canEditPaymentTerms(order.estado as never)) {
    throw new Error("La condición de pago solo se puede editar mientras el pedido está en borrador.");
  }

  // Los días se escriben SIEMPRE junto con la condición, y volver a una
  // condición estándar los limpia en el mismo update: dejarlos colgados
  // haría que el pedido dijera "Contado" y arrastrara 15 días fantasma
  // (el trigger de la base rechaza justamente esa combinación).
  const { error } = await supabase
    .from("orders")
    .update({ payment_terms_id: paymentTermsId, dias_credito_solicitados: diasCreditoSolicitados })
    .eq("id", orderId);
  if (error) throw new Error(error.message);

  await logAudit({
    actor,
    accion: "cambiar_condicion_pago",
    entidad: "orders",
    entidadId: orderId,
    datosAntes: {
      payment_terms_id: order.payment_terms_id,
      dias_credito_solicitados: order.dias_credito_solicitados,
    },
    datosDespues: {
      payment_terms_id: paymentTermsId,
      dias_credito_solicitados: diasCreditoSolicitados,
    },
  });
}

export type SubmitOrderResult = {
  estadoResultado: string;
  priceDrift: Array<{ orderItemId: string; precioAnterior: number; precioNuevo: number }>;
  /** Desenlace de la notificación por correo. Informativo: nunca bloquea el envío. */
  notificacion: NotifyResult;
};

export async function submitOrder(orderId: string, actor: string): Promise<SubmitOrderResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("submit_order", { p_order_id: orderId, p_motivo: "Envío de pedido" });
  if (error) throw new Error(error.message);

  await logAudit({
    actor,
    accion: "enviar_pedido",
    entidad: "orders",
    entidadId: orderId,
    datosDespues: data,
  });

  // Notificación por correo a la lista de destinatarios. Va DESPUÉS del
  // RPC y de la auditoría, y no lanza nunca: el pedido ya quedó SUBMITTED y
  // un proveedor de correo caído no puede revertirlo ni mostrarle un error
  // al vendedor. El desenlace queda en pedidos.notification_logs para
  // reintentar a mano.
  //
  // Las solicitudes de descuento se piden en borrador, así que el pedido
  // "entra a excepción comercial" exactamente acá: en ese caso el aviso es
  // el de descuento por aprobar, no el de pedido enviado, para que el
  // aprobador no tenga que deducirlo del cuerpo.
  const notificacion =
    data.estadoResultado === "COMMERCIAL_EXCEPTION"
      ? await notifyDiscountRequested(orderId, data.estadoResultado, actor)
      : await notifyOrderSubmitted(orderId, data.estadoResultado, actor);

  return {
    estadoResultado: data.estadoResultado,
    priceDrift: data.priceDrift ?? [],
    notificacion,
  };
}

/**
 * Edición del encabezado de un pedido en borrador.
 *
 * El vendedor tiene que poder corregir cliente, dirección o condición de
 * pago DESPUÉS de haber cargado líneas, sin perder ese trabajo. Ninguna de
 * estas funciones toca `order_items`.
 *
 * La condición de pago ya tiene su propia función (`updateOrderPaymentTerms`).
 * Acá van las otras dos.
 */

/** Cambiar la dirección de entrega no afecta precios: es libre. */
export async function updateOrderAddress(input: {
  orderId: string;
  customerAddressId: string;
  actor: string;
}): Promise<void> {
  const supabase = createClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, estado, customer_id")
    .eq("id", input.orderId)
    .maybeSingle();
  if (orderError) throw new Error(orderError.message);
  if (!order) throw new Error("El pedido no existe o no es visible.");
  if (order.estado !== "DRAFT") {
    throw new Error("Solo se puede cambiar la dirección mientras el pedido está en borrador.");
  }

  // La dirección tiene que ser del mismo cliente y estar activa: si no, se
  // podría apuntar el despacho a la dirección de otro.
  const { data: address, error: addressError } = await supabase
    .from("customer_addresses")
    .select("id")
    .eq("id", input.customerAddressId)
    .eq("customer_id", order.customer_id)
    .eq("estado", "activo")
    .maybeSingle();
  if (addressError) throw new Error(addressError.message);
  if (!address) throw new Error("Esa dirección no pertenece al cliente del pedido o no está activa.");

  const { error } = await supabase
    .from("orders")
    .update({ customer_address_id: input.customerAddressId })
    .eq("id", input.orderId);
  if (error) throw new Error(error.message);

  await logAudit({
    actor: input.actor,
    accion: "cambiar_direccion_pedido",
    entidad: "orders",
    entidadId: input.orderId,
    datosDespues: { customer_address_id: input.customerAddressId },
  });
}

/**
 * Precio vigente de un producto para el canal de un cliente, o null si ese
 * canal no lo tiene. Misma resolución que usa `addOrderItem`: producto +
 * canal + `vigente_hasta is null`.
 */
async function resolvePreciosParaCliente(
  customerId: string,
  productIds: string[],
): Promise<Map<string, number | null>> {
  const supabase = createClient();
  const precios = new Map<string, number | null>();
  if (productIds.length === 0) return precios;

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("canal_id")
    .eq("id", customerId)
    .maybeSingle();
  if (customerError) throw new Error(customerError.message);
  if (!customer) throw new Error("El cliente no existe o no es visible para ti.");

  // Sin canal no hay lista de precios posible: todo queda sin precio, que
  // es justamente lo que el bloqueo tiene que reportar.
  if (!customer.canal_id) {
    for (const id of productIds) precios.set(id, null);
    return precios;
  }

  const { data, error } = await supabase
    .from("price_list_items")
    .select("product_id, precio")
    .eq("sales_channel_id", customer.canal_id)
    .is("vigente_hasta", null)
    .in("product_id", productIds);
  if (error) throw new Error(error.message);

  for (const id of productIds) precios.set(id, null);
  for (const row of (data ?? []) as Array<{ product_id: string; precio: number }>) {
    precios.set(row.product_id, row.precio);
  }
  return precios;
}

export type CambioClienteResult =
  | { ok: true }
  | { ok: false; conflictos: ConflictoDePrecio[] };

/**
 * Cambia el cliente de un borrador **solo si ninguna línea cambia de
 * precio** — decisión de negocio tomada con el usuario. El precio se
 * resuelve por el canal del cliente, así que un cliente de otro canal
 * dejaría el pedido con precios que no le corresponden.
 *
 * No borra ni reprecia líneas: o el cambio es inocuo y se aplica, o se
 * rechaza con el detalle de qué producto lo impide.
 */
export async function changeOrderCustomer(input: {
  orderId: string;
  customerId: string;
  customerAddressId: string;
  actor: string;
}): Promise<CambioClienteResult> {
  const supabase = createClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, estado, customer_id")
    .eq("id", input.orderId)
    .maybeSingle();
  if (orderError) throw new Error(orderError.message);
  if (!order) throw new Error("El pedido no existe o no es visible.");
  if (order.estado !== "DRAFT") {
    throw new Error("Solo se puede cambiar el cliente mientras el pedido está en borrador.");
  }

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("id, product_id, precio_unitario, product:products(descripcion, codigo_interno)")
    .eq("order_id", input.orderId);
  if (itemsError) throw new Error(itemsError.message);

  const lineas = (items ?? []) as unknown as Array<{
    id: string;
    product_id: string;
    precio_unitario: number;
    product: { descripcion: string; codigo_interno: string } | null;
  }>;

  const precios = await resolvePreciosParaCliente(
    input.customerId,
    lineas.map((l) => l.product_id),
  );

  const evaluacion = evaluarCambioDeCliente(
    lineas.map((l) => ({
      itemId: l.id,
      codigo: l.product?.codigo_interno ?? "—",
      descripcion: l.product?.descripcion ?? "—",
      precioActual: l.precio_unitario,
      precioConNuevoCliente: precios.get(l.product_id) ?? null,
    })),
  );

  if (!evaluacion.permitido) return { ok: false, conflictos: evaluacion.conflictos };

  // La dirección tiene que ser del cliente NUEVO y estar activa.
  const { data: address, error: addressError } = await supabase
    .from("customer_addresses")
    .select("id")
    .eq("id", input.customerAddressId)
    .eq("customer_id", input.customerId)
    .eq("estado", "activo")
    .maybeSingle();
  if (addressError) throw new Error(addressError.message);
  if (!address) throw new Error(MENSAJE_SIN_DIRECCION);

  const { error } = await supabase
    .from("orders")
    .update({ customer_id: input.customerId, customer_address_id: input.customerAddressId })
    .eq("id", input.orderId);
  if (error) throw new Error(error.message);

  await logAudit({
    actor: input.actor,
    accion: "cambiar_cliente_pedido",
    entidad: "orders",
    entidadId: input.orderId,
    datosAntes: { customer_id: order.customer_id },
    datosDespues: {
      customer_id: input.customerId,
      customer_address_id: input.customerAddressId,
    },
  });

  return { ok: true };
}

/**
 * Cambiar la cantidad de una línea ya cargada.
 *
 * Corregir un "10" que debía ser "12" es la corrección más frecuente del
 * vendedor, y hacerla con quitar + volver a agregar le cuesta buscar el
 * producto de nuevo, parado y con el cliente esperando.
 *
 * Recalcula con el precio YA GRABADO en la línea, no con el vigente: subir
 * la cantidad no es el momento de repreciar en silencio. La deriva de
 * precios se resuelve donde siempre, al enviar (`submitOrder`), que la
 * detecta y la informa.
 */
export async function updateOrderItemQuantity(input: {
  orderId: string;
  itemId: string;
  cantidad: number;
  actor: string;
}): Promise<void> {
  if (!Number.isInteger(input.cantidad) || input.cantidad < 1) {
    throw new Error("La cantidad tiene que ser un número entero de 1 o más.");
  }

  const supabase = createClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("estado")
    .eq("id", input.orderId)
    .maybeSingle();
  if (orderError) throw new Error(orderError.message);
  if (!order) throw new Error("El pedido no existe o no es visible.");
  if (order.estado !== "DRAFT") {
    throw new Error("Solo se pueden cambiar cantidades mientras el pedido está en borrador.");
  }

  const { data: item, error: itemError } = await supabase
    .from("order_items")
    .select("id, cantidad, precio_unitario, afectacion_tributaria, tasa_igv")
    .eq("id", input.itemId)
    .eq("order_id", input.orderId)
    .maybeSingle();
  if (itemError) throw new Error(itemError.message);
  if (!item) throw new Error("Esa línea no pertenece a este pedido.");

  const line = calculateLineItem({
    cantidad: input.cantidad,
    precioVigente: item.precio_unitario,
    afectacionTributaria: item.afectacion_tributaria as "GRAVADO" | "INAFECTO",
    tasaAplicable: item.tasa_igv,
  });
  if (!line.ok) throw new Error("No se pudo recalcular la línea con esa cantidad.");

  const { error } = await supabase
    .from("order_items")
    .update({
      cantidad: input.cantidad,
      subtotal: line.subtotal,
      igv: line.igv,
      total: line.total,
    })
    .eq("id", input.itemId);
  if (error) throw new Error(error.message);

  // La cantidad es lo que decide si se alcanza el umbral de una escala y
  // cuántas unidades se bonifican.
  await aplicarPromociones(input.orderId);

  await logAudit({
    actor: input.actor,
    accion: "cambiar_cantidad_linea",
    entidad: "order_items",
    entidadId: input.itemId,
    datosAntes: { cantidad: item.cantidad },
    datosDespues: { cantidad: input.cantidad },
  });
}
