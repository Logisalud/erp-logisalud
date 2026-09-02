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
 * Decisión de diseño: el `Message-ID` lo generamos NOSOTROS y lo mandamos
 * en los headers, en vez de intentar leer el que asigna el proveedor. La
 * respuesta de la API de Resend al enviar devuelve sólo su `id` interno
 * (un UUID), no el `Message-ID` del correo, así que armar el hilo a partir
 * de eso obligaría a adivinar con qué dominio lo compone. Generándolo acá
 * el ancla del hilo es un dato nuestro, guardado en la base, y no depende
 * de ninguna suposición.
 *
 * Nada de este módulo toca red ni base: sólo texto.
 */

/** Máximo de ids en `References`. Los clientes cortan cadenas larguísimas. */
const MAX_REFERENCIAS = 20;

/**
 * Un `Message-ID` para un correo del pedido. `unico` lo inyecta quien
 * llama (un UUID) para que esta función quede pura y testeable: dos
 * correos del mismo pedido en el mismo milisegundo no pueden compartir id.
 *
 * El dominio tiene que ser uno nuestro —el del remitente— porque el
 * `Message-ID` es un identificador global y colgarlo de un dominio ajeno
 * es cómo se pisan dos hilos distintos.
 */
export function nuevoMessageId(input: {
  numero: number;
  dominio: string;
  unico: string;
}): string {
  const dominio = normalizarDominio(input.dominio);
  const unico = input.unico.replace(/[^A-Za-z0-9._-]/g, "");
  return `<pedido-${input.numero}.${unico}@${dominio}>`;
}

/** `pedidos@logisalud.com`, `LOGISALUD <pedidos@logisalud.com>` → `logisalud.com`. */
export function normalizarDominio(valor: string): string {
  const sinNombre = valor.includes("<") ? (valor.split("<")[1] ?? "").split(">")[0] : valor;
  const dominio = sinNombre.includes("@") ? sinNombre.split("@").pop() ?? "" : sinNombre;
  const limpio = dominio.trim().toLowerCase().replace(/[^a-z0-9.-]/g, "");
  // Sin remitente utilizable igual hay que devolver algo sintácticamente
  // válido: un Message-ID roto invalida el correo entero.
  return limpio === "" ? "pedidos.invalid" : limpio;
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
 * - `Message-ID`: el de ESTE correo, siempre.
 * - `In-Reply-To`: el correo al que responde — el último del hilo, no el
 *   primero, que es lo que espera un cliente de correo al reconstruir el
 *   árbol.
 * - `References`: la cadena completa desde el ancla, en orden y sin
 *   repetidos. Un `In-Reply-To` sin `References` agrupa en Gmail pero se
 *   le escapa a Outlook.
 *
 * El primer correo del hilo devuelve sólo `Message-ID`: mandar
 * `In-Reply-To` vacío es peor que no mandarlo.
 */
export function cabecerasDeHilo(input: {
  messageId: string;
  /** Cadena del hilo, del más viejo al más nuevo, sin incluir este correo. */
  referencias: string[];
}): CabecerasHilo {
  const cadena = dedup(input.referencias.filter((r) => esMessageIdValido(r)));

  if (cadena.length === 0) return { "Message-ID": input.messageId };

  const recortada =
    cadena.length <= MAX_REFERENCIAS
      ? cadena
      : // Se conservan el ancla y los últimos: es lo que usan los clientes
        // para emparentar, y el medio de la cadena no aporta.
        [cadena[0], ...cadena.slice(-(MAX_REFERENCIAS - 1))];

  return {
    "Message-ID": input.messageId,
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
