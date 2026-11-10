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
  /**
   * Sale del maestro de productos (`products.supplier_id`), no de la
   * columna PROVEEDOR del archivo de stock: quién provee un producto es un
   * dato del producto, no del lote, y el archivo diario trae esa columna
   * sólo a veces. Si el maestro no lo tuviera, se cae a lo que dijo el
   * archivo antes que mostrar un guion.
   */
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
type ProductoConStock = {
  id: string;
  codigo_interno: string;
  descripcion: string;
  supplier: { nombre: string } | null;
};

type Nivel = {
  product_id: string;
  cantidad_disponible: number | string;
  lotes: number;
  vence_primero: string | null;
};

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

/**
 * Qué productos entran y en qué orden.
 *
 * Lo comparten la pantalla y el Excel a propósito: si el archivo saliera de
 * otro criterio que la tabla, el vendedor tendría dos verdades del mismo
 * stock. Mismo filtro, mismo orden; lo único que cambia es que la pantalla
 * corta en una página y el archivo no.
 */
async function resolverProductosConStock(
  supabase: ReturnType<typeof createClient>,
  opciones: { busqueda?: string; orden?: StockOrden },
): Promise<{ ordenados: ProductoConStock[]; conStock: Map<string, Nivel> }> {
  const orden: StockOrden = opciones.orden === "vencimiento" ? "vencimiento" : "producto";
  const termino = (opciones.busqueda ?? "").trim();

  const { data: niveles, error: errorNiveles } = await supabase
    .from("stock_levels")
    .select("product_id, cantidad_disponible, lotes, vence_primero")
    .limit(TOPE_POSTGREST);
  if (errorNiveles) throw new Error(errorNiveles.message);

  const conStock = new Map<string, Nivel>();
  for (const n of (niveles ?? []) as unknown as Nivel[]) conStock.set(n.product_id, n);
  if (conStock.size === 0) return { ordenados: [], conStock };

  let queryProductos = supabase
    .from("products")
    .select("id, codigo_interno, descripcion, supplier:suppliers(nombre)")
    .order("descripcion", { ascending: true })
    .limit(TOPE_POSTGREST);

  if (termino !== "") {
    queryProductos = queryProductos.or(
      `codigo_interno.ilike.%${termino}%,descripcion.ilike.%${termino}%`,
    );
  }

  const { data: productos, error: errorProductos } = await queryProductos;
  if (errorProductos) throw new Error(errorProductos.message);

  const candidatos = ((productos ?? []) as unknown as ProductoConStock[]).filter((p) =>
    conStock.has(p.id),
  );

  const ordenados =
    orden === "vencimiento"
      ? [...candidatos].sort((a, b) => {
          const va = conStock.get(a.id)?.vence_primero ?? "9999-12-31";
          const vb = conStock.get(b.id)?.vence_primero ?? "9999-12-31";
          return va === vb ? a.descripcion.localeCompare(b.descripcion, "es") : va < vb ? -1 : 1;
        })
      : candidatos;

  return { ordenados, conStock };
}

/** Los lotes de esos productos, en filas listas para mostrar o exportar. */
async function lotesDe(
  supabase: ReturnType<typeof createClient>,
  productos: ProductoConStock[],
): Promise<StockLoteRow[]> {
  if (productos.length === 0) return [];

  // Paginado por productos y no un `limit` grande: hoy son 257 lotes, pero
  // crecen con cada carga, y un tope silencioso haría desaparecer stock
  // real sin que nadie se entere.
  const porProducto = new Map<string, Lote[]>();
  const TANDA = 200;
  for (let i = 0; i < productos.length; i += TANDA) {
    const ids = productos.slice(i, i + TANDA).map((p) => p.id);
    for (let desde = 0; ; desde += TOPE_POSTGREST) {
      const { data, error } = await supabase
        .from("stock_lotes")
        .select(
          "id, product_id, lote, fecha_vencimiento, cantidad_disponible, proveedor, fecha_actualizacion, source:inventory_sources(nombre)",
        )
        .in("product_id", ids)
        .order("fecha_vencimiento", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true })
        .range(desde, desde + TOPE_POSTGREST - 1);
      if (error) throw new Error(error.message);

      const filas = (data ?? []) as unknown as Lote[];
      for (const l of filas) {
        const lista = porProducto.get(l.product_id);
        if (lista) lista.push(l);
        else porProducto.set(l.product_id, [l]);
      }
      if (filas.length < TOPE_POSTGREST) break;
    }
  }

  // Se recorre en el orden de los PRODUCTOS: así los lotes de uno salen
  // juntos y la tabla se lee de arriba abajo como la lista alfabética que
  // el vendedor está buscando.
  const filas: StockLoteRow[] = [];
  for (const p of productos) {
    for (const l of porProducto.get(p.id) ?? []) {
      filas.push({
        id: l.id,
        codigo: p.codigo_interno,
        descripcion: p.descripcion,
        lote: l.lote,
        fechaVencimiento: l.fecha_vencimiento,
        cantidad: Number(l.cantidad_disponible),
        fuente: l.source?.nombre ?? "—",
        proveedor: p.supplier?.nombre ?? l.proveedor,
        fechaActualizacion: l.fecha_actualizacion,
      });
    }
  }
  return filas;
}

/**
 * Una página de stock, ordenada alfabéticamente por producto (o por
 * vencimiento más próximo) y filtrada por código o nombre.
 *
 * **Pagina por PRODUCTO y no por lote**, que es lo que hace posible el
 * orden alfabético: los lotes viven en `stock_lotes` y el nombre en
 * `products`, y PostgREST no ordena las filas de una tabla por una columna
 * de la tabla embebida. Así que primero se resuelve QUÉ productos entran y
 * en qué orden, y después se piden los lotes de esa página.
 */
export async function listStockLotes(
  opciones: { busqueda?: string; pagina?: number; orden?: StockOrden } = {},
): Promise<StockPage> {
  const supabase = createClient();
  const pagina = Math.max(1, Math.trunc(opciones.pagina ?? 1));
  const orden: StockOrden = opciones.orden === "vencimiento" ? "vencimiento" : "producto";

  const { ordenados, conStock } = await resolverProductosConStock(supabase, opciones);
  if (ordenados.length === 0) {
    return { filas: [], totalProductos: 0, totalLotes: 0, pagina: 1, paginas: 1, orden };
  }

  const totalProductos = ordenados.length;
  const totalLotes = ordenados.reduce((acc, p) => acc + Number(conStock.get(p.id)?.lotes ?? 0), 0);
  const paginas = Math.max(1, Math.ceil(totalProductos / STOCK_PAGE_SIZE));
  const paginaValida = Math.min(pagina, paginas);
  const dePagina = ordenados.slice(
    (paginaValida - 1) * STOCK_PAGE_SIZE,
    paginaValida * STOCK_PAGE_SIZE,
  );

  const filas = await lotesDe(supabase, dePagina);
  return { filas, totalProductos, totalLotes, pagina: paginaValida, paginas, orden };
}

/**
 * TODO el stock que coincide con el filtro, sin paginar, para el Excel.
 *
 * Mismo filtro y mismo orden que la pantalla: el archivo es lo que se está
 * mirando, completo.
 */
export async function listStockLotesCompleto(
  opciones: { busqueda?: string; orden?: StockOrden } = {},
): Promise<StockLoteRow[]> {
  const supabase = createClient();
  const { ordenados } = await resolverProductosConStock(supabase, opciones);
  return lotesDe(supabase, ordenados);
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

/**
 * Cuánto hay de cada producto, para armar el pedido.
 *
 * Es el stock FÍSICO que cargó el almacén, sin descontar lo que ya se pidió
 * y todavía no se despachó. Decisión de negocio (2026-10-22): el archivo
 * diario es un conteo real del almacén, así que lo que ya salió por la
 * puerta ya está descontado ahí; restar además los pedidos pendientes —hoy
 * 330, porque el despacho no se marca al día en el ERP— restaría dos veces
 * lo mismo y frenaría ventas de mercadería que está en el estante.
 *
 * Un producto que no aparece devuelve 0: no tener fila en el archivo del
 * almacén y tener cero son lo mismo para quien vende.
 *
 * Se suma por producto, no por producto+fuente: al vendedor le importa
 * cuánto hay, no en qué almacén está.
 */
export async function stockDisponiblePorProducto(): Promise<Map<string, number>> {
  const supabase = createClient();
  const disponible = new Map<string, number>();

  // Paginado y no un `limit` grande: la vista tiene hoy una fila por
  // producto con stock (266), pero crece con el catálogo y con cada fuente
  // nueva, y un tope silencioso haría desaparecer stock real sin aviso.
  const PAGINA = 1000;
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase
      .from("stock_levels")
      .select("product_id, cantidad_disponible")
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);

    const filas = (data ?? []) as unknown as Array<{
      product_id: string;
      cantidad_disponible: number | string;
    }>;
    for (const f of filas) {
      disponible.set(f.product_id, (disponible.get(f.product_id) ?? 0) + Number(f.cantidad_disponible));
    }
    if (filas.length < PAGINA) return disponible;
  }
}
