import type { EventoAuditoria } from '@/domain/tipos'
import type { Panorama, ProductoConReg } from '@/domain/panorama'
import { autorizarAltaProducto, autorizarValidacion, validarEntradaProducto, type EntradaProducto } from '@/domain/productos'
import { estado, registrar } from './estado'
import { EntradasDemo } from './entradas-demo'
import type { Actor, Repositorio, ResultadoAccion } from '../repositorio'

export class RepositorioDemo extends EntradasDemo implements Repositorio {
  async panorama(): Promise<Panorama> {
    return structuredClone(estado().panorama)
  }

  async auditoria(limite = 100): Promise<EventoAuditoria[]> {
    return estado().auditoria.slice(0, limite)
  }

  async crearProducto(entrada: EntradaProducto, actor: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const permiso = autorizarAltaProducto(actor.roles)
    if (permiso) return { ok: false, mensaje: permiso }
    const v = validarEntradaProducto(entrada)
    if (!v.ok) return { ok: false, mensaje: 'Revisa los campos marcados.', errores: v.errores as Record<string, string> }
    const e = estado()
    const codigo = entrada.codigo.trim()
    if (e.panorama.productos.some((p) => p.codigo.toLowerCase() === codigo.toLowerCase())) {
      return { ok: false, mensaje: `Ya existe un producto con el código ${codigo}.`, errores: { codigo: 'Este código ya existe.' } }
    }
    const id = `prod:${e.panorama.productos.length + 1}`
    const prod: ProductoConReg = {
      id, codigo, descripcion: entrada.descripcion.trim(), presentacion: entrada.presentacion?.trim() || undefined,
      marca: entrada.marca?.trim() || undefined, principioActivo: entrada.principioActivo?.trim() || undefined,
      unidadMedida: entrada.unidadMedida?.trim() || 'UND', estado: 'activo',
      reg: {
        productoId: id, registroSanitario: entrada.registroSanitario?.trim() || undefined, rsVence: v.rsVence,
        fabricante: entrada.fabricante?.trim() || undefined, formaPresentacion: entrada.formaPresentacion?.trim() || undefined,
        estadoValidacion: 'PENDIENTE', creadoPor: actor.id,
      },
    }
    e.panorama.productos.push(prod)
    registrar(e, actor, 'producto_creado', 'productos', codigo, 'Alta de producto (pendiente de validar)')
    return { ok: true, id }
  }

  async decidirProducto(id: string, decision: 'VALIDADO' | 'OBSERVADO', observacion: string | undefined, actor: Actor): Promise<ResultadoAccion> {
    const permiso = autorizarValidacion(actor.roles)
    if (permiso) return { ok: false, mensaje: permiso }
    const e = estado()
    const prod = e.panorama.productos.find((p) => p.id === id)
    if (!prod?.reg) return { ok: false, mensaje: 'El producto no tiene datos regulatorios cargados.' }
    if (decision === 'VALIDADO' && (!prod.reg.registroSanitario || !prod.reg.rsVence)) {
      return { ok: false, mensaje: 'Para validar hacen falta el registro sanitario y su vencimiento.' }
    }
    if (decision === 'OBSERVADO' && !observacion?.trim()) {
      return { ok: false, mensaje: 'Al observar un producto hay que decir qué falta o qué está mal.' }
    }
    prod.reg = {
      ...prod.reg, estadoValidacion: decision, observacion: observacion?.trim() || undefined,
      validadoPor: decision === 'VALIDADO' ? actor.id : undefined, validadoEn: decision === 'VALIDADO' ? new Date().toISOString() : undefined,
    }
    registrar(e, actor, `producto_${decision.toLowerCase()}`, 'producto_regulatorio', prod.codigo,
      decision === 'VALIDADO' ? 'Registro sanitario validado' : 'Producto observado', observacion)
    return { ok: true }
  }
}
