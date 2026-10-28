import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanEnv } from "@/lib/env";
import { logAudit } from "./audit-log";

/**
 * El puente de crédito: la deuda del cliente, que vive en el ERP de
 * cobranzas, copiada acá.
 *
 * Son dos proyectos Supabase distintos, así que no hay join posible: el
 * dato se copia por RUC. Se copia en vez de consultarse en vivo porque si
 * cobranzas no responde, pedidos tiene que poder seguir vendiendo — el
 * peor caso aceptable es trabajar con el dato de ayer, no un vendedor que
 * no puede enviar nada con el cliente adelante.
 */

export type ConfigCredito = {
  activo: boolean;
  diasTolerancia: number;
};

export type EstadoDelCredito = {
  config: ConfigCredito;
  clientes: number;
  conVencido: number;
  bloqueados: number;
  vencidoBloqueado: number;
  ultimaActualizacion: string | null;
  /** Falta configurar el acceso a cobranzas: sin esto no se puede sincronizar. */
  sinConfigurar: boolean;
};

type FilaDeuda = {
  ruc: string;
  razon_social: string | null;
  saldo: number | string;
  vencido: number | string;
  dias_atraso: number;
  documentos_vencidos: number;
};

/** Las dos variables que hacen falta para leer la cartera de cobranzas. */
function accesoACobranzas(): { url: string; key: string } | null {
  const url = cleanEnv(process.env.COBRANZAS_SUPABASE_URL ?? "");
  const key = cleanEnv(process.env.COBRANZAS_SERVICE_ROLE_KEY ?? "");
  return url && key ? { url, key } : null;
}

export async function getConfigCredito(): Promise<ConfigCredito> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("credito_config")
    .select("activo, dias_tolerancia")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const fila = data as { activo: boolean; dias_tolerancia: number } | null;
  return { activo: fila?.activo ?? false, diasTolerancia: fila?.dias_tolerancia ?? 30 };
}

export async function getEstadoDelCredito(): Promise<EstadoDelCredito> {
  const supabase = createClient();
  const config = await getConfigCredito();

  const { data, error } = await supabase
    .from("credito_clientes")
    .select("vencido, dias_atraso, actualizado_en");
  if (error) throw new Error(error.message);

  const filas = (data ?? []) as Array<{
    vencido: number | string;
    dias_atraso: number;
    actualizado_en: string;
  }>;

  const bloqueables = filas.filter(
    (f) => Number(f.vencido) > 0 && f.dias_atraso > config.diasTolerancia,
  );

  return {
    config,
    clientes: filas.length,
    conVencido: filas.filter((f) => Number(f.vencido) > 0).length,
    bloqueados: bloqueables.length,
    vencidoBloqueado: bloqueables.reduce((acc, f) => acc + Number(f.vencido), 0),
    ultimaActualizacion: filas.map((f) => f.actualizado_en).sort().at(-1) ?? null,
    sinConfigurar: accesoACobranzas() === null,
  };
}

export type ResultadoSincronizacion = {
  clientes: number;
  vencido: number;
  cuando: string;
};

/**
 * Trae la deuda de cobranzas y reemplaza la copia local.
 *
 * Se escribe con la service role: la copia la hace el sistema, no una
 * persona, y la RLS de `credito_clientes` solo deja escribir al
 * administrador.
 *
 * Si la lectura falla, NO se toca la copia anterior. Quedarse con el dato
 * de ayer es mucho mejor que quedarse sin dato: sin dato, la regla deja de
 * frenar a todo el mundo y nadie se entera.
 */
export async function sincronizarCredito(actor: string): Promise<ResultadoSincronizacion> {
  const acceso = accesoACobranzas();
  if (!acceso) {
    throw new Error(
      "Falta configurar el acceso al ERP de cobranzas (COBRANZAS_SUPABASE_URL y COBRANZAS_SERVICE_ROLE_KEY).",
    );
  }

  const respuesta = await fetch(
    `${acceso.url}/rest/v1/v_deuda_por_cliente?select=ruc,razon_social,saldo,vencido,dias_atraso,documentos_vencidos`,
    {
      headers: { apikey: acceso.key, Authorization: `Bearer ${acceso.key}` },
      cache: "no-store",
    },
  );

  if (!respuesta.ok) {
    throw new Error(
      `El ERP de cobranzas respondió ${respuesta.status}. No se tocó la copia anterior.`,
    );
  }

  const filas = (await respuesta.json()) as FilaDeuda[];
  if (!Array.isArray(filas)) {
    throw new Error("El ERP de cobranzas devolvió algo inesperado. No se tocó la copia anterior.");
  }

  const cuando = new Date().toISOString();
  const admin = createAdminClient();

  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await admin.from("credito_clientes").upsert(
      filas.slice(i, i + 500).map((f) => ({
        ruc: f.ruc,
        razon_social: f.razon_social,
        saldo: Number(f.saldo) || 0,
        vencido: Number(f.vencido) || 0,
        dias_atraso: Number(f.dias_atraso) || 0,
        documentos_vencidos: Number(f.documentos_vencidos) || 0,
        actualizado_en: cuando,
      })),
      { onConflict: "ruc" },
    );
    if (error) throw new Error(error.message);
  }

  // Un cliente que ya no figura en cobranzas es un cliente que terminó de
  // pagar: su fila vieja diría que sigue debiendo. Se pone en cero en vez
  // de borrarla, para no perder la fecha de la última actualización.
  const vigentes = new Set(filas.map((f) => f.ruc));
  const { data: locales, error: errorLocales } = await admin
    .from("credito_clientes")
    .select("ruc")
    .gt("saldo", 0);
  if (errorLocales) throw new Error(errorLocales.message);

  const saldados = ((locales ?? []) as Array<{ ruc: string }>)
    .map((l) => l.ruc)
    .filter((ruc) => !vigentes.has(ruc));

  if (saldados.length > 0) {
    const { error } = await admin
      .from("credito_clientes")
      .update({ saldo: 0, vencido: 0, dias_atraso: 0, documentos_vencidos: 0, actualizado_en: cuando })
      .in("ruc", saldados);
    if (error) throw new Error(error.message);
  }

  const vencido = filas.reduce((acc, f) => acc + (Number(f.vencido) || 0), 0);

  await logAudit({
    actor,
    accion: "sincronizar_credito",
    entidad: "credito_clientes",
    entidadId: "cartera",
    datosDespues: { clientes: filas.length, saldados: saldados.length, vencido },
  });

  return { clientes: filas.length, vencido, cuando };
}

export async function guardarConfigCredito(
  input: { activo: boolean; diasTolerancia: number },
  actor: string,
): Promise<void> {
  const supabase = createClient();
  const antes = await getConfigCredito();

  const { error } = await supabase
    .from("credito_config")
    .update({
      activo: input.activo,
      dias_tolerancia: input.diasTolerancia,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) throw new Error(error.message);

  await logAudit({
    actor,
    accion: "configurar_credito",
    entidad: "credito_config",
    entidadId: "1",
    datosAntes: antes,
    datosDespues: input,
  });
}

export type BloqueoPendiente = {
  orderId: string;
  numero: number;
  razonSocial: string;
  ruc: string;
  saldo: number;
  vencido: number;
  diasAtraso: number;
  creadoEn: string;
  vendedor: string | null;
};

/** Los pedidos frenados por deuda que esperan una decisión. */
export async function listarBloqueosPendientes(): Promise<BloqueoPendiente[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("bloqueos_credito")
    .select(
      `order_id, ruc, saldo, vencido, dias_atraso, creado_en,
       order:orders(numero, razon_social_snapshot, vendedor_snapshot)`,
    )
    .eq("estado", "pendiente")
    .order("creado_en");
  if (error) throw new Error(error.message);

  return (
    (data ?? []) as unknown as Array<{
      order_id: string;
      ruc: string;
      saldo: number | string;
      vencido: number | string;
      dias_atraso: number;
      creado_en: string;
      order: { numero: number; razon_social_snapshot: string | null; vendedor_snapshot: string | null } | null;
    }>
  ).map((b) => ({
    orderId: b.order_id,
    numero: b.order?.numero ?? 0,
    razonSocial: b.order?.razon_social_snapshot ?? "—",
    ruc: b.ruc,
    saldo: Number(b.saldo),
    vencido: Number(b.vencido),
    diasAtraso: b.dias_atraso,
    creadoEn: b.creado_en,
    vendedor: b.order?.vendedor_snapshot ?? null,
  }));
}

/**
 * Aprobar libera el pedido; rechazar lo deja donde está.
 *
 * Aprobar no borra el bloqueo: lo marca. La fila queda con las cifras del
 * momento y con quién lo levantó — es el registro de que alguien decidió
 * venderle igual a un cliente que debía, que es justo lo que después se
 * revisa.
 */
export async function decidirBloqueoDeCredito(
  input: { orderId: string; decision: "aprobado" | "rechazado"; motivo: string | null; actor: string },
): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("bloqueos_credito")
    .update({
      estado: input.decision,
      decidido_por: input.actor,
      decidido_en: new Date().toISOString(),
      motivo: input.motivo,
    })
    .eq("order_id", input.orderId)
    .eq("estado", "pendiente");
  if (error) throw new Error(error.message);

  if (input.decision === "aprobado") {
    const { error: errorRpc } = await supabase.rpc("reevaluate_order", {
      p_order_id: input.orderId,
      p_motivo: "Bloqueo por deuda levantado por el aprobador comercial",
    });
    if (errorRpc) throw new Error(errorRpc.message);
  }

  await logAudit({
    actor: input.actor,
    accion: `bloqueo_credito_${input.decision}`,
    entidad: "bloqueos_credito",
    entidadId: input.orderId,
    datosDespues: { decision: input.decision, motivo: input.motivo },
  });
}
