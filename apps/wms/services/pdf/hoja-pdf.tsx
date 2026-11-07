import { Image, Text, View } from '@react-pdf/renderer'
import type { ModeloHoja, RegionHoja } from '../formatos/hoja'

// Dibuja una hoja de Excel (su rejilla ya leída) en un PDF: mismas posiciones, combinaciones, bordes, rellenos y textos. Todo se escala por un solo factor para que entre en la página.

const fuente = (r: RegionHoja) => (r.fuente.negrita && r.fuente.cursiva ? 'Helvetica-BoldOblique' : r.fuente.negrita ? 'Helvetica-Bold' : r.fuente.cursiva ? 'Helvetica-Oblique' : 'Helvetica')

/** Tamaño de letra que hace entrar el texto en una sola línea (como «Reducir hasta ajustar» de Excel), sin bajar de 5 pt. */
function tamanoAjustado(r: RegionHoja, k: number): number {
  const base = r.fuente.tam * (r.fuente.angosta ? 0.86 : 1) * k
  if (r.ajustar || !r.texto) return base
  const ancho = (r.desborde - 3) * k
  const necesario = r.texto.length * base * (r.fuente.negrita ? 0.56 : 0.5)
  return necesario > ancho ? Math.max(5 * k, base * (ancho / necesario)) : base
}

export function HojaPdf({ modelo, k }: { modelo: ModeloHoja; k: number }) {
  return (
    <View style={{ width: modelo.ancho * k, height: modelo.alto * k, position: 'relative' }}>
      {modelo.regiones.map((r, i) => (
        <View key={i} style={{ position: 'absolute', left: r.x * k, top: r.y * k, width: r.w * k, height: r.h * k, backgroundColor: r.relleno }}>
          {r.texto ? (
            <View style={{ position: 'absolute', left: 0, top: 0, width: (r.ajustar ? r.w : r.desborde) * k, height: r.h * k, justifyContent: r.v_align === 'top' ? 'flex-start' : r.v_align === 'middle' ? 'center' : 'flex-end', paddingLeft: (1.5 + r.sangria * 6) * k, paddingRight: 1.5 * k }}>
              <Text style={{ fontFamily: fuente(r), fontSize: tamanoAjustado(r, k), textAlign: r.h_align, lineHeight: 1.05 }}>{r.texto}</Text>
            </View>
          ) : null}
          {/* los bordes se dibujan centrados sobre la arista, así el borde que comparten dos celdas queda en una sola línea */}
          {r.bordes.t && <View style={{ position: 'absolute', left: 0, top: -r.bordes.t.w * k / 2, width: r.w * k, height: r.bordes.t.w * k, backgroundColor: '#000' }} />}
          {r.bordes.b && <View style={{ position: 'absolute', left: 0, top: r.h * k - r.bordes.b.w * k / 2, width: r.w * k, height: r.bordes.b.w * k, backgroundColor: '#000' }} />}
          {r.bordes.l && <View style={{ position: 'absolute', top: 0, left: -r.bordes.l.w * k / 2, width: r.bordes.l.w * k, height: r.h * k, backgroundColor: '#000' }} />}
          {r.bordes.r && <View style={{ position: 'absolute', top: 0, left: r.w * k - r.bordes.r.w * k / 2, width: r.bordes.r.w * k, height: r.h * k, backgroundColor: '#000' }} />}
        </View>
      ))}
      {modelo.imagenes.map((im, i) => <Image key={i} src={im.datos} style={{ position: 'absolute', left: im.x * k, top: im.y * k, width: im.w * k, height: im.h * k, objectFit: 'contain' }} />)}
    </View>
  )
}
