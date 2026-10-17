/**
 * Validación de una persona sin usuario (migración 0081). Pura: los mismos
 * límites que los CHECK de la tabla, dichos en lenguaje de quien llena el
 * formulario.
 */

export type BorradorPersonaSinUsuario = {
  nombre: string
  /** Opcional: los vendedores se cargaron solo con el nombre. */
  dni?: string | null
}

export function validarPersonaSinUsuario(b: BorradorPersonaSinUsuario): string[] {
  const errores: string[] = []
  if (!b.nombre.trim()) errores.push('Escribe el nombre.')
  const dni = b.dni?.trim() ?? ''
  if (dni && !/^\d{8}$/.test(dni)) errores.push('El DNI tiene que tener 8 dígitos.')
  return errores
}
