import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ESTADOS_PARA_WMS,
  armarRespuestaContrato,
  type DatosAuxiliares,
  type DatosRuteo,
  type FilaFactura,
  type FilaHistorial,
  type FilaObservacion,
  type FilaPedido,
  type RespuestaContrato,
} from "@/domain/wms-pedidos-listos";

/**
 * Lee los pedidos listos para despacho que consume el WMS.
 *
 * SOLO LECTURA: únicamente `select` (con `in`/`eq`/`order`/`range`). Nada de
 * insert/update/delete/upsert/rpc, ni `logAudit`: pedirle datos a Pedidos no
 * puede dejar rastro de negocio. Hay una prueba que falla si este archivo usa
 * un método de escritura.
 *
 * Usa el cliente con service role porque quien llama es el WMS (sin sesión de
 * usuario). Lo protege la firma HMAC de la ruta, que se verifica ANTES de
 * llegar acá.
 */

const PAGINA = 1000; // tope de PostgREST por respuesta
const LOTE_IDS = 150; // ids por consulta `in` (la URL tiene largo máximo)

const lotes = <T>(xs: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

/** Esta base puede no tener una tabla auxiliar (p. ej. `facturas_emitidas` no existe en el proyecto Supabase de Pedidos): sin ella, ese dato simplemente no se entrega (el contrato lo marca opcional) y la ruta no falla. */
const tablaAusente = (e: { code?: string; message: string }) =>
  e.code === "42P01" || e.code === "PGRST205" || /does not exist|Could not find the table/i.test(e.message);

export async function cargarPedidosListosParaWms(ahora = new Date()): Promise<RespuestaContrato> {
  const db = createAdminClient();

  const filas: FilaPedido[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await db
      .from("orders")
      .select(
        `id, numero, estado, fecha_envio, fecha_creacion, updated_at,
         ubigeo_snapshot, direccion_snapshot, razon_social_snapshot, vendedor_snapshot,
         customer:customers(id, razon_social, ruc_o_documento),
         payment_term:payment_terms(nombre),
         items:order_items(id, cantidad, product:products(codigo_interno, descripcion, presentacion))`,
      )
      .in("estado", ESTADOS_PARA_WMS)
      .order("numero")
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    const pagina = (data ?? []) as unknown as FilaPedido[];
    filas.push(...pagina);
    if (pagina.length < PAGINA) break;
  }

  const ids = filas.map((f) => f.id);
  const aux: DatosAuxiliares = { historial: [], observaciones: [], facturas: [], distritos: {} };

  for (const lote of lotes(ids, LOTE_IDS)) {
    const [h, o, f] = await Promise.all([
      db
        .from("order_status_history")
        .select("order_id, estado_nuevo, motivo, fecha")
        .in("order_id", lote),
      db.from("order_observations").select("order_id, comentario, fecha").in("order_id", lote),
      db
        .from("facturas_emitidas")
        .select("pedido_id, serie, numero")
        .in("pedido_id", lote)
        .eq("anulada", false),
    ]);
    if (h.error) throw new Error(h.error.message);
    if (o.error) throw new Error(o.error.message);
    if (f.error && !tablaAusente(f.error)) throw new Error(f.error.message);
    aux.historial.push(...((h.data ?? []) as FilaHistorial[]));
    aux.observaciones.push(...((o.data ?? []) as FilaObservacion[]));
    if (!f.error) aux.facturas.push(...((f.data ?? []) as FilaFactura[]));
  }

  const codigos = Array.from(
    new Set(filas.map((f) => f.ubigeo_snapshot).filter((u): u is string => !!u)),
  );
  for (const lote of lotes(codigos, LOTE_IDS)) {
    const { data, error } = await db
      .from("ubigeos")
      .select("codigo_inei, distrito")
      .in("codigo_inei", lote);
    if (error && !tablaAusente(error)) throw new Error(error.message);
    for (const u of (data ?? []) as Array<{ codigo_inei: string; distrito: string }>) {
      aux.distritos[u.codigo_inei] = u.distrito;
    }
  }

  // Ruteo de Andrés (solo lectura de sus tablas): zona, orden y plan semanal.
  const ruteo: DatosRuteo = { zonas: [], ubigeoZona: {}, plan: [] };
  const [zonasRes, planRes] = await Promise.all([
    db
      .from("zonas_reparto")
      .select("id, codigo, nombre, orden_ruta")
      .eq("estado", "activo")
      .order("orden_ruta"),
    db.from("plan_semanal_reparto").select("dia_semana, zona_reparto_id"),
  ]);
  if (zonasRes.error) throw new Error(zonasRes.error.message);
  if (planRes.error) throw new Error(planRes.error.message);
  ruteo.zonas = (zonasRes.data ?? []) as DatosRuteo["zonas"];
  for (const fila of (planRes.data ?? []) as Array<{ dia_semana: number; zona_reparto_id: number }>) {
    let dia = ruteo.plan.find((d) => d.dia === fila.dia_semana);
    if (!dia) {
      dia = { dia: fila.dia_semana, zonaIds: [] };
      ruteo.plan.push(dia);
    }
    dia.zonaIds.push(fila.zona_reparto_id);
  }
  for (const lote of lotes(codigos, LOTE_IDS)) {
    const { data, error } = await db
      .from("ubigeo_zona_reparto")
      .select("codigo_inei, zona_reparto_id, orden_distrito")
      .in("codigo_inei", lote);
    if (error) throw new Error(error.message);
    for (const u of (data ?? []) as Array<{
      codigo_inei: string;
      zona_reparto_id: number;
      orden_distrito: number;
    }>) {
      ruteo.ubigeoZona[u.codigo_inei] = {
        zona_reparto_id: u.zona_reparto_id,
        orden_distrito: u.orden_distrito,
      };
    }
  }
  aux.ruteo = ruteo;

  return armarRespuestaContrato(filas, aux, ahora);
}
