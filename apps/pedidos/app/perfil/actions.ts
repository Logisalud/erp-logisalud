"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";

export type ChangePasswordResult = { ok: boolean; message: string };

export async function changePassword(formData: FormData): Promise<ChangePasswordResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !currentUser.email) {
    return { ok: false, message: "No autenticado." };
  }

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword || !newPassword) {
    return { ok: false, message: "Completa todos los campos." };
  }
  if (newPassword.length < 8) {
    return { ok: false, message: "La contraseña nueva debe tener al menos 8 caracteres." };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, message: "La confirmación no coincide con la contraseña nueva." };
  }

  const supabase = createClient();

  // Verifica la contraseña actual re-autenticando antes de permitir el
  // cambio — evita que alguien con la sesión abierta (pero sin la
  // contraseña) pueda cambiarla.
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: currentUser.email,
    password: currentPassword,
  });
  if (verifyError) {
    return { ok: false, message: "La contraseña actual no es correcta." };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) {
    return { ok: false, message: `No se pudo cambiar la contraseña: ${updateError.message}` };
  }

  return { ok: true, message: "Contraseña actualizada correctamente." };
}
