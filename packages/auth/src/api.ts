import 'server-only'

import { NextResponse } from 'next/server'
import { perfilActual } from './server'

/**
 * Autorización por área para Route Handlers.
 *
 * El middleware de sesión ya manda a /login a quien no tiene sesión, pero eso
 * solo responde "¿hay alguien?", no "¿este alguien puede hacer esto?". Estas
 * rutas mueven dinero (pagos, letras, conciliación) o reescriben la cartera
 * entera (importadores), y hablan con Supabase por `supabaseAdmin()`, que
 * bypassa RLS: sin un chequeo explícito acá, cualquier sesión válida —un
 * vendedor con cuenta, alguien de almacén— puede borrar un pago.
 *
 * El guard se pone **por método HTTP, no por archivo**: /api/pagos y
 * /api/letras mezclan un GET de lectura (que gerencia sí tiene que poder
 * hacer) con un POST que escribe (que no).
 */

export type Perfil = { id: string; nombre: string | null; area: string | null; rol: string | null }

export type ResultadoArea =
  | { ok: true; perfil: Perfil }
  | { ok: false; respuesta: NextResponse }

/**
 * ¿La persona de esta request pertenece a alguna de estas áreas?
 *
 * Devuelve la respuesta de error en vez de lanzarla: un throw en un Route
 * Handler sale como 500 y se registra como un bug, cuando en realidad es un
 * rechazo esperado. Uso:
 *
 *     const auth = await exigirArea(AREAS_ESCRITURA)
 *     if (!auth.ok) return auth.respuesta
 *     // auth.perfil sirve para atribuir el cambio (registrado_por, etc.)
 */
export async function exigirArea(areas: readonly string[]): Promise<ResultadoArea> {
  const perfil = await perfilActual()

  // Sin sesión, o con sesión pero sin perfil cargado: 401. No se distingue a
  // propósito — "tenés cuenta pero nadie te asignó un área" no es información
  // que valga la pena filtrar, y el remedio es el mismo: hablar con un admin.
  if (!perfil) {
    return {
      ok: false,
      respuesta: NextResponse.json({ error: 'No autorizado' }, { status: 401 }),
    }
  }

  // admin entra siempre: es el área que administra a las demás, y si queda
  // afuera de una ruta no hay quién arregle un permiso mal puesto.
  if (perfil.area !== 'admin' && !areas.includes(perfil.area ?? '')) {
    return {
      ok: false,
      respuesta: NextResponse.json(
        { error: 'Tu área no tiene permiso para esta operación' },
        { status: 403 },
      ),
    }
  }

  return { ok: true, perfil: perfil as Perfil }
}
