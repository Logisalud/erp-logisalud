import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LOGISALUD — Dashboard en Tiempo Real de Pedidos",
  description: "Monitoreo en vivo de pedidos, despachos y flota en mapa interactivo para TV, móvil y operaciones.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased bg-[#090d16] text-slate-100">{children}</body>
    </html>
  );
}
