"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { resolveCustomerValidation } from "@/services/customers";
import { resolveAdministrativeException, addOrderObservation } from "@/services/order-exceptions";

export async function aprobarCliente(customerId: string) {
  const userId = await requireUserId();
  await resolveCustomerValidation(customerId, "ACTIVO", userId);
  revalidatePath("/control-pedidos/validacion-clientes");
}

export async function rechazarCliente(customerId: string) {
  const userId = await requireUserId();
  await resolveCustomerValidation(customerId, "RECHAZADO", userId);
  revalidatePath("/control-pedidos/validacion-clientes");
}

export async function aprobarExcepcionAdministrativa(orderId: string) {
  const userId = await requireUserId();
  await resolveAdministrativeException({ orderId, decision: "APROBAR", motivo: "Excepción administrativa aprobada", actor: userId });
  revalidatePath("/control-pedidos/validacion-clientes");
}

export async function devolverPedido(orderId: string, motivo: string) {
  const userId = await requireUserId();
  await resolveAdministrativeException({ orderId, decision: "DEVOLVER", motivo, actor: userId });
  revalidatePath("/control-pedidos/validacion-clientes");
}

export async function observarPedido(orderId: string, comentario: string) {
  const userId = await requireUserId();
  await addOrderObservation({ orderId, comentario, contexto: "ADMINISTRATIVE_EXCEPTION", actor: userId });
  revalidatePath("/control-pedidos/validacion-clientes");
}
