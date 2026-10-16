'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
declare global { interface Window { BarcodeDetector?: new (o: { formats: string[] }) => Detector } }

/** Lee el QR con la cámara del teléfono cuando el navegador lo permite (BarcodeDetector). Si no, el campo de texto sirve igual (lector de mano o escritura). */
export function LectorCamara({ alLeer }: { alLeer: (codigo: string) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [soporta, setSoporta] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => setSoporta(typeof window !== 'undefined' && !!window.BarcodeDetector && !!navigator.mediaDevices?.getUserMedia), [])

  useEffect(() => {
    if (!abierto) return
    let vivo = true; let flujo: MediaStream | null = null; let ultimo = ''; let ultimaVez = 0
    ;(async () => {
      try {
        flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (!vivo || !video.current) return
        video.current.srcObject = flujo; await video.current.play()
        const det = new window.BarcodeDetector!({ formats: ['qr_code'] })
        const vuelta = async () => {
          if (!vivo || !video.current) return
          try {
            const r = await det.detect(video.current)
            const v = r[0]?.rawValue
            if (v && (v !== ultimo || Date.now() - ultimaVez > 3000)) { ultimo = v; ultimaVez = Date.now(); alLeer(v) }
          } catch { /* un cuadro sin código: se sigue */ }
          setTimeout(vuelta, 300)
        }
        vuelta()
      } catch { setError('No pudimos abrir la cámara. Escribe el código del bulto.') }
    })()
    return () => { vivo = false; flujo?.getTracks().forEach((t) => t.stop()) }
  }, [abierto, alLeer])

  if (!soporta) return null
  return (
    <div>
      {!abierto
        ? <button type="button" className="btn-secondary" onClick={() => { setError(null); setAbierto(true) }} data-testid="abrir-camara"><Camera className="h-5 w-5" aria-hidden />Escanear con la cámara</button>
        : (
          <div className="space-y-2" data-testid="lector-camara">
            <video ref={video} className="aspect-video w-full max-w-md rounded-lg bg-gray-900 object-cover" muted playsInline aria-label="Vista de la cámara" />
            <button type="button" className="btn-secondary btn-sm" onClick={() => setAbierto(false)}><X className="h-4 w-4" aria-hidden />Cerrar la cámara</button>
          </div>
        )}
      {error && <p className="mt-2 text-sm text-red-800" role="alert">{error}</p>}
    </div>
  )
}
