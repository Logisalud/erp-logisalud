// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

const HIT = [
  {
    id: "3f2b1b1e-0f4e-4b5f-9a2c-0d6f5c1a2b3c",
    ruc_o_documento: "10464768152",
    razon_social: "CASIMIRO CARASCO KETTY SUSAN",
    nombre_comercial: null,
    estado: "ACTIVO",
    canal: { nombre: "FARMACIAS" },
    zona: { nombre: "ZONA 5" },
    direcciones: 1,
  },
];
const { buscar } = vi.hoisted(() => ({ buscar: vi.fn() }));
vi.mock("@/app/admin/maestros/clientes/actions", () => ({ buscarClientesCartera: buscar }));

import { CustomerSearch } from "@/app/admin/maestros/clientes/customer-search";
import { MIN_SEARCH_LENGTH } from "@/domain/customer-search";

buscar.mockImplementation(async (_q: string) => HIT);

function montar() {
  const contenedor = document.createElement("div");
  document.body.appendChild(contenedor);
  const root = createRoot(contenedor);
  act(() => root.render(<CustomerSearch />));

  async function buscarTexto(texto: string) {
    const input = contenedor.querySelector<HTMLInputElement>("#buscar-cliente")!;
    // React ignora una asignación directa a `.value` en un input controlado:
    // hay que pasar por el setter nativo para que vea el cambio.
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    await act(async () => {
      setValue.call(input, texto);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      contenedor.querySelector("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
  }

  return { contenedor, buscarTexto };
}

describe("CustomerSearch", () => {
  it("no consulta al servidor con menos de los caracteres mínimos", async () => {
    const { contenedor, buscarTexto } = montar();
    await buscarTexto("c");
    expect(buscar).not.toHaveBeenCalled();
    expect(contenedor.textContent).toContain(`${MIN_SEARCH_LENGTH} caracteres`);
  });

  it("lleva al detalle del cliente por su RUC", async () => {
    const { contenedor, buscarTexto } = montar();
    await buscarTexto("casimiro");

    expect(buscar).toHaveBeenCalledWith("casimiro");
    const link = contenedor.querySelector<HTMLAnchorElement>("a")!;
    expect(link.getAttribute("href")).toBe("/admin/maestros/clientes/10464768152");
    expect(link.textContent).toContain("CASIMIRO CARASCO KETTY SUSAN");
    // El estado y el conteo de direcciones se muestran para saber, antes de
    // entrar, si el cliente es el que está mal cargado.
    expect(link.textContent).toContain("ACTIVO");
    expect(link.textContent).toContain("1 dirección");
  });
});
