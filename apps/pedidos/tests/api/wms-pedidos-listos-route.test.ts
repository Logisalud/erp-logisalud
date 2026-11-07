import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { firmar } from "@/lib/wms-firma";

const cargar = vi.fn();
vi.mock("@/services/wms-pedidos-listos", () => ({ cargarPedidosListosParaWms: () => cargar() }));

import { GET } from "@/app/api/integracion/wms/pedidos-listos/route";

// Secreto FICTICIO: solo para estas pruebas.
const SECRETO = "secreto-de-prueba-no-real";
const RUTA = "/api/integracion/wms/pedidos-listos";

function pedir(opts: { hora?: string; firma?: string | null; sinHora?: boolean; sinFirma?: boolean } = {}) {
  const hora = opts.hora ?? String(Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = {};
  if (!opts.sinHora) headers["x-wms-timestamp"] = hora;
  if (!opts.sinFirma) headers["x-wms-firma"] = opts.firma ?? firmar(SECRETO, "GET", RUTA, "", hora);
  return new NextRequest("https://pedidos.example.test" + RUTA, { method: "GET", headers });
}

describe("GET /api/integracion/wms/pedidos-listos", () => {
  beforeEach(() => {
    cargar.mockReset();
    cargar.mockResolvedValue({ generado_en: "2026-11-07T15:00:00.000Z", pedidos: [] });
    vi.stubEnv("WMS_PEDIDOS_SECRETO", SECRETO);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("con firma válida responde 200 con el cuerpo del contrato", async () => {
    const r = await GET(pedir());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ generado_en: "2026-11-07T15:00:00.000Z", pedidos: [] });
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("firma inválida: 403 y no lee nada", async () => {
    const r = await GET(pedir({ firma: "sha256=" + "0".repeat(64) }));
    expect(r.status).toBe(403);
    expect(cargar).not.toHaveBeenCalled();
  });

  it("faltan encabezados: 401 y no lee nada", async () => {
    expect((await GET(pedir({ sinHora: true }))).status).toBe(401);
    expect((await GET(pedir({ sinFirma: true }))).status).toBe(401);
    expect(cargar).not.toHaveBeenCalled();
  });

  it("timestamp vencido: 403 aunque la firma sea correcta", async () => {
    const hora = String(Math.floor(Date.now() / 1000) - 400);
    const r = await GET(pedir({ hora }));
    expect(r.status).toBe(403);
    expect(cargar).not.toHaveBeenCalled();
  });

  it("secreto no configurado: rechaza todo (503), incluso una firma hecha con clave vacía", async () => {
    vi.stubEnv("WMS_PEDIDOS_SECRETO", "");
    const hora = String(Math.floor(Date.now() / 1000));
    const r = await GET(pedir({ hora, firma: firmar("", "GET", RUTA, "", hora) }));
    expect(r.status).toBe(503);
    expect(cargar).not.toHaveBeenCalled();
  });

  it("no filtra el secreto ni el motivo en el cuerpo del rechazo", async () => {
    const r = await GET(pedir({ firma: "sha256=" + "0".repeat(64) }));
    const texto = JSON.stringify(await r.json());
    expect(texto).not.toContain(SECRETO);
    expect(texto).not.toMatch(/FIRMA_INCORRECTA|FUERA_DE_TIEMPO/);
  });

  it("si la lectura falla responde 500 sin detalles internos", async () => {
    cargar.mockRejectedValue(new Error("relation pedidos.orders secreto interno"));
    const r = await GET(pedir());
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("relation");
  });
});
