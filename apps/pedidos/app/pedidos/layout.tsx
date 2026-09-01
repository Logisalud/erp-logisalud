import { requireRole } from "@/lib/auth/session";
import { AppHeader } from "@/components/app-header";

export default async function PedidosLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(["vendedor", "administrador"]);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} />
      <div className="mx-auto max-w-4xl p-4 sm:p-6">{children}</div>
    </div>
  );
}
