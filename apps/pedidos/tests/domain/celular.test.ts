import { describe, expect, it } from "vitest";
import { errorDeCelular, esCelularValido, normalizarCelular } from "@/domain/celular";

describe("normalizarCelular", () => {
  it("acepta cómo lo escribe la gente de verdad", () => {
    // Todos son el mismo número; pelearse con el formato sería pelearse con
    // quien está tratando de cargarlo bien.
    expect(normalizarCelular("987 654 321")).toBe("987654321");
    expect(normalizarCelular("987-654-321")).toBe("987654321");
    expect(normalizarCelular("+51 987654321")).toBe("987654321");
    expect(normalizarCelular("51987654321")).toBe("987654321");
  });

  it("vacío y nulo son lo mismo", () => {
    expect(normalizarCelular("")).toBe("");
    expect(normalizarCelular(null)).toBe("");
    expect(normalizarCelular(undefined)).toBe("");
  });
});

describe("esCelularValido", () => {
  it("un celular peruano tiene 9 dígitos y empieza en 9", () => {
    expect(esCelularValido("987654321")).toBe(true);
    expect(esCelularValido("999888777")).toBe(true);
  });

  it("rechaza lo que no sirve para llamar ni escribir", () => {
    expect(esCelularValido("")).toBe(false);
    expect(esCelularValido("123")).toBe(false);
    expect(esCelularValido("12345678")).toBe(false);     // 8 dígitos
    expect(esCelularValido("1234567890")).toBe(false);   // 10 dígitos
    expect(esCelularValido("5555555555")).toBe(false);   // el inventado que ya está cargado
    expect(esCelularValido("012345678")).toBe(false);    // no empieza en 9
  });
});

describe("errorDeCelular", () => {
  it("distingue 'falta' de 'está mal'", () => {
    // No es lo mismo no haberlo cargado que haberlo cargado mal: el remedio
    // es distinto y el mensaje tiene que decir cuál es.
    expect(errorDeCelular("")).toBe("Falta el celular del cliente.");
    expect(errorDeCelular("123")).toBe(
      "El celular tiene que ser un número de 9 dígitos que empiece en 9.",
    );
    expect(errorDeCelular("987654321")).toBeNull();
  });
});
