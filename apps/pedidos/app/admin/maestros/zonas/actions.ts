"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { createCatalogItem, toggleCatalogItemEstado } from "@/services/catalog";

export async function crearZona(formData: FormData) {
  const userId = await requireUserId();
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) throw new Error("Nombre requerido");
  await createCatalogItem("zones", { nombre }, userId);
  revalidatePath("/admin/maestros/zonas");
}

export async function cambiarEstadoZona(id: number, estado: "activo" | "inactivo") {
  const userId = await requireUserId();
  await toggleCatalogItemEstado("zones", id, estado, userId);
  revalidatePath("/admin/maestros/zonas");
}
