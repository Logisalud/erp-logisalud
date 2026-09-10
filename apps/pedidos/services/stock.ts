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

export const STOCK_PAGE_SIZE = 50;

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
  /** Total de lotes que coinciden con la búsqueda, para paginar. */
  total: number;
  pagina: number;
  paginas: number;
};

type Fila = {
  id: string;
  lote: string;
  fecha_vencimiento: string | null;
  cantidad_disponible: number | string;
  proveedor: string | null;
  fecha_actualizacion: string;
  product: { codigo_interno: string; descripcion: string } | null;
  source: { nombre: string } | null;
};

const COLUMNAS =
  "id, lote, fecha_vencimiento, cantidad_disponible, proveedor, fecha_actualizacion, product:products!inner(codigo_interno, descripcion), source:inventory_sources(nombre)";

/**
 * Una página de lotes, filtrada por código o nombre de producto.
 *
 * Pagina en el SERVIDOR con `range`, y no trayendo todo para cortar en el
 * navegador: PostgREST tope las respuestas en 1.000 filas y el stock real
 * ya son cientos de lotes, así que "traer todo" es una lista truncada en
 * silencio esperando a pasar.
 */
export async function listStockLotes(opciones: {
  busqueda?: string;
  pagina?: number;
} = {}): Promise<StockPage> {
  const supabase = createClient();
  const pagina = Math.max(1, Math.trunc(opciones.pagina ?? 1));
  const termino = (opciones.busqueda ?? "").trim();
  const desde = (pagina - 1) * STOCK_PAGE_SIZE;

  let query = supabase
    .from("stock_lotes")
    .select(COLUMNAS, { count: "exact" })
    // Primero lo que vence antes: es la pregunta operativa real ("¿qué hay
    // que sacar primero?"), y deja los lotes sin fecha al final.
    .order("fecha_vencimiento", { ascending: true, nullsFirst: false })
    .order("lote", { ascending: true })
    .range(desde, desde + STOCK_PAGE_SIZE - 1);

  if (termino !== "") {
    // El filtro va sobre la tabla embebida: buscar "vitamina" tiene que
    // encontrar por nombre, no sólo por código.
    query = query.or(
      `codigo_interno.ilike.%${termino}%,descripcion.ilike.%${termino}%`,
      { referencedTable: "product" },
    );
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const filas = ((data ?? []) as unknown as Fila[])
    // Con `!inner` y el filtro embebido, PostgREST devuelve la fila con
    // product en null cuando no matchea: esas se descartan acá.
    .filter((f) => f.product !== null)
    .map((f) => ({
      id: f.id,
      codigo: f.product?.codigo_interno ?? "—",
      descripcion: f.product?.descripcion ?? "—",
      lote: f.lote,
      fechaVencimiento: f.fecha_vencimiento,
      cantidad: Number(f.cantidad_disponible),
      fuente: f.source?.nombre ?? "—",
      proveedor: f.proveedor,
      fechaActualizacion: f.fecha_actualizacion,
    }));

  const total = count ?? filas.length;
  return {
    filas,
    total,
    pagina,
    paginas: Math.max(1, Math.ceil(total / STOCK_PAGE_SIZE)),
  };
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
    .select("product_id, cantidad_disponible, fecha_actualizacion, lotes");
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
    ultimaActualizacion:
      filas.map((f) => f.fecha_actualizacion).sort().at(-1) ?? null,
  };
}
