import { redirect } from 'next/navigation'

/** Vencimientos ahora vive dentro de Reportes (el primero de la lista). */
export default function Vencimientos() {
  redirect('/reportes/vencimientos')
}
