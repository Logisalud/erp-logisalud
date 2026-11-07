import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cleanEnv } from "@/lib/env";

/**
 * Verificador de la firma HMAC con la que el WMS pide los pedidos listos.
 *
 * Es una COPIA del verificador de `apps/wms/services/pedidos/firma.ts`:
 * Pedidos no puede importar código de otra app (regla del monorepo), así que
 * el contrato (docs/wms/salidas/contrato-pedidos-wms.md) es lo que mantiene
 * a las dos puntas de acuerdo. Si cambia el texto que se firma, cambia en
 * los dos lados.
 *
 * Se firma `hora \n MÉTODO \n ruta-con-query \n sha256(cuerpo)` con el
 * secreto compartido. El secreto nunca viaja, y una solicitud de hace más de
 * cinco minutos no vale: no se puede repetir una captura.
 */

export const TOLERANCIA_SEGUNDOS = 300;
export const ENCABEZADO_HORA = "x-wms-timestamp";
export const ENCABEZADO_FIRMA = "x-wms-firma";

export function firmar(
  secreto: string,
  metodo: string,
  ruta: string,
  cuerpo: string,
  hora: string,
): string {
  const texto = `${hora}\n${metodo.toUpperCase()}\n${ruta}\n${createHash("sha256")
    .update(cuerpo)
    .digest("hex")}`;
  return "sha256=" + createHmac("sha256", secreto).update(texto).digest("hex");
}

export type MotivoRechazo =
  | "SIN_SECRETO"
  | "FALTA_FIRMA"
  | "HORA_INVALIDA"
  | "FUERA_DE_TIEMPO"
  | "FIRMA_INCORRECTA";

export type ResultadoVerificacion = { ok: true } | { ok: false; motivo: MotivoRechazo };

/**
 * Falla cerrada: sin secreto (o con uno vacío) NADA pasa. Comparar contra una
 * cadena vacía dejaría entrar a cualquiera que sepa calcular un HMAC con clave
 * vacía.
 */
export function verificar(
  secreto: string | undefined | null,
  metodo: string,
  ruta: string,
  cuerpo: string,
  hora: string | undefined | null,
  firma: string | undefined | null,
  ahora: Date = new Date(),
): ResultadoVerificacion {
  const clave = cleanEnv(secreto ?? "");
  if (!clave) return { ok: false, motivo: "SIN_SECRETO" };
  if (!hora || !firma) return { ok: false, motivo: "FALTA_FIRMA" };
  if (!/^[0-9]+$/.test(hora)) return { ok: false, motivo: "HORA_INVALIDA" };
  const t = Number(hora);
  if (!Number.isSafeInteger(t)) return { ok: false, motivo: "HORA_INVALIDA" };
  if (Math.abs(ahora.getTime() / 1000 - t) > TOLERANCIA_SEGUNDOS) {
    return { ok: false, motivo: "FUERA_DE_TIEMPO" };
  }
  const esperada = Buffer.from(firmar(clave, metodo, ruta, cuerpo, hora));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) {
    return { ok: false, motivo: "FIRMA_INCORRECTA" };
  }
  return { ok: true };
}
