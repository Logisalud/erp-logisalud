"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { guardarConfigCredito, sincronizarCredito } from "@/services/credito";
import { falloDe, type ResultadoAccion } from "@/domain/acciones";

async function requireAdminId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error("No autenticado");
  if (!user.roles.includes("administrador")) {
    throw new Error("Solo un administrador puede tocar la configuración de crédito.");
  }
  return user.userId;
}

export async function actualizarDeudaAhora(): Promise<
  ResultadoAccion<{ clientes: number; vencido: number }>
> {
  try {
    const actor = await requireAdminId();
    const { clientes, vencido } = await sincronizarCredito(actor);
    revalidatePath("/admin/credito");
    return { ok: true, clientes, vencido };
  } catch (err) {
    return falloDe(err, "No se pudo actualizar la deuda.");
  }
}

export async function guardarReglaDeCredito(formData: FormData): Promise<ResultadoAccion> {
  try {
    const actor = await requireAdminId();
    const dias = Number(formData.get("diasTolerancia"));
    if (!Number.isInteger(dias) || dias < 0) {
      throw new Error("Los días de tolerancia tienen que ser un número entero de 0 o más.");
    }
    await guardarConfigCredito({ activo: formData.get("activo") === "on", diasTolerancia: dias }, actor);
    revalidatePath("/admin/credito");
    return { ok: true };
  } catch (err) {
    return falloDe(err, "No se pudo guardar la regla.");
  }
}
