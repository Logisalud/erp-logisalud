import { describe, expect, it } from "vitest";
import {
  pisaTrabajoManual,
  resolverCamposDeCartera,
  type ClienteExistente,
} from "@/domain/customer-import";

/**
 * Reimportar la cartera actualizada no puede borrar el trabajo hecho a
 * mano en la app. El canal decide el precio de lista, la condición de pago
 * habitual decide si el pedido cae en excepción administrativa y el estado
 * es el resultado de validar un cliente nuevo: los tres se corrigen desde
 * la ficha del cliente y ninguno viene del archivo.
 */

const CANAL_DEFECTO = 3; // "Horizontal", el que pone el importador.

describe("resolverCamposDeCartera", () => {
  it("un cliente NUEVO entra con el canal por defecto, sin condición habitual y con el estado del archivo", () => {
    expect(
      resolverCamposDeCartera({
        existente: null,
        canalPorDefectoId: CANAL_DEFECTO,
        estadoDelArchivo: "ACTIVO",
      }),
    ).toEqual({ canalId: CANAL_DEFECTO, condicionPagoHabitualId: null, estado: "ACTIVO" });
  });

  it("no le pisa el canal a un cliente que ya tiene otro", () => {
    const existente: ClienteExistente = {
      canalId: 7, // Instituciones, corregido a mano
      condicionPagoHabitualId: null,
      estado: "ACTIVO",
    };
    expect(
      resolverCamposDeCartera({
        existente,
        canalPorDefectoId: CANAL_DEFECTO,
        estadoDelArchivo: "ACTIVO",
      }).canalId,
    ).toBe(7);
  });

  it("completa el canal sólo si está vacío", () => {
    const existente: ClienteExistente = {
      canalId: null,
      condicionPagoHabitualId: null,
      estado: "ACTIVO",
    };
    expect(
      resolverCamposDeCartera({
        existente,
        canalPorDefectoId: CANAL_DEFECTO,
        estadoDelArchivo: "ACTIVO",
      }).canalId,
    ).toBe(CANAL_DEFECTO);
  });

  it("conserva la condición de pago habitual cargada a mano", () => {
    const existente: ClienteExistente = {
      canalId: CANAL_DEFECTO,
      condicionPagoHabitualId: 4, // "Crédito 30 días"
      estado: "ACTIVO",
    };
    expect(
      resolverCamposDeCartera({
        existente,
        canalPorDefectoId: CANAL_DEFECTO,
        estadoDelArchivo: "ACTIVO",
      }).condicionPagoHabitualId,
    ).toBe(4);
  });

  it("no recalcula el estado de un cliente que ya existe", () => {
    // El caso que importa: alguien validó a este cliente (o lo dio de
    // baja) y el archivo, que sólo mira el documento, diría otra cosa.
    for (const [estadoEnBase, estadoDelArchivo] of [
      ["ACTIVO", "PENDIENTE_DE_VALIDACION"],
      ["RECHAZADO", "ACTIVO"],
      ["INACTIVO", "ACTIVO"],
      ["PENDIENTE_DE_VALIDACION", "ACTIVO"],
    ] as const) {
      const resultado = resolverCamposDeCartera({
        existente: {
          canalId: CANAL_DEFECTO,
          condicionPagoHabitualId: null,
          estado: estadoEnBase,
        },
        canalPorDefectoId: CANAL_DEFECTO,
        estadoDelArchivo,
      });
      expect(resultado.estado).toBe(estadoEnBase);
    }
  });
});

describe("pisaTrabajoManual", () => {
  it("marca sólo lo que de verdad se estaría pisando", () => {
    expect(
      pisaTrabajoManual({
        existente: { canalId: 7, condicionPagoHabitualId: 4, estado: "ACTIVO" },
        canalPorDefectoId: CANAL_DEFECTO,
        estadoDelArchivo: "PENDIENTE_DE_VALIDACION",
      }),
    ).toEqual({ canal: true, condicionPago: true, estado: true });

    // Un cliente que quedó tal cual lo dejó el importador anterior no
    // cuenta como trabajo manual: no hay nada que conservar.
    expect(
      pisaTrabajoManual({
        existente: { canalId: CANAL_DEFECTO, condicionPagoHabitualId: null, estado: "ACTIVO" },
        canalPorDefectoId: CANAL_DEFECTO,
        estadoDelArchivo: "ACTIVO",
      }),
    ).toEqual({ canal: false, condicionPago: false, estado: false });

    // Canal vacío tampoco: se va a completar, no a pisar.
    expect(
      pisaTrabajoManual({
        existente: { canalId: null, condicionPagoHabitualId: null, estado: "ACTIVO" },
        canalPorDefectoId: CANAL_DEFECTO,
        estadoDelArchivo: "ACTIVO",
      }).canal,
    ).toBe(false);
  });
});
