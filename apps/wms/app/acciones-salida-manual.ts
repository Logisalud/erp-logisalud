'use server'

import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { guardarArchivo } from '@/services/archivos'
import { validarLineaSalidaCliente, validarPdfGre, type EntradaOrdenManual } from '@/domain/salida-manual'
import { tipoDeMotivo } from '@/domain/salidas'
import { tipoContenidoCargo, validarArchivoCargo, type EntradaEntrega } from '@/domain/entrega-transportista'
import { hoyEnLima } from '@/domain/fechas'
import type { MotivoSalida } from '@/domain/salidas'
import type { Actor, ResultadoAccion } from '@/services/repositorio'

// SA-2: las acciones de la pantalla «Nueva Orden de Salida» y de la bandeja. Cada una pasa por el repositorio: quien manda en los permisos y las reglas es la base de datos (en la
// demostración, su espejo). Los usuarios de cliente (B3) usarán las mismas acciones cuando existan: el permiso lo decide el rol de la sesión, nunca lo que mande el navegador.

async function quien(): Promise<Actor> {
  const ctx = await exigirContexto()
  return { id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles }
}

export async function buscarProductosSalidaAccion(consulta: string, propietarioId?: string) { await exigirContexto(); return repositorio().buscarProductosParaSalida(consulta, propietarioId) }
export async function lotesParaSalidaAccion(propietarioId: string, productoId: string) { await exigirContexto(); return repositorio().lotesParaSalida(propietarioId, productoId) }
export async function ordenDelPedidoAccion(numeroPedido: string) { await exigirContexto(); return repositorio().ordenDelPedido(numeroPedido) }

/** La validación inmediata de una línea con lote indicado (tipo B y devolución al proveedor): el dominio dice lo mismo que la base. */
export async function validarLineaConLoteAccion(e: { propietarioId: string; productoId?: string; loteCodigo: string; cantidad: number; motivo: MotivoSalida; yaPedidoDelLote?: number }) {
  await exigirContexto()
  const lotes = e.productoId && e.loteCodigo.trim() ? await repositorio().lotesPorCodigo(e.loteCodigo, e.productoId) : []
  const diasAvisoDevolucion = e.motivo === 'DEVOLUCION_PROVEEDOR' ? await repositorio().diasAvisoDevolucion() : undefined
  return validarLineaSalidaCliente({ tipo: tipoDeMotivo(e.motivo), propietarioId: e.propietarioId, productoId: e.productoId, loteCodigo: e.loteCodigo, cantidad: e.cantidad, motivo: e.motivo, yaPedidoDelLote: e.yaPedidoDelLote, hoy: hoyEnLima(), lotes, diasAvisoDevolucion })
}

/** Guarda el PDF de la GRE del cliente y devuelve su referencia (el mismo almacenamiento de archivos que los documentos y el COA). */
export async function subirGreClienteAccion(f: FormData): Promise<ResultadoAccion<{ ref: string; nombre: string }>> {
  await exigirContexto()
  const archivo = f.get('archivo')
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, mensaje: 'Falta el archivo.', errores: { greArchivo: 'Adjunta el PDF de la guía del cliente.' } }
  const malo = validarPdfGre(archivo.name, archivo.size)
  if (malo) return { ok: false, mensaje: malo, errores: { greArchivo: malo } }
  const g = await guardarArchivo('gre-cliente', archivo.name, new Uint8Array(await archivo.arrayBuffer()), 'application/pdf')
  return { ok: true, ref: g.ref, nombre: archivo.name }
}

export async function crearOrdenManualAccion(entrada: EntradaOrdenManual) { return repositorio().crearOrdenManual(entrada, await quien()) }
export async function crearOrdenDePedidoAccion(pedidoId: string) { return repositorio().crearOrdenDePedido(pedidoId, await quien()) }
export async function crearOrdenesPendientesAccion() { return repositorio().crearOrdenesPendientes(await quien()) }
export async function cancelarOrdenAccion(salidaId: string, motivo: string) { return repositorio().cancelarOrden(salidaId, motivo, await quien()) }

/** Guarda la foto o el PDF del cargo de la entrega al transportista del cliente (opcional) y devuelve su referencia. */
export async function subirCargoEntregaAccion(f: FormData): Promise<ResultadoAccion<{ ref: string; nombre: string }>> {
  await exigirContexto()
  const archivo = f.get('archivo')
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, mensaje: 'Falta el archivo.', errores: { cargo: 'Adjunta una foto o un PDF.' } }
  const malo = validarArchivoCargo(archivo.name, archivo.size)
  if (malo) return { ok: false, mensaje: malo, errores: { cargo: malo } }
  const g = await guardarArchivo('cargo-entrega', archivo.name, new Uint8Array(await archivo.arrayBuffer()), tipoContenidoCargo(archivo.name))
  return { ok: true, ref: g.ref, nombre: archivo.name }
}

export async function registrarEntregaTransportistaAccion(entrada: EntradaEntrega) { return repositorio().registrarEntregaTransportistaCliente(entrada, await quien()) }
