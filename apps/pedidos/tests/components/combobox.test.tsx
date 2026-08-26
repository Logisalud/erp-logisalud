// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Combobox, type ComboboxOption } from "@/components/combobox";

afterEach(cleanup);

/**
 * Clientes con la MISMA forma que los reales que devuelve la búsqueda
 * para "boticas peru" (dos coincidencias en la cartera), con nombres y
 * RUC inventados: la cartera real no entra al repo.
 */
const RESULTADOS: ComboboxOption[] = [
  { id: "c1", label: "CORPORACION BOTICAS EJEMPLO S.A.C.", description: "20100000001" },
  { id: "c2", label: "BOTICAS EJEMPLOSALUD", description: "20100000002" },
];

const INICIALES: ComboboxOption[] = [
  { id: "c9", label: "PRIMER CLIENTE ALFABETICO", description: "20100000009" },
];

/** Envoltorio con el estado del padre, como lo usa el formulario real. */
function Harness({ onSearch }: { onSearch: (t: string) => Promise<ComboboxOption[]> }) {
  const [selected, setSelected] = useState<ComboboxOption | null>(null);
  return (
    <form>
      <Combobox
        name="customerId"
        label="Cliente"
        selected={selected}
        onSelect={setSelected}
        onSearch={onSearch}
        initialOptions={INICIALES}
        placeholder="Escribe el RUC o la razón social..."
        debounceMs={0}
      />
    </form>
  );
}

function hiddenValue(): string {
  const el = document.querySelector('input[name="customerId"]') as HTMLInputElement;
  return el.value;
}

describe("Combobox — un solo campo", () => {
  it("es UN campo de texto: no hay un <select> aparte que abrir", async () => {
    render(<Harness onSearch={async () => RESULTADOS} />);

    expect(screen.getByRole("combobox")).toBeDefined();
    // El control separado que había antes ya no existe.
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.querySelectorAll("select")).toHaveLength(0);
    // Un único input visible; el otro es el hidden del submit.
    const visibles = Array.from(document.querySelectorAll("input")).filter(
      (i) => i.type !== "hidden",
    );
    expect(visibles).toHaveLength(1);
  });

  it('escribir "boticas peru" busca y muestra las sugerencias debajo del campo', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn(async () => RESULTADOS);
    render(<Harness onSearch={onSearch} />);

    await user.type(screen.getByRole("combobox"), "boticas peru");

    await waitFor(() => expect(onSearch).toHaveBeenCalled());
    expect(onSearch).toHaveBeenLastCalledWith("boticas peru");

    const lista = await screen.findByRole("listbox");
    const opciones = within(lista).getAllByRole("option");
    expect(opciones).toHaveLength(2);
    expect(within(lista).getByText("CORPORACION BOTICAS EJEMPLO S.A.C.")).toBeDefined();
    expect(within(lista).getByText("BOTICAS EJEMPLOSALUD")).toBeDefined();
    // El RUC se ve como línea secundaria, que es el otro dato por el que
    // el vendedor reconoce al cliente.
    expect(within(lista).getByText("20100000001")).toBeDefined();
  });

  it("UN click en la sugerencia deja el cliente elegido y cierra la lista", async () => {
    const user = userEvent.setup();
    render(<Harness onSearch={async () => RESULTADOS} />);

    const input = screen.getByRole("combobox") as HTMLInputElement;
    await user.type(input, "boticas peru");
    await screen.findByRole("listbox");

    // Un solo click, sin pasos intermedios.
    await user.click(screen.getByText("CORPORACION BOTICAS EJEMPLO S.A.C."));

    expect(input.value).toBe("CORPORACION BOTICAS EJEMPLO S.A.C.");
    expect(hiddenValue()).toBe("c1");
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  });

  it("no busca con menos del mínimo: muestra la primera página", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn(async () => RESULTADOS);
    render(<Harness onSearch={onSearch} />);

    await user.type(screen.getByRole("combobox"), "b");

    const lista = await screen.findByRole("listbox");
    expect(within(lista).getByText("PRIMER CLIENTE ALFABETICO")).toBeDefined();
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("avisa cuando no hay coincidencias, sin dejar el campo en un estado ambiguo", async () => {
    const user = userEvent.setup();
    render(<Harness onSearch={async () => []} />);

    await user.type(screen.getByRole("combobox"), "zzzz");

    const lista = await screen.findByRole("listbox");
    await waitFor(() => expect(within(lista).getByText(/zzzz/)).toBeDefined());
    expect(hiddenValue()).toBe("");
  });

  it("se puede elegir con el teclado (flecha + Enter)", async () => {
    const user = userEvent.setup();
    render(<Harness onSearch={async () => RESULTADOS} />);

    const input = screen.getByRole("combobox") as HTMLInputElement;
    await user.type(input, "boticas peru");
    await screen.findByRole("listbox");

    await user.keyboard("{ArrowDown}{Enter}");

    expect(hiddenValue()).toBe("c2");
    expect(input.value).toBe("BOTICAS EJEMPLOSALUD");
  });

  it("escribir encima de una selección la deshace: el campo no puede mostrar A y mandar B", async () => {
    const user = userEvent.setup();
    render(<Harness onSearch={async () => RESULTADOS} />);

    const input = screen.getByRole("combobox") as HTMLInputElement;
    await user.type(input, "boticas peru");
    await screen.findByRole("listbox");
    await user.click(screen.getByText("CORPORACION BOTICAS EJEMPLO S.A.C."));
    expect(hiddenValue()).toBe("c1");

    await user.type(input, "otra cosa");
    expect(hiddenValue()).toBe("");
  });

  it("el botón de limpiar suelta la selección", async () => {
    const user = userEvent.setup();
    render(<Harness onSearch={async () => RESULTADOS} />);

    const input = screen.getByRole("combobox") as HTMLInputElement;
    await user.type(input, "boticas peru");
    await screen.findByRole("listbox");
    await user.click(screen.getByText("BOTICAS EJEMPLOSALUD"));
    expect(hiddenValue()).toBe("c2");

    await user.click(screen.getByLabelText("Quitar el cliente elegido"));

    expect(hiddenValue()).toBe("");
    expect(input.value).toBe("");
  });

  it("descarta una respuesta lenta que llega después de una más nueva", async () => {
    const user = userEvent.setup();
    let resolvePrimera: ((v: ComboboxOption[]) => void) | null = null;

    const onSearch = vi.fn((term: string) => {
      if (term === "boticas peru") {
        return new Promise<ComboboxOption[]>((res) => {
          resolvePrimera = res;
        });
      }
      return Promise.resolve([{ id: "c3", label: "RESULTADO NUEVO", description: "20100000003" }]);
    });

    render(<Harness onSearch={onSearch} />);
    const input = screen.getByRole("combobox");

    await user.type(input, "boticas peru");
    await waitFor(() => expect(resolvePrimera).not.toBeNull());

    await user.clear(input);
    await user.type(input, "otro termino");
    await screen.findByText("RESULTADO NUEVO");

    // La primera búsqueda responde tarde: no debe pisar lo nuevo.
    resolvePrimera!(RESULTADOS);

    await waitFor(() => expect(screen.getByText("RESULTADO NUEVO")).toBeDefined());
    expect(screen.queryByText("CORPORACION BOTICAS EJEMPLO S.A.C.")).toBeNull();
  });
});
