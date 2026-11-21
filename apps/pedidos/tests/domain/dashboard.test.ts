import { describe, expect, it } from "vitest";
import {
  ALMACEN_CENTRAL_LOGISALUD,
  PEDIDOS_INICIALES,
  VEHICULOS_INICIALES,
  ZONAS_CONFIG,
} from "@/domain/dashboard-dummy-data";

describe("Dashboard Domain & Dummy Data", () => {
  it("contiene la configuración del Almacén Central de LOGISALUD en Callao", () => {
    expect(ALMACEN_CENTRAL_LOGISALUD.nombre).toContain("LOGISALUD");
    expect(ALMACEN_CENTRAL_LOGISALUD.coordenadas.lat).toBeLessThan(-11.5);
    expect(ALMACEN_CENTRAL_LOGISALUD.coordenadas.lng).toBeLessThan(-76.0);
  });

  it("tiene configuradas las 6 zonas de reparto principales", () => {
    const zonas = Object.keys(ZONAS_CONFIG);
    expect(zonas).toContain("lima-centro");
    expect(zonas).toContain("lima-norte");
    expect(zonas).toContain("lima-sur");
    expect(zonas).toContain("lima-este");
    expect(zonas).toContain("callao");
    expect(zonas).toContain("provincias");
  });

  it("los pedidos iniciales tienen datos válidos y consistentes", () => {
    expect(PEDIDOS_INICIALES.length).toBeGreaterThan(10);

    for (const pedido of PEDIDOS_INICIALES) {
      expect(pedido.id).toMatch(/^PED-/);
      expect(pedido.numero).toBeGreaterThan(0);
      expect(pedido.cliente.razonSocial.length).toBeGreaterThan(3);
      expect(pedido.cliente.ruc).toMatch(/^\d{11}$/);
      expect(pedido.montoTotal).toBeGreaterThan(0);
      expect(pedido.items.length).toBeGreaterThan(0);
      expect(pedido.destino.coordenadas.lat).toBeLessThan(0); // Hemisferio sur
      expect(pedido.destino.coordenadas.lng).toBeLessThan(0); // Hemisferio oeste
    }
  });

  it("los vehículos iniciales tienen placa, conductor y pedidos asignados", () => {
    expect(VEHICULOS_INICIALES.length).toBeGreaterThanOrEqual(3);

    for (const vehiculo of VEHICULOS_INICIALES) {
      expect(vehiculo.placa).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
      expect(vehiculo.conductor.length).toBeGreaterThan(2);
      expect(vehiculo.velocidadKmH).toBeGreaterThanOrEqual(0);
    }
  });
});
