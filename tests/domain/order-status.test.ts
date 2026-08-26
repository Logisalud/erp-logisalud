import { describe, expect, it } from "vitest";
import {
  PESTANAS,
  estadoEstilo,
  estadoLabel,
  estadoLabelCorto,
  estadosDePestana,
  parsePestana,
  type OrderEstadoVisible,
} from "@/domain/order-status";

const TODOS_LOS_ESTADOS: OrderEstadoVisible[] = [
  "DRAFT",
  "SUBMITTED",
  "NEW_CUSTOMER_VALIDATION",
  "ADMINISTRATIVE_EXCEPTION",
  "COMMERCIAL_EXCEPTION",
  "READY_FOR_OPERATIONS",
  "DISPATCHED",
];

describe("etiquetas de estado", () => {
  it("traduce todos los estados a palabras, nunca al enum crudo", () => {
    for (const estado of TODOS_LOS_ESTADOS) {
      expect(estadoLabel(estado)).not.toBe(estado);
      expect(estadoLabelCorto(estado)).not.toBe(estado);
    }
  });

  it("la versión corta entra en una fila de lista", () => {
    // El límite no es exacto, pero una etiqueta larga empuja la fecha a otra
    // línea en un celular. 22 caracteres es lo que entra al lado del badge.
    for (const estado of TODOS_LOS_ESTADOS) {
      expect(estadoLabelCorto(estado).length).toBeLessThanOrEqual(22);
    }
  });

  it("un estado desconocido se muestra tal cual en vez de romper", () => {
    expect(estadoLabel("ESTADO_DEL_FUTURO")).toBe("ESTADO_DEL_FUTURO");
    expect(estadoLabelCorto("ESTADO_DEL_FUTURO")).toBe("ESTADO_DEL_FUTURO");
    expect(estadoEstilo("ESTADO_DEL_FUTURO")).toContain("slate");
  });

  it("cada estado tiene su propio estilo definido", () => {
    for (const estado of TODOS_LOS_ESTADOS) {
      expect(estadoEstilo(estado)).not.toBe("");
    }
  });
});

describe("pestañas de Mis pedidos", () => {
  it("borradores y enviados juntos cubren todos los estados, sin superponerse", () => {
    const borradores = estadosDePestana("borradores") ?? [];
    const enviados = estadosDePestana("enviados") ?? [];

    // Ningún estado en las dos: una fila aparecería duplicada al mirar ambas.
    expect(borradores.filter((e) => enviados.includes(e))).toEqual([]);

    // Ningún estado afuera: un pedido invisible en las dos pestañas es
    // exactamente el bug que esta pantalla vino a arreglar.
    const cubiertos = [...borradores, ...enviados].sort();
    expect(cubiertos).toEqual([...TODOS_LOS_ESTADOS].sort());
  });

  it("'todos' no filtra", () => {
    expect(estadosDePestana("todos")).toBeNull();
  });

  it("una pestaña inventada en la URL cae a 'todos'", () => {
    expect(parsePestana("borradores")).toBe("borradores");
    expect(parsePestana("enviados")).toBe("enviados");
    expect(parsePestana(undefined)).toBe("todos");
    expect(parsePestana("'; drop table orders; --")).toBe("todos");
  });

  it("toda pestaña listada en la UI es una que parsePestana reconoce", () => {
    for (const p of PESTANAS) {
      expect(parsePestana(p.id)).toBe(p.id);
    }
  });
});
