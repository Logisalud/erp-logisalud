'use server'

import { exigirContexto } from '@/lib/contexto'
import { registrarDiferenciaCarga } from '@/services/ranking'

/** «Diferencia detectada en la carga» (alimenta el ranking: cuenta contra quien picó y contra quien dio la conformidad). */
export async function registrarDiferenciaCargaAccion(salidaId: string, motivo: string) {
  await exigirContexto()
  return registrarDiferenciaCarga(salidaId, motivo)
}
