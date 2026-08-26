"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { createCatalogItem, toggleCatalogItemEstado } from "@/services/catalog";

export async function crearProveedor(formData: FormData) {
  const userId = await requireUserId();
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) throw new Error("Nombre requerido");
  await createCatalogItem("suppliers", { nombre }, userId);
  revalidatePath("/admin/maestros/proveedores");
}

export async function cambiarEstadoProveedor(id: number, estado: "activo" | "inactivo") {
  const userId = await requireUserId();
  await toggleCatalogItemEstado("suppliers", id, estado, userId);
  revalidatePath("/admin/maestros/proveedores");
}
