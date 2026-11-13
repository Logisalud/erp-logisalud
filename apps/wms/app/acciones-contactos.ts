'use server'

import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import type { Actor } from '@/services/repositorio'
import { leerCsvContactos, type ClaveOpcionSeguimiento } from '@/domain/seguimiento'

// Seguimiento al cliente (0069): contactos de vendedores y opciones. El permiso (`configurar`: el Administrador) lo decide la base; aquí solo se arma quién pide.
async function quien(): Promise<Actor> {
  const ctx = await exigirContexto()
  return { id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles }
}

export async function guardarContactoVendedorAccion(nombre: string, telefono: string) {
  return repositorio().guardarContactoVendedor(nombre.trim().slice(0, 120), telefono.trim().slice(0, 30), await quien())
}
export async function eliminarContactoVendedorAccion(id: string) {
  return repositorio().eliminarContactoVendedor(id, await quien())
}
export async function cargarContactosCsvAccion(texto: string) {
  const filas = leerCsvContactos(texto.slice(0, 500_000))
  if (!filas.length) return { ok: false as const, mensaje: 'El archivo no trae filas. Usa dos columnas: nombre y teléfono.' }
  return repositorio().cargarContactosVendedores(filas, await quien())
}
export async function guardarOpcionSeguimientoAccion(clave: ClaveOpcionSeguimiento, valor: string) {
  return repositorio().guardarOpcionSeguimiento(clave, valor.trim().slice(0, 200), await quien())
}
