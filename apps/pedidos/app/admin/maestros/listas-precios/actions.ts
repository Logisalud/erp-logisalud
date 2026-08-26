"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import {
  previewPriceListImport,
  publishPriceListImport,
  type ImportPreview,
  type PublishResult,
} from "@/services/price-lists";

function extractFileAndSupplier(formData: FormData): { file: File; supplierId: number } {
  const file = formData.get("file");
  const supplierId = Number(formData.get("supplierId"));
  if (!(file instanceof File) || file.size === 0) throw new Error("Selecciona un archivo Excel.");
  if (!supplierId) throw new Error("Selecciona un proveedor.");
  return { file, supplierId };
}

export async function previewImport(formData: FormData): Promise<ImportPreview> {
  await requireUserId();
  const { file, supplierId } = extractFileAndSupplier(formData);
  return previewPriceListImport(file, supplierId);
}

export async function publishImport(formData: FormData): Promise<PublishResult> {
  const userId = await requireUserId();
  const { file, supplierId } = extractFileAndSupplier(formData);
  const result = await publishPriceListImport(file, supplierId, userId);
  revalidatePath("/admin/maestros/listas-precios");
  return result;
}
