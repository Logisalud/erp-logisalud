import { describe, expect, it } from "vitest";
import { displayProductoConPresentacion } from "@/domain/products";

/**
 * El nombre del producto tiene que alcanzar para ELEGIRLO.
 *
 * 72 de los 240 productos ofrecibles comparten nombre con otro: "DIPHADIC
 * LONG" son la caja de 100 cápsulas (DHP026) y la ampolla (DHP017). En el
 * buscador se veían idénticos, y el vendedor no tiene por qué saberse los
 * códigos de memoria.
 */
describe("displayProductoConPresentacion", () => {
  it("agrega la presentación cuando el nombre no la dice", () => {
    expect(
      displayProductoConPresentacion("DIPHADIC LONG", "DHP026", "100MG CAJA x 100 CÁPS. LIB. PROL."),
    ).toBe("DIPHADIC LONG — 100MG CAJA x 100 CÁPS. LIB. PROL.");
  });

  it("no la repite si el nombre ya la trae", () => {
    // Muchos productos traen todo en la descripción; repetirlo sólo alarga
    // la línea en un celular.
    const nombre = "DIPHADIC LONG 75 75 MG/ 3 ML CJA X 1 AMP.";
    expect(displayProductoConPresentacion(nombre, "DHP017", "75 MG/ 3 ML CJA X 1 AMP.")).toBe(nombre);
  });

  it("tolera que esté escrita distinto, pero sólo si es la misma", () => {
    // "CJA X 50" y "CAJA x 50" no son el mismo texto: si no calza, se
    // muestra, que es el lado seguro.
    expect(displayProductoConPresentacion("GASA ESTERIL", "DHP308", "CAJA x 50 SOBRES")).toBe(
      "GASA ESTERIL — CAJA x 50 SOBRES",
    );
  });

  it("sin presentación devuelve el nombre tal cual", () => {
    expect(displayProductoConPresentacion("ALGO", "DHP001", null)).toBe("ALGO");
    expect(displayProductoConPresentacion("ALGO", "DHP001", "   ")).toBe("ALGO");
  });

  it("sigue marcando la bonificación", () => {
    const etiqueta = displayProductoConPresentacion("VITAMINA E", "BODHP200", "FCO x 30 CAP");
    expect(etiqueta).toContain("Bonificación");
    expect(etiqueta).toContain("FCO x 30 CAP");
  });
});
