import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AppHeader } from "@/components/app-header";

/**
 * Stock es de consulta para CUALQUIER rol autenticado —el vendedor
 * incluido—, así que no lleva `requireRole`: basta con estar logueado. Lo
 * que protege el dato es la RLS de `stock_lotes`, que deja leer a todo
 * autenticado y escribir sólo al administrador.
 */
export default async function StockLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} />
      <div className="mx-auto max-w-5xl p-6">{children}</div>
    </div>
  );
}
