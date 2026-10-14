import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AppHeader } from "@/components/app-header";

/**
 * Mismo marco que el resto de las pantallas internas: el header con el
 * nombre del sistema enlazado al inicio y las secciones del rol. Sin esto,
 * el vendedor entraba a su avance y se quedaba sin forma de volver.
 */
export default async function AvanceLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} />
      <div className="mx-auto max-w-5xl p-4 sm:p-6">{children}</div>
    </div>
  );
}
