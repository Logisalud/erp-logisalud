'use server'

import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import type { Actor } from '@/services/repositorio'

// Stock del cliente (0067): generar y revocar el enlace de un cliente. El permiso (`configurar`: el Administrador) lo decide la base; aquí solo se arma quién pide.
async function quien(): Promise<Actor> {
  const ctx = await exigirContexto()
  return { id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles }
}

export async function crearEnlaceStockClienteAccion(propietarioId: string, dias: number, etiqueta: string) {
  return repositorio().crearEnlaceStockCliente(propietarioId, dias, etiqueta.trim().slice(0, 80) || undefined, await quien())
}

export async function revocarEnlaceStockClienteAccion(enlaceId: string) {
  return repositorio().revocarEnlaceStockCliente(enlaceId, await quien())
}
