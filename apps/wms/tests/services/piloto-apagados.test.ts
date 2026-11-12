// Fase 4 · P1: lo que el piloto con producción REAL deja APAGADO. Pruebas de código (sin red ni base): la única salida HTTP hacia afuera es Nubefact (cuenta DEMO) y la lectura
// firmada de Pedidos; nada escribe en Pedidos, no hay correos ni enlaces para clientes, el interruptor de clientes sigue apagado y la 0008 no está en la cadena.
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TEXTO_PEDIDOS_RETENIDO } from '@/domain/modo-piloto'
import { NotificadorBloqueadoPiloto, notificadorPedidos, NotificadorPedidosHttp } from '@/services/pedidos/notificar'
import { bloqueoNubefactReal } from '@/services/nubefact/entorno'

const RAIZ = resolve(__dirname, '../..')
const archivos = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.name === 'node_modules' || d.name === '.next' ? [] : d.isDirectory() ? archivos(join(dir, d.name)) : [join(dir, d.name)]))
const codigo = (carpetas: string[]) => carpetas.flatMap((c) => archivos(join(RAIZ, c))).filter((f) => /\.tsx?$/.test(f)).map((f) => ({ ruta: f.slice(RAIZ.length + 1), texto: readFileSync(f, 'utf8') }))

afterEach(() => { delete process.env.WMS_MODO_PILOTO; delete process.env.WMS_PEDIDOS_URL; delete process.env.WMS_PEDIDOS_SECRETO; vi.restoreAllMocks() })

describe('P1(a): el WMS no envía nada a Pedidos en el piloto', () => {
  it('lista cerrada de las salidas HTTP del código del WMS: solo Nubefact, la lectura de Pedidos y el aviso a Pedidos (retenido en el piloto)', () => {
    const conFetch = codigo(['app', 'services', 'domain', 'lib', 'components']).filter((f) => /\bfetch\s*\(|fetchFn\s*\?\?\s*fetch|XMLHttpRequest|axios|\bgot\(/.test(f.texto)).map((f) => f.ruta).sort()
    expect(conFetch).toEqual(['components/inventario/informe-carga.tsx', 'services/nubefact/http.ts', 'services/pedidos/fuente-pedidos.ts', 'services/pedidos/notificar.ts'])
    // (el informe de la carga llama a su propia ruta del WMS, mismo origen: no sale a ningún servicio externo)
    expect(readFileSync(join(RAIZ, 'components/inventario/informe-carga.tsx'), 'utf8')).toContain('fetch(`${base}/carga-inicial/informe`')
    // la lectura de Pedidos es solo GET; el único POST hacia Pedidos es el aviso, que pasa por la retención del piloto
    expect(readFileSync(join(RAIZ, 'services/pedidos/fuente-pedidos.ts'), 'utf8')).not.toMatch(/method:\s*'(POST|PUT|PATCH|DELETE)'/)
    expect(readFileSync(join(RAIZ, 'services/pedidos/notificar.ts'), 'utf8').match(/method:\s*'POST'/g)).toHaveLength(1)
    const usanNotificador = codigo(['app', 'services', 'components', 'lib']).filter((f) => /notificadorPedidos\(\)|NotificadorPedidosHttp/.test(f.texto) && !f.ruta.endsWith('pedidos/notificar.ts')).map((f) => f.ruta)
    expect(usanNotificador).toEqual(['services/guia-electronica.ts'])
    expect(readFileSync(join(RAIZ, 'services/guia-electronica.ts'), 'utf8')).toMatch(/if \(await modoPilotoActivo\(\)\) return \{ enviados: 0, pendientes: 0, retenidos: true/)
  })
  it('con WMS_MODO_PILOTO=1 el notificador es el bloqueado: no llama a la red aunque estén WMS_PEDIDOS_URL y el secreto', async () => {
    process.env.WMS_MODO_PILOTO = '1'; process.env.WMS_PEDIDOS_URL = 'https://pedidos.ejemplo.pe/api'; process.env.WMS_PEDIDOS_SECRETO = 'x'
    const espia = vi.spyOn(globalThis, 'fetch')
    const n = notificadorPedidos()
    expect(n).toBeInstanceOf(NotificadorBloqueadoPiloto)
    expect(n).not.toBeInstanceOf(NotificadorPedidosHttp)
    expect(await n.enviar({ id: 'e', tipo: 'GUIA_EMITIDA', creadoEn: '2026-11-04T10:00:00Z', payload: { numero_guia: 'TTT1-1' } } as never)).toEqual({ ok: false, mensaje: TEXTO_PEDIDOS_RETENIDO })
    expect(espia).not.toHaveBeenCalled()
  })
})

describe('P1(b): sin enlaces de seguimiento ni correos a clientes', () => {
  it('no hay ninguna librería ni llamada de correo, SMS o WhatsApp en el código del WMS', () => {
    const t = codigo(['app', 'services', 'domain', 'lib', 'components']).filter((f) => /nodemailer|sendgrid|resend|@aws-sdk\/client-ses|twilio|smtp|sendMail|api\.whatsapp|wa\.me/i.test(f.texto)).map((f) => f.ruta)
    // la única excepción: el aviso INTERNO «guía lista, ya puede facturar» (Resend) para quien factura, nunca para un cliente
    expect(t).toEqual(['services/avisos-guia.ts', 'services/correo/resend.ts'])
    const usanEnviarCorreo = codigo(['app', 'services', 'domain', 'lib', 'components']).filter((f) => /enviarCorreo\(/.test(f.texto) && !f.ruta.endsWith('correo/resend.ts')).map((f) => f.ruta)
    expect(usanEnviarCorreo).toEqual(['services/avisos-guia.ts'])
    const aviso = readFileSync(join(RAIZ, 'services/avisos-guia.ts'), 'utf8')
    expect(aviso).toMatch(/destinatariosDeAviso\(process\.env\.AVISO_FACTURACION_CORREOS\)/)     // los destinatarios salen SOLO de la configuración
    const dependencias = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')).dependencies as Record<string, string>
    expect(Object.keys(dependencias).filter((d) => /mail|sendgrid|resend|twilio|ses/i.test(d))).toEqual([])
  })
  it('la única página pública para clientes es /seguimiento (apagada en el piloto: la base responde «no disponible») y el interruptor de clientes está apagado en la cadena de migraciones', () => {
    const publicas = archivos(join(RAIZ, 'app')).filter((f) => /seguimiento|tracking/i.test(f)).map((f) => f.slice(RAIZ.length + 1).replace(/\\/g, '/')).sort()
    expect(publicas).toEqual(['app/seguimiento/[token]/page.tsx', 'app/seguimiento/acciones.ts', 'app/seguimiento/page.tsx'])
    const m = archivos(join(RAIZ, 'supabase/migrations')).map((f) => readFileSync(f, 'utf8')).join('\n')
    expect(m).toMatch(/'acceso_clientes_habilitado',\s*'false'/)
    expect(m).toMatch(/'seguimiento_cliente_habilitado',\s*'false'/)
    expect(m).not.toMatch(/update wms\.parametros set valor = 'true' where clave = '(acceso_clientes|seguimiento_cliente)_habilitado'/i)
    expect(m).toMatch(/not coalesce\(wms\._modo_piloto\(\), true\) and coalesce\(\(select valor from wms\.parametros where clave = 'seguimiento_cliente_habilitado'\)/)
  })
})

describe('P1(d,e): Nubefact solo DEMO y la 0008 fuera', () => {
  it('en el piloto el cliente real de Nubefact solo se permite con entorno DEMO (nunca PRODUCCION)', () => {
    expect(bloqueoNubefactReal(true, { NUBEFACT_ENTORNO: 'PRODUCCION', NUBEFACT_MODO: 'PRUEBA' })).toMatch(/\S/)
    expect(bloqueoNubefactReal(true, {})).toMatch(/\S/)
    expect(bloqueoNubefactReal(true, { NUBEFACT_ENTORNO: 'DEMO', NUBEFACT_MODO: 'PRODUCCION' })).toMatch(/\S/)
    expect(bloqueoNubefactReal(true, { NUBEFACT_ENTORNO: 'DEMO', NUBEFACT_MODO: 'PRUEBA' })).toBeNull()
  })
  it('la ventana del piloto no aplica la 0008: la guía y el ensayo la omiten', () => {
    const doc = readFileSync(join(RAIZ, '../../docs/wms/aplicar-migraciones.md'), 'utf8')
    expect(doc).toMatch(/0008/)
    // la cadena de la base de pruebas omite la 0008 salvo que se pida (`con0008`, ruta del go-live)
    expect(readFileSync(join(RAIZ, 'tests/db/helpers.ts'), 'utf8')).toMatch(/if \(opciones\.con0008\) await admin\.query\(SQL\.m0008\(\)\)/)
    expect(readFileSync(join(RAIZ, 'scripts/ensayo-migraciones.sh'), 'utf8')).toContain('WMS_OMITIR=0008')
  })
})

describe('P1: banner «PILOTO» en TODAS las pantallas', () => {
  it('el banner vive en el layout raíz (cubre el login, el sin acceso y toda la app) y ningún otro layout ni página lo oculta', () => {
    const raiz = readFileSync(join(RAIZ, 'app/layout.tsx'), 'utf8')
    expect(raiz).toMatch(/\{piloto && <BannerPiloto/)
    expect(raiz).toContain('await modoPilotoActivo()')
    const layouts = archivos(join(RAIZ, 'app')).filter((f) => /layout\.tsx$/.test(f)).map((f) => f.slice(RAIZ.length + 1)).sort()
    expect(layouts).toEqual(['app/(app)/layout.tsx', 'app/layout.tsx'])
    // las pantallas que se muestran sin la estructura normal (login, sin acceso) también cuelgan del layout raíz: no hay `app/<otro>/layout`
    expect(archivos(join(RAIZ, 'app')).filter((f) => /page\.tsx$/.test(f) && /banner-piloto|display:\s*none/.test(readFileSync(f, 'utf8')))).toEqual([])
  })
  it('la bienvenida del piloto existe, se enlaza desde el Inicio y el primer ingreso redirige a ella', () => {
    const inicio = readFileSync(join(RAIZ, 'app/(app)/page.tsx'), 'utf8')
    expect(inicio).toContain("redirect('/bienvenida')")
    expect(inicio).toContain('enlace-bienvenida-piloto')
    expect(readFileSync(join(RAIZ, 'app/(app)/bienvenida/page.tsx'), 'utf8')).toContain('aceptarBienvenidaPilotoAccion')
  })
})
