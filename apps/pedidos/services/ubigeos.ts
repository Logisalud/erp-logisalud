import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * El catálogo de ubigeos, para el selector en cascada de las pantallas de
 * dirección.
 *
 * Se sirve por niveles y no de una sola vez: son 1.884 distritos, y el
 * vendedor —que trabaja desde el celular— sólo necesita la lista de
 * provincias cuando ya eligió su departamento. Los 25 departamentos viajan
 * con la página; el resto se pide cuando hace falta.
 *
 * El código nunca llega al navegador ni se escribe a mano: la pantalla
 * manda los tres nombres y el servidor resuelve el ubigeo.
 */

export async function listDepartamentos(): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ubigeos")
    .select("departamento")
    .order("departamento");
  if (error) throw new Error(error.message);

  // PostgREST no hace DISTINCT; con 1.884 filas y 25 departamentos sale
  // más barato deduplicar acá que agregar una vista para esto.
  return Array.from(new Set((data ?? []).map((f) => f.departamento as string)));
}

export async function listProvincias(departamento: string): Promise<string[]> {
  if (!departamento.trim()) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ubigeos")
    .select("provincia")
    .eq("departamento", departamento)
    .order("provincia");
  if (error) throw new Error(error.message);
  return Array.from(new Set((data ?? []).map((f) => f.provincia as string)));
}

export async function listDistritos(
  departamento: string,
  provincia: string,
): Promise<string[]> {
  if (!departamento.trim() || !provincia.trim()) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ubigeos")
    .select("distrito")
    .eq("departamento", departamento)
    .eq("provincia", provincia)
    .order("distrito");
  if (error) throw new Error(error.message);
  return (data ?? []).map((f) => f.distrito as string);
}

/**
 * El código INEI de esos tres nombres, o null si no cruzan.
 *
 * Usa la misma función SQL que resolvió la carga masiva
 * (`pedidos.resolver_ubigeo`), así que la pantalla y la migración no
 * pueden divergir. Null no se corrige a ojo: un ubigeo equivocado en una
 * guía de remisión es un problema con SUNAT, no un dato feo.
 */
export async function resolverUbigeo(
  departamento: string | null | undefined,
  provincia: string | null | undefined,
  distrito: string | null | undefined,
): Promise<string | null> {
  if (!departamento?.trim() || !provincia?.trim() || !distrito?.trim()) return null;

  const supabase = createClient();
  const { data, error } = await supabase.rpc("resolver_ubigeo", {
    p_departamento: departamento,
    p_provincia: provincia,
    p_distrito: distrito,
  });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}
