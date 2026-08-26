import "server-only";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "./audit-log";

/**
 * Datos legales del EMISOR de comprobantes y guías (singleton — una sola
 * fila, id = 1). No cambian por cliente ni por pedido, así que no viven en
 * cada documento: alimentan los campos de emisor del JSON de documentación
 * electrónica. El destinatario sale de customers.
 */

export type CompanySettings = {
  razon_social: string;
  ruc: string;
  direccion: string;
  ubigeo_codigo: string | null;
  telefono: string | null;
  email: string | null;
  updated_at: string;
};

export async function getCompanySettings(): Promise<CompanySettings | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("company_settings")
    .select("razon_social, ruc, direccion, ubigeo_codigo, telefono, email, updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as unknown as CompanySettings) ?? null;
}

export async function updateCompanySettings(
  input: {
    razonSocial: string;
    ruc: string;
    direccion: string;
    ubigeoCodigo: string | null;
    telefono: string | null;
    email: string | null;
  },
  actor: string,
): Promise<void> {
  const supabase = createClient();

  const antes = await getCompanySettings();

  const { error } = await supabase
    .from("company_settings")
    .update({
      razon_social: input.razonSocial.trim(),
      ruc: input.ruc.trim(),
      direccion: input.direccion.trim(),
      ubigeo_codigo: input.ubigeoCodigo?.trim() || null,
      telefono: input.telefono?.trim() || null,
      email: input.email?.trim() || null,
      updated_at: new Date().toISOString(),
      updated_by: actor,
    })
    .eq("id", 1);

  if (error) throw new Error(error.message);

  await logAudit({
    actor,
    accion: "actualizar_datos_empresa",
    entidad: "company_settings",
    entidadId: "1",
    datosAntes: antes,
    datosDespues: input,
  });
}
