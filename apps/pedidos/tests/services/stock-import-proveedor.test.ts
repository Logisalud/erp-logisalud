import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Un archivo de stock que NO trae la columna PROVEEDOR no debe borrar el
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

vi.mock("@/services/audit-log", () => ({ logAudit: async () => {} }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: (nombre: string) => ({
      select: async () => {
        if (nombre === "products") return { data: PRODUCTOS, error: null };
        if (nombre === "inventory_sources") return { data: FUENTES, error: null };
        if (nombre === "stock_lotes") return { data: [], error: null };
        throw new Error(`tabla no simulada: ${nombre}`);
      },
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
