"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { createProductWithTaxProfile, toggleProductEstado } from "@/services/products";

export async function crearProducto(formData: FormData) {
  const userId = await requireUserId();

  const codigoInterno = String(formData.get("codigoInterno") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim();
  const unidadMedida = String(formData.get("unidadMedida") ?? "UND").trim() || "UND";
  const afectacionTributaria = String(formData.get("afectacionTributaria") ?? "GRAVADO") as
    | "GRAVADO"
    | "INAFECTO";
  const tasaAplicable = Number(formData.get("tasaAplicable") ?? 0);
  const supplierIdRaw = formData.get("supplierId");

  if (!codigoInterno || !descripcion) {
    throw new Error("Código interno y descripción son requeridos");
  }

  await createProductWithTaxProfile(
    {
      codigoInterno,
      codigoProveedor: String(formData.get("codigoProveedor") ?? "").trim() || undefined,
      descripcion,
      presentacion: String(formData.get("presentacion") ?? "").trim() || undefined,
      supplierId: supplierIdRaw ? Number(supplierIdRaw) : undefined,
      marca: String(formData.get("marca") ?? "").trim() || undefined,
      unidadMedida,
      controlaLote: formData.get("controlaLote") === "on",
      controlaVencimiento: formData.get("controlaVencimiento") === "on",
      afectacionTributaria,
      tasaAplicable,
    },
    userId,
  );

  revalidatePath("/admin/maestros/productos");
}

export async function cambiarEstadoProducto(id: string, estado: "activo" | "inactivo") {
  const userId = await requireUserId();
  await toggleProductEstado(id, estado, userId);
  revalidatePath("/admin/maestros/productos");
}
