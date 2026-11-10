import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

type AuditLogEntry = {
  actor: string | null;
  accion: string;
  entidad: string;
  entidadId?: string | null;
  datosAntes?: unknown;
  datosDespues?: unknown;
};

/**
 * Punto único de escritura de auditoría para acciones de negocio
 * (Server Actions / Route Handlers). Ver docs/architecture.md para por
 * qué la bitácora se escribe desde la capa de servicio y no vía
 * trigger genérico.
 */
export async function logAudit(entry: AuditLogEntry) {
  const supabase = createAdminClient();

  const { error } = await supabase.from("audit_logs").insert({
    actor: entry.actor,
    accion: entry.accion,
    entidad: entry.entidad,
    entidad_id: entry.entidadId ?? null,
    datos_antes: entry.datosAntes ?? null,
    datos_despues: entry.datosDespues ?? null,
  });

  if (error) {
    throw new Error(`No se pudo escribir el audit log: ${error.message}`);
  }
}

export type UltimaCorrida = {
  cuando: string;
  /** Lo disparó el cron (sin persona detrás) o alguien apretando el botón. */
  porElCron: boolean;
  datos: Record<string, unknown>;
};

/**
 * La última vez que corrió una acción, y si la corrió el cron o una persona.
 *
 * La auditoría es el único lugar donde queda registro de estos procesos, y
 * la pregunta que se hace quien entra a la pantalla —"¿esto corre solo o
 * alguien lo viene apretando a mano?"— no se podía contestar sin mirar la
 * base del otro ERP a ver si había cambiado algo.
 */
export async function ultimaCorrida(accion: string): Promise<UltimaCorrida | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("fecha, actor, datos_despues")
    .eq("accion", accion)
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const fila = data as {
    fecha: string;
    actor: string | null;
    datos_despues: Record<string, unknown> | null;
  };
  return {
    cuando: fila.fecha,
    porElCron: fila.actor === null,
    datos: fila.datos_despues ?? {},
  };
}
