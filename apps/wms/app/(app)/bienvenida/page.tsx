import { exigirContexto } from '@/lib/contexto'
import { modoPilotoActivo } from '@/lib/modo-piloto'
import { Bienvenida } from '@/components/piloto/bienvenida'
import { aceptarBienvenidaPilotoAccion } from '@/app/acciones-piloto'

export const metadata = { title: 'Esto es un piloto — WMS LOGISALUD' }

export default async function PaginaBienvenida() {
  await exigirContexto()
  return <Bienvenida piloto={await modoPilotoActivo()} aceptar={aceptarBienvenidaPilotoAccion} />
}
