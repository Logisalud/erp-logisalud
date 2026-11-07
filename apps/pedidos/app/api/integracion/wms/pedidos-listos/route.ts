import { NextRequest, NextResponse } from "next/server";
import { cleanEnv } from "@/lib/env";
import { ENCABEZADO_FIRMA, ENCABEZADO_HORA, verificar } from "@/lib/wms-firma";
import { cargarPedidosListosParaWms } from "@/services/wms-pedidos-listos";

export const dynamic = "force-dynamic";

/**
 * GET /api/integracion/wms/pedidos-listos
 *
 * Entrega al WMS los pedidos listos para despacho (contrato:
 * docs/wms/salidas/contrato-pedidos-wms.md). SOLO LECTURA, firmada con HMAC
 * con el secreto compartido `WMS_PEDIDOS_SECRETO`. El WMS firma la ruta tal
 * como la pide (`/api/integracion/...`, porque su `WMS_PEDIDOS_URL` termina
 * en `/api`), y acá se verifica la misma ruta con su query.
 *
 * Sin el secreto configurado la ruta rechaza todo (falla cerrada). Los
 * rechazos no dicen por qué la firma no sirve, para no darle pistas a quien
 * la tantea, y nada de esto se registra: ni el secreto ni los encabezados.
 */
export async function GET(req: NextRequest) {
  const secreto = cleanEnv(process.env.WMS_PEDIDOS_SECRETO);
  const resultado = verificar(
    secreto,
    "GET",
    req.nextUrl.pathname + req.nextUrl.search,
    "",
    req.headers.get(ENCABEZADO_HORA),
    req.headers.get(ENCABEZADO_FIRMA),
  );

  if (!resultado.ok) {
    const estado =
      resultado.motivo === "SIN_SECRETO"
        ? 503
        : resultado.motivo === "FALTA_FIRMA" || resultado.motivo === "HORA_INVALIDA"
          ? 401
          : 403;
    const error =
      resultado.motivo === "SIN_SECRETO"
        ? "La integración con el WMS no está configurada."
        : "Firma no válida.";
    return NextResponse.json({ error }, { status: estado, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const cuerpo = await cargarPedidosListosParaWms();
    return NextResponse.json(cuerpo, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { error: "No se pudieron leer los pedidos." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
