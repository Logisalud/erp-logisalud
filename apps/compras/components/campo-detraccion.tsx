'use client'

import { UMBRAL_DETRACCION_PEN, exigeRespuestaDetraccion, redondear } from '@/domain/obligacion'

/**
 * Sesión 2026-09-07: reemplaza el dropdown de categoría de
 * `cuentas_x_pagar.tasas_detraccion` (catálogo que nunca se cargó) en Pago
 * Directo, OS y el registro de factura de OC. En vez de que el sistema
 * adivine la categoría, quien registra declara explícitamente mirando la
 * factura real — por ley trae el dato impreso si aplica SPOT.
 *
 * Por debajo del umbral la pregunta se ve pre-marcada en "No" pero sigue
 * siendo editable (`tieneDetraccion` sigue en null hasta que la persona
 * clickea algo — el default visual no se "commitea" solo). Por encima del
 * umbral, ningún radio queda marcado hasta que contesta: `required` en un
 * grupo de radios sí participa de la validación nativa del navegador (a
 * diferencia de un <input type="hidden">, ver components/selector-condicion-pago.tsx),
 * así que el navegador bloquea el submit solo.
 */

const CHIPS_PORCENTAJE = [4, 10, 12] as const

export function CampoDetraccion({
  total, moneda, tieneDetraccion, onTieneDetraccionChange,
  porcentaje, onPorcentajeChange, monto, onMontoChange,
  errorTieneDetraccion, errorPorcentaje, errorMonto,
}: {
  total: number
  moneda: 'PEN' | 'USD'
  tieneDetraccion: boolean | null
  onTieneDetraccionChange: (v: boolean) => void
  porcentaje: string
  onPorcentajeChange: (v: string) => void
  monto: string
  onMontoChange: (v: string) => void
  errorTieneDetraccion?: string
  errorPorcentaje?: string
  errorMonto?: string
}) {
  const exige = exigeRespuestaDetraccion(total, moneda)
  // Visual: si todavía no contestó, se ve "No" marcado solo cuando NO hace
  // falta contestar — por encima del umbral se ve sin marcar ninguno, para
  // forzar una respuesta real (no alcanza con el default silencioso).
  const valorMostrado = tieneDetraccion ?? (exige ? null : false)

  const elegirPorcentaje = (pct: number) => {
    onPorcentajeChange(String(pct))
    onMontoChange(total > 0 ? String(redondear(total * (pct / 100))) : '')
  }

  return (
    <section className="card space-y-3">
      <h2 className="font-heading text-lg">Detracción</h2>
      <fieldset>
        <legend className="text-sm font-medium text-gray-800">
          ¿Esta factura incluye detracción?{exige ? ' *' : ''}
        </legend>
        <div className="mt-1 flex gap-2">
          {(['si', 'no'] as const).map((opcion) => {
            const valor = opcion === 'si'
            return (
              <label
                key={opcion}
                className={`flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-md border px-3 font-medium ${
                  valorMostrado === valor
                    ? 'border-logisalud-green bg-logisalud-green text-white'
                    : 'border-gray-300 bg-white text-gray-700'
                }`}
              >
                <input
                  type="radio" name="tieneDetraccion" value={opcion} required={exige}
                  checked={valorMostrado === valor}
                  onChange={() => onTieneDetraccionChange(valor)}
                  className="sr-only"
                />
                {opcion === 'si' ? 'Sí' : 'No'}
              </label>
            )
          })}
        </div>
        {errorTieneDetraccion ? <p className="mt-1 text-sm text-red-700">{errorTieneDetraccion}</p> : null}
        {exige ? (
          <p className="mt-1 text-xs text-gray-500">El total supera S/{UMBRAL_DETRACCION_PEN} — mira la factura, por ley lo indica si aplica.</p>
        ) : null}
      </fieldset>

      {valorMostrado === true ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="text-sm">
            <span className="font-medium text-gray-800">% de detracción *</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {CHIPS_PORCENTAJE.map((pct) => (
                <button
                  key={pct} type="button" onClick={() => elegirPorcentaje(pct)}
                  className={`min-h-12 rounded-md border px-3 font-medium ${
                    porcentaje === String(pct)
                      ? 'border-logisalud-green bg-logisalud-green text-white'
                      : 'border-gray-300 bg-white text-gray-700'
                  }`}
                >
                  {pct}%
                </button>
              ))}
              <label>
                <span className="sr-only">% de detracción</span>
                <input
                  type="number" name="porcentajeDetraccion" min="0" max="100" step="0.01"
                  value={porcentaje}
                  onChange={(e) => {
                    onPorcentajeChange(e.target.value)
                    const pct = Number(e.target.value) || 0
                    onMontoChange(pct > 0 && total > 0 ? String(redondear(total * (pct / 100))) : '')
                  }}
                  placeholder="Otro %"
                  className="min-h-12 w-24 rounded-md border border-gray-300 px-3"
                />
              </label>
            </div>
            {errorPorcentaje ? <p className="mt-1 text-red-700">{errorPorcentaje}</p> : null}
          </div>

          <label className="block text-sm">
            <span className="font-medium text-gray-800">Monto de detracción *</span>
            <input
              type="number" name="montoDetraccion" min="0" step="0.01"
              value={monto}
              onChange={(e) => onMontoChange(e.target.value)}
              className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
            <p className="mt-1 text-xs text-gray-500">Calculado del % sobre el total — se puede ajustar si la factura trae otro valor.</p>
            {errorMonto ? <p className="mt-1 text-red-700">{errorMonto}</p> : null}
          </label>
        </div>
      ) : (
        <input type="hidden" name="porcentajeDetraccion" value="" />
      )}
      {valorMostrado !== true ? <input type="hidden" name="montoDetraccion" value="" /> : null}
    </section>
  )
}
