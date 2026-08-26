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
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const visible = await getOrderDetail(params.id);
  if (!visible) {
    return NextResponse.json({ error: "El pedido no existe o no es visible." }, { status: 404 });
  }

  const data = await loadOrderEmailData(params.id, visible.estado);
  if (!data) {
    return NextResponse.json({ error: "No se pudo armar el Excel del pedido." }, { status: 404 });
  }

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
}
