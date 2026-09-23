import "server-only";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import {
  etiquetaBonificacion,
  etiquetaEstadoDescuento,
  precioDeLista,
  type RangoFechas,
  type SolicitudDeLinea,
} from "@/domain/reporte-pedidos";

/**
 * Los dos reportes de /admin que se bajan en Excel.
 *
 * Las dos consultas paginan con `.range()`. No es precaución teórica:
 * PostgREST corta las respuestas en 1.000 filas y `.limit()` no lo sube, así
 * que una lectura sin paginar devuelve un reporte incompleto sin avisar —
 * justo el error que un reporte no puede tener. Hoy son 86 pedidos y 3.424
 * clientes, pero el reporte crece con el uso.
 *
 * Se lee con el cliente DEL USUARIO, no con la service role: quien baja el
 * archivo ve exactamente lo que la RLS le deja ver en pantalla, y no hay una
 * segunda lista de permisos que se pueda desincronizar.
 */

const PAGE_SIZE = 1000;
const VERDE = "4BB168";

/** Lee una tabla entera, de a 1.000 filas, aplicando los filtros que le pasen. */
async function leerTodo<T>(
  construirConsulta: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const filas: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await construirConsulta(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const pagina = (data ?? []) as T[];
    filas.push(...pagina);
    if (pagina.length < PAGE_SIZE) break;
  }
  return filas;
}

function encabezado(sheet: ExcelJS.Worksheet, titulos: string[]) {
  const fila = sheet.addRow(titulos);
  fila.font = { bold: true, color: { argb: "FFFFFFFF" } };
  fila.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${VERDE}` } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: titulos.length } };
}

// ─── 1. Contactos de clientes ──────────────────────────────────────────────

interface FilaContacto {
  razon_social: string;
  nombre_comercial: string | null;
  ruc_o_documento: string;
  whatsapp: string | null;
  canal: { nombre: string } | null;
  zona: { nombre: string; codigo_zona: string | null } | null;
  vendedor: { nombre_completo: string; codigo_representante: string | null } | null;
}

export interface ResultadoExcel {
  buffer: Buffer;
  filas: number;
}

/**
 * Clientes con celular cargado, para armar una campaña o un envío de WhatsApp.
 *
 * Solo salen los que tienen `whatsapp`: un contacto sin número no sirve para
 * lo que se va a usar el archivo, y dejarlo adentro obliga a filtrar a mano.
 * Ordenado por zona y vendedor porque así se reparte el trabajo.
 */
export async function construirExcelContactos(): Promise<ResultadoExcel> {
  const supabase = createClient();

  const filas = await leerTodo<FilaContacto>((from, to) =>
    supabase
      .from("customers")
      .select(
        `razon_social, nombre_comercial, ruc_o_documento, whatsapp,
         canal:sales_channels(nombre),
         zona:zones(nombre, codigo_zona),
         vendedor:sellers(nombre_completo, codigo_representante)`,
      )
      .not("whatsapp", "is", null)
      .neq("whatsapp", "")
      .order("zona_id", { nullsFirst: false })
      .order("razon_social")
      .range(from, to),
  );

  // El orden final se arma acá y no en la consulta: se ordena por el NOMBRE de
  // la zona y del vendedor, que viven en las tablas embebidas y PostgREST no
  // deja ordenar por ellas de forma confiable al paginar.
  const cmp = (a: string, b: string) => a.localeCompare(b, "es-PE");
  filas.sort(
    (a, b) =>
      cmp(a.zona?.nombre ?? "zzz", b.zona?.nombre ?? "zzz") ||
      cmp(a.vendedor?.nombre_completo ?? "zzz", b.vendedor?.nombre_completo ?? "zzz") ||
      cmp(a.razon_social, b.razon_social),
  );

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LOGISALUD Pedidos";
  const sheet = workbook.addWorksheet("Contactos");
  sheet.columns = [
    { width: 44 }, { width: 28 }, { width: 14 }, { width: 14 },
    { width: 20 }, { width: 20 }, { width: 26 }, { width: 12 },
  ];
  encabezado(sheet, [
    "Razón social", "Nombre comercial", "RUC / Documento", "Celular",
    "Canal", "Zona", "Vendedor asignado", "Cód. vendedor",
  ]);

  for (const c of filas) {
    sheet.addRow([
      c.razon_social,
      c.nombre_comercial ?? "",
      // Como texto: un RUC en celda numérica se muestra en notación
      // científica y pierde los ceros de la izquierda del documento.
      c.ruc_o_documento,
      c.whatsapp ?? "",
      c.canal?.nombre ?? "",
      c.zona?.nombre ?? "",
      c.vendedor?.nombre_completo ?? "",
      c.vendedor?.codigo_representante ?? "",
    ]);
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, filas: filas.length };
}

// ─── 2. Pedidos enviados, una fila por línea ───────────────────────────────

interface FilaPedido {
  id: string;
  numero: number | null;
  fecha_envio: string | null;
  estado: string;
  canal_snapshot: string | null;
  zona_snapshot: string | null;
  vendedor: { nombre_completo: string; codigo_representante: string | null } | null;
  cliente: { razon_social: string; ruc_o_documento: string; whatsapp: string | null } | null;
  condicion: { nombre: string } | null;
}

interface FilaItem {
  id: string;
  order_id: string;
  cantidad: number;
  precio_unitario: number;
  precio_lista_original: number | null;
  subtotal: number;
  igv: number;
  total: number;
  origen_precio: string | null;
  es_linea_gratis: boolean;
  motivo_precio_especial: string | null;
  producto: { codigo_interno: string; descripcion: string } | null;
}

interface FilaSolicitud {
  order_item_id: string;
  precio_solicitado: number | null;
  porcentaje_descuento: number | null;
  precio_original: number | null;
  estado: "PENDIENTE" | "RESUELTO";
  approval_decisions: Array<{ decision: string; precio_aprobado: number | null }> | null;
}

export async function construirExcelPedidos(rango: RangoFechas): Promise<ResultadoExcel> {
  const supabase = createClient();

  // Los borradores quedan afuera: no son pedidos todavía, son un carrito a
  // medio llenar. Todo lo demás (SUBMITTED y posteriores) entra.
  const pedidos = await leerTodo<FilaPedido>((from, to) => {
    let q = supabase
      .from("orders")
      .select(
        `id, numero, fecha_envio, estado, canal_snapshot, zona_snapshot,
         vendedor:sellers(nombre_completo, codigo_representante),
         cliente:customers(razon_social, ruc_o_documento, whatsapp),
         condicion:payment_terms(nombre)`,
      )
      .neq("estado", "DRAFT");
    if (rango.desde) q = q.gte("fecha_envio", `${rango.desde}T00:00:00`);
    // Hasta el final del día: un `lte` con la fecha pelada corta a medianoche
    // y se come los pedidos del último día del rango.
    if (rango.hasta) q = q.lte("fecha_envio", `${rango.hasta}T23:59:59.999`);
    return q.order("numero").range(from, to);
  });

  const ids = pedidos.map((p) => p.id);
  const items: FilaItem[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    items.push(
      ...(await leerTodo<FilaItem>((from, to) =>
        supabase
          .from("order_items")
          .select(
            `id, order_id, cantidad, precio_unitario, precio_lista_original, subtotal, igv, total,
             origen_precio, es_linea_gratis, motivo_precio_especial,
             producto:products(codigo_interno, descripcion)`,
          )
          .in("order_id", lote)
          .order("created_at")
          .range(from, to),
      )),
    );
  }

  const itemIds = items.map((i) => i.id);
  const solicitudes: FilaSolicitud[] = [];
  for (let i = 0; i < itemIds.length; i += 200) {
    const lote = itemIds.slice(i, i + 200);
    solicitudes.push(
      ...(await leerTodo<FilaSolicitud>((from, to) =>
        supabase
          .from("approval_requests")
          .select(
            `order_item_id, precio_solicitado, porcentaje_descuento, precio_original, estado,
             approval_decisions(decision, precio_aprobado)`,
          )
          .in("order_item_id", lote)
          .range(from, to),
      )),
    );
  }

  const solicitudPorItem = new Map<string, FilaSolicitud>();
  for (const s of solicitudes) if (s.order_item_id) solicitudPorItem.set(s.order_item_id, s);

  const itemsPorPedido = new Map<string, FilaItem[]>();
  for (const it of items) {
    const arr = itemsPorPedido.get(it.order_id) ?? [];
    arr.push(it);
    itemsPorPedido.set(it.order_id, arr);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LOGISALUD Pedidos";
  const sheet = workbook.addWorksheet("Pedidos enviados");
  sheet.columns = [
    { width: 10 }, { width: 12 }, { width: 24 },          // pedido
    { width: 26 }, { width: 12 },                          // vendedor
    { width: 40 }, { width: 14 }, { width: 13 },           // cliente
    { width: 18 }, { width: 18 },                          // canal / zona
    { width: 14 }, { width: 44 }, { width: 10 },           // producto
    { width: 14 }, { width: 14 },                          // precios
    { width: 15 }, { width: 24 },                          // descuento
    { width: 12 }, { width: 12 }, { width: 12 },           // importes de línea
    { width: 14 }, { width: 22 },                          // total pedido / condición
    { width: 24 }, { width: 34 },                          // bonificación
  ];
  encabezado(sheet, [
    "N° Pedido", "Fecha envío", "Estado",
    "Vendedor", "Cód. vendedor",
    "Cliente", "RUC", "Celular",
    "Canal", "Zona",
    "Cód. producto", "Descripción", "Cantidad",
    "Precio de lista", "Precio final",
    "Precio solicitado", "Estado del descuento",
    "Subtotal", "IGV", "Total línea",
    "Total del pedido", "Condición de pago",
    "Bonificación", "Motivo",
  ]);

  let filasEscritas = 0;
  for (const p of pedidos) {
    const lineas = itemsPorPedido.get(p.id) ?? [];
    // El total del pedido se repite en cada línea a propósito: así una tabla
    // dinámica puede sumar por pedido sin tener que cruzar dos hojas.
    const totalPedido = lineas.reduce((s, l) => s + (Number(l.total) || 0), 0);
    const fecha = p.fecha_envio ? new Date(p.fecha_envio) : null;

    for (const l of lineas) {
      const s = solicitudPorItem.get(l.id) ?? null;
      const decision = s?.approval_decisions?.[0]?.decision ?? null;
      const solicitud: SolicitudDeLinea | null = s
        ? { estado: s.estado, decision: decision as SolicitudDeLinea["decision"] }
        : null;
      const lista = precioDeLista({
        precioListaOriginal: l.precio_lista_original !== null ? Number(l.precio_lista_original) : null,
        precioOriginalSolicitud: s?.precio_original != null ? Number(s.precio_original) : null,
        origenPrecio: l.origen_precio,
        precioUnitario: Number(l.precio_unitario) || 0,
      });

      sheet.addRow([
        p.numero ?? "",
        fecha,
        p.estado,
        p.vendedor?.nombre_completo ?? "",
        p.vendedor?.codigo_representante ?? "",
        p.cliente?.razon_social ?? "",
        p.cliente?.ruc_o_documento ?? "",
        p.cliente?.whatsapp ?? "",
        p.canal_snapshot ?? "",
        p.zona_snapshot ?? "",
        l.producto?.codigo_interno ?? "",
        l.producto?.descripcion ?? "",
        Number(l.cantidad) || 0,
        lista ?? "",
        Number(l.precio_unitario) || 0,
        s?.precio_solicitado !== null && s?.precio_solicitado !== undefined
          ? Number(s.precio_solicitado)
          : s?.porcentaje_descuento != null
            ? `${s.porcentaje_descuento}% dcto.`
            : "",
        etiquetaEstadoDescuento(solicitud),
        Number(l.subtotal) || 0,
        Number(l.igv) || 0,
        Number(l.total) || 0,
        totalPedido,
        p.condicion?.nombre ?? "",
        etiquetaBonificacion(l.origen_precio, l.es_linea_gratis),
        l.motivo_precio_especial ?? "",
      ]);
      filasEscritas++;
    }
  }

  sheet.getColumn(2).numFmt = "dd/mm/yyyy";
  for (const col of [14, 15, 16, 18, 19, 20, 21]) sheet.getColumn(col).numFmt = "#,##0.00";

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, filas: filasEscritas };
}
