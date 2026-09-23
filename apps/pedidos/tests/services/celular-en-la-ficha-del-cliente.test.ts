import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El maestro de clientes es la otra puerta por la que entra el celular.
 *
 * Desde la migración `1040` el pedido no sale sin un celular válido, pero la
 * ficha del cliente guardaba lo que hubiera escrito: un número de prueba
 * cargado probando —o un dígito de menos— quedaba en la base y el pedido de
 * ese cliente se frenaba después, lejos de donde se había tipeado.
 *
 * Vacío se sigue aceptando: la mayoría de los clientes no tiene número y
 * bloquear la ficha entera impediría corregirles la zona o la dirección.
 */

let guardado: Record<string, unknown> | null = null;

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/session", () => ({
  requireUserId: async () => "usuario-1",
  getCurrentUser: async () => ({ id: "usuario-1", roles: ["administrador"] }),
}));
vi.mock("@/services/audit-log", () => ({ logAudit: async () => {} }));
vi.mock("@/services/ubigeos", () => ({
  listDistritos: async () => [],
  listProvincias: async () => [],
  resolverUbigeo: async () => null,
}));
vi.mock("@/services/customer-import", () => ({
  previewCustomerImport: async () => ({}),
  publishCustomerImport: async () => ({}),
}));
vi.mock("@/services/customers", () => ({
  addCustomerAddress: async () => {},
  searchCustomersAnyState: async () => [],
  updateCustomerAddress: async () => {},
  updateCustomerBasics: async (input: Record<string, unknown>) => {
    guardado = input;
    return { antes: {}, despues: {} };
  },
}));

import { guardarDatosDelCliente } from "@/app/admin/maestros/clientes/actions";

function ficha(celular: string) {
  const f = new FormData();
  f.set("razonSocial", "BOTICA EL ROSARIO");
  f.set("tipoComprobante", "FACTURA_O_BOLETA");
  f.set("estado", "ACTIVO");
  f.set("celular", celular);
  return f;
}

beforeEach(() => {
  guardado = null;
});

describe("guardarDatosDelCliente — el celular", () => {
  it("guarda un celular válido", async () => {
    await guardarDatosDelCliente("10209880976", "cli-1", ficha("987654321"));

    expect(guardado?.celular).toBe("987654321");
  });

  it("normaliza lo que escribe la gente", async () => {
    await guardarDatosDelCliente("10209880976", "cli-1", ficha("+51 987 654 321"));

    expect(guardado?.celular).toBe("987654321");
  });

  it("rechaza un número que no es un celular peruano", async () => {
    await expect(
      guardarDatosDelCliente("10209880976", "cli-1", ficha("5555555555")),
    ).rejects.toThrow("9 dígitos");

    expect(guardado).toBeNull();
  });

  it("acepta vacío y lo guarda como null", async () => {
    await guardarDatosDelCliente("10209880976", "cli-1", ficha("   "));

    expect(guardado?.celular).toBeNull();
  });
});
