import { perfilActual } from '@logisalud/auth/server';
import { AREAS_ESCRITURA } from '@/lib/autorizacion';
import EstadoCuentaVista from './vista';

/**
 * Envoltura de servidor de /cobranzas/estado-cuenta.
 *
 * La pantalla en sí sigue siendo un componente cliente (vista.tsx). Lo único
 * que se resuelve acá es el permiso: "marcar un CONTADO como pendiente" es un
 * PATCH a /api/documentos/[id]/contado-pendiente, que desde ahora exige área
 * de escritura. Sin esto, gerencia veía el botón y recibía un 403 al tocarlo.
 *
 * El chequeo real es el del Route Handler — esconder el botón es UI, no
 * seguridad. Va acá y no en el cliente porque el área vive en la sesión del
 * servidor y no tiene por qué viajar al navegador para nada más.
 */
export default async function EstadoCuentaPage() {
  const perfil = await perfilActual();
  const area = perfil?.area ?? '';
  const puedeEditarContado = area === 'admin' || (AREAS_ESCRITURA as readonly string[]).includes(area);

  return <EstadoCuentaVista puedeEditarContado={puedeEditarContado} />;
}
