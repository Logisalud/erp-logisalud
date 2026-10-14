import {
  HOJA_AVANCE,
  HOJA_DETALLE,
  parsearAvance,
  parsearDetalle,
  type AvanceParseado,
  type CeldaCruda,
  type FilaCruda,
  type FilaDetalle,
} from "@/domain/avance-import";

/**
 * Abre el Excel del avance **en el navegador**.
 *
 * Mandar el archivo al servidor no funcionaba: son 3,4 MB y dieciséis
 * hojas, la petición no llegaba a ejecutarse —ni un registro en el
 * servidor— y quien cargaba solo veía "Failed to fetch". Acá se abre
 * donde ya está, se sacan las dos hojas que importan y lo que viaja es
 * eso: unas 270 filas de cuadro y el detalle en tandas.
 *
 * Vive en `lib/` y no dentro de la pantalla porque no tiene nada de
 * pantalla: entra un archivo, salen filas.
 */
export type LibroDeAvance = { avance: AvanceParseado; detalle: FilaDetalle[] };

/** Lo poco que se necesita del lector de Excel. */
type HojaExcel = {
  name: string;
  eachRow: (
    opciones: { includeEmpty: boolean },
    cb: (fila: { values: unknown }, numero: number) => void,
  ) => void;
};
type LibroExcel = {
  xlsx: { load: (datos: ArrayBuffer) => Promise<unknown> };
  worksheets: HojaExcel[];
  getWorksheet: (nombre: string) => HojaExcel | undefined;
};

export async function leerLibroDeAvance(file: File): Promise<LibroDeAvance> {
  // Carga diferida: el lector de Excel pesa casi un mega y no tiene por
  // qué viajar con el resto de la pantalla. El `.default ?? modulo` es
  // porque la versión de navegador exporta al estilo viejo, sin
  // `default`, y cuál de las dos formas llega depende del bundler.
  const modulo = (await import("exceljs")) as unknown as Record<string, unknown>;
  const lector = ((modulo.default as Record<string, unknown>) ?? modulo) as {
    Workbook: new () => LibroExcel;
  };

  const libro = new lector.Workbook();
  await libro.xlsx.load(await file.arrayBuffer());

  const hoja = (nombre: string) => {
    const h = libro.getWorksheet(nombre);
    if (!h) {
      throw new Error(
        `El archivo no tiene la hoja "${nombre}". Tiene: ${libro.worksheets.map((w) => w.name).join(", ")}.`,
      );
    }
    return filasDeHoja(h);
  };

  return {
    avance: parsearAvance(hoja(HOJA_AVANCE)),
    detalle: parsearDetalle(hoja(HOJA_DETALLE)),
  };
}

/**
 * Una hoja como matriz de celdas, con el índice 0 en la columna A.
 *
 * `row.values` del lector es 1-based y arranca con un hueco, así que hay
 * que correrlo; y una celda con fórmula llega como `{ formula, result }`,
 * de donde interesa el resultado que Excel dejó guardado.
 */
function filasDeHoja(hoja: HojaExcel): FilaCruda[] {
  const filas: FilaCruda[] = [];
  hoja.eachRow({ includeEmpty: true }, (fila, numero) => {
    const valores = (fila.values ?? []) as unknown[];
    const salida: FilaCruda = [];
    for (let i = 1; i < valores.length; i++) salida[i - 1] = celdaPlana(valores[i]);
    filas[numero - 1] = salida;
  });
  for (let i = 0; i < filas.length; i++) filas[i] ??= [];
  return filas;
}

function celdaPlana(valor: unknown): CeldaCruda {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return valor;
  if (typeof valor === "object") {
    const o = valor as Record<string, unknown>;
    if ("result" in o) return celdaPlana(o.result);
    if ("richText" in o) {
      return (o.richText as Array<{ text: string }>).map((t) => t.text).join("");
    }
    if ("text" in o) return String(o.text);
    return null;
  }
  if (typeof valor === "boolean") return String(valor);
  return valor as CeldaCruda;
}
