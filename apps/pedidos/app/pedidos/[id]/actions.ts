"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import {
  addOrderItem,
  changeOrderCustomer,
  removeOrderItem,
  submitOrder,
  updateOrderAddress,
  updateOrderItemQuantity,
  updatePaymentTerms,
} from "@/services/orders";
import { listCustomerAddresses, searchActiveCustomers } from "@/services/customers";
import { mensajeCambioBloqueado } from "@/domain/order-header";
import { createApprovalRequest } from "@/services/approvals";
import { addOrderObservation } from "@/services/order-exceptions";

export async function agregarProducto(orderId: string, customerId: string, formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const cantidad = Number(formData.get("cantidad"));
  if (!productId) throw new Error("Selecciona un producto.");
  if (!cantidad || cantidad <= 0) throw new Error("Ingresa una cantidad válida.");

  const result = await addOrderItem({ orderId, customerId, productId, cantidad });
  if (!result.ok) {
    const messages: Record<string, string> = {
      NO_PRICE: "Este producto no tiene precio vigente para el canal del cliente.",
      NO_TAX_PROFILE: "Este producto no tiene perfil tributario vigente.",
      NO_CHANNEL: "El cliente no tiene canal de venta asignado.",
      PRODUCTO_INACTIVO:
        "Ese producto está inactivo y no se puede facturar, así que no se puede agregar al pedido.",
    };
    throw new Error(messages[result.reason]);
  }

  revalidatePath(`/pedidos/${orderId}`);
}

export async function quitarProducto(orderId: string, itemId: string) {
  await removeOrderItem(itemId);
  revalidatePath(`/pedidos/${orderId}`);
}

export async function actualizarCondicionPago(orderId: string, formData: FormData) {
  const userId = await requireUserId();
  const paymentTermsId = Number(formData.get("paymentTermsId"));
  if (!paymentTermsId) throw new Error("Selecciona una condición de pago.");
  await updatePaymentTerms(orderId, paymentTermsId, userId);
  revalidatePath(`/pedidos/${orderId}`);
}

export async function enviarPedido(orderId: string) {
  const userId = await requireUserId();
  const result = await submitOrder(orderId, userId);
  revalidatePath(`/pedidos/${orderId}`);
  return result;
}

export async function agregarObservacion(orderId: string, formData: FormData) {
  const userId = await requireUserId();
  const comentario = String(formData.get("comentario") ?? "").trim();
  if (!comentario) throw new Error("Escribe un comentario.");
  await addOrderObservation({ orderId, comentario, actor: userId });
  revalidatePath(`/pedidos/${orderId}`);
}

export async function solicitarDescuento(orderId: string, itemId: string, formData: FormData) {
  const userId = await requireUserId();
  const cantidad = Number(formData.get("cantidad"));
  const precioSolicitado = formData.get("precioSolicitado") ? Number(formData.get("precioSolicitado")) : undefined;
  const porcentajeDescuento = formData.get("porcentajeDescuento") ? Number(formData.get("porcentajeDescuento")) : undefined;
  const motivo = String(formData.get("motivo") ?? "").trim();

  if (!motivo) throw new Error("Explica el motivo de la solicitud.");
  if (!precioSolicitado && !porcentajeDescuento) throw new Error("Indica un precio solicitado o un porcentaje de descuento.");

  await createApprovalRequest({
    orderId,
    orderItemId: itemId,
    solicitadoPor: userId,
    cantidad,
    motivo,
    precioSolicitado,
    porcentajeDescuento,
    competenciaNegociacion: String(formData.get("competenciaNegociacion") ?? "").trim() || undefined,
    comentario: String(formData.get("comentario") ?? "").trim() || undefined,
  });

  revalidatePath(`/pedidos/${orderId}`);
}

/**
 * Edición del encabezado con líneas ya cargadas. Ninguna de estas acciones
 * toca `order_items`: corregir el encabezado no puede costarle al vendedor
 * el trabajo de haber cargado 15 productos.
 */

export async function buscarClientesParaPedido(query: string) {
  await requireUserId();
  return searchActiveCustomers(query);
}

export async function getDireccionesDeCliente(customerId: string) {
  await requireUserId();
  return listCustomerAddresses(customerId);
}

/** Cambiar la dirección no mueve precios: es libre. */
export async function cambiarDireccion(orderId: string, customerAddressId: string) {
  const userId = await requireUserId();
  if (!customerAddressId) throw new Error("Elegí una dirección de entrega.");
  await updateOrderAddress({ orderId, customerAddressId, actor: userId });
  revalidatePath(`/pedidos/${orderId}`);
}

/**
 * Cambiar el cliente solo se permite si ninguna línea cambia de precio
 * (ver domain/order-header.ts). Si alguna cambiaría, se devuelve el detalle
 * para mostrarlo en pantalla en vez de lanzar: el vendedor necesita ver
 * QUÉ producto lo impide, no solo que no se pudo.
 */
export async function cambiarCliente(
  orderId: string,
  customerId: string,
  customerAddressId: string,
) {
  const userId = await requireUserId();
  if (!customerId) throw new Error("Elegí un cliente.");
  if (!customerAddressId) throw new Error("Elegí una dirección de entrega.");

  const result = await changeOrderCustomer({
    orderId,
    customerId,
    customerAddressId,
    actor: userId,
  });

  if (!result.ok) {
    return { ok: false as const, mensaje: mensajeCambioBloqueado(result.conflictos), conflictos: result.conflictos };
  }

  revalidatePath(`/pedidos/${orderId}`);
  return { ok: true as const };
}

/** Corregir la cantidad de una línea sin tener que buscar el producto otra vez. */
export async function cambiarCantidad(orderId: string, itemId: string, cantidad: number) {
  const userId = await requireUserId();
  await updateOrderItemQuantity({ orderId, itemId, cantidad, actor: userId });
  revalidatePath(`/pedidos/${orderId}`);
}
