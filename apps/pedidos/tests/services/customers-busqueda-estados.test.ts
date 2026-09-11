import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Con qué estados puede empezarse un pedido.
 *
 * El buscador filtraba por ACTIVO, pero el propio flujo de "Cliente nuevo"
 * crea el cliente en PENDIENTE_DE_VALIDACION: el vendedor lo registraba, y
 * al volver a buscarlo no lo encontraba. Lo registraba otra vez y la base le
 * contestaba que ya existía. Pasó el 2026-09-11 con el documento
 * 10435922304 (PORTOCARRERO GARCIA FLORISELDA).
 */

/** Filtros con los que se llamó a la consulta de `customers`. */
const llamada = { estados: null as string[] | null, eqEstado: null as string | null };

const CLIENTES = [
  {
    id: "c1",
    razon_social: "PORTOCARRERO GARCIA FLORISELDA",
    nombre_comercial: null,
    ruc_o_documento: "10435922304",
    canal_id: 1,
    condicion_pago_habitual_id: 1,
    estado: "PENDIENTE_DE_VALIDACION",
  },
];

function builder(): any {
  const cadena: any = {
    in: (columna: string, valores: string[]) => {
      if (columna === "estado") llamada.estados = valores;
      return cadena;
    },
    eq: (columna: string, valor: string) => {
      if (columna === "estado") llamada.eqEstado = valor;
      return cadena;
    },
    or: () => cadena,
    order: () => cadena,
    limit: async () => ({ data: CLIENTES, error: null }),
  };
  return cadena;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ from: () => ({ select: () => builder() }) }),
}));

import { ESTADOS_PARA_PEDIR, listActiveCustomers, searchActiveCustomers } from "@/services/customers";

beforeEach(() => {
  llamada.estados = null;
  llamada.eqEstado = null;
});

describe("clientes con los que se puede empezar un pedido", () => {
  it("el buscador incluye a los pendientes de validación", async () => {
    const resultados = await searchActiveCustomers("10435922304");

    expect(llamada.estados).toEqual(["ACTIVO", "PENDIENTE_DE_VALIDACION"]);
    expect(llamada.eqEstado).toBeNull();
    expect(resultados[0].estado).toBe("PENDIENTE_DE_VALIDACION");
  });

  it("la primera página del selector también", async () => {
    await listActiveCustomers();

    expect(llamada.estados).toEqual(["ACTIVO", "PENDIENTE_DE_VALIDACION"]);
  });

  it("un cliente RECHAZADO no se puede usar para pedir", () => {
    // Ahí alguien miró el cliente y decidió que no: volver a ofrecerlo sería
    // deshacer esa decisión sin que nadie se entere.
    expect(ESTADOS_PARA_PEDIR).not.toContain("RECHAZADO");
  });
});
