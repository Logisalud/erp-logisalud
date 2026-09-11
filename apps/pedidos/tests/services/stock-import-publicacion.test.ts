import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Qué escribe (y qué NO escribe) el importador al publicar.
 *
 * Los dos casos vienen de la misma semana en producción y del mismo error de
 * fondo: tratar el archivo del día como una lista de novedades en vez de
 * como la foto del almacén que es.
 *
 * Primero, un archivo que NO trae la columna PROVEEDOR no debe borrar el
 * proveedor que ya está guardado.
 *
 * Pasó en producción el 2026-09-11: dos cargas seguidas con archivos sin esa
 * columna dejaron los 382 lotes sin proveedor, porque el upsert mandaba
 * `proveedor: null` para todas las filas. Una columna que el archivo no
 * menciona no es una columna vacía.
 */

const PRODUCTOS = [
  { id: "p-aci", codigo_interno: "DHP414", descripcion: "ACIDO TRANEXAMICO", controla_lote: true },
  { id: "p-all", codigo_interno: "BSA301", descripcion: "ALLERGY-BIO", controla_lote: true },
];

const FUENTES = [{ id: 1, nombre: "Almacén Central Lima", estado: "activo" }];

/** Cada llamada a upsert, con las filas que se mandaron. */
const upserts: Array<Array<Record<string, unknown>>> = [];
/** Ids que se pidieron borrar. */
const borrados: string[] = [];
/** Lo que ya está cargado en `stock_lotes` antes de publicar. */
let cargado: Array<Record<string, unknown>> = [];

vi.mock("@/services/audit-log", () => ({ logAudit: async () => {} }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: (nombre: string) => ({
      select: (() => {
        if (nombre === "stock_lotes") {
          // Lectura paginada: `.select().order().range()`.
          return () => ({
            order: () => ({
              range: async (desde: number) => ({
                data: desde === 0 ? cargado : [],
                error: null,
              }),
            }),
          });
        }
        return async () => {
          if (nombre === "products") return { data: PRODUCTOS, error: null };
          if (nombre === "inventory_sources") return { data: FUENTES, error: null };
          throw new Error(`tabla no simulada: ${nombre}`);
        };
      })(),
      delete: () => ({
        in: async (_columna: string, ids: string[]) => {
          borrados.push(...ids);
          return { error: null };
        },
      }),
      upsert: async (filas: Array<Record<string, unknown>>) => {
        upserts.push(filas);
        return { error: null };
      },
    }),
  }),
}));

const { publishStockImport, previewStockImport } = await import("@/services/stock-import");

function archivo(csv: string): File {
  return new File([csv], "stock.csv", { type: "text/csv" });
}

const SIN_PROVEEDOR = [
  "CODIGO;DESCRIPCION;LOTE;FV;CANTIDA",
  "DHP414;ACIDO TRANEXAMICO;PT12412;30/10/2027;180",
  "BSA301;ALLERGY-BIO;2050415;31/05/2028;11",
  "",
].join("\n");

const CON_PROVEEDOR = [
  "CODIGO;DESCRIPCION;LOTE;FV;CANTIDA;PROVEEDOR",
  "DHP414;ACIDO TRANEXAMICO;PT12412;30/10/2027;180;DIPHASAC - GENERICO",
  "BSA301;ALLERGY-BIO;2050415;31/05/2028;11;",
  "",
].join("\n");

beforeEach(() => {
  upserts.length = 0;
  borrados.length = 0;
  cargado = [];
});

describe("publishStockImport y la columna PROVEEDOR", () => {
  it("no manda la columna cuando el archivo no la trae", async () => {
    await publishStockImport(archivo(SIN_PROVEEDOR), "u1");

    expect(upserts).toHaveLength(1);
    for (const fila of upserts[0]) {
      // Ni siquiera como null: si la clave viaja, PostgREST la escribe.
      expect(Object.keys(fila)).not.toContain("proveedor");
    }
  });

  it("escribe el proveedor de las filas que sí lo traen, y deja quietas las demás", async () => {
    await publishStockImport(archivo(CON_PROVEEDOR), "u1");

    const con = upserts.find((filas) => filas.some((f) => "proveedor" in f));
    const sin = upserts.find((filas) => filas.every((f) => !("proveedor" in f)));

    expect(con).toHaveLength(1);
    expect(con?.[0].proveedor).toBe("DIPHASAC - GENERICO");
    // La celda vacía de BSA301 no viaja: dejaría en null lo ya guardado.
    expect(sin).toHaveLength(1);
  });

  it("la vista previa avisa qué columnas opcionales faltan", async () => {
    const preview = await previewStockImport(archivo(SIN_PROVEEDOR));

    expect(preview.columnasAusentes).toEqual(["FUENTE", "PROVEEDOR"]);
  });
});

describe("lo que el archivo no menciona", () => {
  /**
   * El archivo de stock es una foto del almacén. Encontrado en producción el
   * 2026-09-11: dos archivos del mismo día nombraban los mismos productos
   * con lotes distintos, y como el importador sólo hacía upsert, el lote
   * viejo se quedó cargado y el producto apareció dos veces, con el stock
   * sumado dos veces.
   */
  const VIEJO = {
    id: "l-viejo",
    product_id: "p-aci",
    inventory_source_id: 1,
    lote: "DDK626",
    cantidad_disponible: 35,
  };

  it("la vista previa los cuenta antes de publicar", async () => {
    cargado = [VIEJO];

    const preview = await previewStockImport(archivo(SIN_PROVEEDOR));

    expect(preview.sobrantes).toEqual([
      { codigoProducto: "DHP414", descripcion: "ACIDO TRANEXAMICO", lote: "DDK626", cantidad: 35 },
    ]);
    expect(preview.unidadesSobrantes).toBe(35);
  });

  it("con el stock completo del almacén, se dan de baja", async () => {
    cargado = [VIEJO];

    const resultado = await publishStockImport(archivo(SIN_PROVEEDOR), "u1", "reemplazar");

    expect(borrados).toEqual(["l-viejo"]);
    expect(resultado.dadosDeBaja).toBe(1);
  });

  it("con una carga parcial, quedan como están", async () => {
    cargado = [VIEJO];

    const resultado = await publishStockImport(archivo(SIN_PROVEEDOR), "u1", "solo_actualizar");

    expect(borrados).toEqual([]);
    expect(resultado.dadosDeBaja).toBe(0);
  });

  it("no toca el stock de una fuente que el archivo no nombra", async () => {
    // Mismo lote, otro almacén: el archivo de un almacén no puede decir
    // nada del stock de otro.
    cargado = [{ ...VIEJO, id: "l-otra-fuente", inventory_source_id: 2 }];

    await publishStockImport(archivo(SIN_PROVEEDOR), "u1", "reemplazar");

    expect(borrados).toEqual([]);
  });
});
