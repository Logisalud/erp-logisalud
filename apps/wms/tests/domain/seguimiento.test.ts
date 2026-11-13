// Fase 4 · P9: reglas puras del seguimiento para el cliente.
import { describe, expect, it } from 'vitest'
import { CARITAS, enlaceWhatsApp, esEstadoFinal, ETIQUETA_HITO, ipDe, leerCsvContactos, lineaDeTiempo, mensajeDelEstado, normalizarNombre, normalizarPedido, OPCIONES_POR_DEFECTO, telefonoPeruano, textoVanDeRuta, textoEspera, TEXTO_ENLACE_INVALIDO, TEXTO_NO_DISPONIBLE, TEXTO_NO_ENCONTRADO, validarConsulta } from '@/domain/seguimiento'

const h = (estado: Parameters<typeof lineaDeTiempo>[0][number]['estado'], en: string) => ({ estado, en })

describe('línea de tiempo', () => {
  it('muestra los 5 pasos: los que ya ocurrieron con su hora y los demás pendientes; el último hecho es el actual', () => {
    const l = lineaDeTiempo([h('RECIBIDO', '2026-11-03T15:00:00Z'), h('PREPARANDO', '2026-11-04T14:00:00Z')])
    expect(l.map((p) => p.estado)).toEqual(['RECIBIDO', 'PREPARANDO', 'EN_CAMINO', 'LLEGO', 'ENTREGADO'])
    expect(l.map((p) => p.hecho)).toEqual([true, true, false, false, false])
    expect(l.find((p) => p.actual)!.estado).toBe('PREPARANDO')
    expect(l[2].en).toBeUndefined()
  })
  it('entregado cierra la línea; no entregado y cancelado reemplazan el último paso y se marcan como problema', () => {
    expect(lineaDeTiempo([h('RECIBIDO', 'a'), h('ENTREGADO', 'z')]).find((p) => p.actual)!.estado).toBe('ENTREGADO')
    const ne = lineaDeTiempo([h('RECIBIDO', 'a'), h('EN_CAMINO', 'b'), h('NO_ENTREGADO', 'c')])
    expect(ne.map((p) => p.estado)).toEqual(['RECIBIDO', 'PREPARANDO', 'EN_CAMINO', 'LLEGO', 'NO_ENTREGADO'])
    expect(ne.at(-1)).toMatchObject({ hecho: true, actual: true, problema: true })
    expect(lineaDeTiempo([h('RECIBIDO', 'a'), h('CANCELADO', 'b')]).at(-1)).toMatchObject({ estado: 'CANCELADO', problema: true })
  })
  it('sin parada en una ruta de Logisalud (provincia por agencia) termina en «En camino»: no se inventan pasos', () => {
    const l = lineaDeTiempo([h('RECIBIDO', 'a'), h('PREPARANDO', 'b'), h('EN_CAMINO', 'c')], false)
    expect(l.map((p) => p.estado)).toEqual(['RECIBIDO', 'PREPARANDO', 'EN_CAMINO'])
    expect(l.at(-1)).toMatchObject({ actual: true, hecho: true })
    expect(mensajeDelEstado([h('RECIBIDO', 'a'), h('EN_CAMINO', 'c')], false)).toMatchObject({ clave: 'EN_CAMINO', final: true })
  })
  it('solo trae estados con fecha y hora: ninguna etiqueta habla de hora estimada, precios, lotes ni personal', () => {
    const todo = [...Object.values(ETIQUETA_HITO), TEXTO_NO_DISPONIBLE, TEXTO_NO_ENCONTRADO, TEXTO_ENLACE_INVALIDO, textoEspera(60)].join(' ').toLowerCase()
    for (const prohibida of ['estimad', 'precio', 'lote', 'conductor', 'chofer', 'auxiliar', 'placa']) expect(todo).not.toContain(prohibida)
  })
})

describe('mensaje grande por estado', () => {
  const t = (hitos: ReturnType<typeof h>[]) => mensajeDelEstado(hitos)
  it('cada estado tiene su frase humana y la hora de su último paso', () => {
    expect(t([])).toMatchObject({ clave: 'REGISTRADO', titulo: 'Tu pedido está registrado' })
    expect(t([h('RECIBIDO', 'r')])).toMatchObject({ titulo: 'Recibimos tu pedido', hora: 'r', final: false })
    expect(t([h('RECIBIDO', 'r'), h('PREPARANDO', 'p')])).toMatchObject({ titulo: 'Estamos preparando tu pedido', hora: 'p' })
    expect(t([h('RECIBIDO', 'r'), h('PREPARANDO', 'p'), h('EN_CAMINO', 'c')])).toMatchObject({ titulo: 'Tu pedido va en camino', hora: 'c', final: false })
    expect(t([h('EN_CAMINO', 'c'), h('LLEGO', 'l')])).toMatchObject({ titulo: 'Tu pedido llegó a tu dirección', hora: 'l' })
    expect(t([h('LLEGO', 'l'), h('ENTREGADO', 'e')])).toMatchObject({ titulo: 'Entregado', hora: 'e', final: true })
  })
  it('no entregado o cancelado: mensaje neutro, sin motivos internos, y la pantalla deja de actualizarse', () => {
    const ne = t([h('LLEGO', 'l'), h('NO_ENTREGADO', 'n')])
    expect(ne).toMatchObject({ titulo: 'No pudimos completar la entrega', detalle: 'Tu vendedor te contactará.', final: true })
    expect(esEstadoFinal([h('NO_ENTREGADO', 'n')])).toBe(true)
    expect(t([h('RECIBIDO', 'r'), h('CANCELADO', 'x')]).final).toBe(true)
    expect(esEstadoFinal([h('EN_CAMINO', 'c')])).toBe(false)
  })
})

describe('WhatsApp, caritas y contactos', () => {
  it('el enlace dice «Hola [vendedor], consulto por mi pedido [n.°]» con el primer nombre del vendedor', () => {
    const url = enlaceWhatsApp({ nombre: 'JUAN PÉREZ GÓMEZ', telefono: '+51987654321', esVendedor: true }, 'PED-0123')
    expect(url).toBe(`https://wa.me/51987654321?text=${encodeURIComponent('Hola Juan, consulto por mi pedido PED-0123')}`)
    expect(enlaceWhatsApp({ nombre: 'Logisalud', telefono: '+51900111222', esVendedor: false }, 'PED-9')).toContain(encodeURIComponent('Hola Logisalud, consulto'))
  })
  it('teléfonos peruanos: se normalizan a +51 y lo demás se rechaza', () => {
    expect(telefonoPeruano('987 654 321')).toBe('+51987654321'); expect(telefonoPeruano('+51 987654321')).toBe('+51987654321'); expect(telefonoPeruano('51987654321')).toBe('+51987654321')
    expect(telefonoPeruano('12345')).toBeNull(); expect(telefonoPeruano('')).toBeNull()
  })
  it('el CSV de contactos acepta coma, punto y coma o tabulador, con o sin encabezado y comillas', () => {
    expect(leerCsvContactos('Nombre,Teléfono\n"Juan Pérez",987654321\nAna López;912345678\n\n')).toEqual([{ nombre: 'Juan Pérez', telefono: '987654321' }, { nombre: 'Ana López', telefono: '912345678' }])
    expect(leerCsvContactos('\uFEFFLuis\t999888777')).toEqual([{ nombre: 'Luis', telefono: '999888777' }])
    expect(normalizarNombre('  JOSÉ  Muñoz ')).toBe('jose munoz')
  })
  it('hay tres caritas con texto y el parámetro «guía visible» y el piloto tienen valor de fábrica', () => {
    expect(CARITAS.map((c) => c.etiqueta)).toEqual(['Muy bien', 'Regular', 'Mal'])
    expect(OPCIONES_POR_DEFECTO).toMatchObject({ rutaVisible: true, guiaVisible: 'SIEMPRE' })
    expect(textoVanDeRuta({ atendidas: 2, total: 6 })).toBe('Van 2 de 6 entregas de tu ruta')
  })
})

describe('lo que se escribe', () => {
  it('pide el número de pedido y un RUC de 11 números; normaliza mayúsculas y espacios', () => {
    expect(validarConsulta('', '')).toEqual({ pedido: 'Escribe el número de tu pedido.', ruc: 'El RUC tiene 11 números.' })
    expect(validarConsulta('PED-1', '123')).toEqual({ ruc: 'El RUC tiene 11 números.' })
    expect(validarConsulta(' ped-0123 ', '2051 2345 671')).toEqual({})
    expect(normalizarPedido(' ped 0123 ')).toBe('PED0123')
  })
  it('la espera se dice en minutos, en lenguaje llano', () => {
    expect(textoEspera(30)).toBe('Hiciste demasiados intentos. Por seguridad, espera 1 minuto y vuelve a intentar.')
    expect(textoEspera(14 * 60 + 5)).toContain('15 minutos')
  })
  it('la IP es la primera de x-forwarded-for', () => {
    expect(ipDe('1.2.3.4, 10.0.0.1')).toBe('1.2.3.4'); expect(ipDe(null, '9.9.9.9')).toBe('9.9.9.9'); expect(ipDe(undefined)).toBe('')
  })
})

describe('estado de pagos (0068)', () => {
  it('los textos del cliente: alegre si está al día, claro y sin dramatismo si debe', async () => {
    const { TITULO_AL_DIA, TEXTO_AL_DIA, TITULO_MOROSO, TEXTO_MOROSO, soles, textoAtraso, textoCantidadVencidos } = await import('@/domain/seguimiento')
    expect(TITULO_AL_DIA).toBe('¡Estás al día en tus pagos! 😊'); expect(TEXTO_AL_DIA).toBe('Gracias por la confianza.')
    expect(TITULO_MOROSO).toBe('Tus pagos pendientes'); expect(TEXTO_MOROSO).toMatch(/Si ya pagaste.*avísanos.*Gracias por tu comprensión/); expect(TEXTO_MOROSO).not.toMatch(/asesor/i)
    expect(soles(1234.5)).toBe('S/ 1,234.50'); expect(soles(0)).toBe('S/ 0.00'); expect(soles(99.999)).toBe('S/ 100.00')
    expect(textoAtraso(1)).toBe('1 día'); expect(textoAtraso(95)).toBe('95 días')
    expect(textoCantidadVencidos(1)).toBe('1 documento vencido'); expect(textoCantidadVencidos(3)).toBe('3 documentos vencidos')
  })
})
