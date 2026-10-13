import "server-only";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "./audit-log";
import {
  ErrorDeFormato,
  HOJA_AVANCE,
  HOJA_DETALLE,
  parsearAvance,
  parsearDetalle,
  resumirCarga,
  type AvanceParseado,
  type CeldaCruda,
  type FilaCruda,
  type FilaDetalle,
  type ResumenCarga,
} from "@/domain/avance-import";

/**
 * El avance de ventas: subirlo (administrador) y leerlo (cada vendedor).
 *
 * Mismo contrato que los otros importadores del módulo: `preview` no
 * escribe nada y `publicar` escribe lo que la vista previa mostró.
 */

// ---------------------------------------------------------------------
// Lectura del archivo
// ---------------------------------------------------------------------

function celdaPlana(valor: ExcelJS.CellValue): CeldaCruda {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return valor;
  if (typeof valor === "object") {
    if ("result" in valor) return celdaPlana((valor as { result: ExcelJS.CellValue }).result);
    if ("richText" in valor) {
      return (valor as { richText: Array<{ text: string }> }).richText.map((t) => t.text).join("");
    }
    if ("text" in valor) return String((valor as { text: unknown }).text);
    return null;
  }
  if (typeof valor === "boolean") return String(valor);
  return valor as CeldaCruda;
}

function filasDeHoja(hoja: ExcelJS.Worksheet): FilaCruda[] {
  const filas: FilaCruda[] = [];
  hoja.eachRow({ includeEmpty: true }, (fila, numero) => {
    const valores = fila.values as ExcelJS.CellValue[];
    const salida: FilaCruda = [];
    // `row.values` es 1-based y arranca con un hueco; acá se pasa a 0-based
    // para que el índice 0 sea la columna A.
    for (let i = 1; i < valores.length; i++) salida[i - 1] = celdaPlana(valores[i]);
    filas[numero - 1] = salida;
  });
  for (let i = 0; i < filas.length; i++) filas[i] ??= [];
  return filas;
}

async function leerArchivo(file: File): Promise<{ avance: AvanceParseado; detalle: FilaDetalle[] }> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await file.arrayBuffer());

  const hojaAvance = libro.getWorksheet(HOJA_AVANCE);
  if (!hojaAvance) {
    throw new ErrorDeFormato(
      `El archivo no tiene la hoja "${HOJA_AVANCE}". Tiene: ${libro.worksheets.map((h) => h.name).join(", ")}.`,
    );
  }
  const hojaDetalle = libro.getWorksheet(HOJA_DETALLE);
  if (!hojaDetalle) {
    throw new ErrorDeFormato(`El archivo no tiene la hoja "${HOJA_DETALLE}" con el detalle de venta.`);
  }

  return {
    avance: parsearAvance(filasDeHoja(hojaAvance)),
    detalle: parsearDetalle(filasDeHoja(hojaDetalle)),
  };
}

// ---------------------------------------------------------------------
// Vendedores
// ---------------------------------------------------------------------

type Vendedor = { id: string; codigo: string; nombre: string };

async function vendedores(): Promise<Vendedor[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sellers")
    .select("id, codigo_representante, nombre_completo")
    .order("codigo_representante");
  if (error) throw new Error(error.message);
  return (data ?? []).map((v) => ({
    id: v.id as string,
    codigo: String(v.codigo_representante ?? "").toUpperCase(),
    nombre: String(v.nombre_completo ?? ""),
  }));
}

// ---------------------------------------------------------------------
// Vista previa
// ---------------------------------------------------------------------

export type PreviewAvance = {
  resumen: ResumenCarga;
  /** La carga vigente del mismo período, si ya hay una: esto la reemplaza. */
  reemplazaA: { fechaCorte: string; subidoEn: string } | null;
};

export async function previewAvance(file: File): Promise<PreviewAvance> {
  const { avance, detalle } = await leerArchivo(file);
  const conocidos = new Set((await vendedores()).map((v) => v.codigo));
  const resumen = resumirCarga(avance, detalle, conocidos);

  let reemplazaA: PreviewAvance["reemplazaA"] = null;
  if (resumen.periodo) {
    const supabase = createClient();
    const { data } = await supabase
      .from("avance_cargas")
      .select("fecha_corte, subido_en")
      .eq("periodo", resumen.periodo)
      .eq("vigente", true)
      .maybeSingle();
    if (data) {
      reemplazaA = { fechaCorte: String(data.fecha_corte), subidoEn: String(data.subido_en) };
    }
  }

  return { resumen, reemplazaA };
}

// ---------------------------------------------------------------------
// Publicación
// ---------------------------------------------------------------------

/** PostgREST se atraganta con inserts enormes; van de a tandas. */
const TANDA = 500;

async function insertarPorTandas(tabla: string, filas: Record<string, unknown>[]) {
  const supabase = createClient();
  for (let i = 0; i < filas.length; i += TANDA) {
    const { error } = await supabase.from(tabla).insert(filas.slice(i, i + TANDA));
    if (error) throw new Error(`${tabla}: ${error.message}`);
  }
}

export type ResultadoAvance = { cargaId: string; resumen: ResumenCarga };

export async function publicarAvance(file: File, actor: string): Promise<ResultadoAvance> {
  const supabase = createClient();
  const { avance, detalle } = await leerArchivo(file);

  const lista = await vendedores();
  const porCodigo = new Map(lista.map((v) => [v.codigo, v.id]));
  const resumen = resumirCarga(avance, detalle, new Set(porCodigo.keys()));

  if (!resumen.periodo || !resumen.fechaCorte) {
    throw new ErrorDeFormato(
      `No pude leer la fecha de corte de la hoja "${HOJA_AVANCE}". Es la celda que está sobre los encabezados del cuadro.`,
    );
  }

  const idDe = (codigo: string | null) => (codigo ? (porCodigo.get(codigo.toUpperCase()) ?? null) : null);

  // La carga entra apagada: recién se vuelve visible cuando terminaron de
  // entrar sus filas (ver pedidos.avance_publicar).
  const { data: carga, error: errorCarga } = await supabase
    .from("avance_cargas")
    .insert({
      periodo: resumen.periodo,
      fecha_corte: resumen.fechaCorte,
      inicio_mes: avance.inicioMes,
      dias_mes: resumen.diasMes,
      dias_transcurridos: resumen.diasTranscurridos,
      archivo: file.name,
      filas_avance: avance.filas.length,
      filas_detalle: detalle.length,
      vigente: false,
      subido_por: actor,
    })
    .select("id")
    .single();
  if (errorCarga) throw new Error(errorCarga.message);
  const cargaId = carga.id as string;

  try {
    await insertarPorTandas(
      "avance_filas",
      avance.filas.map((f) => ({
        carga_id: cargaId,
        tipo: f.tipo,
        grupo: f.grupo,
        zona: f.zona,
        codigo: f.codigo,
        seller_id: idDe(f.codigo),
        etiqueta: f.etiqueta,
        orden: f.orden,
        s1_avance: f.semanas[0]?.avance ?? null,
        s1_cuota: f.semanas[0]?.cuota ?? null,
        s2_avance: f.semanas[1]?.avance ?? null,
        s2_cuota: f.semanas[1]?.cuota ?? null,
        s3_avance: f.semanas[2]?.avance ?? null,
        s3_cuota: f.semanas[2]?.cuota ?? null,
        s4_avance: f.semanas[3]?.avance ?? null,
        s4_cuota: f.semanas[3]?.cuota ?? null,
        avance: f.avance,
        cuota: f.cuota,
        prom_venta_diaria: f.promVentaDiaria,
        proy_lineal: f.proyLineal,
        cuota_diaria: f.cuotaDiaria,
        por_dia: f.porDia,
      })),
    );

    await insertarPorTandas(
      "avance_detalle",
      detalle.map((d) => ({
        carga_id: cargaId,
        codigo: d.codigo,
        seller_id: idDe(d.codigo),
        vendedor: d.vendedor,
        fecha: d.fecha,
        tipo_documento: d.tipoDocumento,
        nro_documento: d.nroDocumento,
        ruc: d.ruc,
        razon_social: d.razonSocial,
        familia: d.familia,
        cod_producto: d.codProducto,
        producto: d.producto,
        linea: d.linea,
        proveedor: d.proveedor,
        origen: d.origen,
        canal: d.canal,
        departamento: d.departamento,
        provincia: d.provincia,
        distrito: d.distrito,
        cantidad: d.cantidad,
        neto: d.neto,
      })),
    );

    const { error: errorPublicar } = await supabase.rpc("avance_publicar", { p_carga_id: cargaId });
    if (errorPublicar) throw new Error(errorPublicar.message);

    await limpiarCargasViejas(resumen.periodo);
  } catch (e) {
    // Una carga a medias no se queda: el índice único deja una sola
    // vigente, pero las filas sueltas ensucian el histórico. El delete se
    // lleva filas y detalle por cascada.
    await supabase.from("avance_cargas").delete().eq("id", cargaId);
    throw e;
  }

  await logAudit({
    actor,
    accion: "avance.publicar",
    entidad: "avance_cargas",
    entidadId: cargaId,
    datosDespues: {
      periodo: resumen.periodo,
      fecha_corte: resumen.fechaCorte,
      filas_avance: avance.filas.length,
      filas_detalle: detalle.length,
      archivo: file.name,
    },
  });

  return { cargaId, resumen };
}

// ---------------------------------------------------------------------
// Lectura para las pantallas
// ---------------------------------------------------------------------

/**
 * Se guardan la carga vigente y dos anteriores de cada período.
 *
 * Son ~3.000 filas de detalle por carga y se sube todos los días: sin
 * limpiar, un año son más de un millón de filas que nadie va a leer. Las
 * dos que quedan alcanzan para comparar contra ayer si algo no cuadra.
 *
 * Es al final y aparte de `avance_publicar` a propósito: si la limpieza
 * falla, la carga del día ya está publicada y nadie se entera de nada. Lo
 * peor que pasa es que sobren filas viejas.
 */
async function limpiarCargasViejas(periodo: string) {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("avance_cargas")
      .select("id")
      .eq("periodo", periodo)
      .eq("vigente", false)
      .order("subido_en", { ascending: false });

    const sobrantes = (data ?? []).slice(2).map((c) => c.id as string);
    if (sobrantes.length > 0) {
      await supabase.from("avance_cargas").delete().in("id", sobrantes);
    }
  } catch {
    // Nunca romper la publicación por la limpieza.
  }
}

export type Carga = {
  id: string;
  periodo: string;
  fechaCorte: string;
  diasMes: number | null;
  diasTranscurridos: number | null;
  archivo: string;
  subidoEn: string;
  filasDetalle: number;
};

export type FilaCuadro = {
  tipo: "total" | "grupo" | "vendedor" | "linea";
  grupo: string | null;
  zona: string | null;
  codigo: string | null;
  etiqueta: string;
  avance: number;
  cuota: number;
  semanas: Array<{ avance: number | null; cuota: number | null }>;
  promVentaDiaria: number | null;
  proyLineal: number | null;
  cuotaDiaria: number | null;
  porDia: Record<string, number>;
};

export async function cargaVigente(periodo?: string): Promise<Carga | null> {
  const supabase = createClient();
  let q = supabase
    .from("avance_cargas")
    .select("id, periodo, fecha_corte, dias_mes, dias_transcurridos, archivo, subido_en, filas_detalle")
    .eq("vigente", true);
  if (periodo) q = q.eq("periodo", periodo);

  const { data, error } = await q.order("periodo", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    id: data.id as string,
    periodo: data.periodo as string,
    fechaCorte: String(data.fecha_corte),
    diasMes: data.dias_mes as number | null,
    diasTranscurridos: data.dias_transcurridos as number | null,
    archivo: data.archivo as string,
    subidoEn: String(data.subido_en),
    filasDetalle: Number(data.filas_detalle ?? 0),
  };
}

/**
 * El cuadro que le toca a quien está mirando.
 *
 * No filtra por vendedor: de eso se encarga la RLS, que a un vendedor solo
 * le devuelve su fila, sus líneas y los totales. Si acá hubiera además un
 * filtro, un error de una de las dos capas pasaría desapercibido.
 */
export async function filasDelCuadro(cargaId: string): Promise<FilaCuadro[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("avance_filas")
    .select(
      "tipo, grupo, zona, codigo, etiqueta, avance, cuota, s1_avance, s1_cuota, s2_avance, s2_cuota, s3_avance, s3_cuota, s4_avance, s4_cuota, prom_venta_diaria, proy_lineal, cuota_diaria, por_dia",
    )
    .eq("carga_id", cargaId)
    .order("orden");
  if (error) throw new Error(error.message);

  return (data ?? []).map((f) => ({
    tipo: f.tipo as FilaCuadro["tipo"],
    grupo: f.grupo as string | null,
    zona: f.zona as string | null,
    codigo: f.codigo as string | null,
    etiqueta: f.etiqueta as string,
    avance: Number(f.avance ?? 0),
    cuota: Number(f.cuota ?? 0),
    semanas: [1, 2, 3, 4].map((n) => ({
      avance: numeroONulo(f[`s${n}_avance` as keyof typeof f]),
      cuota: numeroONulo(f[`s${n}_cuota` as keyof typeof f]),
    })),
    promVentaDiaria: numeroONulo(f.prom_venta_diaria),
    proyLineal: numeroONulo(f.proy_lineal),
    cuotaDiaria: numeroONulo(f.cuota_diaria),
    porDia: (f.por_dia ?? {}) as Record<string, number>,
  }));
}

const numeroONulo = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);

export type LineaDetalle = {
  fecha: string | null;
  tipoDocumento: string | null;
  nroDocumento: string | null;
  ruc: string | null;
  razonSocial: string | null;
  familia: string | null;
  codProducto: string | null;
  producto: string | null;
  linea: string | null;
  cantidad: number | null;
  neto: number | null;
  vendedor: string | null;
  codigo: string | null;
};

/**
 * El detalle de venta. Igual que el cuadro: la RLS decide de quién es.
 * `codigo` solo lo usa un administrador, para mirar el de alguien puntual.
 */
export async function detalleDeVenta(
  cargaId: string,
  opciones: { codigo?: string | null; limite?: number } = {},
): Promise<LineaDetalle[]> {
  const supabase = createClient();
  let q = supabase
    .from("avance_detalle")
    .select(
      "fecha, tipo_documento, nro_documento, ruc, razon_social, familia, cod_producto, producto, linea, cantidad, neto, vendedor, codigo",
    )
    .eq("carga_id", cargaId);
  if (opciones.codigo) q = q.eq("codigo", opciones.codigo);

  const { data, error } = await q
    .order("fecha", { ascending: false })
    .order("id", { ascending: true })
    .limit(opciones.limite ?? 5000);
  if (error) throw new Error(error.message);

  return (data ?? []).map((d) => ({
    fecha: d.fecha as string | null,
    tipoDocumento: d.tipo_documento as string | null,
    nroDocumento: d.nro_documento as string | null,
    ruc: d.ruc as string | null,
    razonSocial: d.razon_social as string | null,
    familia: d.familia as string | null,
    codProducto: d.cod_producto as string | null,
    producto: d.producto as string | null,
    linea: d.linea as string | null,
    cantidad: numeroONulo(d.cantidad),
    neto: numeroONulo(d.neto),
    vendedor: d.vendedor as string | null,
    codigo: d.codigo as string | null,
  }));
}
