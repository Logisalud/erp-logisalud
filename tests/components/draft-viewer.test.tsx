// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DraftViewer } from "@/app/control-pedidos/documentos/[orderId]/draft-viewer";
import type { ElectronicDocumentDraft } from "@/services/electronic-documents";

afterEach(cleanup);

function draft(over: Partial<ElectronicDocumentDraft> = {}): ElectronicDocumentDraft {
  return {
    id: "d1",
    order_id: "o1",
    fulfillment_id: "f1",
    tipo: "COMPROBANTE",
    tipo_comprobante: "FACTURA",
    payload: { operacion: "generar_comprobante", total: 255 },
    advertencias: ["BORRADOR SIN VALIDAR"],
    generado_en: "2026-08-14T12:00:00Z",
    ...over,
  } as ElectronicDocumentDraft;
}

/**
 * jsdom no implementa la API de object URLs, así que se stubea para poder
 * observar qué blob se genera y qué nombre de archivo se le pone.
 */
let creados: Blob[] = [];
let revocados: string[] = [];

beforeEach(() => {
  creados = [];
  revocados = [];
  vi.useFakeTimers({ shouldAdvanceTime: true });
  Object.defineProperty(URL, "createObjectURL", {
    writable: true,
    value: (blob: Blob) => {
      creados.push(blob);
      return `blob:mock/${creados.length}`;
    },
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    writable: true,
    value: (url: string) => revocados.push(url),
  });
});

afterEach(() => vi.useRealTimers());

describe("DraftViewer — descarga del JSON", () => {
  it("descarga el comprobante con nombre propio y el JSON completo", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DraftViewer draft={draft()} numeroPedido={1042} />);

    // El ancla se crea al vuelo; se intercepta el click para inspeccionarla.
    let anchor: HTMLAnchorElement | null = null;
    const clickReal = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      anchor = this as HTMLAnchorElement;
    };

    await user.click(screen.getByRole("button", { name: "Descargar .json" }));

    HTMLAnchorElement.prototype.click = clickReal;

    expect(anchor).not.toBeNull();
    expect(anchor!.download).toBe("borrador-comprobante-pedido-1042.json");
    expect(anchor!.href).toContain("blob:");
    expect(creados).toHaveLength(1);
    expect(creados[0].type).toBe("application/json");
    expect(await creados[0].text()).toContain('"generar_comprobante"');
  });

  it("la guía usa su propio nombre de archivo", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DraftViewer draft={draft({ tipo: "GUIA_REMISION" })} numeroPedido={7} />);

    let anchor: HTMLAnchorElement | null = null;
    const clickReal = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      anchor = this as HTMLAnchorElement;
    };

    await user.click(screen.getByRole("button", { name: "Descargar .json" }));
    HTMLAnchorElement.prototype.click = clickReal;

    expect(anchor!.download).toBe("borrador-guia-pedido-7.json");
  });

  it("no revoca la URL en la misma vuelta del event loop", async () => {
    // Revocarla enseguida cancela la descarga en varios navegadores, y
    // Firefox además ignora el click de un ancla fuera del documento.
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DraftViewer draft={draft()} numeroPedido={1} />);

    const clickReal = HTMLAnchorElement.prototype.click;
    let estabaEnElDom = false;
    HTMLAnchorElement.prototype.click = function () {
      estabaEnElDom = document.body.contains(this);
    };

    await user.click(screen.getByRole("button", { name: "Descargar .json" }));
    HTMLAnchorElement.prototype.click = clickReal;

    expect(estabaEnElDom).toBe(true);
    expect(revocados).toHaveLength(0);

    vi.advanceTimersByTime(1500);
    expect(revocados).toHaveLength(1);
  });

  it("muestra las advertencias del borrador antes que el JSON", () => {
    render(<DraftViewer draft={draft()} numeroPedido={1} />);
    expect(screen.getByText(/Revisar antes de emitir/)).toBeDefined();
    expect(screen.getByText("BORRADOR SIN VALIDAR")).toBeDefined();
  });
});
