// Copia inmutable de las órdenes de compra (A.1, migración 0038): el WMS LEE Compras y guarda una versión cada vez que el contenido de la OC cambia.
// Dominio puro. Lo que cuenta como «contenido» es lo mismo que en `wms._sincronizar_oc`: proveedor, líneas y cantidades pedidas, y si la anularon;
// lo recibido y lo facturado cambian a diario sin que la OC cambie, así que no cuentan.

export interface LineaOcCopia { ocItemId: string; productoId: string; productoCodigo: string; productoDescripcion: string; cantidadPedida: number }
export interface EncabezadoOcCopia { ocId: string; codigo: string; proveedorId?: string; proveedorNombre: string; proveedorRuc: string; anulada: boolean; eliminada?: boolean }
export interface ContenidoOc { encabezado: EncabezadoOcCopia; lineas: LineaOcCopia[] }

export interface VersionOc extends ContenidoOc {
  id: string
  version: number
  estadoOc?: string
  hash: string
  eliminadaEnCompras: boolean
  creadaEn: string
  creadaPor?: string
}

export type AccionSincronizacion = 'CREADA' | 'SIN_CAMBIOS' | 'CAMBIADA' | 'ELIMINADA' | 'AUSENTE'

export interface ResumenSincronizacion { revisadas: number; nuevas: number; cambiadas: number; eliminadas: number; sinCambios: number }

/** Qué cambió entre dos versiones, en palabras (el mensaje de la alerta `OC_CAMBIADA`). */
export function describirCambioOc(codigo: string, version: number, antes: VersionOc, ahora: ContenidoOc): string {
  const previas = new Map(antes.lineas.map((l) => [l.ocItemId, l]))
  const nuevas = new Map(ahora.lineas.map((l) => [l.ocItemId, l]))
  let otraCantidad = 0, agregadas = 0, quitadas = 0
  for (const [id, l] of nuevas) { const p = previas.get(id); if (!p) agregadas += 1; else if (p.cantidadPedida !== l.cantidadPedida) otraCantidad += 1 }
  for (const id of previas.keys()) if (!nuevas.has(id)) quitadas += 1
  const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
  const partes = [
    ahora.encabezado.anulada && !antes.encabezado.anulada ? 'la anularon' : '',
    ahora.encabezado.proveedorId !== antes.encabezado.proveedorId ? 'cambió el proveedor' : '',
    otraCantidad ? plural(otraCantidad, 'línea con otra cantidad', 'líneas con otra cantidad') : '',
    agregadas ? plural(agregadas, 'línea agregada', 'líneas agregadas') : '',
    quitadas ? plural(quitadas, 'línea quitada', 'líneas quitadas') : '',
    antes.eliminadaEnCompras ? 'volvió a aparecer en Compras' : '',
  ].filter(Boolean)
  return `La orden de compra ${codigo} cambió en Compras (ahora es la versión ${version}): ${partes.join('; ')}. Revisa las solicitudes de ingreso que la usan; la copia anterior sigue guardada.`
}

export const mensajeOcEliminada = (codigo: string, version: number) =>
  `La orden de compra ${codigo} ya no existe en Compras. El WMS conserva su copia (versión ${version}). Avisa a Compras: si había mercadería en camino, hay que aclararlo antes de recibirla.`

/** Una fila de la pantalla «Órdenes de compra del piloto». */
export interface OcPilotoVista {
  ocId: string
  codigo: string
  proveedorNombre: string
  /** Estado de la OC en Compras ahora (solo lectura). */
  estadoCompras?: string
  lineasEnCompras: number
  /** Sin copia todavía (versión 0). */
  versionVigente: number
  copiadaEn?: string
  copiadaPor?: string
  lineasCopia: number
  /** Cuántas veces cambió después de la primera copia (versión vigente − 1). */
  cambios: number
  /** Hay una alerta «OC_CAMBIADA» abierta de esta OC. */
  avisoAbierto: boolean
  eliminadaEnCompras: boolean
  /** Lo que dice la pantalla: sin copia / al día / cambió / ya no existe. */
  situacion: 'SIN_COPIA' | 'AL_DIA' | 'CAMBIO' | 'ELIMINADA'
}

export function situacionOc(o: { versionVigente: number; cambios: number; avisoAbierto: boolean; eliminadaEnCompras: boolean }): OcPilotoVista['situacion'] {
  if (o.versionVigente === 0) return 'SIN_COPIA'
  if (o.eliminadaEnCompras) return 'ELIMINADA'
  return o.cambios > 0 && o.avisoAbierto ? 'CAMBIO' : 'AL_DIA'
}

export const ETIQUETA_SITUACION_OC: Record<OcPilotoVista['situacion'], string> = {
  SIN_COPIA: 'Sin copiar todavía',
  AL_DIA: 'Copia al día',
  CAMBIO: 'Cambió en Compras',
  ELIMINADA: 'Ya no existe en Compras',
}
