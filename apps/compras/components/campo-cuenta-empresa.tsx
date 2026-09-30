import { cuentaEmpresaPorDefecto, etiquetaCuentaEmpresa, type CuentaEmpresa } from '@/domain/cuenta-empresa'

/**
 * "Cuenta de origen": de cuál cuenta PROPIA de Logisalud salió el pago
 * (migración 0075). Lo usan los tres caminos que registran un pago — el lote
 * de Tesorería, el pago histórico desde la ficha y el pago directo marcado
 * "ya se pagó" —, así que vive acá y no copiado en cada formulario: si cada
 * uno armara su propio desplegable, tarde o temprano uno preselecciona otra
 * cuenta que los demás.
 *
 * `opcional` agrega "No sé de cuál salió" para el backlog, donde el dato
 * puede no existir ya — y en ese caso es ESO lo que viene elegido, no la 79.
 * Preseleccionar una cuenta en un pago de hace meses sería empujar a
 * aceptarla sin saberla: el mismo invento que la migración 0075 evitó al no
 * rellenar los pagos viejos. En el camino normal no hay "no sé": la cuenta se
 * sabe en el momento de pagar, y el formulario ya la trae elegida.
 */
export function CampoCuentaEmpresa({
  cuentas, moneda, opcional = false, nombre = 'cuentaEmpresaId',
}: {
  cuentas: readonly CuentaEmpresa[]
  /** La moneda del pago — decide cuál viene preseleccionada. */
  moneda: string
  opcional?: boolean
  nombre?: string
}) {
  if (cuentas.length === 0) {
    return (
      <p className="text-xs text-amber-700">
        No hay cuentas de la empresa cargadas todavía — avísale a Contabilidad.
      </p>
    )
  }
  const porDefecto = opcional ? null : cuentaEmpresaPorDefecto(cuentas, moneda)
  return (
    <label className="block text-sm">
      <span className="text-gray-600">Cuenta de origen</span>
      <select
        name={nombre}
        required={!opcional}
        defaultValue={porDefecto?.id ?? ''}
        className="mt-1 min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
      >
        {opcional ? <option value="">No sé de cuál salió</option> : null}
        {cuentas.map((c) => (
          <option key={c.id} value={c.id}>
            {etiquetaCuentaEmpresa(c)} ({c.moneda})
          </option>
        ))}
      </select>
    </label>
  )
}
