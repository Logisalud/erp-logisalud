import "server-only";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "./audit-log";
import type { FilaAvance, FilaDetalle, ResumenCarga } from "@/domain/avance-import";

/**
 * El avance de ventas: subirlo (administrador) y leerlo (cada vendedor).
 *
 * **El Excel se lee en el navegador, no acá.** Pesa 3,4 MB y tiene
 * dieciséis hojas; mandarlo entero al servidor hacía que la petición ni
 * siquiera llegara a ejecutarse —el navegador mostraba "Failed to fetch" y
 * en los registros del servidor no quedaba nada— y encima el archivo crece
 * todos los días a medida que se agregan ventas al mes. Ahora el navegador
 * lo abre, saca las dos hojas que importan y manda solo eso, en tandas.
 *
 * Que los números los calcule el cliente no abre un agujero: publicar es
 * de administradores (lo exige esta capa y lo vuelve a exigir la RLS), y un
 * administrador podría igual editar el Excel antes de subirlo. Lo que
 * ningún cliente puede hacer es escribir en nombre de otro ni leer lo que
 * no le toca: eso lo decide la base.
 */

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
// Lo que el navegador necesita para armar la vista previa
// ---------------------------------------------------------------------

export type ContextoDeCarga = {
  /** Códigos con vendedor cargado: los demás no los va a ver nadie. */
  codigos: string[];
  /** La carga vigente del período, si ya hay una: esta la reemplaza. */
  vigente: { fechaCorte: string; subidoEn: string } | null;
};

export async function contextoDeCarga(periodo: string | null): Promise<ContextoDeCarga> {
  const codigos = (await vendedores()).map((v) => v.codigo);

  let vigente: ContextoDeCarga["vigente"] = null;
  if (periodo) {
    const supabase = createClient();
    const { data } = await supabase
      .from("avance_cargas")
      .select("fecha_corte, subido_en")
      .eq("periodo", periodo)
      .eq("vigente", true)
      .maybeSingle();
    if (data) vigente = { fechaCorte: String(data.fecha_corte), subidoEn: String(data.subido_en) };
  }

  return { codigos, vigente };
}

// ---------------------------------------------------------------------
// Publicación, en tres tiempos
// ---------------------------------------------------------------------

export type CabeceraCarga = {
  periodo: string;
  fechaCorte: string;
  inicioMes: string | null;
  diasMes: number | null;
  diasTranscurridos: number | null;
  archivo: string;
  filasDetalle: number;
};

/**
 * Abre la carga y escribe el cuadro.
 *
 * La carga nace apagada (`vigente = false`): mientras se suben las tandas
 * de detalle, los vendedores siguen viendo la de ayer entera, nunca media
 * carga a medio llenar.
 */
export async function crearCarga(cabecera: CabeceraCarga, filas: FilaAvance[]): Promise<string> {
  const supabase = createClient();
  const porCodigo = new Map((await vendedores()).map((v) => [v.codigo, v.id]));
  const idDe = (codigo: string | null) => (codigo ? (porCodigo.get(codigo.toUpperCase()) ?? null) : null);

  const { data, error } = await supabase
    .from("avance_cargas")
    .insert({
      periodo: cabecera.periodo,
      fecha_corte: cabecera.fechaCorte,
      inicio_mes: cabecera.inicioMes,
      dias_mes: cabecera.diasMes,
      dias_transcurridos: cabecera.diasTranscurridos,
      archivo: cabecera.archivo,
      filas_avance: filas.length,
      filas_detalle: cabecera.filasDetalle,
      vigente: false,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const cargaId = data.id as string;

  const { error: errorFilas } = await supabase.from("avance_filas").insert(
    filas.map((f) => ({
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
  if (errorFilas) {
    await supabase.from("avance_cargas").delete().eq("id", cargaId);
    throw new Error(errorFilas.message);
  }

  return cargaId;
}

/** Una tanda de detalle. El navegador las manda de a unas cuantas filas. */
export async function agregarDetalle(cargaId: string, filas: FilaDetalle[]): Promise<number> {
  if (filas.length === 0) return 0;
  const supabase = createClient();
  const porCodigo = new Map((await vendedores()).map((v) => [v.codigo, v.id]));

  const { error } = await supabase.from("avance_detalle").insert(
    filas.map((d) => ({
      carga_id: cargaId,
      codigo: d.codigo,
      seller_id: d.codigo ? (porCodigo.get(d.codigo.toUpperCase()) ?? null) : null,
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
  if (error) throw new Error(error.message);
  return filas.length;
}

/** Enciende la carga: a partir de acá es la que ven los vendedores. */
export async function finalizarCarga(
  cargaId: string,
  actor: string,
  resumen: ResumenCarga,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("avance_publicar", { p_carga_id: cargaId });
  if (error) throw new Error(error.message);

  await logAudit({
    actor,
    accion: "avance.publicar",
    entidad: "avance_cargas",
    entidadId: cargaId,
    datosDespues: {
      periodo: resumen.periodo,
      fecha_corte: resumen.fechaCorte,
      vendedores: resumen.vendedores,
      filas_detalle: resumen.filasDetalle,
    },
  });

  if (resumen.periodo) await limpiarCargasViejas(resumen.periodo);
}

/** Si el navegador se corta a mitad de camino, la carga a medias no queda. */
export async function descartarCarga(cargaId: string): Promise<void> {
  const supabase = createClient();
  await supabase.from("avance_cargas").delete().eq("id", cargaId);
}

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

// ---------------------------------------------------------------------
// Lectura para las pantallas
// ---------------------------------------------------------------------

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
