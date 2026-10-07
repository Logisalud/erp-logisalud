import type { Metadata, Viewport } from 'next'
import { Oswald, Poppins } from 'next/font/google'
import { modoDemoActivo } from '@/lib/demo'
import { BannerDemo } from '@/components/banner-demo'
import './globals.css'

const oswald = Oswald({ subsets: ['latin'], variable: '--font-oswald', display: 'swap' })
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Almacén — LOGISALUD',
  description: 'WMS de Logisalud: dónde está cada producto, en qué estado y de quién es.',
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

// Contrato de diseño (Impeccable, modo Operar, mundo de marca heredado):
// MUNDO: almacén Lurín dibujado como plano vivo — gris verdoso de marca, verde Logisalud como único acento de acción.
// CAPAS: el mapa responde preguntas (¿de quién?, ¿en qué estado?, ¿qué tan lleno?) y la leyenda lleva los números.
// ESTADO: siempre texto + ícono + color; propietario siempre con letra. Nada decorativo: lo que brilla es lo que pide atención.
// MOMENTO: buscar un producto y ver cómo el almacén se atenúa y se iluminan sus ubicaciones.
const CONTRATO =
  '<!-- WMS Logisalud · modo Operar · mundo de marca heredado · estructura: capas primero (el mapa responde por capas; la leyenda lleva los números) · estado = texto + ícono + color · momento: buscar y ver iluminarse las ubicaciones -->'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const demo = modoDemoActivo()
  return (
    <html lang="es" className={`${oswald.variable} ${poppins.variable}`}>
      <body className={`min-h-screen bg-gray-50 font-body text-gray-900 ${demo ? 'con-banner' : ''}`}>
        <span hidden dangerouslySetInnerHTML={{ __html: CONTRATO }} />
        {demo && <BannerDemo />}
        {children}
      </body>
    </html>
  )
}
