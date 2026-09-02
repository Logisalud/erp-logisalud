import { redirect } from "next/navigation";

/**
 * La pantalla de perfil se movió a `/perfil`, accesible a cualquier rol.
 * Esta ruta queda como redirección porque estaba enlazada desde el menú
 * del administrador y puede estar guardada en algún favorito.
 */
export default function PerfilAdminRedirect() {
  redirect("/perfil");
}
