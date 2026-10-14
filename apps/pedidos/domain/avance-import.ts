/**
 * Lectura del Excel de avance de ventas que Comercial actualiza a diario.
 *
 * Dominio puro: entra una matriz de celdas, sale la estructura que se
 * guarda. Sin Excel, sin Supabase, sin Next — así se puede probar el caso
 * raro (una fila de grupo sin código, un vendedor que no existe) sin
 * levantar nada.
 *
 * El archivo trae dieciséis hojas. Solo se leen dos:
 *
 * - **AVANCE 2026**: el cuadro. Avance y cuota por vendedor, por línea, por
 *   semana y por día. Es el que se publica, y los números se guardan tal
 *   cual vienen. No se recalculan desde el detalle a propósito: la hoja
 *   aplica reglas propias —excluye la línea DESCUENTO, entre otras— y dos
 *   números distintos para el mismo mes es peor que no mostrar ninguno.
 * - **base**: el detalle, una fila por producto facturado.
 *
 * La hoja "AVANCE MES" se ignora: es un cuadro aparte, con su propio
 * criterio, que Comercial usa para otra cosa.
 */

export type CeldaCruda = string | number | Date | boolean | null;
export type FilaCruda = CeldaCruda[];

export const HOJA_AVANCE = "AVANCE 2026";
export const HOJA_DETALLE = "base";

export type TipoFila = "total" | "grupo" | "vendedor" | "linea";

export type FilaAvance = {
  tipo: TipoFila;
  /** El agrupador bajo el que cuelga: LIMA HORIZONTAL, REGIONES… */
  grupo: string | null;
  zona: string | null;
  codigo: string | null;
  etiqueta: string;
  orden: number;
  semanas: Array<{ avance: number | null; cuota: number | null }>;
  avance: number;
  cuota: number;
  promVentaDiaria: number | null;
  proyLineal: number | null;
  cuotaDiaria: number | null;
  /** { "1": 0, "2": 137.27, … } — solo los días con movimiento. */
  porDia: Record<string, number>;
};

export type CabeceraAvance = {
  fechaCorte: string | null;
  inicioMes: string | null;
  diasMes: number | null;
  diasTranscurridos: number | null;
  /** '2026-10', deducido de la fecha de corte. */
  periodo: string | null;
};

export type AvanceParseado = CabeceraAvance & { filas: FilaAvance[] };

export type FilaDetalle = {
  codigo: string | null;
  vendedor: string | null;
  fecha: string | null;
  tipoDocumento: string | null;
  nroDocumento: string | null;
  ruc: string | null;
  razonSocial: string | null;
  familia: string | null;
  codProducto: string | null;
  producto: string | null;
  linea: string | null;
  proveedor: string | null;
  origen: string | null;
  canal: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  cantidad: number | null;
  neto: number | null;
};

// ---------------------------------------------------------------------
// Celdas
// ---------------------------------------------------------------------

const texto = (c: CeldaCruda): string | null => {
  if (c === null || c === undefined) return null;
  // Una fecha inválida es una celda que el lector no pudo interpretar, no
  // un dato: devolverla como texto escribe "NaN-NaN-NaN" en la base.
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? null : iso(c);
  const s = String(c).trim();
  return s === "" ? null : s;
};

const numero = (c: CeldaCruda): number | null => {
  if (c === null || c === undefined || c === "") return null;
  if (typeof c === "number") return Number.isFinite(c) ? redondear(c) : null;
  // Excel devuelve "" en las celdas con IFERROR(...,"") de la hoja: eso es
  // "no hay dato", no un cero.
  const n = Number(String(c).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? redondear(n) : null;
};

/**
 * Dos decimales. Las celdas vienen con la basura binaria del punto
 * flotante de Excel (-11372.280000000006) y guardarla así hace que la
 * pantalla muestre un número y el Excel otro.
 */
const redondear = (n: number) => Math.round(n * 100) / 100;

const iso = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

const fecha = (c: CeldaCruda): string | null => {
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? null : iso(c);
  const s = texto(c);
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // dd/mm/aaaa, que es como lo escribe quien arma la hoja a mano.
  const d = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (d) return `${d[3]}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}`;
  return null;
};

const igual = (c: CeldaCruda, valor: string) =>
  texto(c)?.toUpperCase().replace(/\s+/g, " ") === valor;

// ---------------------------------------------------------------------
// Hoja del cuadro
// ---------------------------------------------------------------------

export class ErrorDeFormato extends Error {}

/**
 * Un código de representante: tres o cuatro letras y dígitos, sin espacios
 * (CRP1007, CKA2003, DTRU02, DAQP01).
 */
const ES_CODIGO = /^[A-Z]{2,5}[0-9]{2,5}$/i;

/**
 * Posiciones de las columnas del cuadro.
 *
 * Se buscan por nombre y no por letra: la hoja ya cambió de forma una vez
 * (cuando le agregaron el detalle por día) y una columna fija se habría
 * roto en silencio, mostrando la cuota en el lugar del avance.
 */
function ubicarColumnas(filas: FilaCruda[]) {
  const iCabecera = filas.findIndex((f) => f?.some((c) => igual(c, "ZONAS LOGISALUD")));
  if (iCabecera < 1) {
    throw new ErrorDeFormato(
      `No encontré la fila de encabezados de la hoja "${HOJA_AVANCE}" (la que dice ZONAS LOGISALUD).`,
    );
  }

  const cab = filas[iCabecera] ?? [];
  const secciones = filas[iCabecera - 1] ?? [];
  const etiquetas = filas[iCabecera - 2] ?? [];

  const buscar = (fila: FilaCruda, nombre: string) => fila.findIndex((c) => igual(c, nombre));

  const colZona = buscar(cab, "ZONAS LOGISALUD");
  const colCodigo = buscar(cab, "CODIGO");
  const colVendedor = buscar(cab, "VENDEDOR");
  if (colCodigo < 0 || colVendedor < 0) {
    throw new ErrorDeFormato('La hoja no tiene las columnas CODIGO y VENDEDOR donde las espero.');
  }

  // Cada bloque AVANCE/CUOTA/% es una semana; el que cae bajo "TOTAL
  // VENTAS" es el del mes.
  const bloques: number[] = [];
  cab.forEach((c, i) => {
    if (igual(c, "AVANCE")) bloques.push(i);
  });
  const iTotalVentas = secciones.findIndex((c) => igual(c, "TOTAL VENTAS"));
  const colTotal = bloques.find((i) => iTotalVentas >= 0 && i >= iTotalVentas) ?? bloques[bloques.length - 1];
  if (colTotal === undefined) {
    throw new ErrorDeFormato("La hoja no tiene ninguna columna AVANCE.");
  }
  const semanas = bloques.filter((i) => i !== colTotal);

  // Los días del mes: en la fila de encabezados aparecen como 1, 2, 3…
  // Como lista de pares y no como Map: el target de TypeScript del
  // proyecto no itera Maps sin downlevelIteration.
  const dias: Array<[dia: number, columna: number]> = [];
  cab.forEach((c, i) => {
    const n = typeof c === "number" ? c : null;
    if (n !== null && Number.isInteger(n) && n >= 1 && n <= 31 && !dias.some(([d]) => d === n)) {
      dias.push([n, i]);
    }
  });

  // Inicio de mes / días del mes están rotulados una fila más arriba, con
  // el valor justo debajo.
  const valorRotulado = (nombre: string): CeldaCruda => {
    const i = buscar(etiquetas, nombre);
    return i >= 0 ? (secciones[i] ?? null) : null;
  };

  return {
    iCabecera,
    colZona,
    colCodigo,
    colVendedor,
    colTotal,
    semanas,
    dias,
    colProm: buscar(cab, "PROM. VTA. DIARIA"),
    colProy: buscar(cab, "PROY. LINEAL %"),
    colCuotaDiaria: buscar(cab, "CUOTA DIARIA 100%"),
    fechaCorte: fecha(secciones[1] ?? null),
    inicioMes: fecha(valorRotulado("INICIO MES")) ?? fecha(etiquetas[1] ?? null),
    diasMes: numero(valorRotulado("DÍAS DEL MES")),
  };
}

export function parsearAvance(filas: FilaCruda[]): AvanceParseado {
  const c = ubicarColumnas(filas);

  const fechaCorte = c.fechaCorte;
  const diasTranscurridos = fechaCorte ? Number(fechaCorte.slice(8, 10)) : null;

  const resultado: FilaAvance[] = [];
  let grupo: string | null = null;
  let orden = 0;

  for (let i = c.iCabecera + 1; i < filas.length; i++) {
    const f = filas[i] ?? [];
    const zona = texto(f[c.colZona] ?? null);
    const codigoCrudo = texto(f[c.colCodigo] ?? null);
    const etiqueta = texto(f[c.colVendedor] ?? null);

    // Al final de la hoja hay un bloque de totales por línea sin rótulo en
    // la primera columna. No es parte del cuadro: se corta ahí.
    if (!zona && !codigoCrudo) continue;

    // "TOTAL LOGISSA" y los grupos están en una celda combinada B:D, y el
    // lector repite ese texto en CODIGO y VENDEDOR. Sin esto, el grupo se
    // clasificaba como línea de un vendedor llamado "TOTAL LOGISSA".
    const codigo = ES_CODIGO.test(codigoCrudo ?? "") ? codigoCrudo : null;

    let tipo: TipoFila;
    if (!codigo) {
      tipo = /TOTAL/i.test(zona ?? "") ? "total" : "grupo";
    } else if ((zona ?? "").toUpperCase().startsWith(codigo.toUpperCase())) {
      tipo = "linea";
    } else {
      tipo = "vendedor";
    }

    if (tipo === "grupo") grupo = zona;
    if (tipo === "total") grupo = null;

    const porDia: Record<string, number> = {};
    for (const [dia, col] of c.dias) {
      const v = numero(f[col] ?? null);
      if (v !== null && v !== 0) porDia[String(dia)] = v;
    }

    resultado.push({
      tipo,
      grupo: tipo === "total" || tipo === "grupo" ? null : grupo,
      zona: tipo === "linea" ? null : zona,
      codigo,
      etiqueta: etiqueta ?? zona ?? "(sin nombre)",
      orden: orden++,
      semanas: c.semanas.map((col) => ({
        avance: numero(f[col] ?? null),
        cuota: numero(f[col + 1] ?? null),
      })),
      avance: numero(f[c.colTotal] ?? null) ?? 0,
      cuota: numero(f[c.colTotal + 1] ?? null) ?? 0,
      promVentaDiaria: c.colProm >= 0 ? numero(f[c.colProm] ?? null) : null,
      proyLineal: c.colProy >= 0 ? numero(f[c.colProy] ?? null) : null,
      cuotaDiaria: c.colCuotaDiaria >= 0 ? numero(f[c.colCuotaDiaria] ?? null) : null,
      porDia,
    });
  }

  if (!resultado.some((f) => f.tipo === "vendedor")) {
    throw new ErrorDeFormato(
      `La hoja "${HOJA_AVANCE}" no trae ninguna fila de vendedor. ¿Es el archivo correcto?`,
    );
  }

  return {
    fechaCorte,
    inicioMes: c.inicioMes,
    diasMes: c.diasMes,
    diasTranscurridos,
    periodo: fechaCorte ? fechaCorte.slice(0, 7) : null,
    filas: resultado,
  };
}

// ---------------------------------------------------------------------
// Hoja del detalle
// ---------------------------------------------------------------------

const COLUMNAS_DETALLE: Record<keyof Omit<FilaDetalle, never>, string> = {
  codigo: "RV",
  vendedor: "COLUMNA1",
  fecha: "FECHA",
  tipoDocumento: "TIPO DOCUMENTO",
  nroDocumento: "NRO DOCUMENTO",
  ruc: "RUC",
  razonSocial: "RAZ_SOC",
  familia: "FAMILIA",
  codProducto: "COD PROD",
  producto: "PRODUCTO",
  linea: "LINEA",
  proveedor: "PROVEEDOR",
  origen: "ORIGEN",
  canal: "CANAL",
  departamento: "DEPARTAMENTO",
  provincia: "PROVINCIA",
  distrito: "DISTRITO",
  cantidad: "SUMA_CANTIDAD",
  neto: "SUMA_NETO_VTA",
};

const NUMERICAS = new Set(["cantidad", "neto"]);

/**
 * El tipo de comprobante, a partir del código numérico de SUNAT.
 *
 * La columna "TIPO DOCUMENTO" de la hoja es una fórmula con formato de
 * fecha aplicado encima, y el lector de Excel no consigue recuperar su
 * texto: devuelve una fecha inválida en 322 de las primeras 600 filas. La
 * columna "TIPO" de al lado trae el mismo dato como número y se lee sin
 * problema, así que se reconstruye desde ahí — es exactamente lo que hace
 * la fórmula de la hoja.
 */
const TIPOS_SUNAT: Record<string, string> = {
  "1": "FACTURA",
  "3": "BOLETA DE VENTA",
  "7": "NOTA DE CREDITO",
  "8": "NOTA DE DEBITO",
};

export function parsearDetalle(filas: FilaCruda[]): FilaDetalle[] {
  // La fila de encabezados es la que trae más rótulos de texto entre las
  // primeras: la hoja empieza con las columnas del comprobante y no
  // siempre arranca en la primera fila.
  let iCab = -1;
  for (let i = 0; i < Math.min(15, filas.length); i++) {
    if ((filas[i] ?? []).some((c) => igual(c, "SUMA_NETO_VTA"))) {
      iCab = i;
      break;
    }
  }
  if (iCab < 0) {
    throw new ErrorDeFormato(
      `No encontré los encabezados de la hoja "${HOJA_DETALLE}" (busco la columna SUMA_NETO_VTA).`,
    );
  }

  const cab = (filas[iCab] ?? []).map((c) => texto(c)?.toUpperCase().replace(/\s+/g, " ") ?? "");
  const pos = Object.fromEntries(
    Object.entries(COLUMNAS_DETALLE).map(([campo, nombre]) => [campo, cab.indexOf(nombre)]),
  ) as Record<keyof FilaDetalle, number>;
  const colTipoSunat = cab.indexOf("TIPO");

  const faltan = (["codigo", "neto"] as const).filter((k) => pos[k] < 0);
  if (faltan.length > 0) {
    throw new ErrorDeFormato(
      `A la hoja "${HOJA_DETALLE}" le faltan columnas: ${faltan.map((k) => COLUMNAS_DETALLE[k]).join(", ")}.`,
    );
  }

  const salida: FilaDetalle[] = [];
  for (let i = iCab + 1; i < filas.length; i++) {
    const f = filas[i] ?? [];
    if (!f.some((c) => c !== null && c !== undefined && String(c).trim() !== "")) continue;

    const fila = {} as FilaDetalle;
    for (const campo of Object.keys(COLUMNAS_DETALLE) as Array<keyof FilaDetalle>) {
      const col = pos[campo];
      const celda = col >= 0 ? (f[col] ?? null) : null;
      if (NUMERICAS.has(campo)) {
        (fila[campo] as number | null) = numero(celda);
      } else if (campo === "fecha") {
        fila.fecha = fecha(celda);
      } else if (campo === "ruc") {
        // El RUC llega como número y se convierte en 1.04E+10 al mostrarlo.
        fila.ruc = celda === null ? null : String(celda).replace(/\D/g, "") || null;
      } else {
        (fila[campo] as string | null) = texto(celda);
      }
    }
    if (!fila.tipoDocumento && colTipoSunat >= 0) {
      const n = numero(f[colTipoSunat] ?? null);
      fila.tipoDocumento = n === null ? null : (TIPOS_SUNAT[String(n)] ?? "NO REGISTRADO");
    }
    salida.push(fila);
  }

  return salida;
}

// ---------------------------------------------------------------------
// Resumen para la vista previa
// ---------------------------------------------------------------------

export type ResumenCarga = {
  periodo: string | null;
  fechaCorte: string | null;
  diasMes: number | null;
  diasTranscurridos: number | null;
  vendedores: number;
  lineas: number;
  grupos: number;
  filasDetalle: number;
  totalAvance: number;
  totalCuota: number;
  /** Códigos del cuadro que no existen en `sellers`: no los verá nadie. */
  codigosSinVendedor: string[];
};

export function resumirCarga(
  avance: AvanceParseado,
  detalle: FilaDetalle[],
  codigosConocidos: Set<string>,
): ResumenCarga {
  const total = avance.filas.find((f) => f.tipo === "total");
  const vendedores = avance.filas.filter((f) => f.tipo === "vendedor");

  return {
    periodo: avance.periodo,
    fechaCorte: avance.fechaCorte,
    diasMes: avance.diasMes,
    diasTranscurridos: avance.diasTranscurridos,
    vendedores: vendedores.length,
    lineas: avance.filas.filter((f) => f.tipo === "linea").length,
    grupos: avance.filas.filter((f) => f.tipo === "grupo").length,
    filasDetalle: detalle.length,
    totalAvance: total?.avance ?? 0,
    totalCuota: total?.cuota ?? 0,
    codigosSinVendedor: vendedores
      .map((f) => f.codigo)
      .filter((c): c is string => !!c && !codigosConocidos.has(c.toUpperCase()))
      .filter((c, i, todos) => todos.indexOf(c) === i)
      .sort(),
  };
}
