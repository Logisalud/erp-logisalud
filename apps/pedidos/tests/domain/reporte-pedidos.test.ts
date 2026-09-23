import { describe, expect, it } from "vitest";
import {
  etiquetaBonificacion,
  etiquetaEstadoDescuento,
  leerRangoDeFechas,
  nombreArchivoReporte,
  precioDeLista,
} from "@/domain/reporte-pedidos";

describe("etiquetaEstadoDescuento", () => {
  it("una línea sin solicitud dice 'No aplica', no queda vacía", () => {
    // En una columna que se filtra en Excel, el vacío se lee como dato
    // faltante y no como "acá no hubo descuento".
    expect(etiquetaEstadoDescuento(null)).toBe("No aplica");
  });

  it("traduce cada decisión", () => {
    expect(etiquetaEstadoDescuento({ estado: "RESUELTO", decision: "APROBAR" })).toBe("Aprobado");
    expect(etiquetaEstadoDescuento({ estado: "RESUELTO", decision: "RECHAZAR" })).toBe("Rechazado");
    expect(etiquetaEstadoDescuento({ estado: "RESUELTO", decision: "APROBAR_OTRO_PRECIO" })).toBe(
      "Aprobado con otro precio",
    );
  });

  it("una solicitud sin resolver es 'Pendiente', aunque no haya decisión", () => {
    expect(etiquetaEstadoDescuento({ estado: "PENDIENTE", decision: null })).toBe("Pendiente");
  });

  it("resuelta sin decisión registrada no se inventa un resultado", () => {
    expect(etiquetaEstadoDescuento({ estado: "RESUELTO", decision: null })).toBe(
      "Resuelto sin decisión registrada",
    );
  });
});

describe("etiquetaBonificacion", () => {
  it("distingue la automática de la manual", () => {
    expect(etiquetaBonificacion("PROMO_BONIFICACION", true)).toBe("Sí — automática (promoción)");
    expect(etiquetaBonificacion("BONIFICACION_MANUAL", true)).toBe("Sí — manual");
  });

  it("una línea normal dice que no", () => {
    expect(etiquetaBonificacion("LISTA", false)).toBe("No");
    expect(etiquetaBonificacion(null, false)).toBe("No");
  });

  it("gratis con origen desconocido sigue siendo bonificación", () => {
    expect(etiquetaBonificacion("APROBACION_COMERCIAL", true)).toBe("Sí");
  });
});

describe("leerRangoDeFechas", () => {
  const rango = (qs: string) => leerRangoDeFechas(new URLSearchParams(qs));

  it("lee las dos fechas", () => {
    expect(rango("desde=2026-09-01&hasta=2026-09-23")).toEqual({
      desde: "2026-09-01",
      hasta: "2026-09-23",
    });
  });

  it("sin fechas no filtra nada", () => {
    expect(rango("")).toEqual({ desde: null, hasta: null });
  });

  it("una fecha con formato raro se ignora en vez de romper la descarga", () => {
    // Un 500 acá el navegador lo guarda como archivo: el usuario termina con
    // un xlsx corrupto sin saber que falló.
    expect(rango("desde=ayer&hasta=2026-09-23")).toEqual({ desde: null, hasta: "2026-09-23" });
    expect(rango("desde=01/09/2026")).toEqual({ desde: null, hasta: null });
  });

  it("si vienen al revés las da vuelta, en vez de devolver cero filas", () => {
    expect(rango("desde=2026-09-23&hasta=2026-09-01")).toEqual({
      desde: "2026-09-01",
      hasta: "2026-09-23",
    });
  });
});

describe("nombreArchivoReporte", () => {
  it("el nombre dice qué período trae el archivo", () => {
    expect(nombreArchivoReporte({ desde: "2026-09-01", hasta: "2026-09-23" }, "2026-09-23")).toBe(
      "pedidos-enviados-2026-09-01-a-2026-09-23.xlsx",
    );
    expect(nombreArchivoReporte({ desde: "2026-09-01", hasta: null }, "2026-09-23")).toBe(
      "pedidos-enviados-desde-2026-09-01.xlsx",
    );
    expect(nombreArchivoReporte({ desde: null, hasta: null }, "2026-09-23")).toBe(
      "pedidos-enviados-2026-09-23.xlsx",
    );
  });
});

describe("precioDeLista", () => {
  const base = { precioListaOriginal: null, precioOriginalSolicitud: null, origenPrecio: "LISTA", precioUnitario: 60 };

  it("en una línea normal el precio de lista es el que se cobró", () => {
    // No hay rebaja: si esto devolviera null, la columna saldría vacía en la
    // mayoría de las líneas del reporte.
    expect(precioDeLista(base)).toBe(60);
  });

  it("con promoción usa el precio original que guardó la línea", () => {
    expect(
      precioDeLista({ ...base, origenPrecio: "PROMO_ESCALA", precioListaOriginal: 128.91, precioUnitario: 64.455 }),
    ).toBe(128.91);
  });

  it("con descuento aprobado lo toma de la solicitud, que es donde quedó", () => {
    expect(
      precioDeLista({ ...base, origenPrecio: "APROBACION_COMERCIAL", precioOriginalSolicitud: 108, precioUnitario: 86 }),
    ).toBe(108);
  });

  it("la línea guarda más que la solicitud si las dos lo tienen", () => {
    expect(
      precioDeLista({ ...base, precioListaOriginal: 100, precioOriginalSolicitud: 90, origenPrecio: "BONIFICACION_MANUAL" }),
    ).toBe(100);
  });

  it("una bonificación de promoción no tiene precio de lista, y no se inventa", () => {
    expect(
      precioDeLista({ ...base, origenPrecio: "PROMO_BONIFICACION", precioUnitario: 0 }),
    ).toBeNull();
  });
});
