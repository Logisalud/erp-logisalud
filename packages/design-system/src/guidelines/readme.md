# Logisalud — Design System

Design system for **Logisalud** (**LOGISSA S.A.C.**): Peruvian pharmaceutical logistics operator and distributor, based at KM 29.5 Panamericana Sur, Lurín, Lima. ~30 collaborators. Operating since 2023. Gerente General: Sebastián Gonzales Morales. Live site: **https://www.logisalud.com/**

Slogan institucional: *"Transportamos confianza, distribuimos salud."*

**Logisalud is not an e-commerce.** It is a **B2B pharmaceutical logistics and distribution company** whose customers are laboratorios, droguerías and health-sector companies — not consumers. `logisalud.com` is the corporate platform where the company lives: services, culture, blog, Centro de Soluciones, contacto.

### Three business lines

1. **Distribución comercial** — represents and distributes for pharma labs: Diphasac, Prades Lab, Biosana, Dare Nutrition, Reumasol/Farmaquil. National coverage with an in-house sales force.
2. **Operaciones logísticas 3PL** — BPA-certified warehousing and BPDT-certified transport, 100% certified by DIGEMID. 2000+ puntos coberturados, 10k+ repartos nacionally.
3. **Importación** — currently inactive.

### Surfaces this system serves

- **`logisalud.com` — the corporate platform** (primary): home with the "¿Qué quieres lograr?" objective selector (almacenar / transportar / distribuir / asesoría), Nosotros, Servicios, Cultura, Blog, Centro de Soluciones, Contacto. Lead-generation, not checkout: the CTA is "Agenda una reunión", never "Agregar al carrito".
- **Centro de Soluciones / client portal** — where a laboratorio or droguería tracks its operation.
This system covers those surfaces and nothing else. There is **no e-commerce, no cart, no product catalogue and no consumer sub-brand** anywhere in it.

## Sources given

| Source | What it contained |
| --- | --- |
| `uploads/Logos-Logisalud_Oficial/` (from `Logos-Logisalud_Oficial.zip`) | 5 official logo files: black horizontal (PNG), black stacked (PNG), white stacked (PNG), colour horizontal (JPG, white bg), colour stacked (JPG, white bg) |
| Written brand brief (chat) | Institutional colours, typography, tone of voice, icon concept, logo usage rules |
| **https://www.logisalud.com/** | The live corporate platform — read for company structure, service lines, nav, real copy, certifications, operating numbers, values and contact details. Text content only; the site's own images and stylesheets were not accessible for import. |

No codebase, no Figma file, no slide deck, and no existing product screens were provided. **Everything visual in this system is derived from the logo files + the written brief.** There is no prior Logisalud UI to recreate, so the UI kits here are *original* screens built strictly on the brand foundations — flagged as such rather than presented as recreations.

The original brief also mentioned Boticuy / Cuidafarma as consumer-pharmacy references and an "Estrella" natural-products sub-brand. **Both were dropped** — they described a consumer retail idea, not this company. No retail patterns remain in the system.

---

## Brand at a glance

- **Primary surface:** `logisalud.com`, the B2B corporate platform. Its job is credibility and lead capture — certifications (BPA, BPDT, DIGEMID), operating numbers, real client testimonials, and one clear "Agenda una reunión" path.
- **Audience:** decision-makers at laboratorios, droguerías and health companies. They are buying reliability and regulatory compliance, not products.
- **Personality:** ética, empática, rigurosa. Confiable, seria y profesional — pero cercana, sin tecnicismos.
- **Icon concept:** three connected dots = **Confianza + Salud + Eficacia logística**. It is a node/route graph, not a molecule. The three-dot triangle is the single most reusable brand motif in this system.
- **Wordmark structure:** `logi` in institutional green + `salud` in institutional teal. Two layouts exist: **stacked** (logi over salud, tagline below) and **horizontal** (logisalud in one line, tagline right-aligned underneath).

---

## CONTENT FUNDAMENTALS

**Language.** Spanish (Perú) is the product language. Neutral Latin-American Spanish, no Peninsular forms (*envío*, not *envío gratuito peninsular*; *carrito*, not *cesta*). Tuteo (tú), nunca voseo (vos) — Perú usa tuteo estándar, no rioplatense: "tienes", "puedes", "avísame", never "tenés", "podés", "avisame".

**Person.** The live site addresses the business client as **tú** — cercano, not formal-*usted* — and speaks as **nosotros** far more than a consumer store would, because the credential *is* the message: "Conectamos puntos en el espacio para acercar salud y confianza", "Nos adaptamos sin perder confiabilidad". Frame value as the client's objective, in their words: **"Quiero almacenar", "Quiero transportar", "Quiero distribuir", "Quiero asesoría"** — that first-person-client framing is the site's signature device and should be reused.

**Register.** Serious but plain. No technicalisms unless the product demands them — and when a technical term is unavoidable (*principio activo*, *cadena de frío*, *UFC*), explain it in the same breath: "Cadena de frío garantizada — tus productos viajan siempre refrigerados."

**Casing.**

- Headlines and body: **sentence case**. Never Title Case (English habit; wrong in Spanish).
- Eyebrows / kickers / small nav labels: **UPPERCASE** with `--ls-eyebrow` tracking, set in Oswald. Use sparingly — one per section.
- Buttons: sentence case in Poppins ("Agregar al carrito"), or uppercase Oswald for hero-level primary CTAs only.
- The brand name is written **Logisalud** in copy (one word, capital L). The logo lockup renders it lowercase; never mimic that lowercase in running text.

**Length.** Headlines ≤ 7 words. Card bodies one or two lines. Body paragraphs ≤ 3 lines on desktop. Credential copy is short and specific — a number beats an adjective.

**Emoji: never.** Not in nav, not in body copy, not in banners. This is a regulated pharmaceutical operator selling to laboratorios; emoji reads as unserious. Use the icon set instead.

**Exclamation marks:** effectively never on the corporate platform. This audience reads enthusiasm as noise.

**Excepción de tono: ERP interno.** Todo lo anterior en esta sección (registro, casing, "Emoji: never", "Exclamation marks: effectively never") describe la voz de logisalud.com, la plataforma corporativa de cara a laboratorios y droguerías. Esa audiencia externa exige seriedad regulatoria.

El ERP (`erp.logisalud.com` — Cobranzas, Compras y Pagos, Pedidos) es una herramienta interna, usada solo por el propio equipo de Logisalud. Ahí aplica un criterio distinto, decidido conscientemente por Sebastián Gonzales (Gerente General):

- Emojis permitidos, con moderación — en títulos de sección, mensajes de estado, confirmaciones. No en documentos legales/fiscales generados por el sistema (PDFs de OC, facturas, comprobantes) — esos se quedan formales, porque salen del ERP hacia terceros.
- Tono cercano y ágil, no corporativo — el objetivo es que el equipo disfrute usar la herramienta día a día, no que transmita autoridad regulatoria hacia afuera.
- Las reglas visuales (color, tipografía, espaciado, radios, sombras, componentes) NO cambian — se mantiene el mismo sistema de marca en ambas superficies. Lo único que cambia es la voz/tono de los textos de interfaz.
- Esta excepción NO aplica a nada que el ERP genere para consumo externo (documentos, correos a proveedores, comunicaciones a clientes) — ahí sigue la voz formal de siempre.

**Credentials are named, never adjectivised.** Write "BPA y BPDT que respaldan cada entrega", "Operación 100% certificada por Digemid", "2000+ puntos coberturados a nivel nacional" — not "la mejor calidad" or "servicio de excelencia". Every claim on the site carries a certification, a number or a client quote behind it.

**Culture language is part of the brand.** The values are the **"SIE"** set — *"Sé un ser excelente"*, *"Integridad en nuestras acciones"*, *"Empatiza para impactar"* — plus the named internal rituals: **Logisalud School**, **Espíritu Ubuntu**, **Jueves Logistiqueros**. Use these exact names; do not paraphrase or translate them.

**Regulatory language.** Certifications are named exactly: **BPA** (Buenas Prácticas de Almacenamiento), **BPDT** (Buenas Prácticas de Distribución y Transporte), **DIGEMID**. Never claim a certification the company does not hold, never soften one into an adjective, and never write about the products themselves — Logisalud moves and distributes them, it does not make health claims about them.

**Never write commerce copy.** No prices, no "agregar al carrito", no stock, no checkout. The conversion action is always a conversation: *"Agenda una reunión"*, *"Click aquí para conversar"*, *"Hablemos de tu objetivo"*.

**Voice examples** (write like this):

| Slot | Do | Don't |
| --- | --- | --- |
| Hero | "Transportamos confianza, distribuimos salud. Distribuidora y operador logístico farmacéutico que acerca salud y confianza." | "¡LA MEJOR LOGÍSTICA DEL PERÚ! 🚀" |
| Objective card | "Quiero almacenar — Almacenes BPA, seguros y escalables para tus productos farmacéuticos." | "Servicios de almacenamiento de clase mundial" |
| Trust / numbers | "Operación 100% certificada por Digemid · 2000+ puntos coberturados" | "Calidad garantizada" |
| Primary CTA | "Agenda una reunión" · "Click aquí para conversar" | "Comprar ahora" |
| Client quote | "Trabajar con Logisalud nos da tranquilidad. Sabemos que nuestros productos llegan correctamente y con cuidado." | "¡Clientes felices! ⭐⭐⭐⭐⭐" |
| Cultura | "Creemos que la forma en que trabajamos es tan importante como lo que hacemos." | "Somos un gran equipo con mucha pasión" |
| Form error | "No pudimos enviar tu mensaje. Revisa el correo e inténtalo otra vez." | "Error 402: transacción rechazada." |
| Empty state | "Aún no hay artículos en el blog. Vuelve pronto." | "Oops! Nada por aquí 😅" |

---

## VISUAL FOUNDATIONS

### Colour

Exactly **two institutional colours**, both from the official sheet, and they are never altered:

- **Verde `#4BB168`** — the primary. Actions, brand surfaces, the *logi* half of the mark. In the system: `--brand-primary`.
- **Celeste/teal `#4ABCC2`** — the secondary. Accents, informational states, section eyebrows, the *salud* half and the tagline. In the system: `--brand-secondary`.

Full hue-locked ramps (`--green-50…900`, `--teal-50…900`) exist so tints and pressed states never require inventing a colour. Neutrals are a **slightly green-cooled grey** family (`--neutral-*`) so grey UI never looks blue next to the brand.

Rules of use: green outranks teal — a screen has one green primary action, and teal never competes with it. Green and teal are **not** mixed in a gradient anywhere (explicit brand rule: no gradients on the logo; this system extends that to the whole UI). Semantic colours are deliberately offset from the brand (`--danger-500 #D64B4B`, `--warning-500 #E4A03A`) so a green success state and the brand green don't blur; success reuses the darker `--green-600` so it reads as status, not as a CTA.

**Colour on a page:** never more than **two background colours** per screen — `--surface-page` (near-white) plus at most one brand band. Big saturated fields are reserved for the header/footer and one hero or promo band.

### Type

- **Oswald** — condensed, heavy, "importance". Display only: hero, section headings, price figures, numeric stats, eyebrows, hero-level CTAs. Because it is condensed, it always carries positive tracking (`--ls-display`, `--ls-display-caps`) and never runs longer than \~2 lines.
- **Poppins** — geometric, round, legible, cercano. Everything else: body, product names, labels, form fields, buttons, nav.

The pairing does the brand's whole job: Oswald = rigor and authority, Poppins = closeness. Poppins is also the family the wordmark's letterforms belong to visually (rounded geometric lowercase), so Poppins body copy sits under the logo without friction.

Oswald carries the operating figures ("2000+", "10k+", "Desde 2023") — those are the page's loudest elements after the hero.

Never: all-caps Poppins for long strings; Oswald for body text or anything below 16px except tracked eyebrows; a third typeface. Mono (`--font-mono`) appears only for machine strings — lote, código de operación, número de guía.

### Spacing & layout

4px grid throughout (`--space-1…32`). Content container `1240px` with a `24px` gutter (`40px` from `lg`). Vertical section rhythm `80px` desktop / `48px` mobile. Card grids: 4-up desktop for the "¿Qué quieres lograr?" objective row, 3-up for services and values, 2-up mobile, `24px` gap. The sticky header is `72px`; nothing else is fixed.

Generous whitespace is the trust signal — a cramped page reads as an unregulated operator. Cards breathe (`--card-pad` 20px).

### Backgrounds

Flat colour, full stop. `--surface-page` near-white; one full-bleed **photographic** hero (real warehouse, fleet, and team-at-work photography — no illustration, no stock "global logistics" imagery); soft `--green-50` / `--teal-50` tint bands to separate sections. No hand-drawn illustration, no repeating pattern, no texture, no noise, no gradient meshes. The only decorative element permitted is the **three-dot motif** — the logo's node triangle enlarged at very low opacity, or as a small connector graphic between steps in a "cómo funciona" row.

### Imagery

Bright, clean, **cool-neutral** white light — warehouse daylight, not warm golden-hour and not clinical blue-cold. Subjects: the Lurín almacén, racking and cold storage, the fleet, and the team at work. People photography: real Logisalud collaborators, natural expression, no stock over-smiling — the brand's whole claim is *cercanía real*, so generic stock imagery actively undermines it. No grain, no heavy filters, no duotone. Images sit at `--radius-image` (12px); full-bleed heroes are square-cornered.

### Corners

Everything is soft, mirroring the mark's circular nodes. Cards and images `12–16px`. **Buttons, chips, tags, badges and the search pill are pills** (`--radius-pill`) — this is the system's most recognisable UI signature. Text inputs are the one exception: `8px` (`--radius-input`), so a field never reads as a button.

### Cards

White surface, `1px solid --border-subtle`, `--radius-card` 16px, `--shadow-sm`, `20px` padding. On hover: shadow to `--shadow-md` and a `-2px` lift (`--lift-y`), border to `--border-default`. Never a coloured left border. Never a card with a shadow *and* no border — the hairline is what makes it feel precise.

### Shadows

Soft, wide, low-opacity, tinted with the neutral-900 green-grey — never pure black. Five steps (`--shadow-xs…xl`) plus one brand glow (`--shadow-brand`) used only under a primary CTA in a hero. Inner shadows are used for exactly one thing: the `--shadow-inset-line` hairline under a sticky header. **No shadow ever touches the logo** (explicit brand rule).

### Transparency & blur

Used sparingly and only for layering: the sticky header when scrolled (white at 88% + `--overlay-blur`), modal scrims (`--surface-overlay`, neutral-900 at 55%), and image **protection gradients** — a bottom-up neutral-900 fade at 0→60% behind text laid over photography. Where a protection gradient would fight the layout, use a **solid white capsule** with `--radius-pill` instead (`Badge tone="onImage"`); that is the preferred treatment for a short label over a warehouse or fleet photo.

### Motion

Quick, linear-feeling, invisible. `--dur-fast 140ms` for controls, `--dur-base 220ms` for cards and panels, `--ease-standard cubic-bezier(.2,0,.2,1)`. Fades and short 8–12px slides only. **No bounce, no spring, no overshoot, no scale-in-from-zero, no scroll-jacked parallax** — a regulated pharma operator that bounces looks careless. Skeletons pulse at `--dur-slower`. `prefers-reduced-motion` removes all transform transitions and keeps only opacity.

### Interaction states

- **Hover:** solid fills go one ramp step **darker** (`--green-500` → `--green-600`); ghost/tertiary get a `--green-50` wash; links darken and gain a 3px-offset underline. Never opacity-only hover, never lighten a fill.
- **Press:** one more step darker (`--green-700`) plus `scale(0.98)` (`--press-scale`). No ripple.
- **Focus:** always visible — `--focus-ring` = 3px teal at 40%, offset outside the shape. Focus uses **teal**, never green, so it can't be confused with a hover state.
- **Disabled:** `--neutral-200` fill, `--neutral-400` text, no shadow, `cursor:not-allowed`. Never a translucent brand colour.
- **Selected:** 2px `--border-brand` + `--surface-brand-soft` fill.
- **Loading:** in-button spinner replaces the label; the button keeps its width.

### Borders

`1px` hairlines are the structural device (`--border-subtle` for dividers and cards, `--border-default` for inputs, `--border-strong` on input hover). `2px` only signals selection or an error field. No dashed borders except a file-upload dropzone.

---

## Logo usage (from the official brand rules)

**Never:** blur, distort, rotate, recolour, gradient-fill, or shadow the logo.

Two layouts, both official:

- **Horizontal** — `assets/logisalud-color-horizontal.png`. Default for headers, emails, invoices, anywhere wide.
- **Stacked** — `assets/logisalud-color-stacked.png`. For square/vertical spaces, social avatars, packaging.

Colourways: **colour** on white/very light neutral; **black** on light backgrounds where colour is unavailable (print, fax, single-colour); **white** on dark or brand-colour backgrounds. Clear space on all sides ≥ the diameter of one icon node. Minimum width: 120px horizontal / 72px stacked on screen. The icon alone (`assets/logisalud-icon-*.png`) may stand in for the full lockup only where the brand is already established on the page — favicon, mobile header at narrow widths, loading state.

Files in `assets/`:

| File | Notes |
| --- | --- |
| `logisalud-color-horizontal.png` | Transparent background, derived from the supplied print JPG (white matte removed) |
| `logisalud-color-stacked.png` | Transparent background, derived from the supplied print JPG |
| `logisalud-black-horizontal.png`, `logisalud-black-stacked.png`, `logisalud-white-stacked.png` | Supplied originals, unmodified |
| `logisalud-white-horizontal.png` | Generated by recolouring the supplied black horizontal to white (no white horizontal was supplied) |
| `logisalud-icon-color.png`, `-white.png`, `-black.png` | The three-node mark, cropped from the supplied horizontal lockup |

---

## ICONOGRAPHY

No icon set was supplied with the brand kit, and no codebase existed to copy one from. **Substitution flagged:** this system uses **Lucide** (CDN, `lucide@0.544.0`) as the UI icon set. It is the closest match to the brand's own drawing logic — 24×24 grid, `2px` uniform stroke, **round caps and round joins**, open counters, no fill. The logo's icon is literally round-capped strokes joining circular nodes, so Lucide's geometry is continuous with the mark; a filled or sharp-cornered set (Material filled, Heroicons solid) would not be.

Rules:

- Size `20px` inline with body/UI text, `24px` in nav and buttons, `32px` in feature/trust strips, `48px` max in empty states.
- Stroke stays `2px` at every size — never scale the stroke.
- Colour: `currentColor`. Icons inherit text colour; a brand-coloured icon uses `--brand-primary` for actions and `--brand-secondary` for informational marks.
- Never two icon styles on one screen. Never an icon without a text label in navigation. Never emoji or Unicode dingbats (✓, ★, ➜) as icons — use `check`, `star`, `arrow-right`.
- Service / objective icons: `warehouse` (almacenar), `truck` (transportar), `route` (distribuir), `clipboard-check` (asesoría).
- Trust and operations icons: `shield-check` (BPA/BPDT/DIGEMID), `snowflake` (cadena de frío), `package-check`, `map-pin`, `clock`, `building-2`, `users`, `trending-up`, `file-text`.
- Contact icons: `calendar-check` (agenda una reunión), `phone`, `mail`, `map-pin`.
- The retail-only icons (`shopping-cart`, `pill`, `leaf`, `baby`) belong to the future consumer surface, not `logisalud.com`.
- The **three-dot brand motif** is not an icon and never sits in an icon slot. It is a decorative/structural graphic only.

If Logisalud has a licensed icon library, replace the CDN reference in the UI kits and this section.

---

## Intentional additions

No codebase or Figma file defined a component inventory, so this system authors a standard set from the brand guidelines and the live site's structure. Two additions worth naming:

- **`Icon`** — a thin wrapper over Lucide so consumers get consistent size/stroke/colour without touching the CDN API.
- **`BrandMark`** — renders the correct logo file for a given layout + colourway, enforcing the clear-space and minimum-size rules so no one hand-places an `<img>` and breaks them.

The `marketing/` group (`ObjectiveCard`, `StatBlock`, `Testimonial`, `ValueCard`, `CertificationRow`, `TrustStrip`, `PromoBanner`) is modelled directly on the sections that exist on `logisalud.com` — it is a recreation of the live site's inventory, not an invented set.

---

## Index

**Root**

- `styles.css` — the single entry point consumers link. `@import` list only.
- `readme.md` — this file.
- `SKILL.md` — Agent-Skills-compatible entry point.
- `thumbnail.html` — homepage tile.

**`tokens/`** — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `radius.css`, `elevation.css`, `motion.css`, `base.css`

**`assets/`** — logo lockups and icon marks (table above).

**`guidelines/`** — foundation specimen cards (Colors, Type, Spacing, Brand groups in the Design System tab).

**`components/`**

- `core/` — `Button`, `IconButton`, `Icon`, `BrandMark`, `Badge`, `Tag`, `Card`, `Divider`
- `forms/` — `Input`, `Select`, `Checkbox`, `Radio`, `Switch`, `SearchField`
- `marketing/` — `PromoBanner`, `ObjectiveCard`, `CertificationRow`, `StatBlock`, `TrustStrip`, `Testimonial`, `ValueCard`
- `navigation/` — `Header`, `Footer`, `Breadcrumbs`, `Tabs`, `Pagination`
- `feedback/` — `Alert`, `Toast`, `Dialog`, `EmptyState`, `Skeleton` (+ `SkeletonArticle`)

**Not yet built.** The UI kit for `logisalud.com` — home (hero + "¿Qué quieres lograr?" + certificaciones + números + clientes/testimonios), Servicios, Nosotros/Cultura, Contacto — and the `templates/` starting folders are the remaining work. Nothing in the project references them yet.

## Correction log

An earlier draft of this system described Logisalud as a consumer e-commerce with a natural-products sub-brand called Estrella. **That was wrong, and it has been removed entirely.** Logisalud is a B2B pharmaceutical logistics operator and distributor; `logisalud.com` is a corporate lead-generation platform.

Deleted in the correction: `ProductCard`, `CategoryTile`, `CartLineItem`, `OrderSummary`, `Price`, `Rating`, `QuantityStepper`, `SkeletonProductCard`, the `--estrella-*` colour tokens and the Estrella specimen card. `Header` lost its cart, account menu and product search; `SearchField` now serves the Centro de Soluciones and blog. The `commerce/` group was replaced by `marketing/`, built from the live site's real sections.
