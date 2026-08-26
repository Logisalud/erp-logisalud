import { FormularioLogin } from '@logisalud/auth/componentes'

export const metadata = { title: 'Iniciar sesión — ERP LOGISALUD' }

export default function LoginPage({
  searchParams,
}: {
  searchParams: { volver_a?: string }
}) {
  // Solo se aceptan rutas internas, para que un link armado a mano no pueda
  // usar el login como redirección a un sitio externo.
  const destino =
    searchParams.volver_a?.startsWith('/') && !searchParams.volver_a.startsWith('//')
      ? searchParams.volver_a
      : '/'

  return <FormularioLogin volverA={destino} />
}
