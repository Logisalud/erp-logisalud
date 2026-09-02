"use client";

import { MAX_DIAS_CREDITO } from "@/domain/payment-terms";

export type PaymentTermOption = {
  id: number;
  nombre: string;
  /** La única opción de entrada libre: al elegirla hay que escribir los días. */
  permite_dias_libres: boolean;
};

/**
 * Condición de pago, con la opción de escribir los días a mano.
 *
 * Un solo componente para las dos pantallas que la piden (armar un pedido
 * nuevo y corregir el encabezado de un borrador): la regla de "si es la
 * opción libre, el número es obligatorio" tiene que ser la misma en las
 * dos, y duplicarla es cómo se desincronizan.
 *
 * Los `<select>`/`<input>` llevan `name`, así que también funciona dentro
 * de un `<form>` que se envía con FormData, sin que el padre tenga que
 * repetir campos ocultos.
 */
export function PaymentTermsPicker({
  paymentTerms,
  paymentTermsId,
  diasCredito,
  onChange,
  disabled,
  idPrefix = "condicion",
}: {
  paymentTerms: PaymentTermOption[];
  /** "" mientras no eligió nada (pedido nuevo). */
  paymentTermsId: number | "";
  diasCredito: string;
  onChange: (cambio: { paymentTermsId: number | ""; diasCredito: string }) => void;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const elegida = paymentTerms.find((p) => p.id === paymentTermsId) ?? null;
  const pideDias = elegida?.permite_dias_libres ?? false;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="etiqueta" htmlFor={`${idPrefix}-select`}>
          Condición de pago
        </label>
        <select
          id={`${idPrefix}-select`}
          name="paymentTermsId"
          className="campo"
          required
          disabled={disabled}
          value={paymentTermsId === "" ? "" : String(paymentTermsId)}
          onChange={(e) => {
            const valor = e.target.value === "" ? "" : Number(e.target.value);
            const siguiente = paymentTerms.find((p) => p.id === valor) ?? null;
            // Volver a una condición estándar limpia los días: si se quedaran
            // puestos, el pedido diría "Contado" y arrastraría 15 días que
            // nadie pidió (la base rechaza esa combinación).
            onChange({
              paymentTermsId: valor,
              diasCredito: siguiente?.permite_dias_libres ? diasCredito : "",
            });
          }}
        >
          <option value="">Elige una condición</option>
          {paymentTerms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>

      {pideDias && (
        <div>
          <label className="etiqueta" htmlFor={`${idPrefix}-dias`}>
            Días de crédito solicitados
          </label>
          <input
            id={`${idPrefix}-dias`}
            name="diasCredito"
            className="campo cifra sm:max-w-sm"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_DIAS_CREDITO}
            step={1}
            required
            disabled={disabled}
            placeholder="Ej. 15"
            value={diasCredito}
            onChange={(e) => onChange({ paymentTermsId, diasCredito: e.target.value })}
          />
          <p className="mt-1.5 text-sm text-slate-600">
            No es una condición estándar: el pedido queda en excepción administrativa para que
            Administración apruebe el plazo antes de que salga a Operaciones.
          </p>
        </div>
      )}
    </div>
  );
}
