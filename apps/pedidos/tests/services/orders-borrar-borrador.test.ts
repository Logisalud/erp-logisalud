import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Descartar un borrador.
 *
 * Lo que cuida este test es el orden y las condiciones del borrado: que solo
 * se borre en DRAFT, que la bitácora se escriba únicamente si la base de
 * verdad borró la fila (RLS bloquea devolviendo cero filas, no un error), y
 * que el snapshot que queda en auditoría lleve las líneas — que el cascade se
 * lleva y después ya no hay de dónde copiarlas.
 */

const estado = {
  order: null as Record<string, unknown> | null,
  items: [] as Array<Record<string, unknown>>,
  filasBorradas: [] as Array<{ id: string }>,
  /** Filtros con los que se llamó al DELETE. */
  filtrosDelete: null as Record<string, string> | null,
};

const auditoria: Array<Record<string, unknown>> = [];

vi.mock("@/services/audit-log", () => ({
  logAudit: async (entry: Record<string, unknown>) => {
    auditoria.push(entry);
  },
}));

// `order_items` se lee con `.select(...).eq(...)` y sin `maybeSingle`, así que
// el await cae sobre el objeto del `eq`: se le da un `then` para que resuelva.
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: (nombre: string) => ({
      select: () => ({
        eq: (_columna: string, _valor: string) => {
          const resultado =
            nombre === "orders"
              ? { data: estado.order, error: null }
              : { data: estado.items, error: null };
          return {
            maybeSingle: async () => resultado,
            then: (resolve: (v: unknown) => unknown) => Promise.resolve(resultado).then(resolve),
          };
        },
      }),
      delete: () => {
        const filtros: Record<string, string> = {};
        const cadena: any = {
          eq: (columna: string, valor: string) => {
            filtros[columna] = valor;
            return cadena;
          },
          select: async () => {
            estado.filtrosDelete = filtros;
            return { data: estado.filasBorradas, error: null };
          },
        };
        return cadena;
      },
    }),
  }),
}));

import { deleteDraftOrder } from "@/services/orders";

const BORRADOR = {
  id: "o1",
  estado: "DRAFT",
  seller_id: "s1",
  customer_id: "c1",
  fecha_creacion: "2026-09-11T10:00:00Z",
  customer: { razon_social: "BOTICA BOLOGNESI S.R.L." },
};

beforeEach(() => {
  estado.order = null;
  estado.items = [];
  estado.filasBorradas = [];
  estado.filtrosDelete = null;
  auditoria.length = 0;
});

describe("deleteDraftOrder", () => {
  it("borra el borrador y deja el pedido completo en la bitácora", async () => {
    estado.order = BORRADOR;
    estado.items = [
      { product_id: "p1", cantidad: 3, precio_unitario: 10, total: 30, product: { codigo_interno: "DHP100" } },
    ];
    estado.filasBorradas = [{ id: "o1" }];

    const resultado = await deleteDraftOrder("o1", "u1");

    expect(resultado).toEqual({ ok: true });
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0].accion).toBe("eliminar_pedido_borrador");
    expect(auditoria[0].entidadId).toBe("o1");
    expect((auditoria[0].datosAntes as any).razon_social).toBe("BOTICA BOLOGNESI S.R.L.");
    // Las líneas tienen que quedar guardadas: el cascade ya se las llevó.
    expect((auditoria[0].datosAntes as any).items).toEqual([
      { product_id: "p1", codigo_interno: "DHP100", cantidad: 3, precio_unitario: 10, total: 30 },
    ]);
  });

  it("filtra por estado DRAFT en el propio DELETE, no solo por id", async () => {
    estado.order = BORRADOR;
    estado.filasBorradas = [{ id: "o1" }];

    await deleteDraftOrder("o1", "u1");

    expect(estado.filtrosDelete).toEqual({ id: "o1", estado: "DRAFT" });
  });

  it("no borra un pedido ya enviado", async () => {
    estado.order = { ...BORRADOR, estado: "SUBMITTED" };

    const resultado = await deleteDraftOrder("o1", "u1");

    expect(resultado).toEqual({ ok: false, reason: "NO_ES_BORRADOR" });
    expect(estado.filtrosDelete).toBeNull();
    expect(auditoria).toHaveLength(0);
  });

  it("avisa cuando el pedido no existe o no es visible para quien pide", async () => {
    estado.order = null;

    expect(await deleteDraftOrder("o1", "u1")).toEqual({ ok: false, reason: "NO_ENCONTRADO" });
    expect(estado.filtrosDelete).toBeNull();
    expect(auditoria).toHaveLength(0);
  });

  it("no escribe auditoría si RLS bloqueó el borrado (cero filas, sin error)", async () => {
    estado.order = BORRADOR;
    estado.filasBorradas = [];

    const resultado = await deleteDraftOrder("o1", "u1");

    expect(resultado).toEqual({ ok: false, reason: "SIN_PERMISO" });
    expect(auditoria).toHaveLength(0);
  });
});
