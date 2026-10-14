"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import {
  previewAvance,
  publicarAvance,
  type PreviewAvance,
  type ResultadoAvance,
} from "@/services/avance";

function extraerArchivo(formData: FormData): File {
  const file = formData.get("archivo");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Elegí el Excel del avance de ventas.");
  }
  return file;
}

export async function previewCarga(formData: FormData): Promise<PreviewAvance> {
  await requireUserId();
  return previewAvance(extraerArchivo(formData));
}

export async function publicarCarga(formData: FormData): Promise<ResultadoAvance> {
  const userId = await requireUserId();
  const resultado = await publicarAvance(extraerArchivo(formData), userId);
  revalidatePath("/admin/avance");
  revalidatePath("/avance");
  return resultado;
}
