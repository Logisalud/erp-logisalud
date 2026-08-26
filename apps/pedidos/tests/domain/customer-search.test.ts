import { describe, expect, it } from "vitest";
import {
  MIN_SEARCH_LENGTH,
  displayRazonSocial,
  esTerminoBuscable,
  normalizeSearchTerm,
  soloDigitos,
} from "@/domain/customer-search";

describe("displayRazonSocial", () => {
  it("quita los asteriscos que la cartera legacy trae al inicio", () => {
    // Mismas FORMAS que trae el CSV del piloto de WhatsApp, con
    // nombres inventados: la cartera real no entra al repo.
    expect(displayRazonSocial("**** COMERCIAL EJEMPLO S.C.R.L.")).toBe("COMERCIAL EJEMPLO S.C.R.L.");
    expect(displayRazonSocial("*APELLIDO EJEMPLO NOMBRE")).toBe("APELLIDO EJEMPLO NOMBRE");
    expect(displayRazonSocial("***** OTRO EJEMPLO PERSONA")).toBe("OTRO EJEMPLO PERSONA");
    expect(displayRazonSocial("*****///INVERSIONES EJEMPLO E.I.R.L.")).toBe(
      "INVERSIONES EJEMPLO E.I.R.L.",
    );
  });

  it("recorta el espacio inicial que también trae el origen", () => {
    expect(displayRazonSocial(" PERSONA EJEMPLO CUARTA")).toBe("PERSONA EJEMPLO CUARTA");
  });

  it("no toca un nombre limpio", () => {
    expect(displayRazonSocial("PERSONA EJEMPLO TERCERA")).toBe("PERSONA EJEMPLO TERCERA");
  });

  it("no toca asteriscos que no están al inicio", () => {
    expect(displayRazonSocial("BOTICA 5 * ESTRELLAS")).toBe("BOTICA 5 * ESTRELLAS");
  });

  it("si el nombre era solo puntuación, muestra el original en vez de vacío", () => {
    expect(displayRazonSocial("****")).toBe("****");
  });
});

describe("normalizeSearchTerm", () => {
  it("neutraliza los caracteres que rompen el filtro or=() de PostgREST", () => {
    // La coma separa condiciones y los paréntesis las delimitan: sin esto
    // el término cambia la consulta en silencio.
    expect(normalizeSearchTerm("APELLIDO EJEMPLO, NOMBRE")).toBe("APELLIDO EJEMPLO NOMBRE");
    expect(normalizeSearchTerm("INVERSIONES (EJEMPLO)")).toBe("INVERSIONES EJEMPLO");
  });

  it("neutraliza los comodines de LIKE y el alias * de PostgREST", () => {
    expect(normalizeSearchTerm("%EJEMPLO%")).toBe("EJEMPLO");
    expect(normalizeSearchTerm("*EJEMPLO")).toBe("EJEMPLO");
    expect(normalizeSearchTerm("A_B")).toBe("A B");
  });

  it("colapsa espacios repetidos", () => {
    expect(normalizeSearchTerm("  EJEMPLO    SCRL  ")).toBe("EJEMPLO SCRL");
  });
});

describe("esTerminoBuscable", () => {
  it("rechaza términos demasiado cortos: devolverían media cartera", () => {
    expect(esTerminoBuscable("")).toBe(false);
    expect(esTerminoBuscable("   ")).toBe(false);
    expect(esTerminoBuscable("M")).toBe(false);
  });

  it("acepta desde el mínimo", () => {
    expect(MIN_SEARCH_LENGTH).toBe(2);
    expect(esTerminoBuscable("MA")).toBe(true);
    expect(esTerminoBuscable("20100000001")).toBe(true);
  });

  it("un término que queda corto tras limpiarlo no es buscable", () => {
    expect(esTerminoBuscable("%*(")).toBe(false);
  });
});

describe("soloDigitos", () => {
  it("permite buscar un RUC tipeado con espacios o guiones", () => {
    expect(soloDigitos("2010-0000-001")).toBe("20100000001");
    expect(soloDigitos("20 100 000 001")).toBe("20100000001");
  });

  it("es vacío para un nombre", () => {
    expect(soloDigitos("EJEMPLO")).toBe("");
  });
});
