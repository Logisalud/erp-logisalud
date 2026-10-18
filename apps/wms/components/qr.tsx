'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/** El QR de un código (se dibuja en el navegador; el código siempre se muestra también en texto). */
export function Qr({ codigo, tamano = 112 }: { codigo: string; tamano?: number }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => { let vivo = true; QRCode.toDataURL(codigo, { margin: 1, width: tamano * 3, errorCorrectionLevel: 'M' }).then((u) => { if (vivo) setSrc(u) }); return () => { vivo = false } }, [codigo, tamano])
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} width={tamano} height={tamano} alt={`Código QR del bulto ${codigo}`} data-testid="qr" /> : <span className="block bg-gray-100" style={{ width: tamano, height: tamano }} aria-hidden />
}
