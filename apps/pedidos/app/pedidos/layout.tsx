import Link from "next/link";
import { requireRole, roleLabel } from "@/lib/auth/session";
import { UserMenu } from "@/components/user-menu";

const NAV_LINKS = [
  { href: "/pedidos", label: "Inicio" },
  { href: "/pedidos/nuevo", label: "Nuevo pedido" },
];

export default async function PedidosLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(["vendedor", "administrador"]);
  const isAdmin = user.roles.includes("administrador");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/pedidos" className="text-lg font-bold text-logisalud-green">
              LOGISALUD Pedidos
            </Link>
            <nav className="flex flex-wrap gap-3 text-sm">
              {NAV_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="hover:text-logisalud-green hover:underline">
                  {link.label}
                </Link>
              ))}
              {isAdmin && (
                <Link href="/admin" className="hover:text-logisalud-green hover:underline">
                  ← Maestros
                </Link>
              )}
            </nav>
          </div>
          <UserMenu
            fullName={user.fullName}
            email={user.email}
            roleLabel={user.roles[0] ? roleLabel(user.roles[0]) : null}
            perfilHref={isAdmin ? "/admin/perfil" : undefined}
          />
        </div>
      </header>
      <div className="mx-auto max-w-4xl p-4 sm:p-6">{children}</div>
    </div>
  );
}
