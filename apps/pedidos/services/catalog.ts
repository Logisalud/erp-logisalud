import "server-only";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "./audit-log";

export type CatalogTable =
  | "sales_channels"
  | "suppliers"
  | "zones"
  | "payment_terms"
  // Catálogos de despacho (Fase Stock y Operaciones). Comparten la forma
  // (id, nombre, descripcion, estado), así que reusan este servicio.
  // inventory_sources NO está acá: tiene `tipo` y vive en services/inventory.ts.
  | "warehouses"
  | "vehicles"
  | "drivers"
  | "transporters";

export type CatalogItem = {
  id: number;
  nombre: string;
  descripcion?: string | null;
  estado: string;
};

export async function listCatalog(table: CatalogTable): Promise<CatalogItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from(table).select("*").order("nombre");
  if (error) throw new Error(error.message);
  return data as CatalogItem[];
}

export type PaymentTermItem = CatalogItem & { permite_dias_libres: boolean };

/**
 * Condiciones de pago con la marca de entrada libre.
 *
 * Va aparte de `listCatalog` porque la pantalla del pedido necesita saber
 * cuál es la opción de días a mano: sin ese dato no puede pedir el número
 * y el pedido se guardaría sin el plazo real.
 */
export async function listPaymentTerms(): Promise<PaymentTermItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("payment_terms")
    .select("id, nombre, descripcion, estado, permite_dias_libres")
    .eq("estado", "activo")
    // La opción de entrada libre va al final: es la excepción, no la
    // primera cosa que el vendedor debería considerar.
    .order("permite_dias_libres")
    .order("id");
  if (error) throw new Error(error.message);
  return data as PaymentTermItem[];
}

export async function createCatalogItem(
  table: CatalogTable,
  payload: { nombre: string; descripcion?: string },
  actor: string,
): Promise<CatalogItem> {
  const supabase = createClient();
  const { data, error } = await supabase.from(table).insert(payload).select().single();
  if (error) throw new Error(error.message);

  await logAudit({
    actor,
    accion: "crear",
    entidad: table,
    entidadId: String((data as CatalogItem).id),
    datosDespues: data,
  });

  return data as CatalogItem;
}

export async function toggleCatalogItemEstado(
  table: CatalogTable,
  id: number,
  estado: "activo" | "inactivo",
  actor: string,
): Promise<CatalogItem> {
  const supabase = createClient();

  const { data: before } = await supabase.from(table).select("*").eq("id", id).single();

  const { data, error } = await supabase
    .from(table)
    .update({ estado })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  await logAudit({
    actor,
    accion: "cambiar_estado",
    entidad: table,
    entidadId: String(id),
    datosAntes: before,
    datosDespues: data,
  });

  return data as CatalogItem;
}
