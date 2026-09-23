import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Los números que se muestran ANTES de descargar, para saber si vale la pena.
 *
 * Nada de esto trae filas de verdad: son `count` con `head: true` y dos
 * consultas de una sola fila para los extremos del período. Un resumen que
 * se leyera la tabla entera para contarla sería más caro que el reporte.
 */
export async function contarPedidosEnviados(): Promise<{
  pedidos: number;
  lineas: number;
  primera: string | null;
  ultima: string | null;
}> {
  const supabase = createClient();
  const enviados = () => supabase.from("orders").select("id").neq("estado", "DRAFT");

  const [{ count: pedidos }, { data: primeras }, { data: ultimas }] = await Promise.all([
    supabase.from("orders").select("id", { count: "exact", head: true }).neq("estado", "DRAFT"),
    supabase
      .from("orders")
      .select("fecha_envio")
      .neq("estado", "DRAFT")
      .not("fecha_envio", "is", null)
      .order("fecha_envio")
      .limit(1),
    supabase
      .from("orders")
      .select("fecha_envio")
      .neq("estado", "DRAFT")
      .not("fecha_envio", "is", null)
      .order("fecha_envio", { ascending: false })
      .limit(1),
  ]);

  // Las líneas se cuentan por los ids de los pedidos y no con un embed
  // `orders!inner`: el embed cuenta bien pero es la clase de consulta que se
  // rompe en silencio al cambiar una relación, y acá un número mal contado se
  // lee como "el reporte está vacío".
  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await enviados().range(from, from + 999);
    if (error) throw new Error(error.message);
    const pagina = (data ?? []) as Array<{ id: string }>;
    ids.push(...pagina.map((r) => r.id));
    if (pagina.length < 1000) break;
  }

  let lineas = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const { count } = await supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .in("order_id", ids.slice(i, i + 200));
    lineas += count ?? 0;
  }

  const fecha = (rows: unknown) =>
    ((rows ?? []) as Array<{ fecha_envio: string }>)[0]?.fecha_envio?.slice(0, 10) ?? null;

  return { pedidos: pedidos ?? 0, lineas, primera: fecha(primeras), ultima: fecha(ultimas) };
}
