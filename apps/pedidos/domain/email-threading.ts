/**
 * Threading de correo: que los tres avisos de un pedido (enviado, cae en
 * excepción comercial, se resuelve) lleguen como un solo hilo y no como
 * tres conversaciones sueltas.
 *
 * Threading de verdad, no "mismo asunto": los clientes de correo agrupan
 * por los encabezados `Message-ID` / `In-Reply-To` / `References`
 * (RFC 5322 §3.6.4). El asunto es una señal secundaria — Outlook la usa,
 * Gmail casi no — así que se cuidan las dos: encabezados correctos y
 * `Re: ` sobre el MISMO asunto base del hilo.
 *
 * De dónde sale el `Message-ID` del hilo: **de Resend, leído después de
 * enviar**. El primer intento fue generarlo nosotros y mandarlo en los
 * headers, y no funciona: se comprobó contra el encabezado real de un
 * correo recibido en Outlook que Resend **reescribe** el `Message-ID` de
 * salida con su propio formato (`@…amazonses.com`) e ignora el valor
 * personalizado. Un `In-Reply-To` apuntando al id que inventamos
 * referencia un correo que nunca existió, así que ningún cliente puede
 * enlazar nada. `In-Reply-To` y `References`, en cambio, **sí** se
 * respetan tal cual se envían.
 *
 * Por eso el flujo es: enviar, leer el `message_id` real con
 * `GET /emails/{id}` (la respuesta de la API SÍ lo trae) y guardar ESE
 * como ancla. Ver services/order-notifications.ts.
 *
 * Nada de este módulo toca red ni base: sólo texto.
 */

/** Máximo de ids en `References`. Los clientes cortan cadenas larguísimas. */
const MAX_REFERENCIAS = 20;

/**
 * El `message_id` que devuelve Resend, listo para usar en un encabezado.
 *
 * Los ángulos son parte del valor, no decoración (RFC 5322), y la API
 * puede devolverlo con o sin ellos: se agregan si faltan. Lo que no tiene
 * forma de `algo@algo` se descarta — un id roto en `References` rompe el
 * emparentado sin avisar, y es mejor un hilo sin cadena que una cadena
 * mentirosa.
 */
export function normalizarMessageId(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const limpio = valor.trim();
  const conAngulos = limpio.startsWith("<") && limpio.endsWith(">") ? limpio : `<${limpio}>`;
  return esMessageIdValido(conAngulos) ? conAngulos : null;
}

/** Un id fabricado por nosotros, de la implementación anterior a este fix. */
export function esMessageIdPropioViejo(valor: string | null | undefined): boolean {
  return valor !== null && valor !== undefined && /^<pedido-\d+\./.test(valor.trim());
}

/**
 * El asunto de un correo que continúa el hilo. Idempotente: aplicarlo dos
 * veces no deja "Re: Re: ", que es exactamente lo que hace que Outlook
 * abra una conversación nueva.
 */
export function asuntoDeRespuesta(asuntoBase: string): string {
  const limpio = asuntoBase.trim();
  return /^re\s*:/i.test(limpio) ? limpio : `Re: ${limpio}`;
}

export type CabecerasHilo = Record<string, string>;

/**
 * Los encabezados de threading de un correo.
 *
 * - `In-Reply-To`: el correo al que responde — el último del hilo, no el
 *   primero, que es lo que espera un cliente de correo al reconstruir el
 *   árbol.
 * - `References`: la cadena completa desde el ancla, en orden y sin
 *   repetidos. Un `In-Reply-To` sin `References` agrupa en Gmail pero se
 *   le escapa a Outlook.
 *
 * **No se manda `Message-ID`**: Resend lo reescribe con el suyo, así que
 * mandarlo era ruido que además invitaba a construir la cadena con ids
 * que no existen en ninguna bandeja.
 *
 * El primer correo del hilo no lleva ningún encabezado de estos: mandar
 * `In-Reply-To` vacío es peor que no mandarlo.
 */
export function cabecerasDeHilo(input: {
  /** Cadena del hilo, del más viejo al más nuevo, sin incluir este correo. */
  referencias: string[];
}): CabecerasHilo {
  const cadena = dedup(input.referencias.filter((r) => esMessageIdValido(r)));

  if (cadena.length === 0) return {};

  const recortada =
    cadena.length <= MAX_REFERENCIAS
      ? cadena
      : // Se conservan el ancla y los últimos: es lo que usan los clientes
        // para emparentar, y el medio de la cadena no aporta.
        [cadena[0], ...cadena.slice(-(MAX_REFERENCIAS - 1))];

  return {
    "In-Reply-To": cadena[cadena.length - 1],
    References: recortada.join(" "),
  };
}

/**
 * `<algo@dominio>` — con los ángulos, que son parte del valor y no
 * decoración. Un id sin ángulos rompe el emparentado en silencio.
 */
export function esMessageIdValido(valor: string | null | undefined): boolean {
  if (!valor) return false;
  return /^<[^<>@\s]+@[^<>@\s]+>$/.test(valor.trim());
}

function dedup(valores: string[]): string[] {
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const v of valores) {
    const limpio = v.trim();
    if (vistos.has(limpio)) continue;
    vistos.add(limpio);
    salida.push(limpio);
  }
  return salida;
}
