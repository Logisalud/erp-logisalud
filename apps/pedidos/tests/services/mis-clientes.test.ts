import { describe, expect, it, vi } from "vitest";

/**
 * "Mis clientes nuevos": lo que registró el vendedor y en qué quedó.
 *
 * El orden no es cosmético: arriba va lo que necesita atención (pendiente,
 * después rechazado) y recién al final lo aprobado, que ya no requiere nada.
 * Y cada fila dice cuántos pedidos quedaron frenados esperándolo, que es lo
 * que separa un pendiente cualquiera de uno urgente.
 */

const CLIENTES = [
  {
    id: "c-activo",
    razon_social: "BOTICA APROBADA",
    ruc_o_documento: "1",
    estado: "ACTIVO",
    created_at: "2026-09-12T10:00:00Z",
    fecha_validacion: "2026-09-12T11:00:00Z",
    zona: { nombre: "ZONA 04" },
    customer_addresses: [{ direccion: "AV. UNO", es_principal: true }],
  },
  {
    id: "c-pend",
    razon_social: "BOTICA PENDIENTE",
    ruc_o_documento: "2",
    estado: "PENDIENTE_DE_VALIDACION",
    created_at: "2026-09-11T10:00:00Z",
    fecha_validacion: null,
    zona: null,
    customer_addresses: [],
  },
  {
    id: "c-rech",
    razon_social: "BOTICA RECHAZADA",
    ruc_o_documento: "3",
    estado: "RECHAZADO",
    created_at: "2026-09-10T10:00:00Z",
    fecha_validacion: "2026-09-10T12:00:00Z",
    zona: null,
    customer_addresses: [{ direccion: "AV. TRES", es_principal: false }],
  },
];

const FRENADOS = [{ customer_id: "c-pend" }, { customer_id: "c-pend" }];

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: (nombre: string) => {
      if (nombre === "customers") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({ limit: async () => ({ data: CLIENTES, error: null }) }),
            }),
          }),
        };
      }
      if (nombre === "orders") {
        return {
          select: () => ({
            eq: () => ({ in: async () => ({ data: FRENADOS, error: null }) }),
          }),
        };
      }
      throw new Error(`tabla no simulada: ${nombre}`);
    },
  }),
}));

import { listMisClientesNuevos } from "@/services/customers";

describe("listMisClientesNuevos", () => {
  it("pone primero lo que necesita atención", async () => {
    const filas = await listMisClientesNuevos("u1");

    expect(filas.map((f) => f.estado)).toEqual([
      "PENDIENTE_DE_VALIDACION",
      "RECHAZADO",
      "ACTIVO",
    ]);
  });

  it("cuenta los pedidos frenados esperando a cada cliente", async () => {
    const filas = await listMisClientesNuevos("u1");

    expect(filas.find((f) => f.id === "c-pend")?.pedidosEsperando).toBe(2);
    expect(filas.find((f) => f.id === "c-activo")?.pedidosEsperando).toBe(0);
  });

  it("toma la dirección principal, o la única que haya", async () => {
    const filas = await listMisClientesNuevos("u1");

    expect(filas.find((f) => f.id === "c-activo")?.direccion).toBe("AV. UNO");
    // Sin ninguna marcada como principal, sirve la primera.
    expect(filas.find((f) => f.id === "c-rech")?.direccion).toBe("AV. TRES");
    expect(filas.find((f) => f.id === "c-pend")?.direccion).toBeNull();
  });
});
