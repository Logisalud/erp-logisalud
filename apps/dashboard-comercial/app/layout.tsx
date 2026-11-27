import type { Metadata } from 'next'
import { Oswald, Poppins } from 'next/font/google'

import './globals.css'

// Las mismas dos fuentes que cobranzas y compras: el login es una pantalla
// compartida y tiene que verse igual en las tres.
const oswald = Oswald({
  subsets: ['latin'],
  variable: '--font-oswald',
  display: 'swap',
})

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Dashboard Comercial — LOGISALUD',
  description: 'Venta, clasificación de clientes y cartera',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PE" className={`${oswald.variable} ${poppins.variable}`}>
      <body className="min-h-screen bg-gray-50 font-poppins text-gray-900">{children}</body>
    </html>
  )
}
