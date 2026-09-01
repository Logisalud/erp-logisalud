// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AppHeader } from "@/components/app-header";
import type { CurrentUser } from "@/lib/auth/session";

afterEach(cleanup);

function user(roles: string[]): CurrentUser {
  return {
    userId: "u1",
    email: "persona@logisalud.com",
    fullName: "PERSONA DE PRUEBA",
    roles,
    sellerId: null,
  };
}

const nav = () => within(screen.getByRole("navigation"));

describe("AppHeader", () => {
  it("el nombre del sistema siempre lleva al inicio", () => {
    render(<AppHeader user={user(["vendedor"])} />);
    expect(screen.getByRole("link", { name: "LOGISALUD Pedidos" }).getAttribute("href")).toBe("/");
  });

  it("además hay un enlace Inicio explícito", () => {
    render(<AppHeader user={user(["control_pedidos"])} />);
    expect(nav().getByRole("link", { name: "Inicio" }).getAttribute("href")).toBe("/");
  });

  it("el vendedor ve su sección y no las ajenas", () => {
    render(<AppHeader user={user(["vendedor"])} />);
    expect(nav().getByRole("link", { name: "Pedidos" }).getAttribute("href")).toBe("/pedidos");
    expect(nav().queryByRole("link", { name: "Maestros" })).toBeNull();
    expect(nav().queryByRole("link", { name: "Aprobaciones comerciales" })).toBeNull();
  });

  it("el aprobador comercial llega a su bandeja desde cualquier pantalla", () => {
    render(<AppHeader user={user(["aprobador_comercial"])} />);
    expect(
      nav().getByRole("link", { name: "Aprobaciones comerciales" }).getAttribute("href"),
    ).toBe("/aprobador-comercial");
  });

  it("el administrador ve Despachos y Aprobaciones comerciales, que antes faltaban", () => {
    render(<AppHeader user={user(["administrador"])} />);
    expect(nav().getByRole("link", { name: "Despachos" }).getAttribute("href")).toBe("/operaciones");
    expect(
      nav().getByRole("link", { name: "Aprobaciones comerciales" }).getAttribute("href"),
    ).toBe("/aprobador-comercial");
    expect(nav().getByRole("link", { name: "Maestros" }).getAttribute("href")).toBe("/admin");
  });

  it("operaciones no ve secciones de administrador pero sí puede volver al inicio", () => {
    render(<AppHeader user={user(["operaciones"])} />);
    expect(nav().getByRole("link", { name: "Despachos" })).toBeTruthy();
    expect(nav().queryByRole("link", { name: "Maestros" })).toBeNull();
    expect(nav().getByRole("link", { name: "Inicio" }).getAttribute("href")).toBe("/");
  });
});
