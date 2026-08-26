"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { confirmDispatch, getStockForOrder } from "@/services/fulfillments";
import { validarLineasPreparadas, validarTransporte, type LineaPreparada } from "@/domain/fulfillment";

/** Stock registrado de la fuente elegida, para mostrarlo al lado de cada línea. */
export async function stockDeLaFuente(orderId: string, inventorySourceId: number) {
  await requireUserId();
  if (!inventorySourceId) return {};
  return getStockForOrder(orderId, inventorySourceId);
}

export async function confirmarDespacho(input: {
  orderId: string;
  inventorySourceId: number;
  warehouseId: number;
  vehicleId: number | null;
  driverId: number | null;
  transporterId: number | null;
  lineas: LineaPreparada[];
  motivo: string | null;
}) {
  const userId = await requireUserId();

  if (!input.inventorySourceId) throw new Error("Elige la fuente de stock.");
  if (!input.warehouseId) throw new Error("Elige el almacén.");

  const errorTransporte = validarTransporte({
    vehicleId: input.vehicleId,
    driverId: input.driverId,
    transporterId: input.transporterId,
  });
  if (errorTransporte) throw new Error(errorTransporte);

  // Validación optimista para dar el error completo de una sola pasada.
  // La autoridad sigue siendo pedidos.confirm_dispatch en el servidor.
  const issues = validarLineasPreparadas(input.lineas);
  if (issues.length > 0) {
    throw new Error(issues.map((i) => `${i.codigo}: ${i.mensaje}`).join("\n"));
  }

  const result = await confirmDispatch(input, userId);

  revalidatePath("/operaciones");
  revalidatePath(`/operaciones/${input.orderId}`);
  revalidatePath(`/pedidos/${input.orderId}`);
  return result;
}
