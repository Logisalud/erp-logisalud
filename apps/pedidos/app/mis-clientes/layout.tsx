import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AppHeader } from "@/components/app-header";

/**
 * "Mis clientes" es de cada quien: muestra sólo los que uno registró, así
 * que no lleva `requireRole` — basta con estar logueado. Lo que se puede
 * ver lo decide igual la RLS de `customers`.
 */
export default async function MisClientesLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} />
      <div className="mx-auto max-w-5xl p-6">{children}</div>
    </div>
  );
}
