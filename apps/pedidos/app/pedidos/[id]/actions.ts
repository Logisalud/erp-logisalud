"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, requireUserId } from "@/lib/auth/session";
import {
  addOrderItem,
  changeOrderCustomer,
  marcarBonificacionManual,
  quitarBonificacionManual,
  removeOrderItem,
  setItemSpecialPriceAsAdmin,
  submitOrder,
  updateOrderAddress,
  updateOrderItemQuantity,
  updatePaymentTerms,
} from "@/services/orders";
import { listCustomerAddresses, searchActiveCustomers } from "@/services/customers";
import { mensajeCambioBloqueado } from "@/domain/order-header";
import { createApprovalRequest } from "@/services/approvals";
import { addOrderObservation } from "@/services/order-exceptions";
import { listPaymentTerms } from "@/services/catalog";
import { validarCondicionDePago } from "@/domain/payment-terms";

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
  // Se revalida contra el catálogo real: si la condición es la de días
  // libres, el número es obligatorio, y con cualquier otra no puede venir.
  const condicion = validarCondicionDePago(await listPaymentTerms(), {
    paymentTermsId: paymentTermsId || "",
    diasCredito: String(formData.get("diasCredito") ?? ""),
  });
  if (!condicion.ok) throw new Error(condicion.mensaje);
  await updatePaymentTerms(
    orderId,
    condicion.paymentTermsId,
    userId,
    condicion.diasCreditoSolicitados,
  );
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

/**
 * Precio especial fijado por el administrador, sin solicitud de aprobación.
 *
 * El rol se verifica dos veces a propósito: acá, para poder devolver un
 * mensaje entendible, y en la base con `pedidos.is_admin()` dentro del RPC,
 * que es la que de verdad manda. Un vendedor que llame a esta Server Action
 * a mano no pasa de la primera.
 */
export async function fijarPrecioEspecial(orderId: string, itemId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error("No autenticado");
  if (!user.roles.includes("administrador")) {
    throw new Error("Solo un administrador puede fijar un precio sin aprobación comercial.");
  }

  const precio = Number(formData.get("precio"));
  if (!Number.isFinite(precio) || precio <= 0) {
    throw new Error("Escribe el precio unitario que quieres fijar.");
  }

  const resultado = await setItemSpecialPriceAsAdmin({
    orderId,
    itemId,
    precio,
    motivo: String(formData.get("motivo") ?? "").trim() || null,
    actor: user.userId,
  });

  revalidatePath(`/pedidos/${orderId}`);
  return resultado;
}

/**
 * Marca unidades como bonificación manual (S/ 0.00) sin que exista ninguna
 * promoción configurada.
 *
 * No exige rol: lo puede pedir el vendedor y lo puede aplicar el
 * administrador, y la diferencia la hace el envío del pedido —al vendedor
 * le abre una solicitud de aprobación, al administrador no—. Quién es
 * quién lo verifica la base, no esta capa.
 */
export async function marcarComoBonificacion(
  orderId: string,
  itemId: string,
  formData: FormData,
) {
  const userId = await requireUserId();

  const cantidad = Number(formData.get("cantidad"));
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (!Number.isInteger(cantidad) || cantidad < 1) {
    throw new Error("Escribí cuántas unidades van bonificadas.");
  }
  if (!motivo) {
    throw new Error("Escribí el motivo de la bonificación: es lo que va a revisar el aprobador.");
  }

  const resultado = await marcarBonificacionManual({
    orderId,
    itemId,
    cantidad,
    motivo,
    actor: userId,
  });

  revalidatePath(`/pedidos/${orderId}`);
  return resultado;
}

export async function quitarBonificacion(orderId: string, itemId: string) {
  const userId = await requireUserId();
  await quitarBonificacionManual({ itemId, actor: userId });
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
  if (!customerAddressId) throw new Error("Elige una dirección de entrega.");
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
  if (!customerId) throw new Error("Elige un cliente.");
  if (!customerAddressId) throw new Error("Elige una dirección de entrega.");

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
