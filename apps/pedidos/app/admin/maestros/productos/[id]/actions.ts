"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { updateProductDetail, correctChannelPrice } from "@/services/products";

export async function editProduct(productId: string, formData: FormData) {
  const userId = await requireUserId();

  const descripcion = String(formData.get("descripcion") ?? "").trim();
  if (!descripcion) throw new Error("La descripción es requerida.");

  await updateProductDetail(
    productId,
    {
      descripcion,
      presentacion: String(formData.get("presentacion") ?? "").trim() || null,
      controlaLote: formData.get("controlaLote") === "on",
      controlaVencimiento: formData.get("controlaVencimiento") === "on",
    },
    userId,
  );

  revalidatePath(`/admin/maestros/productos/${productId}`);
  revalidatePath("/admin/maestros/productos");
}

export async function submitPriceCorrection(productId: string, formData: FormData) {
  const userId = await requireUserId();

  const salesChannelId = Number(formData.get("salesChannelId"));
  const precio = Number(formData.get("precio"));

  if (!salesChannelId) throw new Error("Selecciona un canal.");
  if (!precio || precio <= 0) throw new Error("Ingresa un precio válido mayor a 0.");

  await correctChannelPrice(productId, salesChannelId, precio, userId);

  revalidatePath(`/admin/maestros/productos/${productId}`);
}
