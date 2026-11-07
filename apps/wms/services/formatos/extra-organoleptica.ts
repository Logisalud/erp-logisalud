import 'server-only'
import type { OrganolepticaVista } from '@/domain/entradas-vistas'
import type { ExtraActaOrganoleptica } from '@/domain/acta-organoleptica-formato'
import { repositorio } from '@/services/repositorio-actual'

/** Lo que el formato LS-FR.55.02 pide y el acta no guarda: el proveedor o cliente y la cantidad pedida, que salen de la solicitud de ingreso. */
export async function extraOrganoleptica(a: OrganolepticaVista): Promise<ExtraActaOrganoleptica> {
  const sol = await repositorio().obtenerSolicitud(a.solicitudId).catch(() => null)
  const linea = sol?.lineas.find((l) => l.productoId === a.productoId && l.lote === a.lote) ?? sol?.lineas.find((l) => l.productoId === a.productoId)
  return { contraparte: sol?.contraparteNombre, cantidadPedida: linea ? (linea.inicial ?? linea.cantidad) : undefined }
}
