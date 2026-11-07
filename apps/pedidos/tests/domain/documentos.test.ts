import { describe, expect, it } from "vitest";
import { claveDeCobranzas } from "@/domain/documentos";

describe("claveDeCobranzas", () => {
  it("un RUC viaja tal cual", () => {
    expect(claveDeCobranzas("20522217493")).toBe("20522217493");
  });

  it("un DNI se rellena con ceros hasta once, como lo guarda cobranzas", () => {
    expect(claveDeCobranzas("74920171")).toBe("00074920171");
  });

  it("recorta los espacios de alrededor antes de decidir", () => {
    expect(claveDeCobranzas("  74920171 ")).toBe("00074920171");
  });

  it("vacío es vacío, no un cliente con llave de ceros", () => {
    expect(claveDeCobranzas("")).toBeNull();
    expect(claveDeCobranzas(null)).toBeNull();
    expect(claveDeCobranzas("   ")).toBeNull();
  });

  it("no inventa cruces con documentos que no son DNI ni RUC", () => {
    // Diez dígitos no es ninguna de las dos formas. Rellenarlo lo haría
    // pasar por un RUC de once y lo emparejaría con otro cliente.
    expect(claveDeCobranzas("1234567890")).toBe("1234567890");
    expect(claveDeCobranzas("123456789012")).toBe("123456789012");
  });

  it("no toca un documento que ya tiene letras", () => {
    expect(claveDeCobranzas("CE12345678")).toBe("CE12345678");
  });
});
