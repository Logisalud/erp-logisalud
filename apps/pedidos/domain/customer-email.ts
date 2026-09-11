/**
 * Armado puro del correo de "cliente validado". Sin dependencias de
 * Next.js, Supabase ni del proveedor de correo, para poder testear el
 * contenido exacto sin mandar nada.
 *
 * Estilos EN LÍNEA por el mismo motivo que el correo del pedido: los
 * clientes de correo ignoran `<style>` y no cargan Tailwind.
 */

import { COLOR_TEAL, COLOR_VERDE, escapeHtml, formatFechaHora } from "./order-email";

const FONT_HEADING = "'Oswald', 'Arial Narrow', Arial, sans-serif";
const FONT_BODY = "'Poppins', 'Helvetica Neue', Helvetica, Arial, sans-serif";

export type CustomerEmailData = {
  decision: "ACTIVO" | "RECHAZADO";
  razonSocial: string;
  rucODocumento: string;
  /** Quién lo registró desde la calle. */
  vendedor: string | null;
  zona: string | null;
  canal: string | null;
  condicionPago: string | null;
  direccion: string | null;
  fechaSolicitud: string | null;
  fechaValidacion: string;
  /**
   * Los pedidos que estaban esperando a este cliente. Es el dato operativo
   * del aviso: aprobar un cliente no es un trámite, es lo que destraba (o
   * devuelve a borrador) pedidos que ya estaban armados.
   */
  pedidosDestrabados: Array<{ numero: number | null; id: string }>;
};

export function buildCustomerEmailSubject(data: CustomerEmailData): string {
  const verbo = data.decision === "ACTIVO" ? "aprobado" : "rechazado";
  return `Cliente ${verbo} — ${data.razonSocial}`;
}

function lead(data: CustomerEmailData): string {
  if (data.decision === "ACTIVO") {
    return data.pedidosDestrabados.length > 0
      ? "El cliente quedó aprobado y ya se le puede facturar. Los pedidos que estaban esperándolo siguieron su curso."
      : "El cliente quedó aprobado y ya se le puede facturar.";
  }
  return data.pedidosDestrabados.length > 0
    ? "El cliente fue rechazado. Los pedidos que estaban esperándolo volvieron a borrador: no avanzan hasta que se corrija el cliente o se cambie por otro."
    : "El cliente fue rechazado, así que no se le puede vender.";
}

/** "#12, #14" o los ids cuando alguno todavía no tiene número. */
function listaDePedidos(data: CustomerEmailData): string {
  return data.pedidosDestrabados
    .map((p) => (p.numero === null ? "un borrador" : `#${p.numero}`))
    .join(", ");
}

const FILAS: Array<{ label: string; valor: (d: CustomerEmailData) => string | null }> = [
  { label: "RUC / documento", valor: (d) => d.rucODocumento },
  { label: "Registrado por", valor: (d) => d.vendedor },
  { label: "Zona", valor: (d) => d.zona },
  { label: "Canal", valor: (d) => d.canal },
  { label: "Condición de pago", valor: (d) => d.condicionPago },
  { label: "Dirección", valor: (d) => d.direccion },
  { label: "Solicitado el", valor: (d) => (d.fechaSolicitud ? formatFechaHora(d.fechaSolicitud) : null) },
];

export function renderCustomerEmailHtml(data: CustomerEmailData): string {
  const aprobado = data.decision === "ACTIVO";
  const color = aprobado ? COLOR_VERDE : "#b91c1c";

  const filas = FILAS.map(({ label, valor }) => {
    const v = valor(data);
    if (!v) return "";
    return `<tr>
      <td style="padding:6px 0;font-size:14px;color:#6b7280;width:170px;">${escapeHtml(label)}</td>
      <td style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(v)}</td>
    </tr>`;
  }).join("");

  const pedidos =
    data.pedidosDestrabados.length > 0
      ? `<p style="margin:16px 0 0;font-size:14px;color:#111827;">
           ${aprobado ? "Pedidos que estaban esperando" : "Pedidos que volvieron a borrador"}:
           <strong>${escapeHtml(listaDePedidos(data))}</strong>
         </p>`
      : "";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(buildCustomerEmailSubject(data))}</title>
</head>
<body style="margin:0;padding:0;background-color:#f9fafb;font-family:${FONT_BODY};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:20px 24px;border-top:4px solid ${COLOR_TEAL};">
              <p style="margin:0;font-family:${FONT_HEADING};font-size:22px;letter-spacing:0.5px;color:${COLOR_VERDE};text-transform:uppercase;">LOGISALUD</p>
              <p style="margin:6px 0 0;font-family:${FONT_HEADING};font-size:18px;color:${color};">${escapeHtml(
                aprobado ? "Cliente aprobado" : "Cliente rechazado",
              )}</p>
              <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${escapeHtml(
                formatFechaHora(data.fechaValidacion),
              )}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 20px;">
              <p style="margin:0 0 12px;font-size:15px;color:#111827;">${escapeHtml(lead(data))}</p>
              <p style="margin:0 0 8px;font-family:${FONT_HEADING};font-size:17px;color:#111827;">${escapeHtml(
                data.razonSocial,
              )}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${filas}</table>
              ${pedidos}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderCustomerEmailText(data: CustomerEmailData): string {
  const lineas = [
    data.decision === "ACTIVO" ? "CLIENTE APROBADO" : "CLIENTE RECHAZADO",
    formatFechaHora(data.fechaValidacion),
    "",
    lead(data),
    "",
    data.razonSocial,
  ];

  for (const { label, valor } of FILAS) {
    const v = valor(data);
    if (v) lineas.push(`${label}: ${v}`);
  }

  if (data.pedidosDestrabados.length > 0) {
    lineas.push("");
    lineas.push(
      `${data.decision === "ACTIVO" ? "Pedidos que estaban esperando" : "Pedidos que volvieron a borrador"}: ${listaDePedidos(data)}`,
    );
  }

  return lineas.join("\n");
}
