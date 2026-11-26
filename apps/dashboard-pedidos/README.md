# LOGISALUD — Dashboard en Tiempo Real de Pedidos (Mapa & Operaciones)

Aplicación independiente en Next.js para monitoreo en vivo de pedidos, despachos y estado de flota en mapa interactivo de Lima Metropolitana y Callao. Diseñada para operar desde **teléfonos móviles** hasta **pantallas gigantes / televisores de operaciones (NOC)**.

---

## 🚀 Despliegue Independiente en Vercel (`.vercel.app`)

Este proyecto está configurado para desplegarse como un proyecto independiente en Vercel:

1. **Nuevo Proyecto en Vercel:**
   - Entra a [Vercel Dashboard](https://vercel.com/new).
   - Conecta el repositorio `erp-logisalud`.
2. **Configuración del Proyecto:**
   - **Root Directory:** Selecciona `apps/dashboard-pedidos`.
   - **Framework Preset:** `Next.js`.
   - **Build Command:** `next build` (o déjalo en automático).
3. **Variables de Entorno (Environment Variables):**
   Configura en Vercel las 3 variables (copiadas desde tu `.env.local`):
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://<tu-proyecto>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<tu-anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<tu-service-role-key>
   ```
4. **Deploy:**
   - Haz clic en **Deploy**. Obtendrás una URL independiente como:
     `https://dashboard-pedidos-logisalud.vercel.app`

---

## 🛠️ Ejecución Local

Desde la raíz del monorepo:
```bash
npm run dev:dashboard
```
O dentro de la carpeta:
```bash
cd apps/dashboard-pedidos
npm run dev
```
La aplicación correrá en `http://localhost:3005`.

---

## 🗺️ Características Principales

* **Conexión Realtime con Supabase:** Consulta los pedidos reales con la `service_role` key y escucha eventos en vivo con WebSockets.
* **Geolocalización Automática por Ubigeo:** Traduce ubigeos y direcciones de Lima y Callao (Surco, Comas, Miraflores, Callao, SJL, etc.) a coordenadas del mapa.
* **Mapa Interactivo Vectorial:**
  * Bahía de Lima, Océano Pacífico y corredores viales principales.
  * Marcadores con código de estado (`Listo para Operaciones`, `En Ruta`, `Entregado`, `Excepción`, `Borrador`).
  * Centro de Distribución Principal (Callao) con radar logístico.
  * Flota móvil de reparto (furgones, camionetas, motos).
* **Modo TV / Pantalla Gigante:**
  * Fondo oscuro de alto contraste (`#090d16`) con acentos neón verde y cian.
  * Marquesina inferior en tiempo real con alertas y despachos.
  * Reloj de operaciones en hora de Lima (`America/Lima`).
  * Controles táctiles optimizados para celulares y tablets.
* **Notificaciones Sonoras:** Sintetizador con Web Audio API para nuevos pedidos sin requerir archivos externos.
