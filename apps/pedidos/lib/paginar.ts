import "server-only";

const PAGINA = 1000;

/**
 * Lee una tabla entera, de a 1.000 filas.
 *
 * PostgREST corta las respuestas en 1.000 filas y `.limit()` no lo sube:
 * un `select()` pelado sobre una tabla más grande devuelve un pedazo y no
 * avisa. En una pantalla se nota; en un proceso que compara dos carteras,
 * no — y el resultado es que la mitad de los clientes queda sin mirar.
 *
 * La consulta que se le pasa TIENE que ordenar por una columna única (el
 * `id`). Sin un orden estable, dos páginas pueden traer la misma fila o
 * saltearse una.
 */
export async function leerTodo<T>(
  consulta: (
    desde: number,
    hasta: number,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    const pagina = (data ?? []) as T[];
    filas.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  return filas;
}
