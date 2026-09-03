"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import {
  previewPromoImport,
  publishPromoImport,
  type PromoImportPreview,
  type PromoImportResult,
} from "@/services/promo-import";

function extraerArchivo(formData: FormData): File {
  const file = formData.get("archivo");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Elegí el archivo de promociones de Diphasac (CSV o Excel).");
  }
  return file;
}

export async function previewImport(formData: FormData): Promise<PromoImportPreview> {
  await requireUserId();
  return previewPromoImport(extraerArchivo(formData));
}

export async function publishImport(formData: FormData): Promise<PromoImportResult> {
  const userId = await requireUserId();
  const result = await publishPromoImport(extraerArchivo(formData), userId);
  revalidatePath("/admin/maestros/promociones");
  return result;
}
