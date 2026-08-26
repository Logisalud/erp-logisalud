import Link from "next/link";
import { requireRole, roleLabel } from "@/lib/auth/session";
import { UserMenu } from "@/components/user-menu";

export default async function AprobadorComercialLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(["aprobador_comercial", "administrador"]);
  const isAdmin = user.roles.includes("administrador");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between p-4">
          <div>
            <h1 className="text-lg font-bold text-logisalud-green">Aprobaciones comerciales</h1>
            {isAdmin && (
              <Link href="/admin" className="text-sm text-gray-600 hover:text-logisalud-green hover:underline">
                ← Volver a Maestros
              </Link>
            )}
          </div>
          <UserMenu
            fullName={user.fullName}
            email={user.email}
            roleLabel={user.roles[0] ? roleLabel(user.roles[0]) : null}
            perfilHref={isAdmin ? "/admin/perfil" : undefined}
          />
        </div>
      </header>
      <div className="mx-auto max-w-3xl p-6">{children}</div>
    </div>
  );
}
