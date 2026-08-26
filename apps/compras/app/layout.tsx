import type { Metadata } from 'next'
import { Oswald, Poppins } from 'next/font/google'
import './globals.css'

const oswald = Oswald({ subsets: ['latin'], variable: '--font-oswald', display: 'swap' })
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Compras y Pagos — ERP LOGISALUD',
  description: 'Compras, Almacén, Cuentas por Pagar, Gastos, Caja Chica',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${oswald.variable} ${poppins.variable}`}>
      <body className="min-h-screen bg-gray-50 font-body text-gray-900">{children}</body>
    </html>
  )
}
