import { describe, expect, it } from "vitest";
import {
  ALERTA_DNI_COMO_RUC,
  MENSAJE_SIN_DIRECCION,
  classifyDocumento,
  documentoAlerta,
  esRucContribuyenteValido,
  isCustomerOrderable,
  puedeTomarPedido,
  resolveEstadoInicialImportacion,
  resolveTipoComprobantePermitido,
} from "@/domain/customers";

describe("isCustomerOrderable", () => {
  it("un cliente PENDIENTE_DE_VALIDACION no debe poder usarse en pedidos (placeholder para Fase 4)", () => {
    expect(isCustomerOrderable("PENDIENTE_DE_VALIDACION")).toBe(false);
  });

  it("un cliente ACTIVO sí puede usarse en pedidos", () => {
    expect(isCustomerOrderable("ACTIVO")).toBe(true);
  });

  it("un cliente RECHAZADO o INACTIVO no debe poder usarse en pedidos", () => {
    expect(isCustomerOrderable("RECHAZADO")).toBe(false);
    expect(isCustomerOrderable("INACTIVO")).toBe(false);
  });
});

describe("classifyDocumento", () => {
  it("distingue persona jurídica, natural y RUC residuales válidos", () => {
    expect(classifyDocumento("20100000001")).toBe("RUC_JURIDICA");
    expect(classifyDocumento("10400000002")).toBe("RUC_NATURAL");
    expect(classifyDocumento("15123456789")).toBe("RUC_OTRO");
    expect(classifyDocumento("17100000007")).toBe("RUC_OTRO");
  });

  it("marca como DNI_COMO_RUC cualquier documento con prefijo no contribuyente", () => {
    // Caso real de la cartera migrada: DNI rellenado con ceros a 11
    // dígitos y guardado en el campo de RUC.
    expect(classifyDocumento("00000000003")).toBe("DNI_COMO_RUC");
    expect(esRucContribuyenteValido("00000000003")).toBe(false);
  });

  it("ignora espacios alrededor del documento", () => {
    expect(classifyDocumento("  20100000001  ")).toBe("RUC_JURIDICA");
  });

  // No alcanza con el prefijo: un RUC son 11 dígitos. Espejo del CHECK
  // en 0041, que exige btrim(ruc) ~ '^(10|15|17|20)[0-9]{9}$'. Si TS
  // fuera más permisivo, el importador grabaría FACTURA en filas que la
  // BD rechaza.
  it("exige 11 dígitos, no solo el prefijo", () => {
    expect(classifyDocumento("20123")).toBe("DNI_COMO_RUC");
    expect(classifyDocumento("2099999999")).toBe("DNI_COMO_RUC"); // 10 dígitos
    expect(classifyDocumento("209999999999")).toBe("DNI_COMO_RUC"); // 12 dígitos
    expect(classifyDocumento("20abcdefghi")).toBe("DNI_COMO_RUC");
    expect(resolveTipoComprobantePermitido("20123")).toBe("BOLETA");
  });

  it("un DNI de 8 dígitos no es RUC", () => {
    expect(classifyDocumento("12345678")).toBe("DNI_COMO_RUC");
    expect(resolveEstadoInicialImportacion("12345678")).toBe("PENDIENTE_DE_VALIDACION");
  });
});

describe("resolveTipoComprobantePermitido", () => {
  it("persona jurídica solo factura", () => {
    expect(resolveTipoComprobantePermitido("20100000001")).toBe("FACTURA");
  });

  it("persona natural con RUC puede elegir factura o boleta caso por caso", () => {
    expect(resolveTipoComprobantePermitido("10400000002")).toBe("FACTURA_O_BOLETA");
  });

  it("sin RUC de contribuyente queda restringido a boleta", () => {
    expect(resolveTipoComprobantePermitido("00000000003")).toBe("BOLETA");
  });
});

describe("resolveEstadoInicialImportacion", () => {
  it("los clientes con RUC válido entran ACTIVO", () => {
    expect(resolveEstadoInicialImportacion("20100000001")).toBe("ACTIVO");
    expect(resolveEstadoInicialImportacion("10400000002")).toBe("ACTIVO");
  });

  it("los que traen DNI como RUC quedan pendientes de validación", () => {
    expect(resolveEstadoInicialImportacion("00000000003")).toBe("PENDIENTE_DE_VALIDACION");
  });
});

describe("documentoAlerta", () => {
  it("no alerta cuando el documento es un RUC válido", () => {
    expect(documentoAlerta("20100000001")).toBeNull();
  });

  it("alerta a Control de Pedidos cuando el documento parece un DNI", () => {
    expect(documentoAlerta("00000000003")).toBe(ALERTA_DNI_COMO_RUC);
  });
});

describe("puedeTomarPedido", () => {
  it("bloquea si el cliente no tiene dirección de entrega", () => {
    expect(puedeTomarPedido({ estado: "ACTIVO", direccionesActivas: 0 })).toEqual({
      ok: false,
      motivo: MENSAJE_SIN_DIRECCION,
    });
  });

  it("bloquea si el cliente no está ACTIVO, aunque tenga dirección", () => {
    const result = puedeTomarPedido({ estado: "PENDIENTE_DE_VALIDACION", direccionesActivas: 1 });
    expect(result.ok).toBe(false);
  });

  it("deja pasar al cliente activo con al menos una dirección", () => {
    expect(puedeTomarPedido({ estado: "ACTIVO", direccionesActivas: 1 })).toEqual({ ok: true });
  });
});
