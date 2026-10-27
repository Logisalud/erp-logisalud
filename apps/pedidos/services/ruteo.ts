import "server-only";
import { createClient } from "@/lib/supabase/server";
import { diaSemanaISO, type ParaPreparar } from "@/domain/ruteo";

/**
 * Lo que hace falta para armar la ruta del día.
 *
 * Las zonas de reparto NO son las zonas comerciales (`pedidos.zones`): esas
 * dicen qué vendedor atiende a quién y cruzan media Lima; estas agrupan
 * destinos para que un camión salga una vez. Por eso viven en su propia
 * tabla y se cruzan por ubigeo.
 */

export type ZonaDeReparto = {
  id: number;
  codigo: string;
  nombre: string;
  ordenRuta: number;
  /** Le toca hoy según el plan semanal. */
  esDeHoy: boolean;
};

export type DatosDeRuteo = {
  zonas: ZonaDeReparto[];
  pendientes: ParaPreparar[];
  diaSemana: number;
};

export async function cargarDatosDeRuteo(hoy = new Date()): Promise<DatosDeRuteo> {
  const supabase = createClient();
  const diaSemana = diaSemanaISO(hoy);

  const [zonasRes, planRes, pedidosRes, ubigeosRes] = await Promise.all([
    supabase
      .from("zonas_reparto")
      .select("id, codigo, nombre, orden_ruta")
      .eq("estado", "activo")
      .order("orden_ruta"),
    supabase.from("plan_semanal_reparto").select("zona_reparto_id").eq("dia_semana", diaSemana),
    supabase
      .from("orders")
      .select(
        `id, numero, fecha_envio, ubigeo_snapshot, direccion_snapshot, razon_social_snapshot,
         customer:customers(razon_social, whatsapp)`,
      )
      .eq("estado", "READY_FOR_OPERATIONS")
      .order("numero"),
    supabase.from("ubigeo_zona_reparto").select("codigo_inei, zona_reparto_id, orden_distrito"),
  ]);

  if (zonasRes.error) throw new Error(zonasRes.error.message);
  if (planRes.error) throw new Error(planRes.error.message);
  if (pedidosRes.error) throw new Error(pedidosRes.error.message);
  if (ubigeosRes.error) throw new Error(ubigeosRes.error.message);

  const deHoy = new Set(
    ((planRes.data ?? []) as Array<{ zona_reparto_id: number }>).map((p) => p.zona_reparto_id),
  );

  const zonas: ZonaDeReparto[] = (
    (zonasRes.data ?? []) as Array<{ id: number; codigo: string; nombre: string; orden_ruta: number }>
  ).map((z) => ({
    id: z.id,
    codigo: z.codigo,
    nombre: z.nombre,
    ordenRuta: z.orden_ruta,
    esDeHoy: deHoy.has(z.id),
  }));

  const porZona = new Map(zonas.map((z) => [z.id, z]));
  const mapaUbigeo = new Map(
    (
      (ubigeosRes.data ?? []) as Array<{
        codigo_inei: string;
        zona_reparto_id: number;
        orden_distrito: number;
      }>
    ).map((u) => [u.codigo_inei, u]),
  );

  // El nombre del distrito se resuelve aparte: `ubigeos` no tiene clave
  // foránea desde `orders` (el pedido guarda el código como snapshot), así
  // que PostgREST no lo puede embeber.
  const codigos = Array.from(
    new Set(
      ((pedidosRes.data ?? []) as Array<{ ubigeo_snapshot: string | null }>)
        .map((o) => o.ubigeo_snapshot)
        .filter((c): c is string => !!c),
    ),
  );

  const distritoPorCodigo = new Map<string, string>();
  for (let i = 0; i < codigos.length; i += 200) {
    const { data, error } = await supabase
      .from("ubigeos")
      .select("codigo_inei, distrito")
      .in("codigo_inei", codigos.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const u of (data ?? []) as Array<{ codigo_inei: string; distrito: string }>) {
      distritoPorCodigo.set(u.codigo_inei, u.distrito);
    }
  }

  const pendientes: ParaPreparar[] = (
    (pedidosRes.data ?? []) as unknown as Array<{
      id: string;
      numero: number;
      fecha_envio: string | null;
      ubigeo_snapshot: string | null;
      direccion_snapshot: string | null;
      razon_social_snapshot: string | null;
      customer: { razon_social: string; whatsapp: string | null } | null;
    }>
  ).map((o) => {
    const u = o.ubigeo_snapshot ? mapaUbigeo.get(o.ubigeo_snapshot) : undefined;
    const zona = u ? porZona.get(u.zona_reparto_id) : undefined;
    return {
      id: o.id,
      numero: o.numero,
      razonSocial: o.razon_social_snapshot ?? o.customer?.razon_social ?? "—",
      direccion: o.direccion_snapshot,
      distrito: o.ubigeo_snapshot ? (distritoPorCodigo.get(o.ubigeo_snapshot) ?? null) : null,
      zonaId: zona?.id ?? null,
      zonaNombre: zona?.nombre ?? null,
      ordenZona: zona?.ordenRuta ?? null,
      ordenDistrito: u?.orden_distrito ?? null,
      fechaEnvio: o.fecha_envio,
      celular: o.customer?.whatsapp ?? null,
    };
  });

  return { zonas, pendientes, diaSemana };
}
