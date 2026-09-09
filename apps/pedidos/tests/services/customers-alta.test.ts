import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El alta de un cliente desde el pedido: qué se escribe en `customers`.
 *
 * Importa que el celular y la dirección FISCAL viajen a la fila del
 * cliente, y que la de ENTREGA siga yendo a `customer_addresses`. Son dos
 * direcciones distintas y mezclarlas es el error que este test cuida: la
 * fiscal es una sola (la del RUC, la del comprobante) y las de entrega
 * pueden ser varias.
 */

const escrito = {
  customers: [] as Array<Record<string, unknown>>,
  addresses: [] as Array<Record<string, unknown>>,
};

function tabla(nombre: string): any {
  if (nombre === "customers") {
    return {
      insert: (fila: Record<string, unknown>) => {
        escrito.customers.push(fila);
        return {
          select: () => ({
            single: async () => ({
              data: {
                id: "c1",
                razon_social: fila.razon_social,
                nombre_comercial: null,
                ruc_o_documento: fila.ruc_o_documento,
                canal_id: fila.canal_id,
                condicion_pago_habitual_id: fila.condicion_pago_habitual_id,
              },
              error: null,
            }),
          }),
        };
      },
    };
  }
  if (nombre === "customer_addresses") {
    return {
      insert: (fila: Record<string, unknown>) => {
        escrito.addresses.push(fila);
        return {
          select: () => ({ single: async () => ({ data: { id: "a1" }, error: null }) }),
        };
      },
    };
  }
  throw new Error(`tabla no simulada: ${nombre}`);
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ from: tabla }) }));

import { requestNewCustomer } from "@/services/customers";

const BASE = {
  rucODocumento: "20517006514",
  razonSocial: "FARMACIA QUEEN SAC",
  canalId: 3,
  zonaId: 2,
  condicionPagoHabitualId: 1,
  direccion: "AV. LOS ALMACENES 123",
  ubigeo: "150140",
  departamento: "LIMA",
  provincia: "LIMA",
  distrito: "SANTIAGO DE SURCO",
  solicitadoPor: "u1",
};

beforeEach(() => {
  escrito.customers = [];
  escrito.addresses = [];
});

describe("alta de cliente nuevo", () => {
  it("guarda celular y dirección fiscal en el cliente, y la de entrega aparte", async () => {
    await requestNewCustomer({
      ...BASE,
      celular: " 999 111 222 ",
      direccionFiscal: "JR. FISCAL 456 — CERCADO DE LIMA",
    });

    const cliente = escrito.customers[0];
    expect(cliente.whatsapp).toBe(" 999 111 222 ");
    expect(cliente.direccion_fiscal).toBe("JR. FISCAL 456 — CERCADO DE LIMA");
    // La fiscal NO se cuela como dirección de entrega.
    expect(escrito.addresses).toHaveLength(1);
    expect(escrito.addresses[0].direccion).toBe("AV. LOS ALMACENES 123");
    expect(escrito.addresses[0].es_principal).toBe(true);
  });

  it("los dos campos son opcionales: sin ellos el alta sigue funcionando", async () => {
    await requestNewCustomer(BASE);

    expect(escrito.customers[0].whatsapp).toBeNull();
    expect(escrito.customers[0].direccion_fiscal).toBeNull();
    expect(escrito.addresses[0].ubigeo).toBe("150140");
  });
});
