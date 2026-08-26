import type { Metadata, Viewport } from "next";
import { Oswald, Poppins } from "next/font/google";
import "./globals.css";

const oswald = Oswald({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-oswald",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "LOGISALUD Pedidos",
  description:
    "Toma, validación, despacho y documentación electrónica de pedidos — LOGISALUD",
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
      <body className={`${oswald.variable} ${poppins.variable} antialiased`}>
        {/*
          Contrato de dirección de diseño. Va como comentario HTML real —no
          como comentario JSX, que React descarta al renderizar— para que
          sobreviva al build de producción y se pueda auditar en el markup.
        */}
        <div
          hidden
          dangerouslySetInnerHTML={{
            __html: `<!--
  THESIS: la toma de pedido es UN documento continuo que se va llenando, no un
  formulario que redirige a otro; rechaza el paso a paso con pantalla intermedia
  que la categoría da por sentado.
  OWN-WORLD: el estándar de la categoría ejecutado a fondo — paneles blancos sobre
  slate-50, borde 1px, sombra con desplazamiento y desenfoque reales, verde #4BB168
  solo para la acción primaria, teal #4ABCC2 solo informativo, Oswald en títulos y
  Poppins en cuerpo, cifras tabulares, íconos dibujados.
  STORY: el vendedor, de pie en la botica, encuentra al cliente, carga las líneas y
  canta el total sin perderlo de vista.
  FIRST VIEWPORT: encabezado colapsado con cliente y RUC arriba, agregar producto
  debajo, líneas densas, y el total fijo al pie con el envío.
  FORM: candidato 5 de la lista propia; el usuario tomó la salida canon sobre la
  dirección sorteada. Clave de sorteo e3cb6cc3.
  FINISH: unreviewed and undocumented is unfinished; this build ends with the finish
  review, the verdict, and DESIGN.md.
-->` ,
          }}
        />
        {children}
      </body>
    </html>
  );
}
