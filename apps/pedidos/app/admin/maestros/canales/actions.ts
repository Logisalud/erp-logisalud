"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { createCatalogItem, toggleCatalogItemEstado } from "@/services/catalog";

export async function crearCanal(formData: FormData) {
  const userId = await requireUserId();
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) throw new Error("Nombre requerido");
  await createCatalogItem("sales_channels", { nombre }, userId);
  revalidatePath("/admin/maestros/canales");
}

export async function cambiarEstadoCanal(id: number, estado: "activo" | "inactivo") {
  const userId = await requireUserId();
  await toggleCatalogItemEstado("sales_channels", id, estado, userId);
  revalidatePath("/admin/maestros/canales");
}
