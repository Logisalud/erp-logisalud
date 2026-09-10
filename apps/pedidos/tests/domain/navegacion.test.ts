import { describe, expect, it } from "vitest";
import { SECCIONES, seccionesParaRoles } from "@/domain/navegacion";

const titulos = (roles: string[]) => seccionesParaRoles(roles).map((s) => s.title);

describe("seccionesParaRoles", () => {
  it("sin roles no muestra nada", () => {
    expect(seccionesParaRoles([])).toEqual([]);
  });

  it("el vendedor ve Pedidos y Stock", () => {
    // Stock es de consulta para todos: el vendedor necesita saber cuánto
    // hay antes de ofrecerle un producto a un cliente.
    expect(titulos(["vendedor"])).toEqual(["Pedidos", "Stock"]);
  });

  it("operaciones ve Stock y Despachos", () => {
    expect(titulos(["operaciones"])).toEqual(["Stock", "Despachos"]);
  });

  it("control de pedidos ve Stock, documentación y validación de clientes", () => {
    expect(titulos(["control_pedidos"])).toEqual([
      "Stock",
      "Documentación electrónica",
      "Validación de clientes",
    ]);
  });

  it("el aprobador comercial ve Stock y su bandeja", () => {
    expect(titulos(["aprobador_comercial"])).toEqual(["Stock", "Aprobaciones comerciales"]);
  });

  it("el administrador ve todas las secciones", () => {
    expect(titulos(["administrador"])).toHaveLength(SECCIONES.length);
  });

  it("con varios roles suma sin repetir", () => {
    const t = titulos(["operaciones", "aprobador_comercial"]);
    expect(t).toEqual(["Stock", "Despachos", "Aprobaciones comerciales"]);
    expect(new Set(t).size).toBe(t.length);
  });

  it("mantiene el orden de SECCIONES para que el header no baile entre pantallas", () => {
    const t = titulos(["administrador"]);
    expect(t).toEqual(SECCIONES.map((s) => s.title));
  });

  it("Aprobaciones comerciales existe y no quedó huérfana", () => {
    const s = SECCIONES.find((x) => x.href === "/aprobador-comercial");
    expect(s).toBeDefined();
    expect(s!.roles).toContain("administrador");
    expect(s!.roles).toContain("aprobador_comercial");
  });

  it("toda sección declara al menos un rol", () => {
    for (const s of SECCIONES) expect(s.roles.length).toBeGreaterThan(0);
  });

  it("Stock lo ve cualquier rol, no sólo el administrador", () => {
    const s = SECCIONES.find((x) => x.href === "/stock");
    expect(s).toBeDefined();
    for (const rol of [
      "administrador",
      "vendedor",
      "operaciones",
      "control_pedidos",
      "aprobador_comercial",
    ]) {
      expect(s!.roles).toContain(rol);
    }
  });
});
