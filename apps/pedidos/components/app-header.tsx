import Link from "next/link";
import { seccionesParaRoles } from "@/domain/navegacion";
import { roleLabel, type CurrentUser } from "@/lib/auth/session";
import { UserMenu } from "@/components/user-menu";

/**
 * El header de todas las pantallas internas.
 *
 * Antes cada layout traía el suyo, con una lista de enlaces distinta escrita a
 * mano, y en dos de ellos el nombre del sistema era un <h1> sin enlace: quien
 * entraba a Control de Pedidos o a Aprobaciones no tenía cómo volver al
 * inicio. Acá el nombre es SIEMPRE un enlace a "/" y los enlaces salen de
 * `seccionesParaRoles`, la misma lista con la que la portada arma sus
 * tarjetas.
 *
 * Los enlaces son objetivos táctiles de 48px, no texto suelto: el vendedor
 * navega de pie y con una mano. Con sus dos secciones la barra entra en una
 * línea en el celular; al administrador, que trabaja sentado, se le envuelve.
 */
export function AppHeader({
  user,
  ancho = "4xl",
}: {
  user: CurrentUser;
  /** Para que el header no quede más ancho que el contenido de la pantalla. */
  ancho?: "3xl" | "4xl";
}) {
  const secciones = seccionesParaRoles(user.roles);
  const isAdmin = user.roles.includes("administrador");
  // Tailwind necesita la clase literal en el código: no sirve interpolar.
  const maxW = ancho === "3xl" ? "max-w-3xl" : "max-w-4xl";

  const enlace =
    "inline-flex min-h-12 shrink-0 items-center whitespace-nowrap rounded-lg px-3 " +
    "text-sm text-slate-700 hover:bg-slate-100 hover:text-logisalud-green";

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
      {/* El contenedor externo NO envuelve: si lo hiciera, al administrador
          —que tiene ocho secciones— el menú de usuario se le caería a una
          línea propia y aparecería alineado a la izquierda. Envuelve sólo el
          grupo de la izquierda; el avatar queda siempre arriba a la derecha. */}
      <div
        className={`mx-auto flex ${maxW} items-start justify-between gap-x-3 px-4 py-2 sm:px-6`}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1">
          <Link
            href="/"
            className="inline-flex min-h-12 items-center rounded-lg px-1 text-lg font-bold text-logisalud-green hover:underline"
          >
            LOGISALUD Pedidos
          </Link>
          {/* En el celular la barra es UNA fila que se desplaza: envolviendo,
              al administrador le comía media pantalla de header pegajoso.
              Desde `sm` hay ancho de sobra y vuelve a envolver, que se lee
              mejor que un carrusel en escritorio. */}
          <nav
            aria-label="Secciones"
            className="flex min-w-0 items-center gap-x-1 overflow-x-auto sm:flex-wrap sm:gap-y-1 sm:overflow-x-visible"
          >
            {/* El nombre ya lleva al inicio, pero quien se perdió una vez no
                vuelve a probar suerte con el logo: el enlace explícito es la
                salida que sí se ve. */}
            <Link href="/" className={enlace}>
              Inicio
            </Link>
            {secciones.map((s) => (
              <Link key={s.href} href={s.href} className={enlace}>
                {s.title}
              </Link>
            ))}
          </nav>
        </div>
        <div className="shrink-0 pt-1.5">
          <UserMenu
            fullName={user.fullName}
            email={user.email}
            roleLabel={user.roles[0] ? roleLabel(user.roles[0]) : null}
            perfilHref={isAdmin ? "/admin/perfil" : undefined}
          />
        </div>
      </div>
    </header>
  );
}
