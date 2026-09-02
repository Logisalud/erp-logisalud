import { describe, expect, it } from "vitest";
import { displayNombreProducto, esOfrecibleEnPedido } from "@/domain/products";

/**
 * Las 18 filas REALES de producción, tal como las entrega listProducts() al
 * buscador de productos: código, descripción, estado y si tiene precio
 * vigente. Se corren las mismas dos funciones que usa la pantalla.
 */
const FILAS_PRODUCCION = [
  { codigo_interno: "BODHP002", descripcion: "DIPHACORTEN 5 MG/ 5 ML FCO X 120 ML", estado: "activo", hasCurrentPrice: false },
  { codigo_interno: "BODHP003", descripcion: "DIPHACORTEN  15 MG/ 5 ML FCO X 120 ML", estado: "activo", hasCurrentPrice: false },
  { codigo_interno: "BODHP007", descripcion: "D - CORT 8 8 MG/ 2 ML CJA X 1 AMP.", estado: "activo", hasCurrentPrice: false },
  { codigo_interno: "BODHP008", descripcion: "ALLER - CLORT 10 MG/ 1ML CJA X 1 AMP.", estado: "activo", hasCurrentPrice: false },
  { codigo_interno: "BODHP016", descripcion: "DIPHARELAX 60 60 MG/ 2 ML CJA X 1 AMP.", estado: "activo", hasCurrentPrice: false },
  { codigo_interno: "BODHP019", descripcion: "MUCOFLUX 100 100MG CJA X 30 SOBRE.", estado: "activo", hasCurrentPrice: false },
  { codigo_interno: "BODHP022", descripcion: "FEM DAY 1.5 MG CJA X 1 TAB.", estado: "activo", hasCurrentPrice: false },
  { codigo_interno: "BODHP206", descripcion: "DIPHA ZINC KID 10 MG/5 ML X FCO X 120 ML", estado: "activo", hasCurrentPrice: false },
  { codigo_interno: "BODHP207", descripcion: "DIPHA ZINC KID 20 MG/5 ML  FCO X 120 ML", estado: "activo", hasCurrentPrice: false },
  { codigo_interno: "BODHP208", descripcion: "NATUVARIX 100 MG CJA X 60 CAP. BDA.", estado: "activo", hasCurrentPrice: false },
  { codigo_interno: "BODHP217", descripcion: "DIPHAZINC 20 20 MG CJA X 100 TAB", estado: "activo", hasCurrentPrice: false },
  { codigo_interno: "BODHP301", descripcion: "HISOPOS NADÓ X 100 BASTFLEX/TOPE/ALGODÓN", estado: "activo", hasCurrentPrice: false },
  { codigo_interno: "BODHP303", descripcion: "HISOPOS NADÓ X 500 BASTFLEX/PTA/ALGODÓN", estado: "activo", hasCurrentPrice: false },
  { codigo_interno: "BODHP304", descripcion: "HISOPOS NADÓ X 100 BASTBIO/PTA/ALGODÓN", estado: "activo", hasCurrentPrice: false },
  { codigo_interno: "BODHP402", descripcion: "OMEPRAZOL 20 MG CJA X 100 CAP. LIB. R.", estado: "activo", hasCurrentPrice: false },
  { codigo_interno: "BODHP405", descripcion: "MOXIFLOXACINO 400 MG CJA X 5 TAB. REC.", estado: "activo", hasCurrentPrice: false },
  { codigo_interno: "BODHP407", descripcion: "ESOMEPRAZOL 40 MG CJA X 30 COMP. GR.", estado: "activo", hasCurrentPrice: false },
  { codigo_interno: "BODHP408", descripcion: "KETOROLACO 60 MG/ 2 ML CJA X 100 AMP.", estado: "activo", hasCurrentPrice: false },
];

/** Sus pares regulares, que siguen ofreciéndose sin marca. */
const PARES_REGULARES = [
  { codigo_interno: "DHP008", descripcion: "ALLER - CLORT 10 MG/ 1ML CJA X 1 AMP.", estado: "activo", hasCurrentPrice: true },
  { codigo_interno: "DHP217", descripcion: "DIPHAZINC 20 20 MG CJA X 100 TAB", estado: "activo", hasCurrentPrice: true },
];

describe("las 18 bonificaciones creadas, en el buscador de productos", () => {
  it("las 18 se ofrecen, aunque no tengan precio", () => {
    const ofrecibles = FILAS_PRODUCCION.filter(esOfrecibleEnPedido);
    expect(ofrecibles).toHaveLength(18);
  });

  it("las 18 salen marcadas con (Bonificación)", () => {
    for (const p of FILAS_PRODUCCION) {
      expect(displayNombreProducto(p.descripcion, p.codigo_interno)).toBe(
        `${p.descripcion.trim()} (Bonificación)`,
      );
    }
  });

  it("el par regular sigue sin marca, y por eso se distinguen", () => {
    // Descripción idéntica: la marca es lo único que los diferencia en el
    // buscador, que es justo el problema que resuelve.
    const bo = FILAS_PRODUCCION.find((p) => p.codigo_interno === "BODHP008")!;
    const regular = PARES_REGULARES.find((p) => p.codigo_interno === "DHP008")!;
    expect(bo.descripcion).toBe(regular.descripcion);
    expect(displayNombreProducto(regular.descripcion, regular.codigo_interno)).toBe(
      "ALLER - CLORT 10 MG/ 1ML CJA X 1 AMP.",
    );
    expect(displayNombreProducto(bo.descripcion, bo.codigo_interno)).toBe(
      "ALLER - CLORT 10 MG/ 1ML CJA X 1 AMP. (Bonificación)",
    );
  });
});
