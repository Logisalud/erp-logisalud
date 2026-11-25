import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Dashboard Comercial — LOGISALUD',
  description: 'Venta, clasificación de clientes y cartera',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PE">
      <body>{children}</body>
    </html>
  )
}
