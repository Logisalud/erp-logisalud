import { describe, expect, it } from "vitest";
import { cleanEnv } from "@/lib/env";

describe("cleanEnv", () => {
  it("elimina un BOM (U+FEFF) al inicio del valor", () => {
    const withBom = String.fromCharCode(0xfeff) + "https://example.supabase.co";
    expect(cleanEnv(withBom)).toBe("https://example.supabase.co");
  });

  it("recorta espacios en blanco", () => {
    expect(cleanEnv("  valor  ")).toBe("valor");
  });

  it("devuelve string vacío para undefined", () => {
    expect(cleanEnv(undefined)).toBe("");
  });

  it("no toca un valor ya limpio", () => {
    expect(cleanEnv("valor-normal")).toBe("valor-normal");
  });
});
