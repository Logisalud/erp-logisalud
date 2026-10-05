import { perfilActual } from '@logisalud/auth/server';
import FactoringVista from './vista';

// Mismo patrón que registrar-pago/page.tsx: anular una operación de
// factoring le devuelve saldo pendiente a facturas, así que solo admin
// puede hacerlo (AREAS_BORRADO = solo admin, ver lib/autorizacion.ts).
export default async function FactoringPage() {
  const perfil = await perfilActual();
  const puedeAnular = (perfil?.area ?? '') === 'admin';

  return <FactoringVista puedeAnular={puedeAnular} />;
}
