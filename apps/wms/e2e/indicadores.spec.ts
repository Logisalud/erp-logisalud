// Indicadores (KPI): el grupo «Inventario y almacén» de Inicio y la pantalla Indicadores dentro de Reportes, en los 4 viewports.
import { expect, test } from '@playwright/test'
import { capturar, entrarComo, esTelefono, sinDesborde } from './ayudas'

test.describe.configure({ mode: 'serial' })

const INICIO = ['exactitud', 'vencimientos', 'ocupacion', 'recepciones-dif']

test.describe('Inicio: Inventario y almacén', () => {
  test('4 indicadores con valor, variación, «¿Cómo se calcula?» y enlace a su reporte; el bloque de unidades por estado ya no está', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    const grupo = page.getByTestId('kpis-inicio')
    await expect(grupo).toBeVisible()
    await expect(grupo.getByRole('heading', { name: 'Inventario y almacén' })).toBeVisible()
    const tarjetas = grupo.getByTestId('kpi')
    await expect(tarjetas).toHaveCount(4)
    for (const [i, clave] of INICIO.entries()) await expect(tarjetas.nth(i)).toHaveAttribute('data-kpi', clave)
    await expect(page.getByText('Unidades por estado')).toHaveCount(0)
    await expect(page.getByText('Ubicaciones usadas por propietario')).toHaveCount(0)
    // cada tarjeta: valor (o por qué no hay) y variación frente al periodo anterior
    for (let i = 0; i < 4; i++) {
      const t = tarjetas.nth(i)
      await expect(t.locator('[data-testid="kpi-valor"], [data-testid="kpi-sin-datos"]')).toBeVisible()
      await expect(t.getByTestId('kpi-variacion')).toContainText(/frente a|Sin periodo anterior|No hay|No hubo/)
    }
    await expect(tarjetas.nth(1)).toContainText(/\d+ lotes? · [\d.,]+ u/) // por vencer y vencidos: lotes y unidades
    await expect(tarjetas.nth(2)).toContainText(/\d+(\.\d)? %/) // ocupación
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

  test('en el teléfono las 4 tarjetas forman una cuadrícula de 2×2 encima de los pendientes', async ({ page }, info) => {
    test.skip(!esTelefono(info), 'La cuadrícula 2×2 es del teléfono')
    await entrarComo(page, 'jefe_almacen')
    const c = await page.getByTestId('kpis-inicio').getByTestId('kpi').evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y) } }))
    expect(c[0].y).toBe(c[1].y); expect(c[2].y).toBe(c[3].y)
    expect(c[2].y).toBeGreaterThan(c[0].y)
    expect(c[1].x).toBeGreaterThan(c[0].x); expect(c[2].x).toBe(c[0].x)
    await expect(page.getByTestId('atencion')).toBeVisible()
  })

  test('un clic abre el reporte filtrado: vencimientos (90 días o menos) y recepciones con diferencia', async ({ page }) => {
    await entrarComo(page, 'jefe_almacen')
    await page.getByTestId('kpis-inicio').locator('[data-kpi="vencimientos"]').getByTestId('kpi-enlace').click()
    await expect(page).toHaveURL(/\/wms\/reportes\/vencimientos\?diasHasta=90/)
    await expect(page.getByTestId('filtro-diasHasta')).toHaveValue('90')
    await expect(page.getByTestId('titulo-reporte')).toHaveText('Vencimientos')
    await page.goto('/wms')
    await page.getByTestId('kpis-inicio').locator('[data-kpi="recepciones-dif"]').getByTestId('kpi-enlace').click()
    await expect(page).toHaveURL(/\/wms\/reportes\/recepciones\?diferencias=/)
    await expect(page.getByTestId('titulo-reporte')).toHaveText('Recepciones')
    await page.goto('/wms')
    await page.getByTestId('kpis-inicio').locator('[data-kpi="exactitud"]').getByTestId('kpi-enlace').click()
    await expect(page).toHaveURL(/\/wms\/reportes\/exactitud\?desde=/)
    await page.goto('/wms')
    await page.getByTestId('kpis-inicio').locator('[data-kpi="ocupacion"]').getByTestId('kpi-enlace').click()
    await expect(page).toHaveURL(/\/wms\/reportes\/ocupacion/)
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
  test('todos los indicadores por tema, con «En Inicio» en los 4 y el grupo Despacho previsto', async ({ page }, info) => {
    await entrarComo(page, 'jefe_almacen')
    await page.goto('/wms/reportes')
    await page.getByTestId('indicadores-enlace').click()
    await expect(page.getByTestId('titulo-indicadores')).toBeVisible()
    for (const t of ['Inventario', 'Recepciones', 'Calidad', 'Movimientos y conteos', 'Operación diaria', 'Despacho']) await expect(page.locator(`[data-testid="grupo-kpi"][data-grupo="${t}"]`)).toBeVisible()
    await expect(page.getByTestId('kpi')).toHaveCount(17)
    await expect(page.getByTestId('kpi-en-inicio')).toHaveCount(4)
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
