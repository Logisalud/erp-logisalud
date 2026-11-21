import { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export const metadata: Metadata = {
  title: "Dashboard de Pedidos en Tiempo Real — LOGISALUD",
  description: "Monitoreo en vivo de pedidos y despachos en mapa interactivo para TV, móvil y escritorio.",
};

export default function PedidosDashboardPage() {
  return <DashboardView />;
}
