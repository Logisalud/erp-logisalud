// Umbrales (metas y colores) de los 6 indicadores de cobranza — editable
// acá, nunca hardcodeado dentro de las consultas. Ver DESIGN.md /
// lib/indicadoresCobranza.ts para el detalle de cada cálculo.

export type UmbralIndicador = {
  meta: number;
  // Para indicadores donde "sube es mejor" (ok si valor >= ok, alerta si >= alerta, si no riesgo/critico).
  // Para indicadores donde "baja es mejor" se invierte (ver mejorSiSube).
  verdeDesde: number;
  ambarDesde: number;
  mejorSiSube: boolean;
};

export const UMBRALES = {
  efectividadCobranza: { meta: 85, verdeDesde: 85, ambarDesde: 75, mejorSiSube: true } as UmbralIndicador,
  dsoBrechaDias: { meta: 0, verdeDesde: 0, ambarDesde: 10, mejorSiSube: false } as UmbralIndicador, // brecha <=0 verde, 1-10 ambar, >10 rojo
  morosidadDura: { meta: 5, verdeDesde: 5, ambarDesde: 7.5, mejorSiSube: false } as UmbralIndicador,
  ventaDeudaVencida: { meta: 5, verdeDesde: 5, ambarDesde: 5, mejorSiSube: false } as UmbralIndicador, // sin ámbar real: >5% ya es rojo
  cobroDeLoVendido: { meta: 85, verdeDesde: 85, ambarDesde: 75, mejorSiSube: true } as UmbralIndicador,
  registroOportuno: { meta: 95, verdeDesde: 95, ambarDesde: 85, mejorSiSube: true } as UmbralIndicador,
};

// Alertas adicionales (no son el semáforo principal, son avisos aparte).
export const ALERTA_VENTA_DEUDA_60_DIAS = true; // cualquier venta a cliente con deuda >60 días
export const ALERTA_DSO_SUBE_2_MESES = true;
export const ALERTA_PAGO_MAS_5_DIAS_HABILES = 5;

// Indicador 5: plazo de medición por defecto (sin categoría de cliente,
// que no existe en este ERP). 60 días desde la emisión, o 120 si la
// propia factura tiene un plazo (vencimiento - emisión) >= 90 días.
export const PLAZO_MEDICION_BASE_DIAS = 60;
export const PLAZO_MEDICION_EXTENDIDO_DIAS = 120;
export const PLAZO_FACTURA_UMBRAL_EXTENDIDO = 90;

// Indicador 6: qué tipos de pago cuentan. Decisión: solo tipo='pago' (las
// retenciones no son un depósito que alguien tenga que "registrar rápido"
// — se insertan junto con el pago real, no por separado en el flujo normal).
export const INDICADOR6_INCLUYE_RETENCIONES = false;
