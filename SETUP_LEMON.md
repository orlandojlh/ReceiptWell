# Configuración manual de Lemon Squeezy

Sigue estos pasos en el panel de Lemon Squeezy **antes** de probar pagos.
Todo lo que está en código ya está listo; solo faltan las acciones del panel.

---

## 1. Obtener tu API Key

1. Ve a **Settings → API** en el panel de LS.
2. Crea una nueva clave o copia la existente.
3. Pégala en `web/.env.local`:
   ```
   LEMONSQUEEZY_API_KEY=tu_clave_aqui
   ```

---

## 2. Verificar IDs de variante (modo test)

Los IDs ya están configurados en `web/.env.local`:

| Plan | Variante ID |
|------|------------|
| Premium Mensual | `1141887` |
| Premium Anual | `1141899` |
| Founding Member | `1141902` |

Confírmalos en **Products → [tu producto] → Variants**.

> **Importante:** En modo test (test mode activado en LS), los pagos son simulados y no cobran dinero real.

---

## 3. Crear el Webhook

1. Ve a **Settings → Webhooks → Add webhook**.
2. Completa:
   - **URL:** `https://TU_DOMINIO/api/webhooks/lemon`
     - En desarrollo local usa **ngrok** u otro túnel:
       ```bash
       npx ngrok http 3000
       # Copia la URL https://xxxx.ngrok.io
       # Webhook URL: https://xxxx.ngrok.io/api/webhooks/lemon
       ```
   - **Secret:** genera una cadena aleatoria segura, p.ej.:
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```
     Copia ese valor en dos lugares:
     - Panel LS → campo **Secret** del webhook
     - `web/.env.local`:
       ```
       LEMONSQUEEZY_WEBHOOK_SECRET=el_mismo_valor_aqui
       ```
3. **Eventos a activar** (marca exactamente estos):
   - `subscription_created`
   - `subscription_updated`
   - `subscription_cancelled`
   - `subscription_expired`
   - `subscription_resumed`
4. Guarda el webhook.

---

## 4. Activar modo test en Lemon Squeezy

- En la barra superior del panel, asegúrate de que el toggle **Test mode** esté **ON**.
- Los pagos de prueba usan la tarjeta `4242 4242 4242 4242`, cualquier fecha futura y cualquier CVC.

---

## 5. URL de éxito / recibo

El checkout redirige a `/dashboard?upgrade=success` al completar el pago.
Para producción, cambia en `web/.env.local`:
```
NEXT_PUBLIC_APP_URL=https://tudominio.com
```

---

## 6. Probar el flujo completo (cuando tengas el webhook configurado)

1. Inicia el servidor: `cd web && npm run dev`
2. Inicia ngrok si es local: `npx ngrok http 3000`
3. Ve a `/upgrade`, haz clic en "Suscribirme" en cualquier plan.
4. Completa el pago con la tarjeta de prueba `4242 4242 4242 4242`.
5. Verifica en Supabase que:
   - `users.plan` cambió a `premium` o `founding`
   - Se insertó una fila en `subscriptions`

---

## Resumen de variables en `web/.env.local`

```env
LEMONSQUEEZY_API_KEY=           ← pegar aquí
LEMONSQUEEZY_WEBHOOK_SECRET=    ← pegar aquí (mismo que en el panel LS)
LEMONSQUEEZY_STORE_ID=376650
LEMONSQUEEZY_VARIANT_MENSUAL=1141887
LEMONSQUEEZY_VARIANT_ANUAL=1141899
LEMONSQUEEZY_VARIANT_FOUNDING=1141902
NEXT_PUBLIC_APP_URL=http://localhost:3000  ← cambiar en producción
```
