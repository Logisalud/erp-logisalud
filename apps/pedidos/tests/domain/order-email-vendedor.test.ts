import { describe, expect, it } from "vitest";
import { etiquetaVendedor } from "@/domain/order-email";

/**
 * El vendedor en el correo va con sus códigos al lado del nombre.
 *
 * Fuera del sistema lo que rige son los códigos —la oficina y el almacén
 * trabajan con "CRP1012 / LIMH04", no con "LUPE CASTRO"—, así que el correo
 * tiene que traer los tres juntos.
 */
describe("etiquetaVendedor", () => {
  it("pone nombre, código de representante y código de zona", () => {
    expect(
      etiquetaVendedor({
        vendedor: "LUPE CASTRO",
        vendedorCodigo: "CRP1012",
        vendedorZonaCodigo: "LIMH04",
      }),
    ).toBe("LUPE CASTRO · CRP1012 · LIMH04");
  });

  it("omite lo que falte en vez de dejar un separador colgando", () => {
    // Hay vendedores sin zona cargada todavía, y pedidos viejos sin
    // snapshot de nombre: ninguno de los dos casos puede ensuciar el correo.
    expect(
      etiquetaVendedor({ vendedor: "OFICINA LOGISSA", vendedorCodigo: "CODI01" }),
    ).toBe("OFICINA LOGISSA · CODI01");
    expect(etiquetaVendedor({ vendedor: null, vendedorCodigo: "CRP1012" })).toBe("CRP1012");
  });

  it("sin ningún dato muestra una raya, no una cadena vacía", () => {
    expect(etiquetaVendedor({ vendedor: null })).toBe("—");
    expect(etiquetaVendedor({ vendedor: "  ", vendedorCodigo: "  " })).toBe("—");
  });
});
