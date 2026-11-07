import { describe, expect, it } from "vitest";
import { TOLERANCIA_SEGUNDOS, firmar, verificar } from "@/lib/wms-firma";

// Secreto FICTICIO: solo para estas pruebas.
const SECRETO = "secreto-de-prueba-no-real";
const RUTA = "/api/integracion/wms/pedidos-listos";
const AHORA = new Date("2026-11-07T15:00:00Z");
const HORA = String(Math.floor(AHORA.getTime() / 1000));

describe("verificar (firma HMAC del WMS)", () => {
  it("acepta una firma válida", () => {
    const f = firmar(SECRETO, "GET", RUTA, "", HORA);
    expect(verificar(SECRETO, "GET", RUTA, "", HORA, f, AHORA)).toEqual({ ok: true });
  });

  it("la firma lleva el prefijo sha256= y coincide con el formato del contrato", () => {
    expect(firmar(SECRETO, "GET", RUTA, "", HORA)).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("rechaza una firma inválida (otro secreto, otra ruta o otro método)", () => {
    const f = firmar(SECRETO, "GET", RUTA, "", HORA);
    expect(verificar("otro-secreto", "GET", RUTA, "", HORA, f, AHORA)).toEqual({ ok: false, motivo: "FIRMA_INCORRECTA" });
    expect(verificar(SECRETO, "GET", RUTA + "?x=1", "", HORA, f, AHORA)).toEqual({ ok: false, motivo: "FIRMA_INCORRECTA" });
    expect(verificar(SECRETO, "POST", RUTA, "", HORA, f, AHORA)).toEqual({ ok: false, motivo: "FIRMA_INCORRECTA" });
    expect(verificar(SECRETO, "GET", RUTA, "", HORA, "sha256=abc", AHORA)).toEqual({ ok: false, motivo: "FIRMA_INCORRECTA" });
  });

  it("rechaza si faltan los encabezados", () => {
    const f = firmar(SECRETO, "GET", RUTA, "", HORA);
    expect(verificar(SECRETO, "GET", RUTA, "", null, f, AHORA)).toEqual({ ok: false, motivo: "FALTA_FIRMA" });
    expect(verificar(SECRETO, "GET", RUTA, "", HORA, null, AHORA)).toEqual({ ok: false, motivo: "FALTA_FIRMA" });
    expect(verificar(SECRETO, "GET", RUTA, "", undefined, undefined, AHORA)).toEqual({ ok: false, motivo: "FALTA_FIRMA" });
  });

  it("rechaza una hora que no es un entero de segundos", () => {
    const f = firmar(SECRETO, "GET", RUTA, "", "abc");
    expect(verificar(SECRETO, "GET", RUTA, "", "abc", f, AHORA)).toEqual({ ok: false, motivo: "HORA_INVALIDA" });
  });

  it("rechaza un timestamp vencido (y uno del futuro) fuera de 300 s, acepta el borde", () => {
    const vieja = String(Number(HORA) - TOLERANCIA_SEGUNDOS - 1);
    expect(verificar(SECRETO, "GET", RUTA, "", vieja, firmar(SECRETO, "GET", RUTA, "", vieja), AHORA)).toEqual({ ok: false, motivo: "FUERA_DE_TIEMPO" });
    const futura = String(Number(HORA) + TOLERANCIA_SEGUNDOS + 1);
    expect(verificar(SECRETO, "GET", RUTA, "", futura, firmar(SECRETO, "GET", RUTA, "", futura), AHORA)).toEqual({ ok: false, motivo: "FUERA_DE_TIEMPO" });
    const borde = String(Number(HORA) - TOLERANCIA_SEGUNDOS);
    expect(verificar(SECRETO, "GET", RUTA, "", borde, firmar(SECRETO, "GET", RUTA, "", borde), AHORA)).toEqual({ ok: true });
  });

  it("falla cerrada si el secreto no está configurado, aunque la firma se calcule con clave vacía", () => {
    const conVacio = firmar("", "GET", RUTA, "", HORA);
    expect(verificar(undefined, "GET", RUTA, "", HORA, conVacio, AHORA)).toEqual({ ok: false, motivo: "SIN_SECRETO" });
    expect(verificar("", "GET", RUTA, "", HORA, conVacio, AHORA)).toEqual({ ok: false, motivo: "SIN_SECRETO" });
    expect(verificar("   ", "GET", RUTA, "", HORA, conVacio, AHORA)).toEqual({ ok: false, motivo: "SIN_SECRETO" });
  });
});
