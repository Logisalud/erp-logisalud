// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  UBIGEO_VACIO,
  UbigeoPicker,
  ubigeoCompleto,
  type UbigeoSeleccion,
} from "@/components/ubigeo-picker";

/**
 * El ubigeo es el dato del que depende la guía de remisión, y el vendedor
 * nunca lo escribe: elige tres nombres. Lo que se prueba acá es que la
 * cascada no deje combinaciones imposibles —una provincia de Lima con
 * departamento Piura resolvería a null y la guía saldría sin ubigeo.
 */

const PROVINCIAS: Record<string, string[]> = {
  LIMA: ["LIMA", "CAÑETE"],
  PIURA: ["PIURA", "SULLANA"],
};
const DISTRITOS: Record<string, string[]> = {
  "LIMA|LIMA": ["LURIN", "SANTIAGO DE SURCO"],
  "PIURA|PIURA": ["CASTILLA", "CATACAOS"],
};

function montar(inicial: UbigeoSeleccion = UBIGEO_VACIO) {
  const contenedor = document.createElement("div");
  document.body.appendChild(contenedor);
  const root = createRoot(contenedor);
  const estado = { valor: inicial };
  const cargarProvincias = vi.fn(async (dep: string) => PROVINCIAS[dep] ?? []);
  const cargarDistritos = vi.fn(async (dep: string, prov: string) => DISTRITOS[`${dep}|${prov}`] ?? []);

  function render() {
    root.render(
      <UbigeoPicker
        idPrefijo="t"
        valor={estado.valor}
        onChange={(v) => {
          estado.valor = v;
          render();
        }}
        departamentos={["LIMA", "PIURA"]}
        cargarProvincias={cargarProvincias}
        cargarDistritos={cargarDistritos}
      />,
    );
  }

  act(() => render());

  const select = (nombre: "departamento" | "provincia" | "distrito") =>
    contenedor.querySelector<HTMLSelectElement>(`#t-${nombre}`)!;

  async function elegir(nombre: "departamento" | "provincia" | "distrito", valor: string) {
    const el = select(nombre);
    await act(async () => {
      el.value = valor;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  return { contenedor, estado, select, elegir, cargarProvincias, cargarDistritos };
}

describe("UbigeoPicker", () => {
  it("provincia y distrito arrancan deshabilitados: no hay nada que elegir todavía", () => {
    const { select } = montar();
    expect(select("provincia").disabled).toBe(true);
    expect(select("distrito").disabled).toBe(true);
    expect(select("provincia").textContent).toContain("Elegí departamento");
  });

  it("elegir departamento pide sus provincias y habilita el nivel siguiente", async () => {
    const { elegir, select, cargarProvincias } = montar();
    await elegir("departamento", "LIMA");

    expect(cargarProvincias).toHaveBeenCalledWith("LIMA");
    expect(select("provincia").disabled).toBe(false);
    expect(Array.from(select("provincia").options).map((o) => o.value)).toEqual([
      "",
      "LIMA",
      "CAÑETE",
    ]);
    // El distrito sigue esperando: falta la provincia.
    expect(select("distrito").disabled).toBe(true);
  });

  it("la cascada completa deja los tres nombres elegidos", async () => {
    const { elegir, estado, cargarDistritos } = montar();
    await elegir("departamento", "LIMA");
    await elegir("provincia", "LIMA");
    expect(cargarDistritos).toHaveBeenCalledWith("LIMA", "LIMA");
    await elegir("distrito", "LURIN");

    expect(estado.valor).toEqual({
      departamento: "LIMA",
      provincia: "LIMA",
      distrito: "LURIN",
    });
    expect(ubigeoCompleto(estado.valor)).toBe(true);
  });

  it("cambiar de departamento borra provincia y distrito", async () => {
    // Es el caso que importa: sin este reset queda "PIURA / LIMA / LURIN",
    // que no existe en el catálogo, y el ubigeo se resuelve a null.
    const { elegir, estado, select } = montar();
    await elegir("departamento", "LIMA");
    await elegir("provincia", "LIMA");
    await elegir("distrito", "LURIN");

    await elegir("departamento", "PIURA");

    expect(estado.valor).toEqual({ departamento: "PIURA", provincia: "", distrito: "" });
    expect(ubigeoCompleto(estado.valor)).toBe(false);
    expect(select("distrito").disabled).toBe(true);
    expect(Array.from(select("provincia").options).map((o) => o.value)).toEqual([
      "",
      "PIURA",
      "SULLANA",
    ]);
  });

  it("cambiar de provincia borra el distrito", async () => {
    const { elegir, estado } = montar();
    await elegir("departamento", "LIMA");
    await elegir("provincia", "LIMA");
    await elegir("distrito", "LURIN");
    await elegir("provincia", "CAÑETE");
    expect(estado.valor).toEqual({
      departamento: "LIMA",
      provincia: "CAÑETE",
      distrito: "",
    });
  });
});

describe("ubigeoCompleto", () => {
  it("exige los tres niveles", () => {
    expect(ubigeoCompleto(UBIGEO_VACIO)).toBe(false);
    expect(ubigeoCompleto({ departamento: "LIMA", provincia: "LIMA", distrito: "" })).toBe(false);
    expect(ubigeoCompleto({ departamento: "LIMA", provincia: " ", distrito: "LURIN" })).toBe(false);
    expect(ubigeoCompleto({ departamento: "LIMA", provincia: "LIMA", distrito: "LURIN" })).toBe(
      true,
    );
  });
});
