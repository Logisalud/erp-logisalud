/**
 * Armado puro del correo de "nuevo pedido enviado". Sin dependencias de
 * Next.js, Supabase ni del proveedor de correo, para poder testear el
 * contenido exacto sin mandar nada.
 *
 * El HTML va con estilos EN LÍNEA a propósito: los clientes de correo
 * (Outlook, Gmail) ignoran o reescriben `<style>` y no cargan Tailwind.
 * Por lo mismo las tipografías de marca se declaran como font-family con
 * fallbacks — Oswald/Poppins se verán solo donde estén disponibles, y en
 * el resto cae a una sans-serif del sistema sin romper el diseño.
 */

export const COLOR_VERDE = "#4BB168";
export const COLOR_TEAL = "#4ABCC2";

const FONT_HEADING = "'Oswald', 'Arial Narrow', Arial, sans-serif";
const FONT_BODY = "'Poppins', 'Helvetica Neue', Helvetica, Arial, sans-serif";

export const NOTA_NO_COMPROBANTE =
  "Documento de control interno — no válido como comprobante de pago. " +
  "El comprobante electrónico se genera al momento del despacho.";

export type OrderEmailItem = {
  codigo: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  igv: number;
  subtotal: number;
  total: number;
};

export type OrderEmailData = {
  numero: number;
  fechaEnvio: string;
  estadoResultado: string;
  cliente: {
    razonSocial: string;
    rucODocumento: string;
    direccionEntrega: string | null;
    canal: string | null;
    zona: string | null;
  };
  vendedor: string | null;
  condicionPago: string | null;
  items: OrderEmailItem[];
};

export type OrderEmailTotals = {
  subtotal: number;
  igv: number;
  total: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Totales del pedido. Se suman las líneas ya calculadas por
 * pedidos.submit_order en el servidor — acá NO se recalcula precio ni
 * IGV, solo se agrega, para que el correo no pueda contradecir a la BD.
 */
export function computeOrderTotals(items: OrderEmailItem[]): OrderEmailTotals {
  return {
    subtotal: round2(items.reduce((sum, i) => sum + i.subtotal, 0)),
    igv: round2(items.reduce((sum, i) => sum + i.igv, 0)),
    total: round2(items.reduce((sum, i) => sum + i.total, 0)),
  };
}

export function formatSoles(n: number): string {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatFechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Hora de Perú, explícita: el servidor corre en UTC y una fecha de
  // pedido en UTC confundiría a quien lo lee desde Lima.
  return d.toLocaleString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildOrderEmailSubject(data: OrderEmailData): string {
  return `Nuevo pedido #${data.numero} — ${data.cliente.razonSocial}`;
}

/** Escapa para interpolar texto de la BD dentro del HTML del correo. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function dash(value: string | null | undefined): string {
  return value === null || value === undefined || value.trim() === "" ? "—" : escapeHtml(value);
}

const TD = `style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827;"`;
const TD_R = `style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827;text-align:right;white-space:nowrap;"`;
const TH = `style="padding:8px 10px;background-color:${COLOR_VERDE};color:#ffffff;font-size:12px;text-align:left;font-weight:600;"`;
const TH_R = `style="padding:8px 10px;background-color:${COLOR_VERDE};color:#ffffff;font-size:12px;text-align:right;font-weight:600;white-space:nowrap;"`;

function datoRow(label: string, value: string): string {
  return `<tr>
      <td style="padding:4px 12px 4px 0;font-size:13px;color:#6b7280;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:4px 0;font-size:13px;color:#111827;font-weight:600;">${value}</td>
    </tr>`;
}

export function renderOrderEmailHtml(data: OrderEmailData): string {
  const totals = computeOrderTotals(data.items);

  const filas = data.items
    .map(
      (i) => `<tr>
      <td ${TD}>${escapeHtml(i.codigo)}</td>
      <td ${TD}>${escapeHtml(i.descripcion)}</td>
      <td ${TD_R}>${i.cantidad.toLocaleString("es-PE")}</td>
      <td ${TD_R}>${formatSoles(i.precioUnitario)}</td>
      <td ${TD_R}>${formatSoles(i.igv)}</td>
      <td ${TD_R}>${formatSoles(i.subtotal)}</td>
      <td ${TD_R}><strong>${formatSoles(i.total)}</strong></td>
    </tr>`,
    )
    .join("");

  const sinItems = `<tr><td ${TD} colspan="7">El pedido no tiene líneas.</td></tr>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(buildOrderEmailSubject(data))}</title>
</head>
<body style="margin:0;padding:0;background-color:#f9fafb;font-family:${FONT_BODY};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">

          <tr>
            <td style="padding:20px 24px;border-top:4px solid ${COLOR_TEAL};">
              <p style="margin:0;font-family:${FONT_HEADING};font-size:22px;letter-spacing:0.5px;color:${COLOR_VERDE};text-transform:uppercase;">LOGISALUD</p>
              <p style="margin:6px 0 0;font-family:${FONT_HEADING};font-size:18px;color:#111827;">Nuevo pedido #${data.numero}</p>
              <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Enviado el ${escapeHtml(formatFechaHora(data.fechaEnvio))} · Estado: ${escapeHtml(data.estadoResultado)}</p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 24px 8px;">
              <p style="margin:16px 0 8px;font-family:${FONT_HEADING};font-size:14px;color:#111827;text-transform:uppercase;letter-spacing:0.5px;">Cliente</p>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                ${datoRow("Razón social", escapeHtml(data.cliente.razonSocial))}
                ${datoRow("RUC / documento", escapeHtml(data.cliente.rucODocumento))}
                ${datoRow("Dirección de entrega", dash(data.cliente.direccionEntrega))}
                ${datoRow("Canal", dash(data.cliente.canal))}
                ${datoRow("Zona", dash(data.cliente.zona))}
              </table>

              <p style="margin:18px 0 8px;font-family:${FONT_HEADING};font-size:14px;color:#111827;text-transform:uppercase;letter-spacing:0.5px;">Pedido</p>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                ${datoRow("Vendedor responsable", dash(data.vendedor))}
                ${datoRow("Condición de pago", dash(data.condicionPago))}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 24px 0;">
              <p style="margin:0 0 8px;font-family:${FONT_HEADING};font-size:14px;color:#111827;text-transform:uppercase;letter-spacing:0.5px;">Productos</p>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                <thead>
                  <tr>
                    <th ${TH}>Código</th>
                    <th ${TH}>Descripción</th>
                    <th ${TH_R}>Cant.</th>
                    <th ${TH_R}>P. unit.</th>
                    <th ${TH_R}>IGV</th>
                    <th ${TH_R}>Subtotal</th>
                    <th ${TH_R}>Total</th>
                  </tr>
                </thead>
                <tbody>${data.items.length > 0 ? filas : sinItems}</tbody>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 24px 0;" align="right">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:3px 12px 3px 0;font-size:13px;color:#6b7280;text-align:right;">Subtotal</td>
                  <td style="padding:3px 0;font-size:13px;color:#111827;text-align:right;white-space:nowrap;">${formatSoles(totals.subtotal)}</td>
                </tr>
                <tr>
                  <td style="padding:3px 12px 3px 0;font-size:13px;color:#6b7280;text-align:right;">IGV</td>
                  <td style="padding:3px 0;font-size:13px;color:#111827;text-align:right;white-space:nowrap;">${formatSoles(totals.igv)}</td>
                </tr>
                <tr>
                  <td style="padding:8px 12px 3px 0;font-size:15px;color:#111827;text-align:right;font-weight:700;border-top:2px solid ${COLOR_VERDE};">Total</td>
                  <td style="padding:8px 0 3px;font-size:15px;color:${COLOR_VERDE};text-align:right;font-weight:700;white-space:nowrap;border-top:2px solid ${COLOR_VERDE};">${formatSoles(totals.total)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 24px 24px;">
              <p style="margin:0;padding:12px 14px;background-color:#fffbeb;border-left:4px solid #f59e0b;font-size:12px;color:#92400e;line-height:1.5;">
                ${escapeHtml(NOTA_NO_COMPROBANTE)}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Versión en texto plano, para clientes de correo que no renderizan HTML
 * y para que el mensaje no caiga en spam por ser HTML-only.
 */
export function renderOrderEmailText(data: OrderEmailData): string {
  const totals = computeOrderTotals(data.items);
  const lineas = data.items.map(
    (i) =>
      `  - ${i.codigo} · ${i.descripcion} · ${i.cantidad} x ${formatSoles(i.precioUnitario)}` +
      ` · IGV ${formatSoles(i.igv)} · total ${formatSoles(i.total)}`,
  );

  return [
    `LOGISALUD — Nuevo pedido #${data.numero}`,
    `Enviado el ${formatFechaHora(data.fechaEnvio)} · Estado: ${data.estadoResultado}`,
    "",
    "CLIENTE",
    `  Razón social: ${data.cliente.razonSocial}`,
    `  RUC / documento: ${data.cliente.rucODocumento}`,
    `  Dirección de entrega: ${data.cliente.direccionEntrega ?? "—"}`,
    `  Canal: ${data.cliente.canal ?? "—"}`,
    `  Zona: ${data.cliente.zona ?? "—"}`,
    "",
    "PEDIDO",
    `  Vendedor responsable: ${data.vendedor ?? "—"}`,
    `  Condición de pago: ${data.condicionPago ?? "—"}`,
    "",
    "PRODUCTOS",
    ...(lineas.length > 0 ? lineas : ["  (el pedido no tiene líneas)"]),
    "",
    `Subtotal: ${formatSoles(totals.subtotal)}`,
    `IGV: ${formatSoles(totals.igv)}`,
    `TOTAL: ${formatSoles(totals.total)}`,
    "",
    NOTA_NO_COMPROBANTE,
  ].join("\n");
}
