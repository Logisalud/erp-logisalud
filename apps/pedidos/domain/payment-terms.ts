/**
 * Condición de pago con días de crédito escritos a mano.
 *
 * El catálogo cubre Contado y Crédito 30/45/60/90/120. Cuando el cliente
 * negocia otro plazo (15 días, 75 días), el vendedor necesita anotar el
 * número exacto en vez de elegir la opción más parecida y perder el dato.
 *
 * Esa condición NO es estándar por definición: no existe cliente cuya
 * condición habitual sea "el número que se escriba en cada pedido", así que
 * siempre cae en excepción administrativa. La regla la aplica
 * `submit_order` en la base (migración 1012); acá vive lo que la pantalla
 * necesita para pedir el dato y mostrarlo.
 */

export const MAX_DIAS_CREDITO = 365;

export type ValidacionDias =
  | { ok: true; dias: number }
  | { ok: false; mensaje: string };

/**
 * Valida los días escritos por el usuario. Lo que llega de un `<input
 * type="number">` es texto, y "15.5 días de crédito" o "0" no son plazos.
 */
export function validarDiasCredito(valor: unknown): ValidacionDias {
  const texto = typeof valor === "string" ? valor.trim() : valor;
  if (texto === "" || texto === null || texto === undefined) {
    return { ok: false, mensaje: "Escribe el número de días de crédito." };
  }

  const dias = Number(texto);
  if (!Number.isFinite(dias) || !Number.isInteger(dias)) {
    return { ok: false, mensaje: "Los días de crédito tienen que ser un número entero." };
  }
  if (dias < 1) {
    return { ok: false, mensaje: "Los días de crédito tienen que ser 1 o más." };
  }
  if (dias > MAX_DIAS_CREDITO) {
    return {
      ok: false,
      mensaje: `Los días de crédito no pueden pasar de ${MAX_DIAS_CREDITO}.`,
    };
  }

  return { ok: true, dias };
}

/**
 * Cómo se lee la condición de pago del pedido en pantalla, en el correo y
 * en el Excel. Con días a medida se muestra el número real y se dice que no
 * es una condición estándar: quien lo revisa tiene que ver por qué el
 * pedido cayó en excepción administrativa sin buscarlo.
 */
export function etiquetaCondicionPago(
  nombre: string | null | undefined,
  diasSolicitados: number | null | undefined,
): string {
  if (diasSolicitados == null) return nombre?.trim() || "—";
  return `Crédito ${diasSolicitados} ${diasSolicitados === 1 ? "día" : "días"} (no estándar)`;
}

export type OpcionCondicionPago = { id: number; permite_dias_libres: boolean };

export type SeleccionCondicionPago = {
  paymentTermsId: number | "";
  diasCredito: string;
};

export type ValidacionCondicion =
  | { ok: true; paymentTermsId: number; diasCreditoSolicitados: number | null }
  | { ok: false; mensaje: string };

/**
 * Valida la condición elegida junto con los días, que es la única forma en
 * que tiene sentido: la opción de entrada libre sin número no es una
 * condición de pago, y un número con una condición estándar es un dato que
 * nadie pidió. Lo usan las dos pantallas y también las Server Actions —el
 * navegador no es el guardián de nada.
 */
export function validarCondicionDePago(
  opciones: OpcionCondicionPago[],
  seleccion: SeleccionCondicionPago,
): ValidacionCondicion {
  if (seleccion.paymentTermsId === "" || !Number.isFinite(Number(seleccion.paymentTermsId))) {
    return { ok: false, mensaje: "Elige una condición de pago." };
  }

  const paymentTermsId = Number(seleccion.paymentTermsId);
  const elegida = opciones.find((o) => o.id === paymentTermsId);
  if (!elegida) {
    return { ok: false, mensaje: "Esa condición de pago no existe o no está activa." };
  }

  if (!elegida.permite_dias_libres) {
    return { ok: true, paymentTermsId, diasCreditoSolicitados: null };
  }

  const dias = validarDiasCredito(seleccion.diasCredito);
  if (!dias.ok) return { ok: false, mensaje: dias.mensaje };
  return { ok: true, paymentTermsId, diasCreditoSolicitados: dias.dias };
}
