"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { guardarConfigCredito, sincronizarCredito } from "@/services/credito";
import { sincronizarContactosACobranzas } from "@/services/contactos-cobranzas";
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
    const tope = Number(formData.get("diasBloqueo"));
    if (!Number.isInteger(tope) || tope < 0) {
      throw new Error("Los días del tope tienen que ser un número entero de 0 o más.");
    }
    // El tope duro por debajo de la tolerancia dejaría al escalón de alerta
    // sin rango: todo saltaría directo a "no se puede enviar". La base tiene
    // el mismo check, pero su error no se le puede mostrar a nadie.
    if (tope < dias) {
      throw new Error(
        "El tope sin venta no puede ser menor que los días tolerados: entre los dos tiene que quedar el rango en que el pedido pasa con aviso.",
      );
    }
    await guardarConfigCredito(
      { activo: formData.get("activo") === "on", diasTolerancia: dias, diasBloqueo: tope },
      actor,
    );
    revalidatePath("/admin/credito");
    return { ok: true };
  } catch (err) {
    return falloDe(err, "No se pudo guardar la regla.");
  }
}

/**
 * El viaje de vuelta del puente, a mano.
 *
 * Existe por la misma razón que "Actualizar ahora" de la deuda: el cron
 * puede no haber corrido —al 2026-11-03 no corrió nunca— y la cartera del
 * vendedor no puede quedar esperando a que alguien destrabe una tarea
 * programada. Con botón, el dato se completa cuando hace falta.
 */
export async function completarContactosAhora(): Promise<
  ResultadoAccion<{ celulares: number; direcciones: number; ubicaciones: number }>
> {
  try {
    const actor = await requireAdminId();
    const r = await sincronizarContactosACobranzas(actor);
    revalidatePath("/admin/credito");
    return { ok: true, celulares: r.celulares, direcciones: r.direcciones, ubicaciones: r.ubicaciones };
  } catch (err) {
    return falloDe(err, "No se pudieron completar los contactos en cobranzas.");
  }
}
