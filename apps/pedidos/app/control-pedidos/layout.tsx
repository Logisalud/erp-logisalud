import { requireRole } from "@/lib/auth/session";
import { AppHeader } from "@/components/app-header";

export default async function ControlPedidosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole(["control_pedidos", "administrador"]);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} ancho="3xl" />
      <div className="mx-auto max-w-3xl p-6">{children}</div>
    </div>
  );
}
