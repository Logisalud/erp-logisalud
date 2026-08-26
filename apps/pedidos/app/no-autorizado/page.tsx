import { signOut } from "@/lib/auth/actions";

export default function NoAutorizadoPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold text-logisalud-teal">Sin autorización</h1>
      <p className="text-sm text-gray-600">
        Tu usuario no tiene un rol con acceso a esta sección.
      </p>
      <form action={signOut}>
        <button type="submit" className="btn-secondary">
          Cerrar sesión
        </button>
      </form>
    </main>
  );
}
