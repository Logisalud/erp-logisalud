import type { Metadata } from 'next';
import { Oswald, Poppins } from 'next/font/google';
import './globals.css';

const oswald = Oswald({
  subsets: ['latin'],
  variable: '--font-oswald',
  display: 'swap',
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ERP LOGISALUD',
  description: 'Cuentas por Cobrar',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${oswald.variable} ${poppins.variable}`}>
      <body className="bg-gray-50 text-gray-900 min-h-screen font-poppins">{children}</body>
    </html>
  );
}
