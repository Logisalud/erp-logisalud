import { NextResponse } from 'next/server'
import { crearClienteServidor } from '@logisalud/auth/server'

/**
 * Cerrar sesión desde el tablero.
 *
 * El tablero es un HTML suelto, no un componente de React, así que no puede
 * usar `BotonCerrarSesion` de `@logisalud/auth`. Hace un POST acá y la
 * cookie se borra del lado del servidor, que es más confiable: el cliente
 * del navegador puede quedarse con la sesión en memoria.
 *
 * POST y no GET a propósito: un GET lo dispara cualquier prefetch del
 * navegador y la persona se encontraría deslogueada sin haber tocado nada.
 */
export async function POST() {
  await crearClienteServidor().auth.signOut()
  return NextResponse.json({ ok: true })
}
