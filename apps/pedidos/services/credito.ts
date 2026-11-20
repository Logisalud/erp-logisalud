import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanEnv } from "@/lib/env";
import { logAudit, ultimaCorrida } from "./audit-log";
import { claveDeCobranzas } from "@/domain/documentos";

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
  /** Pasado este atraso el pedido pasa, pero frenado esperando aprobación. */
  diasTolerancia: number;
  /** Desde este atraso el pedido directamente no se puede enviar. */
  diasBloqueo: number;
};

/**
 * Qué le va a pasar a un pedido a crédito de este cliente.
 *
 * - `ninguno`: sale derecho.
 * - `alerta`: sale, pero queda esperando que alguien lo apruebe, con la
 *   deuda escrita en el correo.
 * - `bloqueo`: no se envía. No hay bandeja ni aprobación — se levanta
 *   pagando, no aprobando.
 */
export type NivelCredito = "ninguno" | "alerta" | "bloqueo";

/** El mismo cálculo que hace `pedidos.credito_nivel` en la base. */
export function nivelDeCredito(
  deuda: { vencido: number; diasAtraso: number },
  config: ConfigCredito,
): NivelCredito {
  if (!config.activo) return "ninguno";
  if (deuda.vencido <= 0) return "ninguno";
  if (deuda.diasAtraso >= config.diasBloqueo) return "bloqueo";
  if (deuda.diasAtraso > config.diasTolerancia) return "alerta";
  return "ninguno";
}

export type EstadoDelCredito = {
  config: ConfigCredito;
  clientes: number;
  conVencido: number;
  /** Pasan la tolerancia: el pedido pasa pero queda esperando aprobación. */
  bloqueados: number;
  vencidoBloqueado: number;
  /** Pasan el tope duro: a estos no se les puede enviar un pedido a crédito. */
  sinVenta: number;
  vencidoSinVenta: number;
  ultimaActualizacion: string | null;
  /** Si la última sincronización la disparó el cron o una persona. Null si nunca corrió. */
  ultimaPorElCron: boolean | null;
  /** Falta configurar el acceso a cobranzas: sin esto no se puede sincronizar. */
  sinConfigurar: boolean;
};

type FilaDocumento = {
  ruc: string;
  comprobante: string;
  fecha_vencimiento: string | null;
  saldo_vencido: number | string;
  saldo_documento: number | string;
  dias_atraso: number;
  tiene_letras: boolean;
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
    .select("activo, dias_tolerancia, dias_bloqueo")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const fila = data as { activo: boolean; dias_tolerancia: number; dias_bloqueo: number } | null;
  return {
    activo: fila?.activo ?? false,
    diasTolerancia: fila?.dias_tolerancia ?? 30,
    diasBloqueo: fila?.dias_bloqueo ?? 60,
  };
}

export async function getEstadoDelCredito(): Promise<EstadoDelCredito> {
  const supabase = createClient();
  const [config, ultima] = await Promise.all([
    getConfigCredito(),
    ultimaCorrida("sincronizar_credito"),
  ]);

  const { data, error } = await supabase
    .from("credito_clientes")
    .select("saldo, vencido, dias_atraso, actualizado_en");
  if (error) throw new Error(error.message);

  const filas = (data ?? []) as Array<{
    saldo: number | string;
    vencido: number | string;
    dias_atraso: number;
    actualizado_en: string;
  }>;

  const bloqueables = filas.filter(
    (f) => Number(f.vencido) > 0 && f.dias_atraso > config.diasTolerancia,
  );
  const sinVenta = filas.filter(
    (f) => Number(f.vencido) > 0 && f.dias_atraso >= config.diasBloqueo,
  );

  return {
    config,
    // Las filas en cero no son clientes con deuda: son los que terminaron
    // de pagar. La sincronización las deja en cero en vez de borrarlas
    // —para no perder la fecha de la última actualización—, así que acá hay
    // que descontarlas o el número crece solo con cada cliente que se pone
    // al día, que es exactamente al revés de lo que pasó.
    clientes: filas.filter((f) => Number(f.saldo) > 0).length,
    conVencido: filas.filter((f) => Number(f.vencido) > 0).length,
    bloqueados: bloqueables.length,
    vencidoBloqueado: bloqueables.reduce((acc, f) => acc + Number(f.vencido), 0),
    sinVenta: sinVenta.length,
    vencidoSinVenta: sinVenta.reduce((acc, f) => acc + Number(f.vencido), 0),
    ultimaActualizacion: filas.map((f) => f.actualizado_en).sort().at(-1) ?? null,
    ultimaPorElCron: ultima ? ultima.porElCron : null,
    sinConfigurar: accesoACobranzas() === null,
  };
}

export type ResultadoSincronizacion = {
  clientes: number;
  vencido: number;
  /** Facturas vencidas copiadas al detalle. */
  documentos: number;
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
/**
 * El detalle: qué factura está vencida, cuánto y hace cuántos días.
 *
 * Va en la misma corrida que el resumen y no en una propia, porque los dos
 * tienen que contar lo mismo: si el detalle fuera de ayer y el total de hoy,
 * el vendedor vería un total que no cierra con las facturas de abajo.
 *
 * Se lee paginado. Hoy son 238 facturas vencidas, pero eso crece con la
 * cartera, y el tope de PostgREST son 1.000 filas devueltas en silencio: un
 * corte ahí haría desaparecer las facturas de los últimos clientes sin que
 * nadie se entere.
 */
async function copiarDocumentosVencidos(
  acceso: { url: string; key: string },
  admin: ReturnType<typeof createAdminClient>,
  cuando: string,
): Promise<number> {
  const PAGINA = 1000;
  const filas: FilaDocumento[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const r = await fetch(
      `${acceso.url}/rest/v1/v_documentos_vencidos` +
        `?select=ruc,comprobante,fecha_vencimiento,saldo_vencido,saldo_documento,dias_atraso,tiene_letras` +
        `&order=ruc,comprobante&limit=${PAGINA}&offset=${desde}`,
      { headers: { apikey: acceso.key, Authorization: `Bearer ${acceso.key}` }, cache: "no-store" },
    );
    if (!r.ok) {
      throw new Error(
        `El ERP de cobranzas respondió ${r.status} al leer las facturas vencidas. No se tocó la copia anterior.`,
      );
    }
    const lote = (await r.json()) as FilaDocumento[];
    if (!Array.isArray(lote)) {
      throw new Error("El ERP de cobranzas devolvió algo inesperado en las facturas vencidas.");
    }
    filas.push(...lote);
    if (lote.length < PAGINA) break;
  }

  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await admin.from("credito_documentos").upsert(
      filas.slice(i, i + 500).map((f) => ({
        ruc: f.ruc,
        comprobante: f.comprobante,
        saldo_vencido: Number(f.saldo_vencido) || 0,
        saldo_documento: Number(f.saldo_documento) || 0,
        dias_atraso: Number(f.dias_atraso) || 0,
        fecha_vencimiento: f.fecha_vencimiento,
        tiene_letras: Boolean(f.tiene_letras),
        actualizado_en: cuando,
      })),
      { onConflict: "ruc,comprobante" },
    );
    if (error) throw new Error(error.message);
  }

  // La factura que se pagó ya no viene en la lista. Acá SÍ se borra —al
  // revés que en el resumen, donde la fila se deja en cero para conservar
  // la fecha—: una factura pagada no es "una factura con cero vencido", es
  // una factura que no tiene nada que hacer en la pantalla del vendedor.
  // Se borra por fecha y no por lista de llaves: la lista puede tener miles
  // de comprobantes y no entra en una URL.
  const { error: errorViejas } = await admin
    .from("credito_documentos")
    .delete()
    .lt("actualizado_en", cuando);
  if (errorViejas) throw new Error(errorViejas.message);

  return filas.length;
}

export async function sincronizarCredito(actor: string | null): Promise<ResultadoSincronizacion> {
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

  // El detalle va DESPUÉS del resumen: si falla, el resumen ya quedó bien y
  // la regla sigue decidiendo con datos de hoy. Al revés —detalle nuevo con
  // resumen viejo— el total no cerraría con las facturas de abajo.
  const documentos = await copiarDocumentosVencidos(acceso, admin, cuando);

  const vencido = filas.reduce((acc, f) => acc + (Number(f.vencido) || 0), 0);

  await logAudit({
    actor,
    accion: "sincronizar_credito",
    entidad: "credito_clientes",
    entidadId: "cartera",
    datosDespues: {
      clientes: filas.length,
      saldados: saldados.length,
      vencido,
      documentos,
      origen: actor ? "persona" : "cron",
    },
  });

  return { clientes: filas.length, vencido, documentos, cuando };
}

export async function guardarConfigCredito(
  input: { activo: boolean; diasTolerancia: number; diasBloqueo: number },
  actor: string,
): Promise<void> {
  const supabase = createClient();
  const antes = await getConfigCredito();

  const { error } = await supabase
    .from("credito_config")
    .update({
      activo: input.activo,
      dias_tolerancia: input.diasTolerancia,
      dias_bloqueo: input.diasBloqueo,
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
  /**
   * Si el cliente ya pasó el tope duro, aprobar no sirve de nada:
   * `reevaluate_order` lo va a volver a frenar. Mejor decirlo acá que
   * dejar que alguien apriete el botón y no pase nada.
   */
  liberable: boolean;
};

/** Los pedidos frenados por deuda que esperan una decisión. */
export async function listarBloqueosPendientes(): Promise<BloqueoPendiente[]> {
  const supabase = createClient();
  const config = await getConfigCredito();
  const { data, error } = await supabase
    .from("bloqueos_credito")
    .select(
      `order_id, ruc, saldo, vencido, dias_atraso, creado_en,
       order:orders(numero, razon_social_snapshot, vendedor_snapshot)`,
    )
    .eq("estado", "pendiente")
    .order("creado_en");
  if (error) throw new Error(error.message);

  // La deuda de HOY, no la del momento del bloqueo: `reevaluate_order`
  // decide con la de hoy, así que la pantalla tiene que mirar lo mismo o
  // va a ofrecer un botón que no hace nada.
  const rucs = ((data ?? []) as Array<{ ruc: string }>)
    .map((b) => b.ruc)
    .filter((ruc, i, todos) => todos.indexOf(ruc) === i);
  const alDia = new Map<string, { vencido: number; diasAtraso: number }>();
  if (rucs.length > 0) {
    const { data: hoy, error: errorHoy } = await supabase
      .from("credito_clientes")
      .select("ruc, vencido, dias_atraso")
      .in("ruc", rucs);
    if (errorHoy) throw new Error(errorHoy.message);
    for (const c of (hoy ?? []) as Array<{ ruc: string; vencido: number | string; dias_atraso: number }>) {
      alDia.set(c.ruc, { vencido: Number(c.vencido), diasAtraso: c.dias_atraso });
    }
  }

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
    liberable:
      nivelDeCredito(
        alDia.get(b.ruc) ?? { vencido: Number(b.vencido), diasAtraso: b.dias_atraso },
        config,
      ) !== "bloqueo",
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

export type DocumentoVencido = {
  comprobante: string;
  /** Lo vencido de esa factura, que no siempre es su saldo entero. */
  saldoVencido: number;
  saldoDocumento: number;
  diasAtraso: number;
  fechaVencimiento: string | null;
  /** Canjeada por letras: parte del saldo puede no estar vencida todavía. */
  tieneLetras: boolean;
};

export type DeudaDelCliente = {
  saldo: number;
  vencido: number;
  diasAtraso: number;
  documentosVencidos: number;
  actualizadoEn: string;
  /**
   * Las facturas vencidas, de la más vieja a la más nueva.
   *
   * El total y los días del resumen son cosas distintas —el monto suma
   * todas, los días son los de la más vieja— y juntos en una frase se leen
   * como una sola factura. Con el detalle el vendedor puede decir "pagá
   * esta y volvés a comprar", que es la conversación real.
   */
  documentos: DocumentoVencido[];
  /** Qué le va a pasar al pedido con la regla de hoy. */
  nivel: NivelCredito;
  /**
   * Pasa la tolerancia pero la regla está apagada: se muestra la deuda y
   * no frena nada. `nivel` es "ninguno" en ese caso, así que sin este
   * campo la pantalla no podría distinguir "no debe" de "debe y no importa".
   */
  reglaApagada: boolean;
};

/**
 * La deuda de UN cliente, para avisarle al vendedor mientras arma el pedido.
 *
 * Se muestra aunque la regla esté apagada: saber que el cliente debe hace
 * falta para decidir si conviene venderle, y enterarse recién al apretar
 * "Enviar" es enterarse tarde —con el cliente adelante.
 *
 * Devuelve null si el cliente no está en la copia: no tener deuda y no
 * estar son lo mismo para esta pantalla.
 */
export async function deudaDelCliente(ruc: string | null): Promise<DeudaDelCliente | null> {
  // La copia de la deuda viene de cobranzas y conserva SU forma de la
  // llave: el DNI relleno con ceros. Buscar con el documento pelado no
  // encuentra nada y el cliente aparece sin deuda.
  const llave = claveDeCobranzas(ruc);
  if (!llave) return null;
  const supabase = createClient();

  const [deudaRes, documentosRes, config] = await Promise.all([
    supabase
      .from("credito_clientes")
      .select("saldo, vencido, dias_atraso, documentos_vencidos, actualizado_en")
      .eq("ruc", llave)
      .maybeSingle(),
    supabase
      .from("credito_documentos")
      .select("comprobante, saldo_vencido, saldo_documento, dias_atraso, fecha_vencimiento, tiene_letras")
      .eq("ruc", llave)
      .order("dias_atraso", { ascending: false })
      .order("comprobante", { ascending: true }),
    getConfigCredito(),
  ]);
  if (documentosRes.error) throw new Error(documentosRes.error.message);

  if (deudaRes.error) throw new Error(deudaRes.error.message);
  const fila = deudaRes.data as {
    saldo: number | string;
    vencido: number | string;
    dias_atraso: number;
    documentos_vencidos: number;
    actualizado_en: string;
  } | null;

  if (!fila || Number(fila.saldo) <= 0) return null;

  const vencido = Number(fila.vencido);
  const deuda = { vencido, diasAtraso: fila.dias_atraso };
  const pasaTolerancia = vencido > 0 && fila.dias_atraso > config.diasTolerancia;

  return {
    saldo: Number(fila.saldo),
    vencido,
    diasAtraso: fila.dias_atraso,
    documentosVencidos: fila.documentos_vencidos,
    actualizadoEn: fila.actualizado_en,
    documentos: (
      (documentosRes.data ?? []) as Array<{
        comprobante: string;
        saldo_vencido: number | string;
        saldo_documento: number | string;
        dias_atraso: number;
        fecha_vencimiento: string | null;
        tiene_letras: boolean;
      }>
    ).map((d) => ({
      comprobante: d.comprobante,
      saldoVencido: Number(d.saldo_vencido),
      saldoDocumento: Number(d.saldo_documento),
      diasAtraso: d.dias_atraso,
      fechaVencimiento: d.fecha_vencimiento,
      tieneLetras: Boolean(d.tiene_letras),
    })),
    nivel: nivelDeCredito(deuda, config),
    reglaApagada: !config.activo && pasaTolerancia,
  };
}
