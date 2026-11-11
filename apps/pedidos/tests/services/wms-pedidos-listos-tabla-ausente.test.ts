import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Cliente falso: devuelve filas para las tablas "presentes" y el error de PostgREST para las ausentes.
function clienteFalso(ausentes: string[]) {
  const pedido = {
    id: "p1", numero: 1, estado: "READY_FOR_OPERATIONS", fecha_envio: null, fecha_creacion: "2026-11-10T10:00:00Z",
    updated_at: "2026-11-10T10:00:00Z", ubigeo_snapshot: "150101", direccion_snapshot: "Av. X", razon_social_snapshot: "Cliente",
    vendedor_snapshot: null, customer: { id: "c1", razon_social: "Cliente", ruc_o_documento: "20100000001" },
    payment_term: { nombre: "Contado" }, items: [],
  };
  return {
    from(tabla: string) {
      const resultado = ausentes.includes(tabla)
        ? { data: null, error: { code: "PGRST205", message: `Could not find the table 'pedidos.${tabla}' in the schema cache` } }
        : { data: tabla === "orders" ? [pedido] : [], error: null };
      const q: Record<string, unknown> = {};
      const encadenar = () => q;
      for (const m of ["select", "in", "eq", "order", "range"]) q[m] = encadenar;
      q.then = (ok: (r: unknown) => unknown) => Promise.resolve(resultado).then(ok);
      return q;
    },
  };
}

describe("pedidos listos para el WMS: tablas auxiliares ausentes", () => {
  it("sin facturas_emitidas ni ubigeos la ruta no falla: ese dato simplemente no se entrega", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => clienteFalso(["facturas_emitidas", "ubigeos"]) }));
    const { cargarPedidosListosParaWms } = await import("@/services/wms-pedidos-listos");
    const r = await cargarPedidosListosParaWms();
    expect(JSON.stringify(r)).toContain("20100000001");
  });

  it("un error que no es de tabla ausente sigue fallando", async () => {
    vi.resetModules();
    const roto = clienteFalso([]);
    const from = roto.from.bind(roto);
    roto.from = (t: string) => {
      const q = from(t) as Record<string, unknown>;
      if (t === "facturas_emitidas") q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: null, error: { code: "XX000", message: "boom" } }).then(ok);
      return q;
    };
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => roto }));
    const { cargarPedidosListosParaWms } = await import("@/services/wms-pedidos-listos");
    await expect(cargarPedidosListosParaWms()).rejects.toThrow("boom");
  });
});
