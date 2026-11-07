import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La ruta del WMS es de SOLO LECTURA. Dos candados:
 *  1) el código fuente de la ruta, del servicio y del dominio no usa ningún
 *     método de escritura (ni rpc, ni logAudit);
 *  2) al ejecutarla contra un cliente falso, solo se invocan lecturas.
 */

const RAIZ = path.resolve(__dirname, "../..");
const ARCHIVOS = [
  "app/api/integracion/wms/pedidos-listos/route.ts",
  "services/wms-pedidos-listos.ts",
  "domain/wms-pedidos-listos.ts",
  // lib/wms-firma.ts queda fuera: usa `.update()` de node:crypto (hash), no de la base.
];

const ESCRITURA = /\.\s*(insert|update|delete|upsert|rpc)\s*\(|\blogAudit\b|\.storage\b|\.auth\.admin\b/;

function sinComentarios(src: string) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("la ruta del WMS no escribe nada", () => {
  it.each(ARCHIVOS)("%s no usa métodos de escritura", (archivo) => {
    const src = sinComentarios(readFileSync(path.join(RAIZ, archivo), "utf8"));
    expect(src).not.toMatch(ESCRITURA);
  });

  it("la ruta solo exporta GET", () => {
    const src = sinComentarios(readFileSync(path.join(RAIZ, ARCHIVOS[0]), "utf8"));
    expect(src).not.toMatch(/export\s+(async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/);
    expect(src).toMatch(/export\s+async\s+function\s+GET\b/);
  });
});

// ---- Ejecución contra un cliente falso que anota cada llamada ----

const llamadas: string[] = [];
const tablas: Record<string, unknown[]> = {};

function constructor(tabla: string) {
  const b: Record<string, unknown> = {};
  const anotar = (m: string) => (..._: unknown[]) => {
    llamadas.push(`${tabla}.${m}`);
    return b;
  };
  for (const m of ["select", "in", "eq", "order", "range"]) b[m] = anotar(m);
  for (const m of ["insert", "update", "delete", "upsert"]) {
    b[m] = () => {
      llamadas.push(`${tabla}.${m}`);
      throw new Error(`escritura prohibida: ${tabla}.${m}`);
    };
  }
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: tablas[tabla] ?? [], error: null }).then(ok);
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (t: string) => constructor(t),
    rpc: () => {
      llamadas.push("rpc");
      throw new Error("rpc prohibido");
    },
  }),
}));

import { cargarPedidosListosParaWms } from "@/services/wms-pedidos-listos";

describe("cargarPedidosListosParaWms con un cliente falso", () => {
  beforeEach(() => {
    llamadas.length = 0;
    for (const k of Object.keys(tablas)) delete tablas[k];
    tablas.orders = [
      {
        id: "p1", numero: 7, estado: "READY_FOR_OPERATIONS", fecha_envio: "2026-10-14T15:00:00Z", fecha_creacion: null,
        updated_at: "2026-10-14T15:00:00Z", ubigeo_snapshot: "150116", direccion_snapshot: "Av. X", razon_social_snapshot: "X SAC",
        vendedor_snapshot: "Ana", customer: { id: "c1", razon_social: "X SAC", ruc_o_documento: "20512345671" },
        payment_term: { nombre: "Contado" },
        items: [{ id: "l1", cantidad: 3, product: { codigo_interno: "A-1", descripcion: "Algo", presentacion: null } }],
      },
    ];
    tablas.ubigeos = [{ codigo_inei: "150116", distrito: "Lince" }];
    tablas.zonas_reparto = [{ id: 3, codigo: "CENTRO", nombre: "Centro", orden_ruta: 3 }];
    tablas.ubigeo_zona_reparto = [{ codigo_inei: "150116", zona_reparto_id: 3, orden_distrito: 6 }];
    tablas.plan_semanal_reparto = [
      { dia_semana: 1, zona_reparto_id: 3 },
      { dia_semana: 3, zona_reparto_id: 3 },
    ];
  });

  it("solo ejecuta lecturas y devuelve el pedido en la forma del contrato", async () => {
    const r = await cargarPedidosListosParaWms(new Date("2026-11-07T15:00:00Z"));
    expect(r.pedidos).toHaveLength(1);
    expect(r.pedidos[0]).toMatchObject({ pedidoId: "p1", numero: "7", estado: "READY_FOR_OPERATIONS", version: 1 });
    expect(r.pedidos[0].cliente.distrito).toBe("Lince");
    // 2026-11-07 es sábado: la zona Centro toca lunes y miércoles, gana el lunes 9.
    expect(r.pedidos[0]).toMatchObject({
      zona_reparto: { codigo: "CENTRO", nombre: "Centro", orden_ruta: 3 },
      orden_distrito: 6,
      dia_planificado: 1,
      fecha_planificada: "2026-11-09",
    });

    expect(llamadas.length).toBeGreaterThan(0);
    const metodos = new Set(llamadas.map((l) => l.split(".").pop()));
    for (const m of metodos) expect(["select", "in", "eq", "order", "range"]).toContain(m);
    expect(llamadas.some((l) => /insert|update|delete|upsert|rpc/.test(l))).toBe(false);
  });

  it("filtra por los estados del contrato y nunca consulta tablas fuera de la lista de lectura", async () => {
    await cargarPedidosListosParaWms();
    const tocadas = new Set(llamadas.map((l) => l.split(".")[0]));
    expect([...tocadas].sort()).toEqual(
      [
        "facturas_emitidas",
        "order_observations",
        "order_status_history",
        "orders",
        "plan_semanal_reparto",
        "ubigeo_zona_reparto",
        "ubigeos",
        "zonas_reparto",
      ].sort(),
    );
  });
});
