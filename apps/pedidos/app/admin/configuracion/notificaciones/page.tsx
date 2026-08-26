import { Breadcrumb } from "@/components/breadcrumb";
import {
  listNotificationLogs,
  listNotificationRecipients,
} from "@/services/order-notifications";
import { isEmailConfigured } from "@/services/email";
import { RecipientList } from "./recipient-list";

const ETIQUETA_ESTADO: Record<string, { texto: string; clase: string }> = {
  enviado: { texto: "Enviado", clase: "text-logisalud-green" },
  fallido: { texto: "Fallido", clase: "text-red-700" },
  sin_destinatarios: { texto: "Sin destinatarios", clase: "text-amber-700" },
};

export default async function NotificacionesPage() {
  const [recipients, logs] = await Promise.all([
    listNotificationRecipients(),
    listNotificationLogs(),
  ]);
  const emailConfigurado = isEmailConfigured();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Breadcrumb
          items={[{ label: "Maestros", href: "/admin" }, { label: "Notificaciones de pedidos" }]}
        />
        <h2 className="text-xl font-semibold">Notificaciones de pedidos</h2>
        <p className="mt-1 text-sm text-gray-600">
          Cada vez que un vendedor envía un pedido, se manda un correo con el detalle a todos los
          destinatarios activos de esta lista. Si el correo falla, el pedido igual queda enviado.
        </p>
      </div>

      {!emailConfigurado && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          El proveedor de correo no está configurado: faltan las variables de entorno{" "}
          <code>RESEND_API_KEY</code> y/o <code>RESEND_FROM_EMAIL</code>. Puedes administrar la
          lista, pero ningún correo saldrá hasta configurarlas.
        </p>
      )}

      <section>
        <h3 className="font-heading text-lg">Destinatarios</h3>
        <div className="mt-3">
          <RecipientList recipients={recipients} />
        </div>
      </section>

      <section>
        <h3 className="font-heading text-lg">Últimos envíos</h3>
        {logs.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">Todavía no se registró ningún envío.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {logs.map((log) => {
              const etiqueta = ETIQUETA_ESTADO[log.estado] ?? {
                texto: log.estado,
                clase: "text-gray-700",
              };
              return (
                <li key={log.id} className="card p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className={`text-sm font-semibold ${etiqueta.clase}`}>{etiqueta.texto}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(log.created_at).toLocaleString("es-PE", {
                        timeZone: "America/Lima",
                      })}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    {log.destinatarios.length > 0
                      ? log.destinatarios.join(", ")
                      : "Sin destinatarios configurados, correo no enviado."}
                  </p>
                  {log.error_mensaje && (
                    <p className="mt-1 break-words text-xs text-red-700">{log.error_mensaje}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
