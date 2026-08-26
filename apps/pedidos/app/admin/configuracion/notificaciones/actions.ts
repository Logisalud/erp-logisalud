"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import {
  addNotificationRecipient,
  updateNotificationRecipient,
} from "@/services/order-notifications";

const RUTA = "/admin/configuracion/notificaciones";

export async function agregarDestinatario(formData: FormData) {
  const userId = await requireUserId();
  const email = String(formData.get("email") ?? "").trim();
  const nombreReferencial = String(formData.get("nombreReferencial") ?? "").trim();

  if (!email) throw new Error("El correo es requerido.");

  await addNotificationRecipient({ email, nombreReferencial: nombreReferencial || null }, userId);
  revalidatePath(RUTA);
}

export async function editarDestinatario(id: string, formData: FormData) {
  const userId = await requireUserId();
  const email = String(formData.get("email") ?? "").trim();
  const nombreReferencial = String(formData.get("nombreReferencial") ?? "").trim();

  if (!email) throw new Error("El correo es requerido.");

  await updateNotificationRecipient(id, { email, nombreReferencial: nombreReferencial || null }, userId);
  revalidatePath(RUTA);
}

export async function cambiarEstadoDestinatario(id: string, activo: boolean) {
  const userId = await requireUserId();
  await updateNotificationRecipient(id, { activo }, userId);
  revalidatePath(RUTA);
}
