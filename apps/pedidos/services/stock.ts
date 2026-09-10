import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Consulta de stock por lote, de sólo lectura, para CUALQUIER rol.
 *
 * Existe porque el vendedor necesitaba saber cuánto hay de un producto
 * antes de ofrecérselo a un cliente y no tenía dónde mirarlo: el stock
 * vivía escondido dentro de Maestros, que es sólo de administrador.
 *
 * Se lee con el cliente de sesión (nunca el admin) y la RLS de
 * `stock_lotes` deja leer a todo autenticado; escribir sigue siendo sólo
 * del administrador, desde el importador.
 */

/** Productos por página. Se pagina por PRODUCTO, no por lote — ver abajo. */
export const STOCK_PAGE_SIZE = 50;

/** Tope de PostgREST. Se usa como guarda explícita, no como supuesto. */
const TOPE_POSTGREST = 1000;

export type StockOrden = "producto" | "vencimiento";

export type StockLoteRow = {
  id: string;
  codigo: string;
  descripcion: string;
  lote: string;
  fechaVencimiento: string | null;
  cantidad: number;
  fuente: string;
  proveedor: string | null;
  fechaActualizacion: string;
};

export type StockPage = {
  filas: StockLoteRow[];
  /** Productos con stock que coinciden con la búsqueda. */
  totalProductos: number;
  /** Lotes de esos productos, para mostrar el tamaño real de lo filtrado. */
  totalLotes: number;
  pagina: number;
  paginas: number;
  orden: StockOrden;
};

/**
 * Una página de stock, ordenada alfabéticamente por producto (o por
 * vencimiento más próximo) y filtrada por código o nombre.
 *
 * **Pagina por PRODUCTO y no por lote**, que es lo que hace posible el
 * orden alfabético: los lotes viven en `stock_lotes` y el nombre en
 * `products`, y PostgREST no ordena las filas de una tabla por una columna
 * de la tabla embebida. Así que primero se resuelve QUÉ productos entran y
 * en qué orden, y después se piden los lotes de esa página. De paso queda
 * mejor para leer: los lotes de un producto salen juntos, con el que vence
 * primero arriba.
 */
export async function listStockLotes(
  opciones: { busqueda?: string; pagina?: number; orden?: StockOrden } = {},
): Promise<StockPage> {
  const supabase = createClient();
  const pagina = Math.max(1, Math.trunc(opciones.pagina ?? 1));
  const orden: StockOrden = opciones.orden === "vencimiento" ? "vencimiento" : "producto";
  const termino = (opciones.busqueda ?? "").trim();

  // 1. Qué productos tienen stock, con su total y su vencimiento más
  //    próximo. Es la vista agregada: una fila por producto+fuente, no una
  //    por lote, así que es chica por construcción.
  const { data: niveles, error: errorNiveles } = await supabase
    .from("stock_levels")
    .select("product_id, cantidad_disponible, lotes, vence_primero")
    .limit(TOPE_POSTGREST);
  if (errorNiveles) throw new Error(errorNiveles.message);

  type Nivel = {
    product_id: string;
    cantidad_disponible: number | string;
    lotes: number;
    vence_primero: string | null;
  };
  const conStock = new Map<string, Nivel>();
  for (const n of (niveles ?? []) as unknown as Nivel[]) conStock.set(n.product_id, n);
  if (conStock.size === 0) {
    return { filas: [], totalProductos: 0, totalLotes: 0, pagina: 1, paginas: 1, orden };
  }

  // 2. Los nombres, ordenados por la BASE (no por el navegador: el orden
  //    tiene que ser el mismo entre páginas). El filtro de búsqueda va acá,
  //    que es donde están el código y la descripción.
  let queryProductos = supabase
    .from("products")
    .select("id, codigo_interno, descripcion")
    .order("descripcion", { ascending: true })
    .limit(TOPE_POSTGREST);

  if (termino !== "") {
    queryProductos = queryProductos.or(
      `codigo_interno.ilike.%${termino}%,descripcion.ilike.%${termino}%`,
    );
  }

  const { data: productos, error: errorProductos } = await queryProductos;
  if (errorProductos) throw new Error(errorProductos.message);

  type Producto = { id: string; codigo_interno: string; descripcion: string };
  const candidatos = ((productos ?? []) as unknown as Producto[]).filter((p) =>
    conStock.has(p.id),
  );

  // El orden por vencimiento se resuelve acá porque el dato sale de la
  // vista agregada y el nombre de otra tabla; sin fecha va al final, que es
  // donde no estorba.
  const ordenados =
    orden === "vencimiento"
      ? [...candidatos].sort((a, b) => {
          const va = conStock.get(a.id)?.vence_primero ?? "9999-12-31";
          const vb = conStock.get(b.id)?.vence_primero ?? "9999-12-31";
          return va === vb ? a.descripcion.localeCompare(b.descripcion, "es") : va < vb ? -1 : 1;
        })
      : candidatos;

  const totalProductos = ordenados.length;
  const totalLotes = ordenados.reduce((acc, p) => acc + Number(conStock.get(p.id)?.lotes ?? 0), 0);
  const paginas = Math.max(1, Math.ceil(totalProductos / STOCK_PAGE_SIZE));
  const paginaValida = Math.min(pagina, paginas);
  const dePagina = ordenados.slice(
    (paginaValida - 1) * STOCK_PAGE_SIZE,
    paginaValida * STOCK_PAGE_SIZE,
  );

  if (dePagina.length === 0) {
    return { filas: [], totalProductos, totalLotes, pagina: paginaValida, paginas, orden };
  }

  // 3. Los lotes de esos productos, y nada más.
  const { data: lotes, error: errorLotes } = await supabase
    .from("stock_lotes")
    .select(
      "id, product_id, lote, fecha_vencimiento, cantidad_disponible, proveedor, fecha_actualizacion, source:inventory_sources(nombre)",
    )
    .in(
      "product_id",
      dePagina.map((p) => p.id),
    )
    .order("fecha_vencimiento", { ascending: true, nullsFirst: false })
    .limit(TOPE_POSTGREST);
  if (errorLotes) throw new Error(errorLotes.message);

  type Lote = {
    id: string;
    product_id: string;
    lote: string;
    fecha_vencimiento: string | null;
    cantidad_disponible: number | string;
    proveedor: string | null;
    fecha_actualizacion: string;
    source: { nombre: string } | null;
  };
  const porProducto = new Map<string, Lote[]>();
  for (const l of (lotes ?? []) as unknown as Lote[]) {
    const lista = porProducto.get(l.product_id);
    if (lista) lista.push(l);
    else porProducto.set(l.product_id, [l]);
  }

  // Se recorre en el orden de los PRODUCTOS: así los lotes de uno salen
  // juntos y la tabla se lee de arriba abajo como la lista alfabética que
  // el vendedor está buscando.
  const filas: StockLoteRow[] = [];
  for (const p of dePagina) {
    for (const l of porProducto.get(p.id) ?? []) {
      filas.push({
        id: l.id,
        codigo: p.codigo_interno,
        descripcion: p.descripcion,
        lote: l.lote,
        fechaVencimiento: l.fecha_vencimiento,
        cantidad: Number(l.cantidad_disponible),
        fuente: l.source?.nombre ?? "—",
        proveedor: l.proveedor,
        fechaActualizacion: l.fecha_actualizacion,
      });
    }
  }

  return { filas, totalProductos, totalLotes, pagina: paginaValida, paginas, orden };
}

export type StockResumen = {
  lotes: number;
  productos: number;
  unidades: number;
  /** La carga más reciente, para saber de cuándo es lo que se está viendo. */
  ultimaActualizacion: string | null;
};

export async function getStockResumen(): Promise<StockResumen> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("stock_levels")
    .select("product_id, cantidad_disponible, fecha_actualizacion, lotes")
    .limit(TOPE_POSTGREST);
  if (error) throw new Error(error.message);

  type Nivel = {
    product_id: string;
    cantidad_disponible: number | string;
    fecha_actualizacion: string;
    lotes: number;
  };
  const filas = (data ?? []) as unknown as Nivel[];

  return {
    lotes: filas.reduce((acc, f) => acc + Number(f.lotes ?? 0), 0),
    productos: new Set(filas.map((f) => f.product_id)).size,
    unidades: filas.reduce((acc, f) => acc + Number(f.cantidad_disponible), 0),
    ultimaActualizacion: filas.map((f) => f.fecha_actualizacion).sort().at(-1) ?? null,
  };
}
