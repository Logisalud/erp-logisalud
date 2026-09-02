"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import {
  previewStockImport,
  publishStockImport,
  type StockImportPreview,
  type StockImportResult,
} from "@/services/stock-import";

function extraerArchivo(formData: FormData): File {
  const file = formData.get("archivo");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Elegí un archivo CSV o Excel con el stock.");
  }
  return file;
}

export async function previewImport(formData: FormData): Promise<StockImportPreview> {
  await requireUserId();
  return previewStockImport(extraerArchivo(formData));
}

export async function publishImport(formData: FormData): Promise<StockImportResult> {
  const userId = await requireUserId();
  const result = await publishStockImport(extraerArchivo(formData), userId);
  revalidatePath("/admin/maestros/stock");
  return result;
}
