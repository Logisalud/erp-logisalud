import "server-only";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "./audit-log";

/**
 * inventory_sources no usa services/catalog.ts porque tiene `tipo`
 * (central/regional), que es una distinción de negocio real: el stock de
 * una fuente no se mezcla con el de otra, y el tipo es lo que le dice a
 * Operaciones qué está eligiendo.
 */

export type InventorySource = {
  id: number;
  nombre: string;
  tipo: "central" | "regional";
  estado: string;
};

export async function listInventorySources(): Promise<InventorySource[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("inventory_sources")
    .select("id, nombre, tipo, estado")
    .order("nombre");

  if (error) throw new Error(error.message);
  return data as unknown as InventorySource[];
}

export async function createInventorySource(
  input: { nombre: string; tipo: "central" | "regional" },
  actor: string,
): Promise<InventorySource> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("inventory_sources")
    .insert({ nombre: input.nombre.trim(), tipo: input.tipo })
    .select("id, nombre, tipo, estado")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("Ya existe una fuente de stock con ese nombre.");
    throw new Error(error.message);
  }

  await logAudit({
    actor,
    accion: "crear",
    entidad: "inventory_sources",
    entidadId: String((data as InventorySource).id),
    datosDespues: data,
  });

  return data as unknown as InventorySource;
}

export async function toggleInventorySourceEstado(
  id: number,
  estado: "activo" | "inactivo",
  actor: string,
): Promise<void> {
  const supabase = createClient();

  const { data: before } = await supabase
    .from("inventory_sources")
    .select("estado")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("inventory_sources").update({ estado }).eq("id", id);
  if (error) throw new Error(error.message);

  await logAudit({
    actor,
    accion: "cambiar_estado",
    entidad: "inventory_sources",
    entidadId: String(id),
    datosAntes: before,
    datosDespues: { estado },
  });
}
