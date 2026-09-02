import { NextResponse } from "next/server";
import { getOrderDetail } from "@/services/orders";
import { loadOrderEmailData } from "@/services/order-notifications";
import { buildOrderExcel, buildOrderExcelFilename } from "@/services/order-excel";

/**
 * Descarga directa del Excel del pedido.
 *
 * Devuelve EL MISMO archivo que se adjunta al correo al enviar el pedido: usa
 * `loadOrderEmailData` + `buildOrderExcel`, las mismas funciones, sin duplicar
 * nada. Si el Excel cambia, cambia en los dos lados a la vez.
 *
 * **No depende del correo.** El envío puede fallar sin bloquear el pedido
 * (ver docs/business-rules.md), y esta descarga no mira `notification_logs`
 * para nada: reconstruye el archivo desde el pedido cada vez.
 *
 * Permisos: primero se lee el pedido con el cliente DEL USUARIO, así que la
 * RLS de `orders_select` decide quién puede descargarlo — vendedor dueño,
 * control_pedidos, aprobador_comercial, operaciones y administrador. Si no lo
 * puede ver, no existe para él y devuelve 404. No hay una segunda lista de
 * permisos que se pueda desincronizar de la de la base.
 *
 * Si algo falla al armar el archivo, la respuesta NO es un error: es un
 * redirect de vuelta al pedido con `?excel=error`, que muestra el aviso en
 * pantalla. Un 500 acá se guardaba como archivo — el navegador escribe en
 * disco lo que venga, aunque sea la página de error HTML — y el usuario
 * terminaba con un "excel.txt" corrupto sin saber que había fallado.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const errorRedirect = (motivo: string) =>
    NextResponse.redirect(new URL(`/pedidos/${params.id}?excel=${motivo}`, request.url), 303);

  try {
    const visible = await getOrderDetail(params.id);
    if (!visible) {
      return NextResponse.json({ error: "El pedido no existe o no es visible." }, { status: 404 });
    }

    const data = await loadOrderEmailData(params.id, visible.estado);
    if (!data) return errorRedirect("error");

    const excel = await buildOrderExcel(data);
    const filename = buildOrderExcelFilename(data);

    return new NextResponse(new Uint8Array(excel), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        // El pedido puede cambiar (cantidades, precios al enviar), así que el
        // archivo se rearma siempre en vez de servir una copia vieja.
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    // Queda en los logs de la plataforma con el pedido, que es lo único que
    // permite diagnosticarlo después; al usuario se le muestra el aviso.
    console.error(`No se pudo generar el Excel del pedido ${params.id}:`, error);
    return errorRedirect("error");
  }
}
