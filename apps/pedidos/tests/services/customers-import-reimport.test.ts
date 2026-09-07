import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La reimportación de la cartera, de punta a punta con la base falsa: lo
 * que se mira es el payload REAL del upsert, que es donde el trabajo hecho
 * a mano se perdía en silencio.
 */

type Upsert = Record<string, unknown>;

const db = {
  /** Lo que ya hay cargado, por RUC. */
  clientes: [] as Array<{
    ruc_o_documento: string;
    canal_id: number | null;
    condicion_pago_habitual_id: number | null;
    estado: string;
    customer_addresses: Array<{ id: string }>;
  }>,
  upserts: [] as Upsert[],
};

const CANAL_HORIZONTAL = 3;

function tabla(nombre: string): any {
  if (nombre === "sales_channels") {
    return {
      select: () => ({
        eq: () => ({ single: async () => ({ data: { id: CANAL_HORIZONTAL }, error: null }) }),
      }),
    };
  }

  if (nombre === "customers") {
    return {
      select: () => ({
        in: async (_col: string, rucs: string[]) => ({
          data: db.clientes.filter((c) => rucs.includes(c.ruc_o_documento)),
          error: null,
        }),
        range: async () => ({ data: [], error: null }),
      }),
      upsert: (filas: Upsert[]) => {
        db.upserts.push(...filas);
        return {
          select: async () => ({
            data: filas.map((f) => ({
              id: `id-${f.ruc_o_documento}`,
              ruc_o_documento: f.ruc_o_documento,
            })),
            error: null,
          }),
        };
      },
    };
  }

  if (
    nombre === "customer_contacts" ||
    nombre === "customer_seller_reassignments" ||
    nombre === "legacy_vendor_snapshots"
  ) {
    const filtro: any = {
      in: async () => ({ data: [], error: null, count: 0 }),
      eq: () => filtro,
      neq: () => filtro,
    };
    return {
      select: () => filtro,
      delete: () => filtro,
      insert: async () => ({ error: null }),
    };
  }

  if (nombre === "customer_addresses") {
    return {
      select: () => ({
        in: async () => ({ data: [], error: null }),
        eq: () => ({ in: async () => ({ data: [], error: null }) }),
        range: async () => ({ data: [], error: null }),
      }),
    };
  }

  if (nombre === "zones") {
    return { select: async () => ({ data: [{ id: 2, codigo_zona: "LIMH01" }], error: null }) };
  }

  if (nombre === "sellers") {
    return {
      select: async () => ({
        data: [{ id: "seller-1", codigo_representante: "CRP1011" }],
        error: null,
      }),
    };
  }

  throw new Error(`tabla no simulada: ${nombre}`);
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ from: tabla }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: tabla }) }));
vi.mock("@/services/audit-log", () => ({ logAudit: async () => {} }));

import { previewCustomerImport, publishCustomerImport } from "@/services/customers-import";

const VENDEDORES_CSV = "id,codigo\n900,CRP1011\n";
const CLIENTES_CSV = [
  "ruc,razon_social,vendedor_actual_id,codigo_zona,zona_manual,distrito,provincia,departamento,celular",
  // Ya existe y alguien le corrigió canal, condición y estado.
  "20517006514,FARMACIA QUEEN SAC,900,LIMH01,false,SURCO,LIMA,LIMA,999111222",
  // Ya existe pero sin canal cargado: se completa.
  "20609238756,MEDICAL ROSS FARM EIRL,900,LIMH01,false,TRUJILLO,TRUJILLO,LA LIBERTAD,",
  // Nuevo.
  "20614846276,BOTICAS T & T FARMA SAC,900,LIMH01,false,CHORRILLOS,LIMA,LIMA,",
].join("\n");

const input = { clientesCsv: CLIENTES_CSV, vendedoresCsv: VENDEDORES_CSV, snapshotCsv: null };

beforeEach(() => {
  db.upserts = [];
  db.clientes = [
    {
      ruc_o_documento: "20517006514",
      canal_id: 7, // Instituciones, puesto a mano
      condicion_pago_habitual_id: 4, // Crédito 30 días, puesto a mano
      estado: "INACTIVO", // dado de baja a mano
      customer_addresses: [{ id: "a1" }],
    },
    {
      ruc_o_documento: "20609238756",
      canal_id: null,
      condicion_pago_habitual_id: null,
      estado: "ACTIVO",
      customer_addresses: [],
    },
  ];
});

const porRuc = (ruc: string) => db.upserts.find((u) => u.ruc_o_documento === ruc)!;

describe("reimportar la cartera", () => {
  it("no pisa canal, condición de pago ni estado de un cliente que ya existe", async () => {
    await publishCustomerImport(input, "actor-1");

    const existente = porRuc("20517006514");
    expect(existente.canal_id).toBe(7);
    expect(existente.condicion_pago_habitual_id).toBe(4);
    expect(existente.estado).toBe("INACTIVO");
  });

  it("sí actualiza identificación y ubicación con lo que trae el archivo", async () => {
    await publishCustomerImport(input, "actor-1");

    const existente = porRuc("20517006514");
    expect(existente.razon_social).toBe("FARMACIA QUEEN SAC");
    expect(existente.distrito).toBe("SURCO");
    expect(existente.provincia).toBe("LIMA");
    expect(existente.departamento).toBe("LIMA");
    expect(existente.zona_id).toBe(2);
    expect(existente.vendedor_id).toBe("seller-1");
    expect(existente.whatsapp).toBe("999111222");
  });

  it("completa el canal cuando está vacío", async () => {
    await publishCustomerImport(input, "actor-1");
    expect(porRuc("20609238756").canal_id).toBe(CANAL_HORIZONTAL);
    // Y su estado, que no lo tocó nadie, queda como estaba.
    expect(porRuc("20609238756").estado).toBe("ACTIVO");
  });

  it("un cliente nuevo entra con el canal por defecto y sin condición habitual", async () => {
    await publishCustomerImport(input, "actor-1");
    const nuevo = porRuc("20614846276");
    expect(nuevo.canal_id).toBe(CANAL_HORIZONTAL);
    expect(nuevo.condicion_pago_habitual_id).toBeNull();
    expect(nuevo.estado).toBe("ACTIVO");
  });

  it("el resultado cuenta los estados ESCRITOS, no los que derivaba el archivo", async () => {
    const result = await publishCustomerImport(input, "actor-1");
    // El INACTIVO que se conservó no puede contarse como ACTIVO.
    expect(result.activos).toBe(2);
    expect(result.preservados).toEqual({ canal: 1, condicionPago: 1, estado: 1 });
  });

  it("la vista previa avisa cuántos conservan lo suyo, antes de escribir nada", async () => {
    const preview = await previewCustomerImport(input);
    expect(preview.conservan).toEqual({ canal: 1, condicionPago: 1, estado: 1 });
    expect(preview.nuevos).toBe(1);
    expect(preview.yaExistentes).toBe(2);
    expect(db.upserts).toHaveLength(0);
  });
});
