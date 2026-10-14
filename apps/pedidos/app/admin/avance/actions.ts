"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUserId } from "@/lib/auth/session";
import {
  agregarDetalle,
  contextoDeCarga,
  crearCarga,
  descartarCarga,
  finalizarCarga,
  type CabeceraCarga,
  type ContextoDeCarga,
} from "@/services/avance";
import type { FilaAvance, FilaDetalle, ResumenCarga } from "@/domain/avance-import";

/**
 * La carga del avance, en tandas.
 *
 * El Excel lo abre el navegador (ver services/avance.ts): acá llegan ya
 * las dos hojas convertidas en filas. Cada acción vuelve a exigir el rol
 * de administrador — no alcanza con que la pantalla que las muestra lo
 * haya pedido, porque una Server Action es una URL y se la puede llamar
 * desde cualquier lado.
 */

export async function leerContexto(periodo: string | null): Promise<ContextoDeCarga> {
  await requireRole(["administrador"]);
  return contextoDeCarga(periodo);
}

export async function abrirCarga(cabecera: CabeceraCarga, filas: FilaAvance[]): Promise<string> {
  const userId = await requireUserId();
  await requireRole(["administrador"]);
  return crearCarga(cabecera, filas, userId);
}

export async function subirTandaDeDetalle(cargaId: string, filas: FilaDetalle[]): Promise<number> {
  await requireRole(["administrador"]);
  return agregarDetalle(cargaId, filas);
}

export async function publicarCarga(cargaId: string, resumen: ResumenCarga): Promise<void> {
  const userId = await requireUserId();
  await requireRole(["administrador"]);
  await finalizarCarga(cargaId, userId, resumen);
  revalidatePath("/admin/avance");
  revalidatePath("/avance");
}

export async function abandonarCarga(cargaId: string): Promise<void> {
  await requireRole(["administrador"]);
  await descartarCarga(cargaId);
}
