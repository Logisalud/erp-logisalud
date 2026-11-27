// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DashboardView } from "@/components/dashboard/dashboard-view";

afterEach(cleanup);

describe("DashboardView Component", () => {
  it("renderiza el título y controles principales del dashboard", () => {
    render(<DashboardView />);

    expect(screen.getAllByText("LOGISALUD").length).toBeGreaterThan(0);
    expect(screen.getByText("MAPA EN VIVO")).toBeDefined();
    expect(screen.getByText("Flujo de Pedidos en Vivo")).toBeDefined();
    expect(screen.getByTitle("Modo Pantalla Gigante / TV de Operaciones")).toBeDefined();
    expect(screen.getByTitle("Generar un nuevo pedido simulado en tiempo real")).toBeDefined();
  });

  it("renderiza las métricas y KPIs iniciales", () => {
    render(<DashboardView />);

    expect(screen.getAllByText("Pedidos Hoy").length).toBeGreaterThan(0);
    expect(screen.getAllByText("En Ruta").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Entregados").length).toBeGreaterThan(0);
  });

  it("renderiza el mapa de Lima Metropolitana con su lienzo SVG", () => {
    const { container } = render(<DashboardView />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(screen.getByText("HUB LOGISALUD")).toBeDefined();
  });
});
