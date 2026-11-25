import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * El webhook de Resend: firma y lectura del evento.
 *
 * Existe porque "aceptado por Resend" no es "entregado". A la vendedora
 * SUSANA RAMOS no le llegó ni uno de 66 correos en dos meses —su dirección
 * había quedado en la lista de supresión de Resend después de que su buzón
 * se diera de baja— y el ERP los registró todos como enviados. El webhook
 * es la única forma de enterarse de lo que pasa DESPUÉS del envío.
 *
 * Sin dependencias nuevas: Resend firma con el esquema de Svix, que es un
 * HMAC-SHA256 sobre `id.timestamp.cuerpo`. Se verifica con `node:crypto`,
 * igual que el envío se hace con `fetch` en vez del SDK.
 */

export type EventoResend = {
  /** `email.bounced`, `email.delivered`, `email.complained`, … */
  tipo: string;
  /** El id interno de Resend del correo (`data.email_id`). */
  messageId: string;
  /** A quién le pasó. Un correo va a varios; el evento es de uno. */
  destinatarios: string[];
  /** El motivo, cuando el evento lo trae (rebote, queja). */
  detalle: string | null;
  ocurridoEn: string | null;
};

/** Los eventos que dicen que el correo NO llegó a destino. */
const TIPOS_DE_REBOTE = new Set(["email.bounced", "email.complained", "email.failed"]);

export function esRebote(tipo: string): boolean {
  return TIPOS_DE_REBOTE.has(tipo);
}

/**
 * ¿La firma del webhook es nuestra?
 *
 * Falla CERRADO: sin secreto configurado devuelve false. Un webhook
 * abierto deja que cualquiera invente rebotes y marque como caído un
 * correo que sí llegó, que es peor que no tener webhook.
 *
 * El header `svix-signature` puede traer varias firmas separadas por
 * espacio (`v1,aaa v1,bbb`) durante una rotación de secreto: alcanza con
 * que una coincida. La comparación es de tiempo constante.
 */
export function firmaValida(input: {
  cuerpo: string;
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
  secreto: string;
  /** Para la prueba; por defecto, ahora. */
  ahora?: Date;
  /** Tolerancia de reloj, en minutos. */
  toleranciaMinutos?: number;
}): boolean {
  const { cuerpo, svixId, svixTimestamp, svixSignature, secreto } = input;
  if (!secreto || !svixId || !svixTimestamp || !svixSignature) return false;

  // El timestamp acota la ventana de repetición: un evento viejo capturado
  // por alguien más no sirve para reenviarlo mañana.
  const enSegundos = Number(svixTimestamp);
  if (!Number.isFinite(enSegundos)) return false;
  const ahora = (input.ahora ?? new Date()).getTime();
  const tolerancia = (input.toleranciaMinutos ?? 5) * 60 * 1000;
  if (Math.abs(ahora - enSegundos * 1000) > tolerancia) return false;

  // El secreto viene como `whsec_<base64>`; lo que se usa es el base64.
  const base64 = secreto.startsWith("whsec_") ? secreto.slice("whsec_".length) : secreto;
  let clave: Buffer;
  try {
    clave = Buffer.from(base64, "base64");
  } catch {
    return false;
  }
  if (clave.length === 0) return false;

  const esperada = createHmac("sha256", clave)
    .update(`${svixId}.${svixTimestamp}.${cuerpo}`)
    .digest("base64");
  const esperadaBuf = Buffer.from(esperada);

  return svixSignature.split(" ").some((parte) => {
    const firma = parte.includes(",") ? parte.slice(parte.indexOf(",") + 1) : parte;
    const recibida = Buffer.from(firma);
    return recibida.length === esperadaBuf.length && timingSafeEqual(recibida, esperadaBuf);
  });
}

/** Lee el evento del cuerpo, o null si no es uno que entendamos. */
export function leerEvento(cuerpo: string): EventoResend | null {
  let json: unknown;
  try {
    json = JSON.parse(cuerpo);
  } catch {
    return null;
  }
  if (typeof json !== "object" || json === null) return null;

  const raiz = json as Record<string, unknown>;
  const tipo = typeof raiz.type === "string" ? raiz.type : null;
  const data = (typeof raiz.data === "object" && raiz.data !== null ? raiz.data : {}) as Record<
    string,
    unknown
  >;
  const messageId = typeof data.email_id === "string" ? data.email_id : null;
  if (!tipo || !messageId) return null;

  const destinatarios = Array.isArray(data.to)
    ? data.to.filter((d): d is string => typeof d === "string")
    : typeof data.to === "string"
      ? [data.to]
      : [];

  // El motivo viene en `data.bounce` (rebote) y a veces suelto. Se arma un
  // texto legible: quien mira la pantalla necesita leerlo, no interpretarlo.
  const bounce = (typeof data.bounce === "object" && data.bounce !== null ? data.bounce : {}) as
    Record<string, unknown>;
  const partes = [bounce.type, bounce.subType, bounce.message, data.reason]
    .filter((p): p is string => typeof p === "string" && p.trim() !== "")
    .map((p) => p.trim());
  const unicas = partes.filter((p, i) => partes.indexOf(p) === i);
  const detalle = unicas.length > 0 ? unicas.join(" · ") : null;

  return {
    tipo,
    messageId,
    destinatarios,
    detalle,
    ocurridoEn: typeof raiz.created_at === "string" ? raiz.created_at : null,
  };
}
