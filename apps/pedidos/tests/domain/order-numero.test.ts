import { describe, expect, it } from "vitest";
import { etiquetaNumeroDePedido } from "@/domain/orders";

describe("etiquetaNumeroDePedido", () => {
  it("muestra 'Borrador' mientras el pedido no tiene número asignado", () => {
    // El correlativo se asigna al enviar (trigger orders_numero_al_enviar),
    // así que un borrador vale null y no hay número que mostrar.
    expect(etiquetaNumeroDePedido(null)).toBe("Borrador");
  });

  it("muestra el correlativo con almohadilla una vez enviado", () => {
    expect(etiquetaNumeroDePedido(6)).toBe("#6");
  });

  it("no confunde el número 0 con un pedido sin número", () => {
    expect(etiquetaNumeroDePedido(0)).toBe("#0");
  });
});
