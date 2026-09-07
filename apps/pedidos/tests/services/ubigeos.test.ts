import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El selector de ubigeo tiene que ofrecer los 25 departamentos y TODAS las
 * provincias del que se elija.
 *
 * Lo que se cuida acá es la trampa que ya mordió en producción: PostgREST
 * no hace DISTINCT y tope las respuestas en 1.000 filas, así que pedir las
 * 1.884 filas del catálogo para quedarse con 25 nombres devuelve una lista
 * truncada —11 departamentos, sin LIMA— sin ningún error visible. El
 * DISTINCT lo hace la base; este test falla si alguien vuelve a leer la
 * tabla directo.
 */

const llamadas: Array<{ tipo: "rpc" | "from"; nombre: string; args?: unknown }> = [];

const CATALOGO: Record<string, string[]> = {
  ubigeo_departamentos: [
    "AMAZONAS", "ANCASH", "APURIMAC", "AREQUIPA", "AYACUCHO", "CAJAMARCA", "CALLAO",
    "CUSCO", "HUANCAVELICA", "HUANUCO", "ICA", "JUNIN", "LA LIBERTAD", "LAMBAYEQUE",
    "LIMA", "LORETO", "MADRE DE DIOS", "MOQUEGUA", "PASCO", "PIURA", "PUNO",
    "SAN MARTIN", "TACNA", "TUMBES", "UCAYALI",
  ],
};

const PROVINCIAS: Record<string, string[]> = {
  LIMA: ["BARRANCA", "CAJATAMBO", "CAÑETE", "CANTA", "HUARAL", "HUAROCHIRI", "HUAURA", "LIMA", "OYON", "YAUYOS"],
  JUNIN: ["CHANCHAMAYO", "CHUPACA", "CONCEPCION", "HUANCAYO", "JAUJA", "JUNIN", "SATIPO", "TARMA", "YAULI"],
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    rpc: async (nombre: string, args?: Record<string, unknown>) => {
      llamadas.push({ tipo: "rpc", nombre, args });
      if (nombre === "ubigeo_departamentos") return { data: CATALOGO.ubigeo_departamentos, error: null };
      if (nombre === "ubigeo_provincias") {
        return { data: PROVINCIAS[String(args?.p_departamento)] ?? [], error: null };
      }
      return { data: null, error: { message: `rpc no simulada: ${nombre}` } };
    },
    from: (nombre: string) => {
      llamadas.push({ tipo: "from", nombre });
      throw new Error(
        `No se debe leer la tabla ${nombre} directo para armar el selector: ` +
          "PostgREST tope en 1.000 filas y la lista queda truncada en silencio.",
      );
    },
  }),
}));

import { listDepartamentos, listProvincias } from "@/services/ubigeos";

beforeEach(() => {
  llamadas.length = 0;
});

describe("catálogo del selector de ubigeo", () => {
  it("trae los 25 departamentos, incluidos los que caen después del corte de 1.000 filas", async () => {
    const deps = await listDepartamentos();

    expect(deps).toHaveLength(25);
    // Los que se perdían con la lectura directa de la tabla: el corte cae
    // dentro de JUNIN, por orden alfabético.
    for (const perdido of ["JUNIN", "LIMA", "PIURA", "SAN MARTIN", "UCAYALI"]) {
      expect(deps).toContain(perdido);
    }
    expect(llamadas).toEqual([{ tipo: "rpc", nombre: "ubigeo_departamentos", args: undefined }]);
  });

  it("trae TODAS las provincias del departamento, sin más filtro que ese", async () => {
    expect(await listProvincias("LIMA")).toEqual(PROVINCIAS.LIMA);
    expect(await listProvincias("JUNIN")).toEqual(PROVINCIAS.JUNIN);

    expect(llamadas).toEqual([
      { tipo: "rpc", nombre: "ubigeo_provincias", args: { p_departamento: "LIMA" } },
      { tipo: "rpc", nombre: "ubigeo_provincias", args: { p_departamento: "JUNIN" } },
    ]);
  });

  it("sin departamento no se le pregunta nada a la base", async () => {
    expect(await listProvincias("  ")).toEqual([]);
    expect(llamadas).toEqual([]);
  });
});
