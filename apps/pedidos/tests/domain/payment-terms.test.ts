import { describe, expect, it } from "vitest";
import {
  MAX_DIAS_CREDITO,
  etiquetaCondicionPago,
  validarCondicionDePago,
  validarDiasCredito,
} from "@/domain/payment-terms";

const OPCIONES = [
  { id: 1, permite_dias_libres: false }, // Contado
  { id: 2, permite_dias_libres: false }, // Crédito 30 días
  { id: 7, permite_dias_libres: true }, // Crédito (otro número de días)
];

describe("validarDiasCredito", () => {
  it("acepta un entero positivo", () => {
    expect(validarDiasCredito("15")).toEqual({ ok: true, dias: 15 });
    expect(validarDiasCredito(75)).toEqual({ ok: true, dias: 75 });
  });

  it("rechaza el vacío: elegir la opción libre y no escribir nada no es un plazo", () => {
    expect(validarDiasCredito("")).toEqual({
      ok: false,
      mensaje: "Escribe el número de días de crédito.",
    });
    expect(validarDiasCredito(null).ok).toBe(false);
    expect(validarDiasCredito(undefined).ok).toBe(false);
  });

  it("rechaza decimales y texto", () => {
    expect(validarDiasCredito("15.5").ok).toBe(false);
    expect(validarDiasCredito("quince").ok).toBe(false);
  });

  it("rechaza cero, negativos y plazos absurdos", () => {
    expect(validarDiasCredito("0").ok).toBe(false);
    expect(validarDiasCredito("-30").ok).toBe(false);
    expect(validarDiasCredito(String(MAX_DIAS_CREDITO + 1)).ok).toBe(false);
    expect(validarDiasCredito(String(MAX_DIAS_CREDITO)).ok).toBe(true);
  });
});

describe("validarCondicionDePago", () => {
  it("una condición estándar no lleva días", () => {
    expect(validarCondicionDePago(OPCIONES, { paymentTermsId: 2, diasCredito: "" })).toEqual({
      ok: true,
      paymentTermsId: 2,
      diasCreditoSolicitados: null,
    });
  });

  it("ignora días escritos si después se volvió a una condición estándar", () => {
    expect(validarCondicionDePago(OPCIONES, { paymentTermsId: 1, diasCredito: "15" })).toEqual({
      ok: true,
      paymentTermsId: 1,
      diasCreditoSolicitados: null,
    });
  });

  it("la opción de entrada libre exige el número de días", () => {
    expect(validarCondicionDePago(OPCIONES, { paymentTermsId: 7, diasCredito: "" }).ok).toBe(false);
    expect(validarCondicionDePago(OPCIONES, { paymentTermsId: 7, diasCredito: "15" })).toEqual({
      ok: true,
      paymentTermsId: 7,
      diasCreditoSolicitados: 15,
    });
  });

  it("no acepta una condición que no está en el catálogo", () => {
    const r = validarCondicionDePago(OPCIONES, { paymentTermsId: 99, diasCredito: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).toContain("no existe");
  });

  it("no acepta que no se haya elegido ninguna", () => {
    expect(validarCondicionDePago(OPCIONES, { paymentTermsId: "", diasCredito: "" }).ok).toBe(false);
  });
});

describe("etiquetaCondicionPago", () => {
  it("con condición estándar muestra el nombre del catálogo", () => {
    expect(etiquetaCondicionPago("Crédito 30 días", null)).toBe("Crédito 30 días");
  });

  it("con días a mano muestra el plazo real y avisa que no es estándar", () => {
    expect(etiquetaCondicionPago("Crédito (otro número de días)", 15)).toBe(
      "Crédito 15 días (no estándar)",
    );
  });

  it("respeta el singular", () => {
    expect(etiquetaCondicionPago("Crédito (otro número de días)", 1)).toBe(
      "Crédito 1 día (no estándar)",
    );
  });

  it("sin nombre ni días queda el guion, no un 'null' en pantalla", () => {
    expect(etiquetaCondicionPago(null, null)).toBe("—");
    expect(etiquetaCondicionPago("  ", null)).toBe("—");
  });
});
