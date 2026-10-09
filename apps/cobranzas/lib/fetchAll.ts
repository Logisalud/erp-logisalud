/**
 * Trae TODAS las filas de una consulta de Supabase, paginando con `.range()`.
 *
 * PostgREST corta las respuestas en 1.000 filas (`max-rows`) e ignora
 * `.limit()`, pero siempre respeta el header Range. Por eso esto, y no un
 * `.limit()` grande, para cualquier consulta que pueda pasar de 1.000.
 *
 * ## La consulta TIENE que traer un orden único
 *
 * No es un detalle de estilo: **sin un orden determinista, paginar duplica
 * filas y pierde otras**. Postgres no garantiza ningún orden sin `ORDER BY`,
 * así que la página 2 puede volver a traer filas de la página 1 y saltearse
 * otras. El resultado no es un error, es un número silenciosamente mal.
 *
 * Pasó de verdad: el Excel "Resumen por vendedor" sumaba sobre 2.573
 * facturas en 3 páginas sin orden, y traía 592 filas repetidas y perdía
 * otras 592 — S/ 54.086 de diferencia contra la pantalla, y distinta en
 * cada descarga. La pantalla daba bien sólo porque su filtro la dejaba en
 * 489 filas, o sea una sola página.
 *
 * Ordenar por una columna no única (fecha, razón social) **no alcanza**: los
 * empates se reordenan entre páginas igual. Si ya ordenás por algo así,
 * agregá la clave única al final como desempate:
 *
 *     db.from('documentos').select('*').order('fecha_emision').order('id').range(from, to)
 *
 * En este esquema la clave es `id` en todas las tablas y vistas, salvo
 * `clientes` (es `ruc`) y `letra_documento` (`documento_id` + `letra_id`).
 */
export async function fetchAll<T>(
  queryFn: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const PAGE = 1000;
  let from = 0;
  const all: T[] = [];

  while (true) {
    const { data, error } = await queryFn(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;   // last page — done
    from += PAGE;
  }

  return all;
}
