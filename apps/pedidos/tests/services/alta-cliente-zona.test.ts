import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La zona del cliente nuevo sale del vendedor, no de un selector.
 *
 * Era la pregunta que ningún vendedor sabía contestar: su zona es un dato de
 * la empresa ("ZONA 04", código LIMH04), no algo que él maneje, y elegir mal
 * dejaba al cliente en una zona ajena — invisible para él en cuanto vuelva
 * el filtro por zona.
 */

const sesion = {
  userId: "u1",
  roles: ["vendedor"] as string[],
  sellerId: "s-lupe" as string | null,
};

/** Zona por vendedor, como la tiene `sellers.zone_id`. */
const ZONAS: Record<string, { id: number; nombre: string } | null> = {
  "s-lupe": { id: 4, nombre: "ZONA 04" },
  "s-karina": { id: 7, nombre: "ZONA 07" },
  "s-sin-zona": null,
};

const alta = { recibido: null as Record<string, unknown> | null };

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => sesion,
  requireUserId: async () => sesion.userId,
}));

vi.mock("@/services/ubigeos", () => ({
  resolverUbigeo: async () => "150140",
  listProvincias: async () => [],
  listDistritos: async () => [],
}));

vi.mock("@/services/customers", () => ({
  zonaDelVendedor: async (sellerId: string) => ZONAS[sellerId] ?? null,
  requestNewCustomer: async (input: Record<string, unknown>) => {
    alta.recibido = input;
    return { customer: { id: "c1" }, addressId: "a1" };
  },
  listCustomerAddresses: async () => [],
  addCustomerAddress: async () => ({ id: "a1" }),
  searchActiveCustomers: async () => [],
  ClienteDuplicadoError: class extends Error {},
  MENSAJE_SIN_ZONA_ASIGNADA: "SIN_ZONA",
}));

import { crearClienteNuevo } from "@/app/pedidos/nuevo/actions";

const BASE = {
  razonSocial: "BOTICA NUEVA",
  rucODocumento: "20517006514",
  canalId: 3,
  condicionPagoHabitualId: 1,
  direccion: "AV. UNO 123",
  departamento: "LIMA",
  provincia: "LIMA",
  distrito: "SANTIAGO DE SURCO",
};

beforeEach(() => {
  alta.recibido = null;
  sesion.roles = ["vendedor"];
  sesion.sellerId = "s-lupe";
});

describe("alta de cliente desde el pedido", () => {
  it("toma la zona del vendedor que lo registra", async () => {
    const resultado = await crearClienteNuevo(BASE);

    expect(resultado.ok).toBe(true);
    expect(alta.recibido?.zonaId).toBe(4);
  });

  it("un vendedor no puede registrar en la zona de otro aunque mande el dato", async () => {
    // El sellerId sólo lo honra el administrador: para un vendedor manda su
    // propio seller, como en el pedido.
    await crearClienteNuevo({ ...BASE, sellerId: "s-karina" });

    expect(alta.recibido?.zonaId).toBe(4);
  });

  it("el administrador registra en la zona del vendedor que eligió", async () => {
    sesion.roles = ["administrador"];
    sesion.sellerId = null;

    await crearClienteNuevo({ ...BASE, sellerId: "s-karina" });

    expect(alta.recibido?.zonaId).toBe(7);
  });

  it("si el vendedor no tiene zona, lo dice en vez de registrar mal", async () => {
    sesion.sellerId = "s-sin-zona";

    const resultado = await crearClienteNuevo(BASE);

    expect(resultado).toEqual({ ok: false, mensaje: "SIN_ZONA" });
    expect(alta.recibido).toBeNull();
  });
});
