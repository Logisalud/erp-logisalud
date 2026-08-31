import Link from "next/link";
import { getCurrentUser, roleLabel } from "@/lib/auth/session";
import { listPendingCustomers } from "@/services/customers";
import { UserMenu } from "@/components/user-menu";

type HomeSection = {
  href: string;
  title: string;
  description: string;
  roles: string[];
};

const HOME_SECTIONS: HomeSection[] = [
  {
    href: "/pedidos",
    title: "Pedidos",
    description: "Tomar un pedido nuevo o revisar tus borradores.",
    roles: ["administrador", "vendedor"],
  },
  {
    href: "/admin",
    title: "Maestros",
    description: "Productos, proveedores, canales, zonas y condiciones de pago.",
    roles: ["administrador"],
  },
  {
    href: "/admin/maestros/productos",
    title: "Productos",
    description: "Catálogo de productos, precios por canal y perfil tributario.",
    roles: ["administrador"],
  },
  {
    href: "/admin/maestros/listas-precios",
    title: "Listas de precios",
    description: "Importar y publicar listas de precios por proveedor.",
    roles: ["administrador"],
  },
  {
    href: "/operaciones",
    title: "Despachos",
    description: "Preparar y despachar los pedidos listos para operaciones.",
    roles: ["administrador", "operaciones"],
  },
  {
    href: "/aprobador-comercial",
    title: "Aprobaciones comerciales",
    description: "Solicitudes de descuento que frenan el pedido hasta resolverse.",
    roles: ["administrador", "aprobador_comercial"],
  },
  {
    href: "/control-pedidos/documentos",
    title: "Documentación electrónica",
    description: "Borradores de factura/boleta y guía de remisión para revisar.",
    roles: ["administrador", "control_pedidos"],
  },
  {
    href: "/control-pedidos/validacion-clientes",
    title: "Validación de clientes",
    description: "Aprobar o rechazar clientes nuevos solicitados por vendedores.",
    roles: ["administrador", "control_pedidos"],
  },
];

export default async function Home() {
  const user = await getCurrentUser();
  const isAdmin = user?.roles.includes("administrador") ?? false;

  const sections = user
    ? HOME_SECTIONS.filter((s) => s.roles.some((r) => user.roles.includes(r)))
    : [];

  const canSeePendingCustomers = sections.some((s) => s.href === "/control-pedidos/validacion-clientes");
  const pendingCount = canSeePendingCustomers ? (await listPendingCustomers()).length : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 pt-8">
        <h1 className="text-3xl font-bold text-logisalud-green">LOGISALUD Pedidos</h1>
        {user && (
          <UserMenu
            fullName={user.fullName}
            email={user.email}
            roleLabel={user.roles[0] ? roleLabel(user.roles[0]) : null}
            perfilHref={isAdmin ? "/admin/perfil" : undefined}
          />
        )}
      </header>

      {user ? (
        <>
          <p className="-mt-4 text-sm text-gray-600">
            Hola, {user.fullName ?? user.email} — elige una sección para empezar.
          </p>

          {pendingCount !== null && (
            <Link href="/control-pedidos/validacion-clientes" className="card-highlight flex items-baseline gap-3 p-5">
              <span className="text-3xl font-bold text-logisalud-green">{pendingCount}</span>
              <span className="text-sm text-gray-600">
                {pendingCount === 1 ? "cliente pendiente de validación" : "clientes pendientes de validación"}
              </span>
            </Link>
          )}

          {sections.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {sections.map((s) => (
                <Link key={s.href} href={s.href} className="card p-5 hover:shadow-md">
                  <h3 className="font-semibold text-logisalud-green">{s.title}</h3>
                  <p className="mt-1 text-sm text-gray-600">{s.description}</p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              Todavía no tienes secciones asignadas. Contacta a un administrador.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="-mt-4 text-sm text-gray-600">Gestión de pedidos, precios y clientes.</p>
          <Link href="/login" className="btn-primary text-center">
            Iniciar sesión
          </Link>
        </>
      )}
    </main>
  );
}
