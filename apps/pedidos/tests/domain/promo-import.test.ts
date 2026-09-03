import { describe, expect, it } from "vitest";
import {
  encontrarCabeceras,
  parsePromoRows,
  porcentajeDeCelda,
  resolverPromoImport,
  resumirPromoImport,
  umbralDeTexto,
  type CatalogoProductoPromo,
  type RawRow,
} from "@/domain/promo-import";

/**
 * El archivo real de Diphasac, en miniatura: la fila de cabeceras con los
 * dos bloques y unas pocas filas que cubren cada caso que trae el archivo
 * de verdad.
 *
 * Lo que se prueba acá no es "parsea un Excel": es que un porcentaje leído
 * de la columna equivocada no llegue nunca a un pedido. Un importador de
 * promociones que se equivoca no rompe nada visible — cobra distinto.
 */
const CABECERAS: RawRow = [
  "CÓDIGO DIPHASAC",
  "MASTER PACK",
  "PRODUCTO",
  "PRINCIPIO ACTIVO",
  "PRESENTACIÓN",
  "VVF (Sin IGV)",
  "VVD (SIN IGV)",
  "IGV (18%)",
  "FECHA V.",
  "PVF A DISTRIBUIDORA 2026",
  "PVF INSTITUCIONES",
  "PVF SUBDISTRIBUIDORAS/MINICADENAS",
  "PVF MAYORISTA/TOP",
  "PVF FARMA",
  "MARGEN X PRODUCTO",
  "ESCALA PARA HORIZONTALIDAD",
  "% DCTO",
  "PRECIO PROMOCIONAL",
  "PROMOS VÍA BONIFICACIÓN",
  "",
  "",
  "PRECIO PROMOCIONAL",
  "ESCALA PARA MAYORISTA/SUBDISTRIBUIDORA",
  "% DCTO",
  "PRECIO PROMOCIONAL",
  "PROMOS VÍA BONIFICACIÓN",
  "",
  "",
  "PRECIO PROMOCIONAL",
];

function fila(valores: Record<number, string | number>): RawRow {
  const f: RawRow = Array.from({ length: CABECERAS.length }, () => null);
  for (const [idx, valor] of Object.entries(valores)) f[Number(idx)] = valor;
  return f;
}

/** Mucoflux 200: escala del 10% desde 1 caja, sólo Horizontalidad. */
const MUCOFLUX = fila({ 0: "RX101-042", 2: "MUCOFLUX 200MG", 15: "DE 1 A MÁS CAJAS", 16: 0.1, 17: 19.755 });
/** Vitamina E: bonificación 1 + 1, sólo Horizontalidad. */
const VITAMINA_E = fila({ 0: "OT100-023", 2: "VITAMINA E", 18: 1, 19: "+", 20: 1, 21: 8 });
/** Ibucalm: el paquete escrito en prosa, en la columna de la escala. */
const IBUCALM = fila({
  0: "OT100-024",
  2: "IBUCALM",
  15: "NUEVO PAQUETE: IBUCALM 200 + MUCOFLUX 200 ( S/. 50)",
});
/** Gasa: bonificación en los dos bloques, con cantidades distintas. */
const GASA = fila({
  0: "CP103-011",
  2: "GASA",
  18: 1,
  19: "+",
  20: 1,
  21: 19,
  25: 10,
  26: "+",
  27: 10,
  28: 18.352272727272727,
});

const CATALOGO: CatalogoProductoPromo[] = [
  {
    id: "p-muco",
    codigo_interno: "DHP020",
    codigo_proveedor: "RX101-042",
    descripcion: "MUCOFLUX 200 200MG CJA X 30 SOBRE.",
    estado: "activo",
  },
  {
    id: "p-vite",
    codigo_interno: "DHP200",
    codigo_proveedor: "OT100-023",
    descripcion: "VITAMINA E 400 UI CJA. X 30 CAP. BDA.",
    estado: "activo",
  },
  {
    id: "p-gasa",
    codigo_interno: "DHP300",
    codigo_proveedor: "CP103-011",
    descripcion: "GASA ESTÉRIL 7.5 X 7.5",
    estado: "activo",
  },
];

const CANALES = [
  { id: 1, nombre: "Mayorista" },
  { id: 2, nombre: "Horizontal" },
  { id: 3, nombre: "Minicadenas" },
  { id: 4, nombre: "Tops" },
  { id: 5, nombre: "Clínicas" },
  { id: 6, nombre: "Subdistribuidores" },
];

const PRECIOS = new Map<string, number>([
  ["p-muco|2", 21.95],
  ["p-muco|1", 20.4534],
  ["p-vite|2", 16],
  ["p-gasa|2", 38],
  ["p-gasa|1", 36.70454545454545],
]);

function catalogos(extra?: { productos?: CatalogoProductoPromo[]; vigentes?: Set<string> }) {
  return {
    productos: extra?.productos ?? CATALOGO,
    canales: CANALES,
    precios: PRECIOS,
    vigentes: extra?.vigentes ?? new Set<string>(),
  };
}

describe("umbralDeTexto", () => {
  it("lee el umbral de las escalas del archivo", () => {
    expect(umbralDeTexto("DE 2 A MÁS CAJAS")).toBe(2);
    expect(umbralDeTexto("DE 10 A MAS CAJAS")).toBe(10);
    expect(umbralDeTexto("de 1 a más cajas")).toBe(1);
  });

  it("no inventa un umbral cuando la celda trae prosa", () => {
    // Esta celda es el par Ibucalm + Mucoflux. Leerla como escala sería
    // aplicarle a Ibucalm un descuento que sólo existe con Mucoflux.
    expect(umbralDeTexto("NUEVO PAQUETE: IBUCALM 200 + MUCOFLUX 200 ( S/. 50)")).toBeNull();
    expect(umbralDeTexto("")).toBeNull();
    expect(umbralDeTexto("2 CAJAS")).toBeNull();
  });
});

describe("porcentajeDeCelda", () => {
  it("convierte la fracción del archivo en porcentaje", () => {
    expect(porcentajeDeCelda(0.15)).toBe(15);
    expect(porcentajeDeCelda(0.1)).toBe(10);
    expect(porcentajeDeCelda(0.5)).toBe(50);
  });

  it("acepta el porcentaje ya escrito como tal", () => {
    expect(porcentajeDeCelda(16)).toBe(16);
    expect(porcentajeDeCelda("16%")).toBe(16);
  });

  it("rechaza lo que no es un descuento posible", () => {
    expect(porcentajeDeCelda(0)).toBeNull();
    expect(porcentajeDeCelda(100)).toBeNull();
    expect(porcentajeDeCelda("s/d")).toBeNull();
    expect(porcentajeDeCelda(null)).toBeNull();
  });
});

describe("encontrarCabeceras", () => {
  it("ubica los dos bloques y le da a cada bonificación su canal", () => {
    const cabeceras = encontrarCabeceras([["Lista de precios 2026"], [], CABECERAS]);
    expect(cabeceras?.headerRowNumber).toBe(3);

    const [horizontal, mayorista] = cabeceras!.columns.bloques;
    expect(horizontal.escala).toEqual([15, 16, 17]);
    expect(horizontal.bonificacion).toEqual([18, 20, 21]);
    expect(mayorista.escala).toEqual([22, 23, 24]);
    expect(mayorista.bonificacion).toEqual([25, 27, 28]);
  });

  it("no confunde el archivo de otro importador", () => {
    expect(encontrarCabeceras([["codigo_producto", "inventory_source", "cantidad"]])).toBeNull();
  });
});

describe("parsePromoRows", () => {
  const parsed = parsePromoRows([CABECERAS, MUCOFLUX, VITAMINA_E, IBUCALM, GASA]);

  it("lee la escala con su umbral y su porcentaje", () => {
    const escala = parsed.promos.find((p) => p.tipo === "ESCALA");
    expect(escala).toMatchObject({
      codigoProveedor: "RX101-042",
      bloque: "HORIZONTALIDAD",
      cantidadMinima: 1,
      porcentajeDescuento: 10,
      etiquetaOrigen: "DE 1 A MÁS CAJAS",
      precioDeclarado: 19.755,
    });
  });

  it("lee la bonificación como compra N + lleva M", () => {
    const bonificacion = parsed.promos.find((p) => p.codigoProveedor === "OT100-023");
    expect(bonificacion).toMatchObject({
      tipo: "BONIFICACION",
      bloque: "HORIZONTALIDAD",
      cantidadComprada: 1,
      cantidadGratis: 1,
      precioDeclarado: 8,
    });
  });

  it("separa los dos bloques de una misma fila", () => {
    const gasa = parsed.promos.filter((p) => p.codigoProveedor === "CP103-011");
    expect(gasa).toHaveLength(2);
    expect(gasa.map((p) => p.bloque)).toEqual(["HORIZONTALIDAD", "MAYORISTA"]);
    expect(gasa[1]).toMatchObject({ cantidadComprada: 10, cantidadGratis: 10 });
  });

  it("la prosa se reporta como nota y no se importa", () => {
    expect(parsed.promos.some((p) => p.codigoProveedor === "OT100-024")).toBe(false);
    expect(parsed.notas).toEqual([
      {
        rowNumber: 4,
        codigoProveedor: "OT100-024",
        producto: "IBUCALM",
        bloque: "HORIZONTALIDAD",
        texto: "NUEVO PAQUETE: IBUCALM 200 + MUCOFLUX 200 ( S/. 50)",
      },
    ]);
    expect(parsed.errors).toEqual([]);
  });

  it("un porcentaje suelto, sin la escala que dice desde cuándo, es un error", () => {
    const suelto = parsePromoRows([CABECERAS, fila({ 0: "RX101-042", 16: 0.15 })]);
    expect(suelto.promos).toEqual([]);
    expect(suelto.errors[0].code).toBe("PORCENTAJE_SIN_ESCALA");
  });

  it("una bonificación a medias no se completa a ojo", () => {
    const media = parsePromoRows([CABECERAS, fila({ 0: "OT100-023", 18: 2 })]);
    expect(media.promos).toEqual([]);
    expect(media.errors[0].code).toBe("BONIFICACION_INCOMPLETA");
  });
});

describe("resolverPromoImport", () => {
  const parsed = parsePromoRows([CABECERAS, MUCOFLUX, VITAMINA_E, GASA]);

  it("el bloque de Mayorista se expande a sus cuatro canales", () => {
    const { promos } = resolverPromoImport(parsed.promos, catalogos());
    const mayorista = promos.find((p) => p.bloque === "MAYORISTA");
    expect(mayorista?.canales.map((c) => c.nombre).sort()).toEqual([
      "Mayorista",
      "Minicadenas",
      "Subdistribuidores",
      "Tops",
    ]);
    // Clínicas no tiene promociones en el archivo y no debe recibir ninguna.
    expect(promos.every((p) => !p.canales.some((c) => c.nombre === "Clínicas"))).toBe(true);
  });

  it("el bloque de Horizontalidad va sólo a Horizontal", () => {
    const { promos } = resolverPromoImport(parsed.promos, catalogos());
    const horizontal = promos.find((p) => p.codigoProveedor === "RX101-042");
    expect(horizontal?.canales).toEqual([{ id: 2, nombre: "Horizontal" }]);
  });

  it("el precio calculado coincide con el que declara el archivo", () => {
    const { promos, errors } = resolverPromoImport(parsed.promos, catalogos());
    expect(errors).toEqual([]);

    const muco = promos.find((p) => p.codigoProveedor === "RX101-042");
    // 21.95 × 0.90. Se guarda exacto, no redondeado a 19.76: redondearlo
    // cobraría 10.02% en vez del 10% que declara el archivo.
    expect(muco?.precioCalculado).toBe(19.755);

    const vite = promos.find((p) => p.codigoProveedor === "OT100-023");
    // 16 × 1 / (1 + 1): el unitario promedio del juego completo.
    expect(vite?.precioCalculado).toBe(8);
  });

  it("una fila que no cuadra con el precio declarado no se publica", () => {
    // Es lo que pasaría si Diphasac corriera una columna: el porcentaje se
    // leería de otra celda y nadie se enteraría hasta ver un pedido raro.
    const corrida = parsePromoRows([
      CABECERAS,
      fila({ 0: "RX101-042", 15: "DE 1 A MÁS CAJAS", 16: 0.3, 17: 19.755 }),
    ]);
    const { promos, errors } = resolverPromoImport(corrida.promos, catalogos());
    expect(promos).toEqual([]);
    expect(errors[0].code).toBe("PRECIO_NO_COINCIDE");
    expect(errors[0].message).toContain("19.7550");
  });

  it("un código que no está en el catálogo se reporta, no se descarta en silencio", () => {
    const otro = parsePromoRows([CABECERAS, fila({ 0: "ZZ999-001", 18: 1, 20: 1, 21: 5 })]);
    const { promos, errors, codigosSinProducto } = resolverPromoImport(otro.promos, catalogos());
    expect(promos).toEqual([]);
    expect(codigosSinProducto).toEqual(["ZZ999-001"]);
    expect(errors[0].code).toBe("PRODUCTO_DESCONOCIDO");
  });

  it("un producto inactivo no recibe promoción", () => {
    const inactivo = CATALOGO.map((p) =>
      p.id === "p-vite" ? { ...p, estado: "inactivo" } : p,
    );
    const { errors } = resolverPromoImport(
      parsePromoRows([CABECERAS, VITAMINA_E]).promos,
      catalogos({ productos: inactivo }),
    );
    expect(errors[0].code).toBe("PRODUCTO_INACTIVO");
  });

  it("la bonificación se carga al producto que se vende, no a su par BO", () => {
    // Una bonificación comparte el código de proveedor con su par regular.
    // Si ganara la fila BO, la promo quedaría colgada de un producto que
    // nadie pide y no se aplicaría nunca.
    const conBonificacion: CatalogoProductoPromo[] = [
      {
        id: "p-bo-vite",
        codigo_interno: "BODHP200",
        codigo_proveedor: "OT100-023",
        descripcion: "VITAMINA E 400 UI CJA. X 30 CAP. BDA.",
        estado: "activo",
      },
      ...CATALOGO,
    ];
    const { promos } = resolverPromoImport(
      parsePromoRows([CABECERAS, VITAMINA_E]).promos,
      catalogos({ productos: conBonificacion }),
    );
    expect(promos[0].productId).toBe("p-vite");
  });

  it("sin precio de lista no hay contra qué validar, así que no se publica", () => {
    const sinPrecio = resolverPromoImport(parsePromoRows([CABECERAS, VITAMINA_E]).promos, {
      productos: CATALOGO,
      canales: CANALES,
      precios: new Map(),
      vigentes: new Set(),
    });
    expect(sinPrecio.promos).toEqual([]);
    expect(sinPrecio.errors[0].code).toBe("SIN_PRECIO_DE_LISTA");
  });

  it("distingue crear de reemplazar una promoción vigente", () => {
    const { promos } = resolverPromoImport(
      parsed.promos,
      catalogos({ vigentes: new Set(["ESCALA|p-muco|2"]) }),
    );
    expect(promos.find((p) => p.tipo === "ESCALA")?.accion).toBe("reemplazar");
    expect(promos.find((p) => p.codigoProveedor === "OT100-023")?.accion).toBe("crear");
  });
});

describe("resumirPromoImport", () => {
  it("cuenta las filas que se van a escribir, una por canal", () => {
    const { promos } = resolverPromoImport(
      parsePromoRows([CABECERAS, MUCOFLUX, VITAMINA_E, GASA]).promos,
      catalogos(),
    );
    // Muco (1 canal) + Vitamina E (1) + Gasa horizontal (1) + Gasa
    // mayorista (4 canales) = 7 filas para 4 promociones.
    expect(resumirPromoImport(promos)).toEqual({
      escalas: 1,
      bonificaciones: 3,
      filasAEscribir: 7,
      productos: 3,
    });
  });
});
