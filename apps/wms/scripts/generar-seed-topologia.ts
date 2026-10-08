// Genera supabase/seeds/0001_topologia.sql desde config/topologia.ts, para que
// la topología tenga UNA sola fuente (la config) y el SQL no se escriba a mano.
//   npm run seed:topologia --workspace erp-logisalud-wms
// El SQL resultante es re-ejecutable (on conflict / where not exists).

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DOCUMENTOS_CONFIG, generarPosiciones, PROPIETARIOS_CONFIG } from '../config/topologia'
import { coordenadasCelda } from '../domain/mapa'

const q = (s: string | null | undefined) => (s == null ? 'null' : `'${s.replace(/'/g, "''")}'`)
const n = (v: number | null) => (v == null ? 'null' : String(v))

export function generarSqlTopologia(): string {
  const pos = generarPosiciones()
  const docPorCodigo = new Map(DOCUMENTOS_CONFIG.map((d) => [d.codigo, d]))
  const lineas: string[] = []
  lineas.push('-- GENERADO por scripts/generar-seed-topologia.ts desde config/topologia.ts. No editar a mano.')
  lineas.push('-- Datos de configuración (topología, propietarios, asignaciones). Se aplica a mano, re-ejecutable.')
  lineas.push('')
  lineas.push('insert into wms.propietarios (codigo, razon_social, ruc, es_dueno_almacen) values')
  lineas.push(PROPIETARIOS_CONFIG.map((p) => `  (${q(p.codigo)}, ${q(p.razonSocial)}, ${q(p.ruc)}, ${p.esDuenoAlmacen})`).join(',\n'))
  lineas.push('on conflict (codigo) do nothing;')
  lineas.push('')
  lineas.push('insert into wms.documentos_sustento (tipo, titulo, vigente_desde, archivo_ref, estado_confirmacion, nota) values')
  lineas.push(
    DOCUMENTOS_CONFIG.map(
      (d) => `  (${q(d.tipo)}, ${q(d.titulo)}, ${q(d.vigenteDesde)}, ${q(d.archivoRef)}, ${q(d.estadoConfirmacion)}, ${q(d.nota)})`,
    ).join(',\n'),
  )
  lineas.push('on conflict (titulo) do nothing;')
  lineas.push('')
  lineas.push('insert into wms.posiciones (codigo, rack, posicion, nivel, subnivel, forma, tipo_area, por_verificar, nota_verificacion) values')
  lineas.push(
    pos
      .map(
        (p) =>
          `  (${q(p.codigo)}, ${q(p.rack)}, ${n(p.posicion)}, ${n(p.nivel)}, ${n(p.subnivel)}, ${q(p.forma)}, ${q(p.tipoArea)}, ${p.porVerificar ? 'true' : 'false'}, ${q(p.porVerificar)})`,
      )
      .join(',\n'),
  )
  lineas.push('on conflict (codigo) do nothing;')
  lineas.push('')
  lineas.push('-- Asignaciones con vigencia y documento de sustento (las áreas compartidas no llevan).')
  lineas.push('insert into wms.asignaciones_posicion (posicion_id, propietario_id, desde, documento_id)')
  lineas.push('select p.id, o.id, v.desde::date, d.id')
  lineas.push('from (values')
  const asignadas = pos.filter((p) => p.propietario && p.documento)
  lineas.push(
    asignadas
      .map((p) => {
        const d = docPorCodigo.get(p.documento!)!
        return `  (${q(p.codigo)}, ${q(p.propietario)}, ${q(d.vigenteDesde)}, ${q(d.titulo)})`
      })
      .join(',\n'),
  )
  lineas.push(') as v(posicion, propietario, desde, documento)')
  lineas.push('join wms.posiciones p on p.codigo = v.posicion')
  lineas.push('join wms.propietarios o on o.codigo = v.propietario')
  lineas.push('join wms.documentos_sustento d on d.titulo = v.documento')
  lineas.push('where not exists (select 1 from wms.asignaciones_posicion a')
  lineas.push('                   where a.posicion_id = p.id and a.propietario_id = o.id and a.desde = v.desde::date);')
  lineas.push('')
  lineas.push('-- Geometría APROXIMADA del mapa (los planos no tienen escala exacta).')
  lineas.push('insert into wms.posicion_geometria (posicion_id, x, y, aproximada, plano_ref)')
  lineas.push('select p.id, v.x, v.y, true, \'planos 2026\'')
  lineas.push('from (values')
  lineas.push(
    pos
      .map((p) => {
        const { x, y } = coordenadasCelda(p.rack, p.posicion, p.codigo)
        return `  (${q(p.codigo)}, ${x}, ${y})`
      })
      .join(',\n'),
  )
  lineas.push(') as v(posicion, x, y)')
  lineas.push('join wms.posiciones p on p.codigo = v.posicion')
  lineas.push('on conflict (posicion_id) do nothing;')
  lineas.push('')
  return lineas.join('\n')
}

if (process.argv[1]?.endsWith('generar-seed-topologia.ts')) {
  const destino = resolve(__dirname, '../supabase/seeds/0001_topologia.sql')
  writeFileSync(destino, generarSqlTopologia(), 'utf8')
  console.log(`Escrito ${destino}`)
}
