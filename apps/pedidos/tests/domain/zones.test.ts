import { describe, expect, it } from "vitest";
import { validateZoneParticipantsTotal } from "@/domain/zones";

describe("validateZoneParticipantsTotal", () => {
  it("permite una zona con dos vendedores compartiendo cuota si la suma no pasa de 100%", () => {
    const resultado = validateZoneParticipantsTotal([
      { vendedor: "vendedor-a", porcentajeParticipacion: 60 },
      { vendedor: "vendedor-b", porcentajeParticipacion: 40 },
    ]);
    expect(resultado.valid).toBe(true);
    expect(resultado.total).toBe(100);
  });

  it("rechaza cuando la suma de participación supera 100%", () => {
    const resultado = validateZoneParticipantsTotal([
      { vendedor: "vendedor-a", porcentajeParticipacion: 70 },
      { vendedor: "vendedor-b", porcentajeParticipacion: 50 },
    ]);
    expect(resultado.valid).toBe(false);
    expect(resultado.total).toBe(120);
  });
});
