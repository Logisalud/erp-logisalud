import { describe, expect, it } from "vitest";
import {
  encabezadoCompleto,
  evaluarCambioDeCliente,
  mensajeCambioBloqueado,
  type LineaParaRevaluar,
} from "@/domain/order-header";

function linea(over: Partial<LineaParaRevaluar> = {}): LineaParaRevaluar {
  return {
    itemId: "i1",
    codigo: "PROD-1",
    descripcion: "Producto de ejemplo",
    precioActual: 10.5,
    precioConNuevoCliente: 10.5,
    ...over,
  };
}

describe("evaluarCambioDeCliente", () => {
  it("permite el cambio cuando el pedido todavía no tiene líneas", () => {
    const r = evaluarCambioDeCliente([]);
    expect(r.permitido).toBe(true);
  });

  it("permite el cambio cuando ninguna línea cambia de precio", () => {
    const r = evaluarCambioDeCliente([linea(), linea({ itemId: "i2", codigo: "PROD-2" })]);
    expect(r.permitido).toBe(true);
    expect(r.conflictos).toHaveLength(0);
  });

  it("bloquea cuando una línea cambiaría de precio, e informa cuál", () => {
    const r = evaluarCambioDeCliente([
      linea(),
      linea({ itemId: "i2", codigo: "PROD-2", precioActual: 20, precioConNuevoCliente: 22.4 }),
    ]);

    expect(r.permitido).toBe(false);
    expect(r.conflictos).toHaveLength(1);
    expect(r.conflictos[0]).toMatchObject({
      itemId: "i2",
      codigo: "PROD-2",
      precioActual: 20,
      precioNuevo: 22.4,
      motivo: "CAMBIA_DE_PRECIO",
    });
  });

  it("bloquea cuando el canal del cliente nuevo no tiene precio para el producto", () => {
    const r = evaluarCambioDeCliente([linea({ precioConNuevoCliente: null })]);

    expect(r.permitido).toBe(false);
    expect(r.conflictos[0].motivo).toBe("SIN_PRECIO_EN_EL_CANAL");
    expect(r.conflictos[0].precioNuevo).toBeNull();
  });

  it("no bloquea por ruido de punto flotante", () => {
    // 10.1 + 0.2 === 10.299999999999999 en JS. Comparar con !== bloquearía
    // un cambio que en realidad no mueve ni un céntimo.
    const r = evaluarCambioDeCliente([
      linea({ precioActual: 10.1 + 0.2, precioConNuevoCliente: 10.3 }),
    ]);
    expect(r.permitido).toBe(true);
  });

  it("junta todos los conflictos en vez de frenar en el primero", () => {
    const r = evaluarCambioDeCliente([
      linea({ itemId: "a", precioConNuevoCliente: 11 }),
      linea({ itemId: "b", precioConNuevoCliente: null }),
      linea({ itemId: "c" }),
    ]);
    expect(r.conflictos.map((c) => c.itemId)).toEqual(["a", "b"]);
  });
});

describe("mensajeCambioBloqueado", () => {
  it("dice el problema y la salida", () => {
    const { conflictos } = evaluarCambioDeCliente([
      linea({ precioConNuevoCliente: 12 }),
    ]) as { conflictos: ReturnType<typeof evaluarCambioDeCliente>["conflictos"] };

    const msg = mensajeCambioBloqueado(conflictos as never);
    expect(msg).toContain("1 producto");
    expect(msg).toContain("otro precio");
    // La salida importa tanto como el diagnóstico.
    expect(msg).toMatch(/empezá un pedido nuevo|Quitá esos productos/);
  });

  it("distingue el caso de que directamente no haya precio", () => {
    const r = evaluarCambioDeCliente([linea({ precioConNuevoCliente: null })]);
    const msg = mensajeCambioBloqueado(r.conflictos as never);
    expect(msg).toContain("sin precio en la lista del cliente nuevo");
  });

  it("concuerda en plural con varios productos", () => {
    const r = evaluarCambioDeCliente([
      linea({ itemId: "a", precioConNuevoCliente: 11 }),
      linea({ itemId: "b", precioConNuevoCliente: 12 }),
    ]);
    expect(mensajeCambioBloqueado(r.conflictos as never)).toContain("2 productos");
  });
});

describe("encabezadoCompleto", () => {
  it("exige los tres campos", () => {
    expect(encabezadoCompleto({ customerId: "c", customerAddressId: "a", paymentTermsId: 1 })).toBe(
      true,
    );
    expect(encabezadoCompleto({ customerId: "", customerAddressId: "a", paymentTermsId: 1 })).toBe(
      false,
    );
    expect(encabezadoCompleto({ customerId: "c", customerAddressId: "", paymentTermsId: 1 })).toBe(
      false,
    );
    expect(
      encabezadoCompleto({ customerId: "c", customerAddressId: "a", paymentTermsId: null }),
    ).toBe(false);
  });

  it("no acepta un id de condición de pago inválido", () => {
    expect(encabezadoCompleto({ customerId: "c", customerAddressId: "a", paymentTermsId: 0 })).toBe(
      false,
    );
    expect(
      encabezadoCompleto({ customerId: "c", customerAddressId: "a", paymentTermsId: NaN }),
    ).toBe(false);
  });
});
