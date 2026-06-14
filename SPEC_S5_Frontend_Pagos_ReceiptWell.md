# SPEC PARA CLAUDE CODE — ReceiptWell · Semana 5: Frontend Web + Límites Freemium + Pagos

> **Cómo usar este archivo:** abre Claude Code en la carpeta existente `receiptwell` y pégale:
> *"Lee SPEC_S5_Frontend_Pagos_ReceiptWell.md e implementa SOLO la FASE 1. Confírmame al terminar, sin avanzar a las otras fases."*

---

## OBJETIVO (criterio de éxito de S5)

Una **web app funcional** donde un usuario real puede: registrarse → subir foto de boleta → ver su reporte de 4 capas → toparse con el límite de 2 boletas/mes → pagar Premium con Lemon Squeezy → quedar desbloqueado. Deploy en Vercel free tier.

**Cortes de aceptación S5:**
- Flujo completo registro → boleta → reporte en el navegador, <90 segundos.
- Límite freemium activo: 3.ª boleta del mes bloqueada con pantalla de upgrade.
- Pago real de prueba (modo test de Lemon Squeezy) desbloquea Premium.
- Anti-abuso mínimo: boleta duplicada rechazada sin gastar IA, rate limit por usuario.
- Móvil primero: la mayoría subirá la foto desde el teléfono.

**Fuera de alcance S5:** marketing site, blog, modo familia, exportar (Capa 2-3). El landing de venta es S6-7.

---

## ARQUITECTURA

```
receiptwell/
├── web/                        # NUEVA app Next.js (App Router)
│   ├── app/
│   │   ├── (auth)/login/page.tsx
│   │   ├── (auth)/registro/page.tsx
│   │   ├── dashboard/page.tsx          # historial + score + marcador
│   │   ├── subir/page.tsx              # upload de boleta
│   │   ├── reporte/[id]/page.tsx       # reporte 4 capas
│   │   ├── premium/page.tsx            # pricing + checkout
│   │   └── api/
│   │       ├── analizar/route.ts       # POST: imagen → motor → reporte (server-side)
│   │       └── webhooks/lemon/route.ts # webhook de Lemon Squeezy
│   ├── components/
│   ├── lib/                            # re-usa src/ del motor vía imports relativos o paquete compartido
│   └── ...
├── src/                        # motor existente (NO TOCAR salvo exports)
```

- **El motor corre SOLO server-side** (API route). La API key de Gemini nunca llega al navegador.
- Reusar `src/engine` y `src/report` desde `web/` (monorepo simple con paths de TypeScript o npm workspace — elegir lo más simple que funcione en Vercel).
- Supabase: el mismo proyecto; en local contra el emulador, en producción contra proyecto cloud free tier (la migración de un entorno a otro es solo cambiar `.env`).

---

## FASE 1 — Setup Next.js + Auth UI (día 1-2)

1. Crear app: `npx create-next-app@latest web` (TypeScript, Tailwind, App Router, sin src/ dir).
2. Instalar `@supabase/supabase-js` y `@supabase/ssr` en `web/`.
3. Cliente Supabase para browser y server (patrón oficial @supabase/ssr con cookies).
4. Páginas `/login` y `/registro`: email + contraseña, usando las funciones de auth ya probadas. Botón "Continuar con Google" (configurar OAuth en Supabase: en local basta dejarlo visible pero deshabilitado con tooltip "disponible en el lanzamiento" si configurarlo toma >30 min — no bloquear la fase por esto).
5. Middleware de Next.js: rutas `/dashboard`, `/subir`, `/reporte/*` requieren sesión; si no, redirect a `/login`.
6. Layout base móvil-primero: header con logo texto "ReceiptWell", score del usuario si hay sesión.
7. **Test manual:** registrarse desde el navegador, verificar el usuario en Studio, login/logout.

## FASE 2 — Subida de boleta + API de análisis (día 2-3)

1. `/subir`: input de cámara/archivo (`<input type="file" accept="image/*,application/pdf" capture="environment">`), preview, botón "Analizar mi boleta".
2. `POST /api/analizar` (server):
   - Valida sesión → valida tipo y tamaño (<10 MB) → **anti-abuso paso 1: hash SHA-256 de la imagen; si ya existe en `receipts.imagen_hash` del mismo usuario → devolver el reporte existente sin gastar IA** (agregar columna `imagen_hash` con migración).
   - **Anti-abuso paso 2: rate limit** — máx 3 análisis por usuario por hora (contar en `receipts`), respuesta 429 amable.
   - Sube imagen a storage → corre motor → si rechazo (ilegible/no supermercado): respuesta amable, **cuenta contra el límite solo si se procesó con IA** (regla del proyecto) → `buildReport()` con el perfil del usuario → guarda en `reports` → devuelve `reportId`.
3. Pantalla de espera con estados reales ("Leyendo tu boleta…", "Clasificando productos…", "Armando tu plan…") — el análisis tarda ~20-40 s, la espera debe sentirse viva.
4. **Test:** subir PRUEBA3 desde el navegador (usa 2 llamadas IA — hacerlo solo cuando haya cuota).

## FASE 3 — Render del reporte 4 capas (día 3-4)

1. `/reporte/[id]`: lee `report_json` de Supabase (RLS protege acceso).
2. Capa 1 — Espejo financiero: total, % ultraprocesados grande y visual (barra/donut CSS, sin librerías de charts pesadas), proyección anual en CLP formateado chileno ($1.234.567).
3. Capa 2 — Riesgo: badge de nivel (verde/ámbar/rojo), factores, narrativa, **disclaimer siempre visible**.
4. Capa 3 — Costo en sudor: 3 tarjetas (caminata/trote/gimnasio) con números redondeados.
5. Capa 4 — Swaps: 3 tarjetas con producto → alternativa, ahorro CLP/mes, diferencia nutricional, logos de texto de supermercados disponibles. Botón "Acepto este cambio" → suma al marcador de ahorro (`score_history.ahorro_aceptado_clp`).
6. Marcador y score con tendencia (flecha ↑→↓) en dashboard y reporte.
7. Tono visual: limpio, números grandes, cero culpa — el rojo solo en el badge de riesgo, nunca en el total gastado.

## FASE 4 — Límites freemium (día 4-5)

1. Migración: columna `plan` en `users` (`free` | `premium` | `founding`), default `free`, + `plan_expires_at`.
2. En `/api/analizar`: si `plan = free`, contar boletas **procesadas con IA** del mes calendario; si ≥2 → respuesta 402 con flag `limit_reached`.
3. UI: contador "1 de 2 boletas gratis este mes" visible en dashboard; al tope, pantalla de upgrade con los 3 precios cerrados ($3.490/mes, $34.900/año, Founding $1.990/mes vitalicio si quedan cupos).
4. Test automatizado del contador (sin IA: insertar receipts fake y verificar el corte).

## FASE 5 — Lemon Squeezy (día 5-6)

1. Crear cuenta/store en modo test. Productos: Premium Mensual ($3,49 USD), Premium Anual ($34,90 USD), variante Founding Member ($1,99 USD/mes) con cupón limitado a 100 usos.
2. `npm install @lemonsqueezy/lemonsqueezy.js` en `web/`.
3. `/premium`: botones de checkout → checkout overlay de Lemon Squeezy con `user_id` en `custom_data`.
4. `POST /api/webhooks/lemon`: verificar firma HMAC → eventos `subscription_created` / `subscription_updated` / `subscription_cancelled` / `subscription_expired` → actualizar `users.plan` y `plan_expires_at`. Tabla `subscriptions` para auditoría (migración).
5. Webhook en local: `lemon squeezy` no llega a localhost → usar el modo test + `ngrok` o el botón "reenviar webhook" del panel; documentar en `SETUP_LEMON.md`.
6. **Test:** compra de prueba completa → `plan` cambia a `premium` → el límite desaparece → cancelación → vuelve a `free` al expirar.

## FASE 6 — Deploy + evaluación (día 6-7)

1. Crear proyecto Supabase cloud (free tier) → aplicar las migraciones (`supabase db push`) → crear bucket.
2. Deploy `web/` en Vercel (free): variables de entorno (Supabase cloud + Gemini + Lemon), verificar que el motor corre en serverless (timeout: configurar `maxDuration = 90` en la API route; si el plan free de Vercel lo limita a menos, evaluar streaming o mover el análisis a Supabase Edge Function — decidir por lo más simple).
3. Checklist final `S5_CHECKLIST.md`:
   - [ ] Registro + login en producción
   - [ ] Boleta real desde un teléfono → reporte <90 s
   - [ ] Límite free funciona (3.ª boleta bloqueada)
   - [ ] Pago test desbloquea / cancelación re-bloquea
   - [ ] Boleta duplicada no gasta IA
   - [ ] Rate limit activo
   - [ ] Disclaimer visible en todo reporte
   - [ ] Móvil: flujo completo usable en pantalla de 360 px

---

## NOTAS

- **Costo fijo sigue ≈ $0:** Vercel free + Supabase free + Lemon Squeezy (5% solo sobre ventas). Nada que cobre antes del breakeven.
- **Privacidad:** las imágenes quedan en bucket privado con RLS por usuario; ningún dato de boleta sale a analytics de terceros. La anonimización para dataset es Capa 2-3 (backlog), pero el diseño ya separa identidad (auth) de consumo (receipts/reports) vía `user_id`, lo que la hará posible sin migrar datos.
- **Replicabilidad país (visión):** textos de UI en un archivo `web/lib/i18n/es-CL.ts` desde el día 1 — agregar idioma después será agregar archivo, no reescribir componentes.
- **Backlog Capa 2-3 anotado:** resumen viral compartible del reporte; recordatorio mensual por email.
