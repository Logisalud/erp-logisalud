/**
 * "Nadie aprueba lo suyo" — regla transversal a los cuatro tipos con gate
 * de aprobación real (OS, Pago Directo, Anticipo, Reembolso). Puro: sin
 * Next, sin Supabase.
 *
 * Hasta ahora ninguna Server Action de aprobación miraba quién llamaba:
 * solo validaban el ESTADO. Y las policies nominales incluso lo habilitaban
 * a propósito (`solicitante_id = auth.uid()` en gastos y servicios,
 * `custodio_id = auth.uid()` en caja chica), así que quien pedía un
 * anticipo podía aprobárselo.
 *
 * Este chequeo vive en la aplicación y no solo en RLS porque hoy RLS no
 * filtra nada: el flag `compras.flags.acceso_abierto_temporal` está en true
 * y su policy `cmd=ALL` anula a las demás por OR. La migración 0047 igual
 * arregla las policies, para el día que el flag se apague.
 */

export type PerfilDecisor = { area: string | null; rol: string | null } | null

/**
 * La autoridad final del módulo: `admin` (Sebastián, Andrés) y Contabilidad
 * con rol admin (Mariela). Mismo criterio que ya usan los otros gates —
 * `app/cuentas-por-pagar/[id]/page.tsx`, `domain/pendientes-aprobar.ts`.
 *
 * Están exentos de la regla a propósito: son el último escalón, no hay
 * nadie por encima a quien pedirle que apruebe en su lugar. Bloquearlos
 * dejaría solicitudes suyas trabadas para siempre.
 */
export function esAutoridadFinal(perfil: PerfilDecisor): boolean {
  return perfil?.area === 'admin' || (perfil?.area === 'contabilidad' && perfil?.rol === 'admin')
}

/**
 * ¿Puede esta persona decidir (aprobar / rechazar / dar conformidad) sobre
 * este registro?
 *
 * `quienCreo` es SIEMPRE quien cargó el registro, nunca el beneficiario: en
 * un anticipo, `solicitante_id` y `asignado_a` pueden ser distintos porque
 * Contabilidad arma anticipos para vendedores. Mirar el beneficiario
 * bloquearía a Mariela sin ninguna razón.
 */
export function puedeDecidirSobre(
  perfil: PerfilDecisor,
  quienDecide: string,
  quienCreo: string | null
): boolean {
  if (esAutoridadFinal(perfil)) return true
  if (!quienCreo) return true
  return quienDecide !== quienCreo
}

/** El mensaje que ve quien intenta aprobar lo suyo — dice qué hacer, no solo que no. */
export const ERROR_AUTO_APROBACION =
  'No puedes aprobar ni rechazar una solicitud que cargaste vos. Pedile a Contabilidad que la revise.'

/**
 * "Anular" (Pieza G): puede el CREADOR o la AUTORIDAD, pero el creador solo
 * mientras la autoridad no haya decidido todavía. Después de que decidió,
 * anular queda reservado a la autoridad — el creador ya no corrige por su
 * cuenta algo que otro ya revisó; tiene que pedirlo.
 *
 * `esAutoridad` lo calcula quien llama porque NO es el mismo por tipo: en
 * una OS la autoridad es el jefe del área solicitante (`es_jefe_de`), y en
 * Pago Directo / Anticipo / Reembolso es Contabilidad (`esAutoridadFinal`).
 * Meter las dos acá obligaría a pasarle `misAreas` a una función que en tres
 * de los cuatro casos no lo necesita.
 */
export function puedeAnular(
  esAutoridad: boolean,
  quienIntenta: string,
  quienCreo: string | null,
  autoridadYaDecidio: boolean
): boolean {
  if (esAutoridad) return true
  if (autoridadYaDecidio) return false
  return quienIntenta === quienCreo
}

export const ERROR_ANULAR_TARDE =
  'Ya no puedes anularlo vos: alguien con autoridad ya lo revisó. Pedile a quien corresponda que lo rechace o lo anule.'

export const ERROR_ANULAR_AJENO =
  'Solo quien lo creó, o Contabilidad, puede anular este registro.'

/**
 * ¿La autoridad ya se pronunció? Uno por tipo, porque cada máquina de
 * estados marca ese momento en un lugar distinto.
 *
 * OS: el jefe decide en `pendiente_jefe`; cualquier estado posterior
 * significa que ya aprobó (o rechazó).
 */
export function autoridadYaDecidioOS(estado: string): boolean {
  return estado !== 'pendiente_jefe'
}

/** Anticipo/Reembolso: Contabilidad decide en `pendiente_contabilidad`. */
export function autoridadYaDecidioSolicitud(estado: string): boolean {
  return estado !== 'pendiente_contabilidad'
}

/**
 * Pago Directo: Contabilidad decide dando conformidad. Antes de eso la
 * obligación está en `pendiente_factura` o `registrada`.
 */
export function autoridadYaDecidioPagoDirecto(estado: string): boolean {
  return estado !== 'pendiente_factura' && estado !== 'registrada'
}
