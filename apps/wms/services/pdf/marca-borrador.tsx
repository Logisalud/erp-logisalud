import { Text, View } from '@react-pdf/renderer'
import { MARCA_BORRADOR } from '@/domain/borrador-documento'

/** Cinta de «BORRADOR, pendiente de firmas» que se repite arriba de cada página, y una marca de agua en diagonal. Solo se usa si faltan firmas. */
export function MarcaBorrador({ detalle }: { detalle?: string }) {
  return (
    <>
      <View fixed style={{ backgroundColor: '#FEF3C7', border: '1pt solid #B45309', padding: 4, marginBottom: 6 }}>
        <Text style={{ color: '#92400E', fontFamily: 'Helvetica-Bold', fontSize: 10, textAlign: 'center' }}>{MARCA_BORRADOR}</Text>
        {detalle ? <Text style={{ color: '#92400E', fontSize: 7.5, textAlign: 'center', marginTop: 1 }}>{detalle}</Text> : null}
      </View>
      <View fixed style={{ position: 'absolute', top: 260, left: 0, right: 0, alignItems: 'center' }}>
        <Text style={{ fontSize: 58, fontFamily: 'Helvetica-Bold', color: '#FDE68A', opacity: 0.55, transform: 'rotate(-22deg)' }}>BORRADOR</Text>
      </View>
    </>
  )
}
