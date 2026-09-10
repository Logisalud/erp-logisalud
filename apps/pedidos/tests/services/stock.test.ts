import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La pantalla de Stock tiene que salir en orden alfabético de producto: es
 * cómo la busca un vendedor cuando el cliente le nombra algo.
 *
 * Lo que se cuida acá es que el orden lo decida el SERVIDOR y sea estable
 * entre páginas. El nombre vive en `products` y los lotes en `stock_lotes`,
 * y PostgREST no ordena una tabla por una columna de la embebida: si eso se
 * resolviera ordenando cada página por separado, un producto podría
 * aparecer dos veces o ninguna al pasar de página.
 */

type Lote = {
  id: string;
  product_id: string;
  lote: string;
  fecha_vencimiento: string | null;
  cantidad_disponible: number;
  proveedor: string | null;
  fecha_actualizacion: string;
  source: { nombre: string } | null;
};

const PRODUCTOS = [
  { id: "p-vit", codigo_interno: "DHP200", descripcion: "VITAMINA E 400 UI CJA. X 30 CAP. BDA." },
  { id: "p-aci", codigo_interno: "DHP414", descripcion: "ACIDO TRANEXAMICO 1G/ 10ML CJA X 50 AMP" },
  { id: "p-gas", codigo_interno: "DHP308", descripcion: "GASA ESTERIL 7.5 CM X 7.5 CM CAJA X 50 SOBRES" },
  { id: "p-sin", codigo_interno: "DHP999", descripcion: "PRODUCTO SIN STOCK" },
];

const LOTES: Lote[] = [
  { id: "l1", product_id: "p-vit", lote: "XK0011", fecha_vencimiento: "2027-06-30", cantidad_disponible: 241, proveedor: "DIPHASAC - OTC", fecha_actualizacion: "2026-09-10T14:00:00Z", source: { nombre: "Almacén Central Lima" } },
  { id: "l2", product_id: "p-aci", lote: "PT12412", fecha_vencimiento: "2027-10-30", cantidad_disponible: 180, proveedor: "DIPHASAC - GENERICO", fecha_actualizacion: "2026-09-10T14:00:00Z", source: { nombre: "Almacén Central Lima" } },
  { id: "l3", product_id: "p-aci", lote: "PT12406", fecha_vencimiento: "2027-09-30", cantidad_disponible: 108, proveedor: "DIPHASAC - GENERICO", fecha_actualizacion: "2026-09-10T14:00:00Z", source: { nombre: "Almacén Central Lima" } },
  { id: "l4", product_id: "p-gas", lote: "HD20250625", fecha_vencimiento: "2030-07-24", cantidad_disponible: 7, proveedor: "DIPHASAC - CUIDADO PERSONAL", fecha_actualizacion: "2026-09-10T14:00:00Z", source: { nombre: "Almacén Central Lima" } },
];

/** Lo que devolvería la vista `stock_levels`: una fila por producto. */
const NIVELES = [
  { product_id: "p-vit", cantidad_disponible: 241, lotes: 1, vence_primero: "2027-06-30" },
  { product_id: "p-aci", cantidad_disponible: 288, lotes: 2, vence_primero: "2027-09-30" },
  { product_id: "p-gas", cantidad_disponible: 7, lotes: 1, vence_primero: "2030-07-24" },
];

const pedidas: string[] = [];

function tabla(nombre: string): any {
  pedidas.push(nombre);

  if (nombre === "stock_levels") {
    return { select: () => ({ limit: async () => ({ data: NIVELES, error: null }) }) };
  }

  if (nombre === "products") {
    // Builder encadenable como el de supabase-js: `.or()` se puede llamar
    // después de `.order()`, y el orden lo aplica la "base".
    const estado: { filtro: string | null; columna: string; asc: boolean } = {
      filtro: null,
      columna: "descripcion",
      asc: true,
    };
    const builder: any = {
      or(expr: string) {
        estado.filtro = /ilike\.%([^%]*)%/.exec(expr)?.[1] ?? "";
        return builder;
      },
      order(columna: string, opts: { ascending: boolean }) {
        estado.columna = columna;
        estado.asc = opts.ascending;
        return builder;
      },
      limit() {
        return builder;
      },
      then(resolve: (v: unknown) => void) {
        let filas = [...PRODUCTOS];
        if (estado.filtro) {
          const t = estado.filtro.toLowerCase();
          filas = filas.filter(
            (p) =>
              p.codigo_interno.toLowerCase().includes(t) ||
              p.descripcion.toLowerCase().includes(t),
          );
        }
        filas.sort((a, b) =>
          String(a[estado.columna as "descripcion"]).localeCompare(
            String(b[estado.columna as "descripcion"]),
            "es",
          ),
        );
        if (!estado.asc) filas.reverse();
        resolve({ data: filas, error: null });
      },
    };
    return { select: () => builder };
  }

  if (nombre === "stock_lotes") {
    return {
      select: () => ({
        in: (_col: string, ids: string[]) => ({
          order: () => ({
            limit: async () => ({
              data: LOTES.filter((l) => ids.includes(l.product_id)).sort((a, b) =>
                String(a.fecha_vencimiento).localeCompare(String(b.fecha_vencimiento)),
              ),
              error: null,
            }),
          }),
        }),
      }),
    };
  }

  throw new Error(`tabla no simulada: ${nombre}`);
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ from: tabla }) }));

import { listStockLotes } from "@/services/stock";

beforeEach(() => {
  pedidas.length = 0;
});

describe("listStockLotes", () => {
  it("por defecto ordena alfabéticamente por nombre de producto", async () => {
    const page = await listStockLotes();

    expect(page.orden).toBe("producto");
    expect(page.filas.map((f) => f.descripcion)).toEqual([
      "ACIDO TRANEXAMICO 1G/ 10ML CJA X 50 AMP",
      "ACIDO TRANEXAMICO 1G/ 10ML CJA X 50 AMP",
      "GASA ESTERIL 7.5 CM X 7.5 CM CAJA X 50 SOBRES",
      "VITAMINA E 400 UI CJA. X 30 CAP. BDA.",
    ]);
  });

  it("dentro de un producto, el lote que vence primero va arriba", async () => {
    const page = await listStockLotes();
    const tranexamico = page.filas.filter((f) => f.codigo === "DHP414");
    expect(tranexamico.map((f) => [f.lote, f.fechaVencimiento])).toEqual([
      ["PT12406", "2027-09-30"],
      ["PT12412", "2027-10-30"],
    ]);
  });

  it("el orden por vencimiento pone primero al producto que vence antes", async () => {
    const page = await listStockLotes({ orden: "vencimiento" });
    expect(page.orden).toBe("vencimiento");
    expect(page.filas.map((f) => f.codigo)).toEqual(["DHP200", "DHP414", "DHP414", "DHP308"]);
  });

  it("no muestra productos del catálogo que no tienen stock", async () => {
    const page = await listStockLotes();
    expect(page.filas.some((f) => f.codigo === "DHP999")).toBe(false);
    expect(page.totalProductos).toBe(3);
    expect(page.totalLotes).toBe(4);
  });

  it("la búsqueda filtra por nombre y sigue ordenada", async () => {
    const page = await listStockLotes({ busqueda: "acido" });
    expect(page.filas.map((f) => f.lote)).toEqual(["PT12406", "PT12412"]);
    expect(page.totalProductos).toBe(1);
    expect(page.totalLotes).toBe(2);
  });

  it("la búsqueda por código también encuentra", async () => {
    const page = await listStockLotes({ busqueda: "DHP308" });
    expect(page.filas.map((f) => f.codigo)).toEqual(["DHP308"]);
  });

  it("una página fuera de rango cae en la última, no en una lista vacía", async () => {
    const page = await listStockLotes({ pagina: 99 });
    expect(page.pagina).toBe(1);
    expect(page.paginas).toBe(1);
    expect(page.filas).toHaveLength(4);
  });

  it("pide los lotes de la página, no la tabla entera", async () => {
    await listStockLotes();
    // stock_levels para saber qué tiene stock, products para el orden y el
    // nombre, stock_lotes sólo para los productos de esta página.
    expect(pedidas).toEqual(["stock_levels", "products", "stock_lotes"]);
  });
});
