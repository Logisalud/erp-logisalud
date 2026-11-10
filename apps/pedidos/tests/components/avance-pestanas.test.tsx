// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PestanasDeMes } from "@/app/avance/pestanas";

afterEach(cleanup);

const mes = (periodo: string) => ({ periodo, fechaCorte: "2026-11-04", subidoEn: "2026-11-04T12:00:00Z" });

describe("PestanasDeMes", () => {
  it("escribe el nombre del mes, no el período crudo", () => {
    render(<PestanasDeMes periodos={[mes("2026-11"), mes("2026-10")]} actual="2026-11" />);

    expect(screen.getByRole("link", { name: "Noviembre" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Octubre" })).toBeTruthy();
    expect(screen.queryByText("2026-11")).toBeNull();
  });

  it("marca el mes que se está mirando y enlaza el otro", () => {
    render(<PestanasDeMes periodos={[mes("2026-11"), mes("2026-10")]} actual="2026-10" />);

    expect(screen.getByRole("link", { name: "Octubre" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Noviembre" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: "Noviembre" }).getAttribute("href")).toBe(
      "/avance?periodo=2026-11",
    );
  });

  it("con un solo mes publicado no muestra nada que elegir", () => {
    const { container } = render(<PestanasDeMes periodos={[mes("2026-11")]} actual="2026-11" />);
    expect(container.querySelector("nav")).toBeNull();
  });

  // En enero, con diciembre al lado, "Diciembre" a secas es ambiguo.
  it("agrega el año solo cuando hay más de uno a la vista", () => {
    render(<PestanasDeMes periodos={[mes("2027-01"), mes("2026-12")]} actual="2027-01" />);

    expect(screen.getByRole("link", { name: "Enero 2027" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Diciembre 2026" })).toBeTruthy();
  });
});
