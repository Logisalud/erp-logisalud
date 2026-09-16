import { describe, expect, it } from "vitest";
import { esOfrecibleEnPedido, faltaPrecioParaPedir } from "@/domain/products";

/**
 * Un producto activo sin precio de lista no se puede pedir — pero hay que
 * poder DECIRLO.
 *
 * Pasó el 2026-09-16 con `PLGS24` (ASHWCALMEX): el vendedor lo veía en Stock
 * con 121 unidades, lo buscaba para armar el pedido y no salía nada. Sin
 * explicación, eso se lee como que el sistema está roto.
 */
describe("faltaPrecioParaPedir", () => {
  const ASHWCALMEX = { estado: "activo", hasCurrentPrice: false, codigo_interno: "PLGS24" };
  const ASHWAGANDA = { estado: "activo", hasCurrentPrice: true, codigo_interno: "PLGS16" };

  it("marca al producto activo que no tiene precio", () => {
    expect(faltaPrecioParaPedir(ASHWCALMEX)).toBe(true);
    expect(esOfrecibleEnPedido(ASHWCALMEX)).toBe(false);
  });

  it("no marca al que sí se puede pedir", () => {
    expect(faltaPrecioParaPedir(ASHWAGANDA)).toBe(false);
  });

  it("no marca a un producto inactivo: ese no se nombra, directamente no va", () => {
    // Un producto dado de baja no es un dato que falta, es una decisión
    // tomada: ofrecer explicarlo invitaría a pedir que lo reactiven.
    expect(faltaPrecioParaPedir({ estado: "inactivo", hasCurrentPrice: false })).toBe(false);
  });

  it("no marca a una bonificación: esa sí se puede pedir sin precio", () => {
    const bonificacion = { estado: "activo", hasCurrentPrice: false, codigo_interno: "BOPLGS16" };
    expect(esOfrecibleEnPedido(bonificacion)).toBe(true);
    expect(faltaPrecioParaPedir(bonificacion)).toBe(false);
  });

  it("es el complemento exacto de esOfrecibleEnPedido entre los activos", () => {
    for (const p of [ASHWCALMEX, ASHWAGANDA, { estado: "activo", hasCurrentPrice: false, codigo_interno: "DHP028" }]) {
      expect(faltaPrecioParaPedir(p)).toBe(!esOfrecibleEnPedido(p));
    }
  });
});
