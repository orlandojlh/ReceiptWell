# SPEC PARA CLAUDE CODE — ReceiptWell · Semana 4: Backend + Usuarios (Supabase)

> **Cómo usar este archivo:** abre Claude Code en la carpeta existente `receiptwell` y pégale:
> *"Lee SPEC_S4_Backend_Usuarios_ReceiptWell.md e implementa SOLO la FASE 1. Confírmame al terminar, sin avanzar a las otras fases."*

---

## OBJETIVO (criterio de éxito de S4)

Reemplazar la persistencia local (JSON en `data/`) por Supabase, manteniendo exactamente la misma interfaz que S3 usaba. En otras palabras: `buildReport()` sigue igual, pero cuando llama a `history.append()`, esa llamada ahora escribe en Postgres en lugar de en un archivo JSON local.

**Cortes de aceptación S4:**
- Auth funcional: registro + login con email, login con Google.
- CRUD completo: crear/leer/actualizar usuario, guardar boleta, guardar reporte, consultar historial.
- Tests sin internet: emulador local de Supabase (docker, gratis).
- Tiempo por operación <500ms.
- No quebrar S1-3: el motor de extracción sigue igual, `buildReport()` sigue igual, solo cambia dónde se guardan los datos.

**Fuera de alcance S4:** frontend web, pagos, límites freemium. Eso es S5.

---

## FASE 1 — Setup de Supabase local (día 1)

### 1.1 Instalar Supabase CLI y emulador local

```bash
# macOS / Linux
brew install supabase/tap/supabase

# o global npm
npm install -g supabase

# verificar
supabase --version

# en la raíz del proyecto receiptwell:
supabase init

# arranca el emulador local (docker requerido)
supabase start
```

Supabase CLI genera `supabase/.env.local` con `SUPABASE_URL` y `SUPABASE_ANON_KEY` para el emulador local. Copiar a `.env.local` en la raíz del proyecto.

### 1.2 Crear tabla `users` en el emulador

SQL directo en Supabase Studio (http://localhost:54323) o via CLI. Tabla:

```sql
create table users (
  id uuid primary key default auth.uid(),
  email text unique not null,
  nombre text default '',
  objetivo text check (objetivo in ('ahorrar', 'salud', 'equilibrio')) default 'equilibrio',
  adultos integer default 1,
  ninos integer default 0,
  condiciones text[] default array[]::text[],
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- RLS: cada usuario solo ve su propio perfil
alter table users enable row level security;

create policy "users_own_profile" on users
  for select
  using (auth.uid() = id);

create policy "users_update_own_profile" on users
  for update
  using (auth.uid() = id);
```

### 1.3 Crear tabla `receipts`

```sql
create table receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  imagen_path text,  -- path en Supabase storage
  motor_json jsonb,  -- salida cruda del motor de S1-2
  created_at timestamp default now()
);

alter table receipts enable row level security;

create policy "users_own_receipts" on receipts
  for select
  using (auth.uid() = user_id);
```

### 1.4 Crear tabla `reports`

```sql
create table reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  receipt_id uuid references receipts(id) on delete cascade,
  report_json jsonb,  -- salida completa de buildReport()
  created_at timestamp default now()
);

alter table reports enable row level security;

create policy "users_own_reports" on reports
  for select
  using (auth.uid() = user_id);
```

### 1.5 Crear tabla `score_history`

```sql
create table score_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  fecha timestamp,
  score integer check (score >= 0 and score <= 100),
  ahorro_aceptado_clp integer default 0,
  created_at timestamp default now()
);

alter table score_history enable row level security;

create policy "users_own_history" on score_history
  for select
  using (auth.uid() = user_id);

create policy "users_append_own_history" on score_history
  for insert
  with check (auth.uid() = user_id);
```

### 1.6 Crear storage bucket `receipts` (para guardar imágenes)

```sql
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false);

create policy "users_upload_receipts" on storage.objects
  for insert
  with check (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "users_read_own_receipts" on storage.objects
  for select
  using (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);
```

### 1.7 Documentar en `SETUP_SUPABASE.md`

Archivo de checklist y debugging:
- Verificar que `supabase status` devuelve "supabase local development setup is running"
- Conectar Studio a http://localhost:54323
- Ver las 4 tablas + 1 bucket en Studio
- Pasos para resetear: `supabase db reset --local`

---

## FASE 2 — SDK Supabase + tipos TypeScript (día 2)

### 2.1 Instalar SDK

```bash
npm install @supabase/supabase-js
```

### 2.2 Nuevo archivo `src/supabase/client.ts`

```ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

### 2.3 Nuevo archivo `src/supabase/types.ts` — tipos generados desde Supabase

Opción A (recomendada):
```bash
npm install -g @supabase/cli  # ya lo tienes
supabase gen types typescript --local > src/supabase/types.ts
```

Opción B (manual): copiar los tipos de tabla a mano (estructura: `Database.public.Tables.{tabla_name}.Row`).

### 2.4 Nuevo archivo `src/supabase/auth.ts` — funciones de auth

```ts
// signup(email, password): Promise<User>
// login(email, password): Promise<User>
// loginGoogle(): Promise<User>
// logout(): Promise<void>
// getCurrentUser(): Promise<User | null>
```

Test básico: registrar usuario, loguear, verificar session, logout.

---

## FASE 3 — HistoryStore en Supabase (día 2-3)

### 3.1 Reemplazar `src/report/history.ts`

La interfaz `HistoryStore` sigue igual (mismo contrato):
```ts
interface HistoryStore {
  append(fecha, score, ahorro): Promise<void>;
  recent(n): Promise<ScoreEntry[]>;
}
```

Pero la implementación cambia:
```ts
export async function createSupabaseHistoryStore(userId: string): Promise<HistoryStore> {
  return {
    async append(fecha, score, ahorro) {
      await supabase
        .from("score_history")
        .insert({ user_id: userId, fecha, score, ahorro_aceptado_clp: ahorro });
    },
    async recent(n) {
      const { data } = await supabase
        .from("score_history")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(n);
      return data || [];
    },
  };
}
```

### 3.2 Cambiar `buildReport()` en `src/report/build.ts`

Pasar `userId` como parámetro:
```ts
async function buildReport(
  motorJSON: ReceiptJSON,
  profile: HouseholdProfile,
  userId: string  // NUEVO
): Promise<Report> {
  const historyStore = await createSupabaseHistoryStore(userId);
  // ... rest igual
}
```

### 3.3 Test: `eval/test-supabase-history.ts`

- Crea usuario fake en el emulador
- Apenda 5 scores
- Lee los últimos 3
- Verifica orden y valores

---

## FASE 4 — CRUD de usuarios y boletas (día 3-4)

### 4.1 `src/supabase/users.ts` — funciones de usuario

```ts
// getUser(userId): Promise<User>
// updateProfile(userId, profile): Promise<void>
// createReceipt(userId, imagePath, motorJSON): Promise<Receipt>
// getUserReceipts(userId, limit?): Promise<Receipt[]>
// saveReport(userId, receiptId, reportJSON): Promise<void>
```

### 4.2 `src/supabase/receipts.ts` — gestión de boletas

```ts
// uploadReceiptImage(userId, file): Promise<{ path: string }>
// getReceipt(receiptId): Promise<Receipt>
// getReports(receiptId): Promise<Report[]>
```

### 4.3 Test integración: `eval/test-supabase-crud.ts`

- Auth: registrar usuario
- Upload: guardar imagen de boleta en storage
- Create: guardar motor_json en tabla
- Save: guardar reporte completo
- Read: obtener boletas del usuario
- Cleanup: deletear usuario (cascade)

---

## FASE 5 — Integración con CLI y S3 (día 5)

### 5.1 Extender `src/cli.ts` con banderas de usuario

```bash
# Sin usuario: modo local (como ahora)
npx tsx src/cli.ts ./boletas/foto1.jpg --reporte

# Con usuario: guardar en Supabase
npx tsx src/cli.ts ./boletas/foto1.jpg --reporte --user-id <uuid>

# Login interactivo
npx tsx src/cli.ts --auth login  # email + password
npx tsx src/cli.ts --auth login-google
npx tsx src/cli.ts --auth status
```

### 5.2 Flujo con usuario:
1. Validar sesión
2. Subir imagen a `storage/receipts/{userId}/{nombre}`
3. Guardar en tabla `receipts`
4. Correr `buildReport()` (que ahora usa `createSupabaseHistoryStore(userId)`)
5. Guardar en tabla `reports`
6. Imprimir reporte en consola

### 5.3 Test e2e: `eval/test-e2e-supabase.ts`

- Login
- Procesar boleta (todos los pasos)
- Verificar tablas
- Logout

---

## FASE 6 — Evaluación (día 5-6)

1. **Test en verde:** CRUD, auth, history, e2e sin internet simulada (emulador solo).
2. **Latencia:** cada operación <500ms (medir con console.time).
3. **Integridad:** procesar PRUEBA3 (la de mayor % ultraprocesados) con usuario real, verificar en Studio que tablas tienen los datos.
4. **Checklist** en `SUPABASE_CHECKLIST.md`:
   - [ ] Setup local funciona
   - [ ] 4 tablas + 1 bucket creados
   - [ ] Auth (email, Google) funciona
   - [ ] HistoryStore escribe/lee de Supabase
   - [ ] CRUD completo verde
   - [ ] E2E verde
   - [ ] Latencia <500ms
   - [ ] PRUEBA3 guardada en Studio

---

## NOTAS

- **Costo:** Supabase free tier soporta 500 MB storage + 2GB bandwidth/mes. Una foto de boleta ~200 KB, 100 usuarios × 5 boletas = 100 MB. Estamos dentro del tier free para MVP.
- **No quebrar S3:** el motor sigue igual, `buildReport()` tiene la misma firma (adiciona `userId`), los tests de S3 se adaptarán en S5 (backend web).
- **Backlog Capa 2-3:** encriptación de boletas guardadas (S2 future), auditoría de acceso, soft-delete de usuarios.
