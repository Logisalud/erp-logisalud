import "server-only";
import { createClient } from "@/lib/supabase/server";

export type SellerOption = {
  id: string;
  codigo_representante: string;
  nombre_completo: string;
  zone: { nombre: string } | null;
};

export async function listActiveSellers(): Promise<SellerOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sellers")
    .select("id, codigo_representante, nombre_completo, zone:zones(nombre)")
    .eq("estado", "activo")
    .order("nombre_completo");

  if (error) throw new Error(error.message);
  return data as unknown as SellerOption[];
}
