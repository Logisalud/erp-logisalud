import { describe, expect, it } from "vitest";
import { combinarDestinatarios, normalizarEmail } from "@/domain/notification-recipients";

describe("normalizarEmail", () => {
  it("limpia espacios y mayúsculas", () => {
    expect(normalizarEmail("  SRamos@LogisaludVentas.com ")).toBe("sramos@logisaludventas.com");
  });

  it("descarta lo que no puede ser un destinatario", () => {
    for (const basura of [null, undefined, "", "   ", "sinarroba", "a@b", "@dominio.com", "x@"]) {
      expect(normalizarEmail(basura)).toBeNull();
    }
  });
});

describe("combinarDestinatarios", () => {
  const OFICINA = ["aromero@logisalud.com", "sgonzales@logisalud.com", "a.aguilar@logisalud.com"];

  it("suma el vendedor del pedido a la lista fija, sin reemplazarla", () => {
    expect(combinarDestinatarios(OFICINA, ["sramos@logisaludventas.com"])).toEqual([
      ...OFICINA,
      "sramos@logisaludventas.com",
    ]);
  });

  it("no le manda dos veces a quien ya está en la lista fija", () => {
    // Caso real posible: el vendedor pidió estar también en la lista fija.
    expect(combinarDestinatarios(OFICINA, ["AROMERO@logisalud.com"])).toEqual(OFICINA);
  });

  it("sin vendedor resuelto queda sólo la lista fija", () => {
    expect(combinarDestinatarios(OFICINA, [null])).toEqual(OFICINA);
    expect(combinarDestinatarios(OFICINA, [undefined])).toEqual(OFICINA);
  });

  it("sin lista fija el aviso igual sale al vendedor", () => {
    expect(combinarDestinatarios([], ["sramos@logisaludventas.com"])).toEqual([
      "sramos@logisaludventas.com",
    ]);
  });

  it("deduplica también dentro de la lista fija", () => {
    expect(
      combinarDestinatarios(["a@logisalud.com", "A@Logisalud.com "], ["a@logisalud.com"]),
    ).toEqual(["a@logisalud.com"]);
  });

  it("sin nadie, no hay destinatarios", () => {
    expect(combinarDestinatarios([], [])).toEqual([]);
    expect(combinarDestinatarios([null], [""])).toEqual([]);
  });
});
