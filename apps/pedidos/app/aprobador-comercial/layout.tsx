import { requireRole } from "@/lib/auth/session";
import { AppHeader } from "@/components/app-header";

export default async function AprobadorComercialLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole(["aprobador_comercial", "administrador"]);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} ancho="3xl" />
      <div className="mx-auto max-w-3xl p-6">{children}</div>
    </div>
  );
}
