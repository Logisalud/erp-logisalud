import { describe, expect, it, vi } from "vitest";

/**
 * Quien despacha tiene que ver lo que escribió el vendedor.
 *
 * La observación ("horario de recepción: 3pm en adelante", "recoger 2
 * frascos que se enviaron por error") salía por correo y en el Excel, pero
 * la pantalla de despacho no la pedía, y encima el rol `operaciones` ni
 * siquiera podía leer la tabla: habría recibido una lista vacía sin error.
 * Dos vendedoras reclamaron que sus observaciones "no pasaban" — pasaban,
 * pero no llegaban a los ojos de quien arma la caja.
 */

const pedido = {
  id: "o-1",
  numero: 328,
  estado: "READY_FOR_OPERATIONS",
  fecha_envio: "2026-10-21T20:10:23Z",
  customer_address_id: "dir-1",
  razon_social_snapshot: "BOTICA MI PASTOR",
  direccion_snapshot: "Av. Siempre Viva 123",
  canal_snapshot: "Horizontal",
  zona_snapshot: "ZONA 02",
  vendedor_snapshot: "ROMINA CHAMOCHUMBI",
  customer: { razon_social: "BOTICA MI PASTOR", ruc_o_documento: "20606645202" },
  payment_terms: { nombre: "Contado" },
};

/** De la más nueva a la más vieja: el servicio tiene que darlas al revés. */
const observaciones = [
  { id: "ob-2", comentario: "Despachar el miércoles", fecha: "2026-10-21T20:09:44Z" },
  { id: "ob-1", comentario: "Horario de recepción: 3pm en adelante", fecha: "2026-10-21T19:00:00Z" },
];

let ordenPedida: { columna: string; ascending: boolean } | null = null;

function tabla(nombre: string): any {
  if (nombre === "orders") {
    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: pedido, error: null }) }) }),
    };
  }
  if (nombre === "order_items") {
    return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
  }
  if (nombre === "customer_addresses") {
    return {
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { id: "dir-1", estado: "activo" }, error: null }) }),
      }),
    };
  }
  if (nombre === "order_observations") {
    return {
      select: () => ({
        eq: () => ({
          order: async (columna: string, opciones: { ascending: boolean }) => {
            ordenPedida = { columna, ascending: opciones.ascending };
            const copia = [...observaciones];
            return { data: opciones.ascending ? copia.reverse() : copia, error: null };
          },
        }),
      }),
    };
  }
  throw new Error(`tabla inesperada: ${nombre}`);
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ from: tabla }) }));
vi.mock("@/services/audit-log", () => ({ logAudit: async () => {} }));

import { getOrderForFulfillment } from "@/services/fulfillments";

describe("getOrderForFulfillment", () => {
  it("trae las observaciones del vendedor, de la más vieja a la más nueva", async () => {
    const order = await getOrderForFulfillment("o-1");

    expect(ordenPedida).toEqual({ columna: "fecha", ascending: true });
    expect(order?.observaciones.map((o) => o.comentario)).toEqual([
      "Horario de recepción: 3pm en adelante",
      "Despachar el miércoles",
    ]);
  });
});
