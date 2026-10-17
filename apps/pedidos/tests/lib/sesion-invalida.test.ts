import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Una sesión que el servidor de datos ya no acepta tiene que leerse como
 * "volvé a entrar", no como una pantalla rota.
 *
 * Son dos casos distintos y los dos se veían igual de mal: el token venció
 * y la consulta salió como `anon` —"permission denied for table orders",
 * 6 vendedores entre agosto y octubre de 2026— o el reloj del teléfono
 * está adelantado y el token todavía no vale ("JWT issued at future").
 */
const auth = { getUser: vi.fn() };
const from = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth, from }) }));
const redirect = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});
vi.mock("next/navigation", () => ({ redirect: (...a: unknown[]) => redirect(...(a as [])) }));

import { getCurrentUser, requireSession } from "@/lib/auth/session";

const usuario = { id: "7a1c1c6a-9c5f-4a1a-9b3a-1b2c3d4e5f60", email: "vendedor@logisalud.com" };

/** `from()` encadena hasta devolver lo que se le indique. */
function consultaQueDevuelve(resultado: unknown) {
  const encadenable: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) encadenable[m] = () => encadenable;
  encadenable.maybeSingle = async () => ({ data: null });
  encadenable.then = (resolve: (v: unknown) => unknown) => resolve(resultado);
  return () => encadenable;
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.getUser.mockResolvedValue({ data: { user: usuario } });
});

describe("una sesión que la base ya no acepta", () => {
  it("se lee como sin sesión cuando la consulta entra como anónima", async () => {
    from.mockImplementation(
      consultaQueDevuelve({ data: null, error: { message: "permission denied for table user_roles", code: "42501" } }),
    );
    expect(await getCurrentUser()).toBeNull();
  });

  it("se lee como sin sesión cuando el reloj del teléfono adelanta", async () => {
    from.mockImplementation(consultaQueDevuelve({ data: null, error: { message: "JWT issued at future" } }));
    expect(await getCurrentUser()).toBeNull();
  });

  it("manda al login en vez de reventar la pantalla", async () => {
    from.mockImplementation(consultaQueDevuelve({ data: null, error: { message: "JWT expired" } }));
    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("un error de verdad sigue siendo un error, no un login", async () => {
    from.mockImplementation(
      consultaQueDevuelve({ data: null, error: { message: "relation user_roles does not exist", code: "42P01" } }),
    );
    await expect(getCurrentUser()).rejects.toThrow(/does not exist/);
  });
});
