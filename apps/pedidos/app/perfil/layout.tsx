import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AppHeader } from "@/components/app-header";

/**
 * Mi perfil, para CUALQUIER rol.
 *
 * Antes vivía en `/admin/perfil` y por lo tanto sólo lo alcanzaba un
 * administrador: un vendedor no tenía forma de cambiar su contraseña, que
 * es justamente quien más la necesita (entra con una temporal). Acá no hay
 * `requireRole`: basta con estar autenticado, porque la pantalla sólo
 * toca la cuenta de quien la abre.
 */
export default async function PerfilLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} ancho="3xl" />
      <div className="mx-auto max-w-3xl p-4 sm:p-6">{children}</div>
    </div>
  );
}
