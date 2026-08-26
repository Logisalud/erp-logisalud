import { getCurrentUser } from "@/lib/auth/session";
import { Breadcrumb } from "@/components/breadcrumb";
import { ChangePasswordForm } from "./change-password-form";

export default async function PerfilPage() {
  const user = await getCurrentUser();

  return (
    <div>
      <Breadcrumb items={[{ label: "Maestros", href: "/admin" }, { label: "Mi perfil" }]} />
      <h2 className="text-xl font-semibold">Mi perfil</h2>
      <p className="mt-1 text-sm text-gray-600">{user?.email}</p>

      <div className="mt-6">
        <h3 className="mb-3 text-lg font-semibold">Cambiar contraseña</h3>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
