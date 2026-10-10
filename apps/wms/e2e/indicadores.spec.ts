// Indicadores (KPI): las 3 tarjetas de Inicio y la pantalla Indicadores dentro de Reportes, en los 4 viewports.
// Las tarjetas muestran hacia dónde va cada indicador (color por tendencia, con ícono y palabra) y su mini gráfico de 30 días.
import { expect, test } from '@playwright/test'
import { capturar, entrarComo, esTelefono, sinDesborde } from './ayudas'

test.describe.configure({ mode: 'serial' })

const INICIO = ['exactitud', 'vencimientos', 'disponibilidad']

test.describe('Inicio: Inventario y almacén', () => {
  test('3 indicadores con valor, tendencia con ícono y palabra, mini gráfico, «¿Cómo se calcula?» y enlace a su reporte; el bloque de unidades por estado ya no está', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    const grupo = page.getByTestId('kpis-inicio')
    await expect(grupo).toBeVisible()
    await expect(grupo.getByRole('heading', { name: 'Inventario y almacén' })).toBeVisible()
    const tarjetas = grupo.getByTestId('kpi')
    await expect(tarjetas).toHaveCount(3)
    for (const [i, clave] of INICIO.entries()) await expect(tarjetas.nth(i)).toHaveAttribute('data-kpi', clave)
    await expect(page.getByText('Unidades por estado')).toHaveCount(0)
    await expect(page.getByText('Ubicaciones usadas por propietario')).toHaveCount(0)
    // cada tarjeta: valor (o por qué no hay) y variación frente al periodo anterior
    for (let i = 0; i < 3; i++) {
      const t = tarjetas.nth(i)
      await expect(t.locator('[data-testid="kpi-valor"], [data-testid="kpi-sin-datos"]')).toBeVisible()
      // hacia dónde va: ícono + cambio + palabra (el color nunca es la única señal)
      const v = t.getByTestId('kpi-variacion')
      await expect(v).toContainText(/mejoró|empeoró|Sin cambio|Sin periodo anterior|No hay|No hubo/)
      if ((await v.getAttribute('data-efecto')) !== null) await expect(v.locator('svg')).toHaveCount(1)
      await expect(t.getByTestId('kpi-tendencia')).toBeVisible() // mini gráfico de 30 días
    }
    await expect(tarjetas.nth(1)).toContainText(/\d+ lotes? · [\d.,]+ u/) // por vencer y vencidos: lotes y unidades
    await expect(tarjetas.nth(0)).toContainText(/\d+(\.\d)? %/) // exactitud
    await expect(tarjetas.nth(2)).toContainText(/\d+(\.\d)? h/) // tiempo de disponibilidad, en horas
    await expect(tarjetas.nth(2).getByTestId('kpi-detalle')).toContainText(/\d+ recepci/) // con detalle por propietario
    await expect(tarjetas.nth(2).getByTestId('kpi-variacion')).toContainText(/mejoró/) // la demo acortó su cuarentena
    // ¿Cómo se calcula?: fórmula y datos
    await tarjetas.nth(1).getByTestId('kpi-como').locator('summary').click()
    await expect(tarjetas.nth(1).getByTestId('kpi-como')).toContainText('Fórmula')
    await expect(tarjetas.nth(1).getByTestId('kpi-como')).toContainText('Con estos datos')
    // sin semáforos ni metas: nada de «meta» ni de colores de bueno o malo en las variaciones
    await expect(grupo).not.toContainText(/meta:|objetivo/i)
    // lo que necesita atención hoy sigue; los KPI van encima
    await expect(page.getByTestId('atencion')).toBeVisible()
    const yGrupo = (await grupo.boundingBox())!.y; const yAtencion = (await page.getByTestId('atencion').boundingBox())!.y
    expect(yGrupo).toBeLessThan(yAtencion)
    await expect(page.getByTestId('ver-todos-indicadores')).toBeVisible()
    await sinDesborde(page)
    await capturar(page, info, 'inicio-kpis')
    await capturar(page, info, 'inicio-kpis-completa', { completa: true })
  })

  test('en el teléfono las 3 tarjetas van en una columna, encima de los pendientes; en pantallas grandes, en una fila', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    const c = await page.getByTestId('kpis-inicio').getByTestId('kpi').evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y) } }))
    expect(c).toHaveLength(3)
    if (esTelefono(info)) {
      expect(new Set(c.map((x) => x.x)).size).toBe(1)
      expect(c[1].y).toBeGreaterThan(c[0].y); expect(c[2].y).toBeGreaterThan(c[1].y)
      const yAtencion = (await page.getByTestId('atencion').boundingBox())!.y
      expect(yAtencion).toBeGreaterThan(c[2].y)
    } else {
      expect(new Set(c.map((x) => x.y)).size).toBe(1)
      expect(c[1].x).toBeGreaterThan(c[0].x); expect(c[2].x).toBeGreaterThan(c[1].x)
    }
    await expect(page.getByTestId('atencion')).toBeVisible()
  })

  test('un clic abre el reporte filtrado: vencimientos (90 días o menos) y recepciones con diferencia', async ({ page }) => {
    await entrarComo(page, 'jefe_almacen')
    await page.getByTestId('kpis-inicio').locator('[data-kpi="vencimientos"]').getByTestId('kpi-enlace').click()
    await expect(page).toHaveURL(/\/wms\/reportes\/vencimientos\?diasHasta=90/)
    await expect(page.getByTestId('filtro-diasHasta')).toHaveValue('90')
    await expect(page.getByTestId('titulo-reporte')).toHaveText('Vencimientos')
    await page.goto('/wms')
    await page.getByTestId('kpis-inicio').locator('[data-kpi="disponibilidad"]').getByTestId('kpi-enlace').click()
    await expect(page).toHaveURL(/\/wms\/reportes\/recepciones\?/)
    await expect(page.getByTestId('titulo-reporte')).toHaveText('Recepciones')
    await page.goto('/wms')
    await page.getByTestId('kpis-inicio').locator('[data-kpi="exactitud"]').getByTestId('kpi-enlace').click()
    await expect(page).toHaveURL(/\/wms\/reportes\/exactitud\?desde=/)
  })

  test('el contador (auxiliar) no ve los indicadores: no puede leer saldos; Dirección Técnica sí', async ({ page }) => {
    await entrarComo(page, 'auxiliar')
    await expect(page.getByTestId('kpis-inicio')).toHaveCount(0)
    await expect(page.getByTestId('atencion')).toBeVisible()
    await page.goto('/wms/reportes/indicadores')
    await expect(page).toHaveURL(/\/wms\/reportes\/?$/)
    await page.getByTestId('cambiar-rol-demo').selectOption('direccion_tecnica')
    await page.waitForTimeout(400)
    await page.goto('/wms')
    await expect(page.getByTestId('kpis-inicio')).toBeVisible()
  })
})

test.describe('Reportes → Indicadores', () => {
  test('todos los indicadores por tema, con «En Inicio» en los 3, las mismas tarjetas que Inicio y el grupo Despacho previsto', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/reportes')
    await page.getByTestId('indicadores-enlace').click()
    await expect(page.getByTestId('titulo-indicadores')).toBeVisible()
    for (const t of ['Inventario', 'Recepciones', 'Calidad', 'Movimientos y conteos', 'Operación diaria', 'Despacho']) await expect(page.locator(`[data-testid="grupo-kpi"][data-grupo="${t}"]`)).toBeVisible()
    await expect(page.getByTestId('kpi')).toHaveCount(18)
    await expect(page.getByTestId('kpi-en-inicio')).toHaveCount(3)
    await expect(page.locator('[data-kpi="ocupacion"]').getByTestId('kpi-en-inicio')).toHaveCount(0) // salió de Inicio: queda aquí
    await expect(page.locator('[data-kpi="recepciones-dif"]').getByTestId('kpi-en-inicio')).toHaveCount(0)
    // el mismo componente que Inicio: tendencia con ícono y palabra, y mini gráfico
    const exa = page.locator('[data-kpi="exactitud"]')
    await expect(exa.getByTestId('kpi-variacion')).toContainText(/mejoró|empeoró|Sin cambio/)
    await expect(exa.getByTestId('kpi-tendencia')).toBeVisible()
    expect(await page.getByTestId('kpi-tendencia').count()).toBeGreaterThan(8)
    for (const c of INICIO) await expect(page.locator(`[data-kpi="${c}"]`).getByTestId('kpi-en-inicio')).toBeVisible()
    await expect(page.locator('[data-kpi="tiempo-cuarentena"]').getByTestId('kpi-en-inicio')).toHaveCount(0) // solo en Reportes
    // Despacho: los 4 previstos, sin valores todavía
    const despacho = page.locator('[data-testid="grupo-kpi"][data-grupo="Despacho"]')
    await expect(despacho.getByTestId('kpi-previsto')).toHaveCount(4)
    await expect(despacho).toContainText('OTIF'); await expect(despacho).toContainText('Nivel de servicio'); await expect(despacho).toContainText('Exactitud de despacho'); await expect(despacho).toContainText('Tiempo de preparación')
    await expect(despacho.getByTestId('kpi')).toHaveCount(0)
    // cada tarjeta explica cómo se calcula y lleva a su reporte
    const una = page.locator('[data-kpi="ocupacion"]')
    await una.getByTestId('kpi-como').locator('summary').click()
    await expect(una.getByTestId('kpi-como')).toContainText('Fórmula')
    await expect(una.getByTestId('kpi-detalle')).toContainText(/\d+ de \d+/) // detalle por propietario
    await sinDesborde(page)
    await capturar(page, info, 'indicadores', { completa: true })
    if (esTelefono(info)) { // tarjetas en una columna
      const xs = await page.getByTestId('kpi').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().x)))
      expect(new Set(xs).size).toBe(1)
    }
  })

  test('el periodo (7, 30 y 90 días o un rango) y el propietario cambian los indicadores y viajan en la dirección', async ({ page }) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/reportes/indicadores')
    await expect(page.getByTestId('periodo-actual')).toContainText('30 días')
    await page.getByTestId('periodo-7').click()
    await expect(page).toHaveURL(/dias=7/)
    await expect(page.getByTestId('periodo-actual')).toContainText('7 días')
    await page.getByTestId('periodo-90').click()
    await expect(page.getByTestId('periodo-actual')).toContainText('90 días')
    await expect(page.locator('[data-kpi="exactitud"] [data-testid="kpi-enlace"]')).toHaveAttribute('href', /desde=\d{4}-\d{2}-\d{2}&hasta=\d{4}-\d{2}-\d{2}/)
    // rango de fechas
    await page.getByTestId('periodo-rango').click()
    await page.getByTestId('rango-desde').fill('2026-09-01')
    await page.getByTestId('rango-hasta').fill('2026-09-15')
    await page.getByTestId('rango-aplicar').click()
    await expect(page).toHaveURL(/desde=2026-09-01&hasta=2026-09-15/)
    await expect(page.getByTestId('periodo-actual')).toContainText('15 días')
    // propietario: los enlaces a los reportes lo llevan y los indicadores sin propietario avisan
    const opciones = await page.getByTestId('filtro-propietario-ind').locator('option').allTextContents()
    const prop = opciones.find((o) => o !== 'Todos')!
    await page.getByTestId('filtro-propietario-ind').selectOption(prop)
    await expect(page).toHaveURL(new RegExp(`propietario=${encodeURIComponent(prop)}`))
    await expect(page.getByTestId('periodo-actual')).toContainText(prop)
    await expect(page.locator('[data-kpi="ocupacion"] [data-testid="kpi-enlace"]')).toHaveAttribute('href', new RegExp(`propietario=${encodeURIComponent(prop)}`))
    await page.locator('[data-kpi="revision-diaria"]').getByTestId('kpi-como').locator('summary').click()
    await expect(page.locator('[data-kpi="revision-diaria"]')).toContainText('no se filtra por propietario')
  })
})
