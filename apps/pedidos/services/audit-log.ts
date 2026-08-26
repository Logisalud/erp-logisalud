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
