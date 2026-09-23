/**
 * Cómo se lee, en una planilla, lo que en la app son varias tablas.
 *
 * El reporte de pedidos saca una fila por línea de producto, y hay dos cosas
 * que no están en `order_items` y hay que traducir: en qué quedó la solicitud
 * de descuento de esa línea (vive en `approval_requests` + `approval_decisions`)
 * y si la línea es una bonificación. Las dos se resuelven acá, sin base de
 * datos, para que se puedan leer y testear sin montar un pedido entero.
 */

/** Lo que la línea tiene registrado sobre su solicitud de descuento. */
export interface SolicitudDeLinea {
  estado: "PENDIENTE" | "RESUELTO";
  decision: "APROBAR" | "RECHAZAR" | "APROBAR_OTRO_PRECIO" | "SOLICITAR_INFO" | null;
}

/**
 * En qué quedó el descuento de esta línea.
 *
 * Una línea sin solicitud dice "No aplica" y no "—": en una columna que se
 * filtra en Excel, el vacío se confunde con un dato que falta.
 */
export function etiquetaEstadoDescuento(solicitud: SolicitudDeLinea | null): string {
  if (!solicitud) return "No aplica";
  if (solicitud.estado === "PENDIENTE") return "Pendiente";

  switch (solicitud.decision) {
    case "APROBAR":
      return "Aprobado";
    case "APROBAR_OTRO_PRECIO":
      return "Aprobado con otro precio";
    case "RECHAZAR":
      return "Rechazado";
    case "SOLICITAR_INFO":
      return "Pendiente (pidieron más información)";
    // Resuelta sin decisión registrada: no se inventa un resultado.
    default:
      return "Resuelto sin decisión registrada";
  }
}

/**
 * Si la línea va sin costo, y por qué.
 *
 * `es_linea_gratis` es la marca de la línea; `origen_precio` dice quién la
 * puso. Una bonificación de promoción la aplicó sola el motor desde el archivo
 * del proveedor; una manual la agregó una persona, y ahí el motivo es el dato
 * importante.
 */
export function etiquetaBonificacion(
  origenPrecio: string | null,
  esLineaGratis: boolean,
): string {
  if (origenPrecio === "PROMO_BONIFICACION") return "Sí — automática (promoción)";
  if (origenPrecio === "BONIFICACION_MANUAL") return "Sí — manual";
  // Gratis sin origen conocido: sigue siendo una bonificación para quien lee.
  if (esLineaGratis) return "Sí";
  return "No";
}

/**
 * El precio que correspondía por catálogo, que no vive en un solo lugar.
 *
 * Según cómo se armó la línea, el precio de lista quedó en un campo distinto,
 * y en una línea normal no quedó en ninguno porque ES el precio cobrado:
 *
 *  - Promoción (escala, condicionada) y bonificación manual: la línea guarda
 *    `precio_lista_original`.
 *  - Descuento aprobado por Comercial: la línea no lo guarda, pero la
 *    solicitud sí, en `precio_original`.
 *  - Línea normal (`LISTA`): no hay nada guardado porque no hubo rebaja —
 *    el precio de lista es el que se cobró.
 *  - Bonificación de promoción: unidades regaladas, sin precio de lista
 *    registrado. Queda en blanco a propósito; la columna "Bonificación"
 *    explica por qué.
 *
 * Leerlo de un solo campo dejaba la columna vacía en 247 de 322 líneas, que
 * es justo el caso más común.
 */
export function precioDeLista(linea: {
  precioListaOriginal: number | null;
  precioOriginalSolicitud: number | null;
  origenPrecio: string | null;
  precioUnitario: number;
}): number | null {
  if (linea.precioListaOriginal !== null) return linea.precioListaOriginal;
  if (linea.precioOriginalSolicitud !== null) return linea.precioOriginalSolicitud;
  if (linea.origenPrecio === "LISTA") return linea.precioUnitario;
  return null;
}

/** Rango de fechas del reporte, ya validado. `null` = sin tope por ese lado. */
export interface RangoFechas {
  desde: string | null;
  hasta: string | null;
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lee el rango que viene en la URL.
 *
 * Una fecha con formato raro se ignora en vez de romper la descarga: el
 * reporte sale completo, que es el comportamiento sin filtro, y no un 500
 * que el navegador guarda como archivo.
 *
 * Si vienen al revés (desde > hasta) se dan vuelta: es un error de tipeo
 * evidente y devolver cero filas no le sirve a nadie.
 */
export function leerRangoDeFechas(params: URLSearchParams): RangoFechas {
  const limpia = (v: string | null) => (v && ES_FECHA.test(v) ? v : null);
  const desde = limpia(params.get("desde"));
  const hasta = limpia(params.get("hasta"));

  if (desde && hasta && desde > hasta) return { desde: hasta, hasta: desde };
  return { desde, hasta };
}

/** pedidos-enviados-2026-09-01-a-2026-09-23.xlsx */
export function nombreArchivoReporte(rango: RangoFechas, hoyISO: string): string {
  if (rango.desde && rango.hasta) return `pedidos-enviados-${rango.desde}-a-${rango.hasta}.xlsx`;
  if (rango.desde) return `pedidos-enviados-desde-${rango.desde}.xlsx`;
  if (rango.hasta) return `pedidos-enviados-hasta-${rango.hasta}.xlsx`;
  return `pedidos-enviados-${hoyISO}.xlsx`;
}
