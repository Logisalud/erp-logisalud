import { requireRole } from "@/lib/auth/session";
import { AppHeader } from "@/components/app-header";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(["administrador"]);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} />
      <div className="mx-auto max-w-4xl p-6">{children}</div>
    </div>
  );
}
