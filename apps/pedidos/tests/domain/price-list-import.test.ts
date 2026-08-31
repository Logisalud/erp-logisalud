import { describe, expect, it } from "vitest";
import {
  parsePriceListRows,
  decideTaxTreatment,
  buildChannelPrices,
  findHeaderAndColumns,
  type RawRow,
} from "@/domain/price-list-import";

const HEADER: RawRow = [
  "CÓDIGO DIPHASAC",
  "CÓDIGO LOGISALUD",
  "CÓDIGO BONIFICACIÓN",
  "OBS.",
  "MASTER PACK",
  "PRODUCTO",
  "PRINCIPIO ACTIVO",
  "PRESENTACIÓN",
  "", // sin encabezado: unidad de medida
  "VVF (Sin IGV)",
  "VVD (Sin IGV)",
  "IGV (18%)",
  "FECHA V.",
  "PVF A DISTRIBUIDORA 2026",
  "PVF INSTITUCIONES",
  "PVF SUBDISTRIB.",
  "PVF MINICADENAS",
  "PVF MAYORISTA/TOP",
  "PVF FARMA",
];

function buildRows(productRows: RawRow[]): RawRow[] {
  return [
    ["LISTA DE PRECIOS DIPHASAC"],
    [],
    [],
    [],
    [],
    [],
    HEADER,
    ...productRows,
  ];
}

describe("parsePriceListRows", () => {
  it("detecta la fila de encabezado real aunque esté precedida de filas irrelevantes", () => {
    const rows = buildRows([
      [
        "COD1",
        "DHP001",
        null,
        null,
        null,
        "Producto A",
        "Principio A",
        "Caja x 10",
        "TABLETA",
        100,
        90,
        18,
        "2026-01-15",
        80,
        120,
        110,
        115,
        118,
        125,
      ],
    ]);

    const result = parsePriceListRows(rows);
    expect(result.headerRowIndex).toBe(6);
    expect(result.errors).toHaveLength(0);
    expect(result.products).toHaveLength(1);
  });

  it("ignora filas de encabezado de sección (solo texto en la primera columna)", () => {
    const rows = buildRows([
      ["LÍNEA MARCAS METABOLICAS Mx", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
      [
        "COD2",
        "DHP002",
        null,
        null,
        null,
        "Producto B",
        "Principio B",
        "Caja x 20",
        "TUBO",
        50,
        45,
        9,
        "2026-01-15",
        40,
        60,
        55,
        58,
        59,
        62,
      ],
    ]);

    const result = parsePriceListRows(rows);
    expect(result.sectionHeaders).toEqual([{ rowIndex: 7, label: "LÍNEA MARCAS METABOLICAS Mx" }]);
    expect(result.products).toHaveLength(1);
  });

  it("detecta encabezado de sección aunque el texto no caiga en la columna 0 (celdas combinadas)", () => {
    // Caso real detectado en el archivo de Diphasac: el título de
    // sección aparece en la columna de CÓDIGO LOGISALUD, no en la 0.
    const sectionRow: RawRow = new Array(19).fill(null);
    sectionRow[1] = "LÍNEA MARCAS METABOLICAS Mx";

    const rows = buildRows([
      sectionRow,
      [
        "COD9",
        "DHP009",
        null,
        null,
        null,
        "Producto Z",
        null,
        null,
        null,
        10,
        9,
        1,
        null,
        8,
        12,
        11,
        11,
        11,
        13,
      ],
    ]);

    const result = parsePriceListRows(rows);
    expect(result.sectionHeaders).toEqual([
      { rowIndex: 7, label: "LÍNEA MARCAS METABOLICAS Mx" },
    ]);
    expect(result.products).toHaveLength(1);
    expect(result.warnings).toHaveLength(0);
  });

  it("marca como error las filas sin CÓDIGO LOGISALUD", () => {
    const rows = buildRows([
      ["COD3", "", null, null, null, "Producto C", null, null, null, 10, 9, 1, null, 8, 12, 11, 11, 11, 13],
    ]);

    const result = parsePriceListRows(rows);
    expect(result.products).toHaveLength(0);
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "MISSING_CODE" }),
    ]);
  });

  it("ignora (no publica como producto) una fila con código pero sin descripción — caso real BSA326", () => {
    // Excel real de Biosana: código y bonificación presentes, PRODUCTO
    // vacío (un SKU sin descripción cargada).
    const rows = buildRows([
      ["FAR30-026", "BSA326", "BOBSA326", null, null, "", null, null, null, null, null, null, null, null, "-", null, null, null, null],
    ]);

    const result = parsePriceListRows(rows);
    expect(result.products).toHaveLength(0);
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "MISSING_DESCRIPTION" }),
    ]);
  });

  it("ignora una fila de leyenda/nota que cae en la columna de código — caso real Biosana", () => {
    // Excel real: fila "LEYENDA:" / "VVF= Valor de Venta Farmacia",
    // esta última justo en la columna de CÓDIGO LOGISALUD. No la
    // detecta soleNonBlankCellText porque hay dos textos distintos.
    const rows = buildRows([
      ["LEYENDA:", "VVF= Valor de Venta Farmacia", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    ]);

    const result = parsePriceListRows(rows);
    expect(result.products).toHaveLength(0);
    // Cae primero en MISSING_DESCRIPTION (producto vacío); si el
    // producto tuviera texto entre paréntesis en vez de vacío,
    // caería en SUSPICIOUS_NOTE (ver siguiente test).
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "MISSING_DESCRIPTION" }),
    ]);
  });

  it("ignora una fila cuyo código o producto viene envuelto entre paréntesis (nota/aclaración)", () => {
    const rows = buildRows([
      [
        "COD9",
        "DHP900",
        null,
        null,
        null,
        "(Ver leyenda de códigos)",
        null,
        null,
        null,
        10,
        9,
        1,
        null,
        8,
        12,
        11,
        11,
        11,
        13,
      ],
    ]);

    const result = parsePriceListRows(rows);
    expect(result.products).toHaveLength(0);
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "SUSPICIOUS_NOTE" }),
    ]);
  });

  it("marca como error (no como warning) los códigos LOGISALUD duplicados y los excluye de products", () => {
    const dupRow = (producto: string): RawRow => [
      "COD4",
      "DHP004",
      null,
      null,
      null,
      producto,
      null,
      null,
      null,
      10,
      9,
      1,
      null,
      8,
      12,
      11,
      11,
      11,
      13,
    ];

    const rows = buildRows([dupRow("Producto D v1"), dupRow("Producto D v2")]);

    const result = parsePriceListRows(rows);
    expect(result.products).toHaveLength(0);
    expect(result.errors.filter((e) => e.code === "DUPLICATE_CODE")).toHaveLength(2);
  });

  it("trata precio vacío, en cero o '-' como advertencia, no como error fatal", () => {
    const rows = buildRows([
      [
        "COD5",
        "DHP005",
        null,
        null,
        null,
        "Producto E",
        null,
        null,
        null,
        10,
        9,
        1,
        null,
        8,
        "-",
        0,
        "",
        50,
        60,
      ],
    ]);

    const result = parsePriceListRows(rows);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].pvfInstituciones).toBeNull();
    expect(result.products[0].pvfSubdistrib).toBeNull();
    expect(result.products[0].pvfMinicadenas).toBeNull();
    expect(result.warnings.filter((w) => w.code === "NO_PRICE")).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
  });

  it("PVF MAYORISTA/TOP alimenta dos canales con el mismo valor; PVF A DISTRIBUIDORA no es precio de ningún canal", () => {
    const rows = buildRows([
      [
        "COD6",
        "DHP006",
        null,
        null,
        null,
        "Producto F",
        null,
        null,
        null,
        10,
        9,
        1,
        null,
        999, // PVF A DISTRIBUIDORA — costo referencial, no debe ser price_list_item
        12,
        11,
        11,
        77, // PVF MAYORISTA/TOP
        13,
      ],
    ]);

    const result = parsePriceListRows(rows);
    const product = result.products[0];
    expect(product.pvfDistribuidora).toBe(999);

    const channelPrices = buildChannelPrices(product);
    expect(channelPrices).toContainEqual({ channel: "Mayorista", precio: 77 });
    expect(channelPrices).toContainEqual({ channel: "Tops", precio: 77 });
    expect(channelPrices.some((c) => c.precio === 999)).toBe(false);
    // Clínicas, Subdistribuidores, Minicadenas, Farma (1 cada uno) + Mayorista/Tops (2 del mismo valor) = 6
    expect(channelPrices).toHaveLength(6);
  });
});

describe("decideTaxTreatment", () => {
  it("es INAFECTO con tasa 0 cuando VVF e IGV vienen vacíos", () => {
    const treatment = decideTaxTreatment({ vvfSinIgv: null, igv: null }, 18);
    expect(treatment).toEqual({ afectacionTributaria: "INAFECTO", tasaAplicable: 0 });
  });

  it("es GRAVADO con la tasa vigente del sistema cuando VVF/IGV tienen valor", () => {
    const treatment = decideTaxTreatment({ vvfSinIgv: 100, igv: 18 }, 18);
    expect(treatment).toEqual({ afectacionTributaria: "GRAVADO", tasaAplicable: 18 });
  });
});

describe("formato consolidado 2026-08 (un archivo, todos los proveedores)", () => {
  // Encabezado real del archivo "Formato_Lista_Precios_2.xlsx": el
  // código propio se llama "CODIGO LOGISA", CODIGO PROVEEDOR está a la
  // DERECHA (antes iba a la izquierda), aparecen PROVEEDOR y LINEA,
  // Subdistribuidoras y Minicadenas comparten UNA columna, y detrás de
  // los PVF vienen columnas MARGEN que repiten el mismo texto.
  const HEADER = [
    "CODIGO LOGISA",
    "CODIGO PROVEEDOR",
    "DESCRIPCION PRODUCTO",
    "PRINCIPIO ACTIVO",
    "PRESENTACIÓN ",
    "PROVEEDOR",
    "LINEA",
    "VVF (Sin IGV)",
    "VVD (SIN IGV)",
    "IGV (18%)",
    "FECHA V.",
    "PVF A DISTRIBUIDORA 2026",
    "PVF INSTITUCIONES",
    "PVF SUBDISTRIBUIDORAS/MINICADENAS",
    "PVF MAYORISTA/TOP",
    "PVF FARMA",
    "MARGEN - PVF INSTITUCIONES",
    "MARGEN - PVF SUBDISTRIBUIDORAS/MINICADENAS",
    "MARGEN - PVF MAYORISTA/TOP",
    "MARGEN - PVF FARMA",
  ];

  const FILA_GRAVADA = [
    "DHP104", "RX101-057", "DUO DAPHA 5", "DAPAGLIFOZINA + METFORMINA",
    "5MG/1000MG CAJA x 30 TAB RECUB.", "DIPHASAC", "RX",
    67.1186, 57.722, 10.39, new Date(Date.UTC(2027, 1, 28)),
    68.112, 70.5, 75.68, 77.4, 79.2,
    0.08, 0.1, 0.12, 0.18,
  ];

  it("mapea las columnas del consolidado sin confundirse con VVF/MARGEN", () => {
    const found = findHeaderAndColumns([HEADER]);
    expect(found).not.toBeNull();
    const m = found!.columnMap;
    expect(m.codigoLogisalud).toBe(0);
    // Por texto, no por posición: acá está a la derecha del código propio.
    expect(m.codigoProveedor).toBe(1);
    expect(m.producto).toBe(2);
    expect(m.proveedor).toBe(5);
    expect(m.linea).toBe(6);
    // "VVF (Sin IGV)" también contiene "IGV" y viene antes: el IGV real
    // es la columna 9, no la 7.
    expect(m.igv).toBe(9);
    expect(m.vvf).toBe(7);
    // "PVF SUBDISTRIBUIDORAS/MINICADENAS" contiene "DISTRIBUIDORA":
    // el costo de referencia sigue siendo la 11.
    expect(m.pvfDistribuidora).toBe(11);
    expect(m.pvfInstituciones).toBe(12);
    // Los PVF nunca deben caer en las columnas MARGEN (16-19).
    expect(m.pvfMayoristaTop).toBe(14);
    expect(m.pvfFarma).toBe(15);
    // No hay columna de unidad de medida; PROVEEDOR ocupa ese lugar y
    // sí tiene encabezado, así que no se la toma por unidad.
    expect(m.unidadMedida).toBe(-1);
  });

  it("detecta que Subdistribuidoras y Minicadenas comparten columna", () => {
    const m = findHeaderAndColumns([HEADER])!.columnMap;
    expect(m.pvfSubdistrib).toBe(13);
    expect(m.pvfMinicadenas).toBe(13);
    expect(m.subdistribMinicadenasCompartidas).toBe(true);
  });

  it("un solo valor alimenta Subdistribuidores Y Minicadenas", () => {
    const result = parsePriceListRows([HEADER, FILA_GRAVADA]);
    expect(result.errors).toEqual([]);
    expect(result.products).toHaveLength(1);
    const p = result.products[0];
    expect(p.pvfSubdistrib).toBe(75.68);
    expect(p.pvfMinicadenas).toBe(75.68);
    expect(p.proveedorNombre).toBe("DIPHASAC");
    expect(p.linea).toBe("RX");

    const canales = buildChannelPrices(p);
    // Mismo patrón que MAYORISTA/TOP: una columna, dos canales.
    expect(canales).toEqual(
      expect.arrayContaining([
        { channel: "Subdistribuidores", precio: 75.68 },
        { channel: "Minicadenas", precio: 75.68 },
        { channel: "Mayorista", precio: 77.4 },
        { channel: "Tops", precio: 77.4 },
        { channel: "Clínicas", precio: 70.5 },
        { channel: "Horizontal", precio: 79.2 },
      ]),
    );
    // PVF A DISTRIBUIDORA es costo referencial, nunca precio de canal.
    expect(canales.some((c) => c.precio === 68.112)).toBe(false);
  });

  it("avisa una sola vez cuando la columna compartida viene vacía", () => {
    const sinSubMin = [...FILA_GRAVADA];
    sinSubMin[13] = "-";
    const result = parsePriceListRows([HEADER, sinSubMin]);
    const avisos = result.warnings.filter((w) => w.code === "NO_PRICE");
    expect(avisos).toHaveLength(1);
    expect(avisos[0].message).toContain("SUBDISTRIBUIDORAS/MINICADENAS");
  });

  it("trata como INAFECTO la fila con VVF e IGV en '-'", () => {
    const inafecta = [...FILA_GRAVADA];
    inafecta[0] = "BODHP106";
    inafecta[2] = "DAPHA 10";
    inafecta[7] = "-";
    inafecta[9] = "-";
    const p = parsePriceListRows([HEADER, inafecta]).products[0];
    expect(decideTaxTreatment(p, 18)).toEqual({
      afectacionTributaria: "INAFECTO",
      tasaAplicable: 0,
    });
  });
});
