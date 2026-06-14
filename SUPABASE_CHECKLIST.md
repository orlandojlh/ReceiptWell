# SUPABASE_CHECKLIST — ReceiptWell S4

> Evaluación final de la Fase 6 · 2026-06-12

---

## Estado global

| Suite de tests               | Tests | Verde | Rojo |
|------------------------------|------:|------:|-----:|
| S3 · Cálculos determinísticos (`test-calc`)    |  38 |  38 | 0 |
| S3 · Guardián narrativa (`test-guard`)         |  43 |  43 | 0 |
| S4 · Auth (`test-supabase-auth`)               |  19 |  19 | 0 |
| S4 · HistoryStore (`test-supabase-history`)    |  23 |  23 | 0 |
| S4 · CRUD (`test-supabase-crud`)               |  49 |  49 | 0 |
| S4 · E2E (`test-e2e-supabase`)                 |  49 |  49 | 0 |
| **TOTAL**                                      | **221** | **221** | **0** |

---

## Checklist de criterios S4

### Infraestructura

- [x] **Setup local funciona**
  - Supabase CLI v2.106.0, emulador Docker corriendo
  - API URL: `http://127.0.0.1:54321`
  - Studio URL: `http://127.0.0.1:54323`
  - DB URL: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
  - Comando de reset: `npx supabase db reset --local`

- [x] **4 tablas + 1 bucket creados**
  - `public.users` — perfil extendido (nombre, objetivo, adultos, ninos, condiciones)
  - `public.receipts` — boletas con `motor_json jsonb`
  - `public.reports` — reportes con `report_json jsonb`
  - `public.score_history` — historial de scores y ahorro
  - Storage bucket `receipts` (privado, políticas por userId)

- [x] **3 migraciones aplicadas**
  - `20240101000000_initial_schema.sql` — tablas, RLS, storage
  - `20240101000001_grants.sql` — `GRANT SELECT/INSERT/UPDATE` al rol `authenticated`
  - `20240101000002_insert_policies.sql` — INSERT policies para `users`, `receipts`, `reports`

---

### Auth

- [x] **Auth por email + contraseña funciona**
  - signup, login, getCurrentUser, logout — 19/19 tests verde
  - Error con contraseña incorrecta verificado
  - Limpieza con service_role admin verificada

- [ ] **Login con Google OAuth**
  - No testeable en CLI sin frontend (requiere flujo web)
  - Código preparado en `src/supabase/auth.ts` (`loginGoogle()`)
  - Pendiente para S5 (frontend web)

---

### HistoryStore en Supabase

- [x] **HistoryStore escribe y lee de Supabase** — 23/23 tests verde
  - `append()` inserta en `score_history`
  - `recent(n)` devuelve los últimos N ordenados por `created_at DESC`
  - `totalAhorro()` suma `ahorro_aceptado_clp`
  - Aislamiento por `user_id` verificado (RLS funciona correctamente)
  - `buildReport()` acepta `userId: string` y crea el store automáticamente

---

### CRUD completo

- [x] **Perfil de usuario** — 49/49 tests verde
  - `createUser`, `getUser`, `updateProfile` funcionan
  - `getUser` devuelve `null` para IDs inexistentes (no lanza excepción)

- [x] **Boletas (receipts)**
  - `uploadReceiptImage` — sube imagen al storage bajo `{userId}/{filename}`
  - `createReceipt` — guarda `motor_json` completo como `jsonb`
  - `getUserReceipts` — paginado, ordenado `DESC`, límite configurable
  - `getReceipt` — lectura individual

- [x] **Reportes**
  - `saveReport` — guarda `report_json jsonb` vinculado a `receipt_id`
  - `getReports` — obtiene todos los reportes de una boleta

- [x] **Cascade al borrar usuario**
  - `admin.deleteUser(userId)` elimina en cascada: receipts → reports, score_history
  - Verificado: 0 registros huérfanos tras cleanup

---

### E2E

- [x] **Test e2e verde (sin IA)** — 49/49 tests verde
  - Motor: `PRUEBA3.json` (Lider, 25 productos, 53.4% ultraprocesados, score=47, nivel=alto)
  - Flujo completo: auth → perfil → upload → receipt → history → report → read → logout → cascade
  - Construido con `calc` + `NARRATIVA_FALLBACK_TEST` + `FALLBACK_SWAPS` — cero llamadas a Gemini

- [ ] **Test e2e con IA real (PRUEBA3 + usuario real)**
  - **PENDIENTE — sin cuota Gemini disponible hoy (2026-06-12)**
  - Cuando haya cuota: `npx tsx src/cli.ts ./boletas/PRUEBA3.jpg --reporte --user-id <uuid>`
  - Verificar en Studio (`http://127.0.0.1:54323`) que las 4 tablas tienen los datos

---

### Latencia

Medida en el emulador local (Docker, loopback). Todas las operaciones bajo el límite de 500ms.

| Operación              | Ejecución 1 | Ejecución 2 | Límite |
|------------------------|------------:|------------:|-------:|
| `createUser`           |       42 ms |       25 ms | 500 ms |
| `uploadReceiptImage`   |      107 ms |       30 ms | 500 ms |
| `createReceipt`        |       11 ms |        8 ms | 500 ms |
| `getReceipt`           |        8 ms |        6 ms | 500 ms |
| `saveReport`           |        9 ms |        9 ms | 500 ms |
| `getUserReceipts`      |        7 ms |        5 ms | 500 ms |
| `getReports`           |        6 ms |        5 ms | 500 ms |
| `buildReport+history`  |       30 ms |       24 ms | 500 ms |
| **Máximo observado**   |  **107 ms** |  **30 ms**  | 500 ms |

> La primera ejecución de `uploadReceiptImage` es más lenta (cold start de storage).
> Todas las operaciones cumplen el criterio <500ms.

---

### No se rompió S1-S3

- [x] Motor de extracción (`src/engine/analyze.ts`) sin cambios
- [x] `buildReport()` mantiene compatibilidad: acepta `HistoryStore | string | undefined`
  - `undefined` → modo local JSON (S3, sin cambios)
  - `HistoryStore` → inyectado (tests S3, sin cambios)
  - `string` (userId) → crea `SupabaseHistoryStore` automáticamente (S4 nuevo)
- [x] CLI local (`--reporte` sin `--user-id`) sigue funcionando igual que en S3
- [x] test-calc: 38/38 ✓ · test-guard: 43/43 ✓

---

## Archivos creados en S4

```
src/supabase/
  client.ts          ← createClient con .env.local
  types.ts           ← tipos manuales de todas las tablas
  auth.ts            ← signup, login, loginGoogle, logout, getCurrentUser, getSession
  users.ts           ← createUser, getUser, updateProfile, createReceipt,
                       getUserReceipts, saveReport
  receipts.ts        ← uploadReceiptImage, getReceipt, getReports

src/report/
  history.ts         ← HistoryStore (interfaz), createLocalHistoryStore,
                       createSupabaseHistoryStore
  build.ts           ← buildReport con historyOrUserId: HistoryStore | string | undefined

supabase/migrations/
  20240101000000_initial_schema.sql
  20240101000001_grants.sql
  20240101000002_insert_policies.sql

eval/
  test-supabase-auth.ts      ← 19 tests
  test-supabase-history.ts   ← 23 tests
  test-supabase-crud.ts      ← 49 tests
  test-e2e-supabase.ts       ← 49 tests (sin IA)

SETUP_SUPABASE.md            ← guía de setup local
SUPABASE_CHECKLIST.md        ← este archivo
```

---

## Pendiente para S5

- [ ] Test e2e con IA real (PRUEBA3 + usuario real en Studio) — esperando cuota Gemini
- [ ] Login con Google OAuth — requiere frontend web
- [ ] Frontend web (Next.js / React) con Supabase Auth UI
- [ ] Límites freemium por usuario
- [ ] Encriptación de boletas en storage (backlog S4)
