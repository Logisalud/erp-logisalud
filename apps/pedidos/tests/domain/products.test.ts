import { describe, expect, it } from "vitest";
import {
  codigoRegularDeBonificacion,
  displayNombreProducto,
  esBonificacion,
  esOfrecibleEnPedido,
} from "@/domain/products";

describe("esBonificacion", () => {
  it("reconoce el prefijo BO", () => {
    expect(esBonificacion("BOBSA207")).toBe(true);
    expect(esBonificacion("BODHP100")).toBe(true);
  });

  it("no marca al producto regular", () => {
    expect(esBonificacion("BSA207")).toBe(false);
    expect(esBonificacion("DHP100")).toBe(false);
  });

  it("es indiferente a mayúsculas y espacios", () => {
    expect(esBonificacion("  bobsa207 ")).toBe(true);
  });

  it("no marca un código que sea solo 'BO'", () => {
    expect(esBonificacion("BO")).toBe(false);
    expect(esBonificacion("")).toBe(false);
  });
});

describe("codigoRegularDeBonificacion", () => {
  it("devuelve el par regular", () => {
    expect(codigoRegularDeBonificacion("BOBSA207")).toBe("BSA207");
    expect(codigoRegularDeBonificacion("BODHP100")).toBe("DHP100");
  });

  it("es null para un producto regular", () => {
    expect(codigoRegularDeBonificacion("BSA207")).toBeNull();
  });
});

describe("displayNombreProducto", () => {
  it("marca la bonificación para que no se confunda con su par", () => {
    const descripcion = "DUO DAPHA 10 10 MG + 1000 MG CJA X 30 TAB. REC.";
    expect(displayNombreProducto(descripcion, "BODHP100")).toBe(
      "DUO DAPHA 10 10 MG + 1000 MG CJA X 30 TAB. REC. (Bonificación)",
    );
  });

  it("deja intacto el producto regular, con la misma descripción", () => {
    const descripcion = "DUO DAPHA 10 10 MG + 1000 MG CJA X 30 TAB. REC.";
    expect(displayNombreProducto(descripcion, "DHP100")).toBe(descripcion);
  });

  it("el par regular y su bonificación dejan de verse idénticos", () => {
    const descripcion = "BIOSANA VITAMINA C 1 G CJA X 10 TAB EFERV.";
    const regular = displayNombreProducto(descripcion, "BSA207");
    const bonif = displayNombreProducto(descripcion, "BOBSA207");
    expect(regular).not.toBe(bonif);
    expect(bonif).toContain("(Bonificación)");
  });

  it("no marca dos veces si el origen ya lo decía", () => {
    expect(displayNombreProducto("ALGO BONIFICACION", "BOX1")).toBe("ALGO BONIFICACION");
  });
});

describe("esOfrecibleEnPedido", () => {
  it("ofrece un producto activo y con precio", () => {
    expect(esOfrecibleEnPedido({ estado: "activo", hasCurrentPrice: true })).toBe(true);
  });

  it("NO ofrece un producto inactivo, aunque tenga precio", () => {
    // Es el caso de los 16 desactivados en 0052 por no estar en NubeFact:
    // tienen precio de lista, pero no se pueden facturar.
    expect(esOfrecibleEnPedido({ estado: "inactivo", hasCurrentPrice: true })).toBe(false);
  });

  it("NO ofrece un producto sin precio vigente", () => {
    expect(esOfrecibleEnPedido({ estado: "activo", hasCurrentPrice: false })).toBe(false);
  });

  it("los 16 códigos desactivados por NubeFact quedan fuera del buscador", () => {
    const desactivados = [
      "DHP218","DHP219","DHP220","DHP221","DHP222","DHP223","DHP224","DHP225",
      "DHP226","DHP227","DHP228","DHP229","DHP421","DHP423","DHP424","PLGS14",
    ];
    // Tras 0052 quedan en estado inactivo; ninguno debe ser ofrecible.
    const ofrecibles = desactivados.filter(() =>
      esOfrecibleEnPedido({ estado: "inactivo", hasCurrentPrice: true }),
    );
    expect(ofrecibles).toHaveLength(0);
  });
});
