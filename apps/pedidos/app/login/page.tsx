import { login } from "@/lib/auth/actions";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const { error } = searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-logisalud-green">LOGISALUD Pedidos</h1>
        <p className="mt-1 text-sm text-gray-600">Inicia sesión para continuar.</p>
      </div>

      <form action={login} className="card flex flex-col gap-3 p-5">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        <input
          name="email"
          type="email"
          placeholder="Correo"
          required
          className="min-h-12 rounded-lg border border-gray-300 px-3 py-2"
        />
        <input
          name="password"
          type="password"
          placeholder="Contraseña"
          required
          className="min-h-12 rounded-lg border border-gray-300 px-3 py-2"
        />
        <button type="submit" className="btn-primary">
          Entrar
        </button>
      </form>
    </main>
  );
}
