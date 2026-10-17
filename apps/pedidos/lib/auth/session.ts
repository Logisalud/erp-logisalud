import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  userId: string;
  email: string | null;
  fullName: string | null;
  roles: string[];
  /** Vendedor vinculado a este usuario (pedidos.sellers.user_id), si existe. */
  sellerId: string | null;
};

type UserRoleRow = {
  roles: { name: string } | { name: string }[] | null;
};

const ROLE_LABELS: Record<string, string> = {
  vendedor: "Vendedor",
  control_pedidos: "Control de pedidos",
  aprobador_comercial: "Aprobador comercial",
  operaciones: "Operaciones",
  administrador: "Administrador",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

/**
 * ¿Este error es "tu sesión ya no vale" disfrazado?
 *
 * PostgREST rechaza un token vencido o todavía no válido con un 401 cuyo
 * mensaje habla del JWT, y cuando la petición sale sin token la consulta
 * entra como `anon` y lo que vuelve es un "permission denied" sobre la
 * tabla (42501). Ninguno de los dos es un fallo de la pantalla.
 */
function esSesionInvalida(error: { message?: string; code?: string }): boolean {
  if (error.code === "42501" || error.code === "PGRST301") return true;
  const m = (error.message ?? "").toLowerCase();
  return m.includes("jwt") || m.includes("permission denied");
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ data: roleRows, error: roleError }, { data: profile }, { data: seller }] = await Promise.all([
    supabase.from("user_roles").select("roles(name)").eq("user_id", user.id),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase.from("sellers").select("id").eq("user_id", user.id).maybeSingle(),
  ]);

  // Una sesión que el servidor de datos ya no acepta no es un error de la
  // pantalla: es alguien que tiene que volver a entrar. Pasa de dos
  // maneras y las dos se veían como una pantalla rota —"permission denied
  // for table orders", "JWT issued at future"—: el token venció y no se
  // renovó, o el reloj del teléfono está adelantado y el token todavía no
  // vale. Devolver null deja que el llamador mande al login.
  if (roleError) {
    if (esSesionInvalida(roleError)) return null;
    throw new Error(roleError.message);
  }

  const roles = ((roleRows ?? []) as UserRoleRow[]).flatMap((row) => {
    const r = row.roles;
    if (!r) return [];
    return Array.isArray(r) ? r.map((x) => x.name) : [r.name];
  });

  return {
    userId: user.id,
    email: user.email ?? null,
    fullName: profile?.full_name ?? null,
    roles,
    sellerId: seller?.id ?? null,
  };
}

/**
 * Server Component guard: usar al inicio de un layout/page que
 * requiera uno de los roles indicados. Redirige a /login si no hay
 * sesión, o a /no-autorizado si el usuario no tiene ninguno de los
 * roles permitidos.
 */
export async function requireRole(allowed: string[]): Promise<CurrentUser> {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (!current.roles.some((r) => allowed.includes(r))) redirect("/no-autorizado");
  return current;
}

/**
 * Hay sesión, o se va al login — y se comprueba ANTES de consultar nada.
 *
 * El `requireRole` del layout no alcanza: en el App Router el layout y la
 * página se renderizan **en paralelo**, así que la consulta de la página
 * sale al mismo tiempo que el guardia del layout. Con la sesión vencida es
 * una carrera: a veces gana el guardia y la persona aterriza en el login, y
 * a veces gana la consulta, revienta con "permission denied" y lo que se ve
 * es "No se pudo cargar esta pantalla". Le pasó a 6 vendedores entre agosto
 * y octubre de 2026.
 *
 * Llamar a esto en la primera línea de la página ordena la carrera: no se
 * consulta nada hasta saber que hay sesión. Los roles los sigue decidiendo
 * el layout; esto solo mira que haya alguien.
 */
export async function requireSession(): Promise<CurrentUser> {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  return current;
}

/**
 * Para Server Actions: la página/layout que las expone ya hizo
 * requireRole(); esto solo obtiene el uid autenticado para pasarlo
 * como "actor" a la capa de servicio. Lanza si por algún motivo no hay
 * sesión (defensa en profundidad — RLS igual bloquearía el write).
 */
export async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(MENSAJE_SESION_VENCIDA);
  return user.id;
}

/**
 * Lo que ve alguien cuya sesión caducó con la pantalla abierta.
 *
 * Sin sesión, las consultas salen como `anon` y la RLS no le deja ver
 * NADA: el error que llegaba era "El producto no existe o no es visible",
 * que manda a buscar el problema al lado equivocado. Pasó el 2026-09-18
 * con una vendedora que tenía el pedido abierto desde antes.
 */
export const MENSAJE_SESION_VENCIDA =
  "Tu sesión venció. Volvé a entrar y reintentá: el pedido que estabas armando quedó guardado.";
