import { describe, expect, it } from "vitest";
import { anioDePeriodo, nombreDeMes, nombreDePeriodo } from "@/domain/fechas";

describe("nombre de un período", () => {
  it("traduce el período a mes y año", () => {
    expect(nombreDePeriodo("2026-11")).toBe("Noviembre 2026");
    expect(nombreDePeriodo("2026-01")).toBe("Enero 2026");
    expect(nombreDePeriodo("2026-12")).toBe("Diciembre 2026");
  });

  // Setiembre y no Septiembre: es la forma que usa el resto del ERP.
  it("escribe setiembre como se escribe acá", () => {
    expect(nombreDeMes("2026-09")).toBe("Setiembre");
  });

  it("devuelve el período tal cual si no es un mes", () => {
    expect(nombreDePeriodo("2026-13")).toBe("2026-13");
    expect(nombreDePeriodo("")).toBe("");
  });

  it("saca el año sin pasar por Date", () => {
    expect(anioDePeriodo("2026-11")).toBe("2026");
  });
});
