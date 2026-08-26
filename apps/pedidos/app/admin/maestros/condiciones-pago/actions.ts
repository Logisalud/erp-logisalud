"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { createCatalogItem, toggleCatalogItemEstado } from "@/services/catalog";

export async function crearCondicionPago(formData: FormData) {
  const userId = await requireUserId();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim();
  if (!nombre) throw new Error("Nombre requerido");
  await createCatalogItem("payment_terms", { nombre, descripcion: descripcion || undefined }, userId);
  revalidatePath("/admin/maestros/condiciones-pago");
}

export async function cambiarEstadoCondicionPago(id: number, estado: "activo" | "inactivo") {
  const userId = await requireUserId();
  await toggleCatalogItemEstado("payment_terms", id, estado, userId);
  revalidatePath("/admin/maestros/condiciones-pago");
}
