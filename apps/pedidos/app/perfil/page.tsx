import { getCurrentUser, roleLabel } from "@/lib/auth/session";
import { ChangePasswordForm } from "./change-password-form";

export default async function PerfilPage() {
  const user = await getCurrentUser();

  return (
    <div>
      <h2 className="text-xl text-slate-900">Mi perfil</h2>
      <p className="cifra mt-1 text-sm text-slate-600">{user?.email}</p>
      {user?.roles.length ? (
        <p className="mt-0.5 text-sm text-slate-600">
          {user.roles.map((r) => roleLabel(r)).join(" · ")}
        </p>
      ) : null}

      <section className="panel mt-6 p-4" aria-labelledby="cambiar-password">
        <h3 id="cambiar-password" className="text-lg text-slate-900">
          Cambiar contraseña
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Se te va a pedir la contraseña actual: tener la sesión abierta no alcanza para
          cambiarla.
        </p>
        <div className="mt-4">
          <ChangePasswordForm />
        </div>
      </section>
    </div>
  );
}
