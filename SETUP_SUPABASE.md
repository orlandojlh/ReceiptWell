# Setup Supabase Local — ReceiptWell S4

## Estado actual

| Paso | Estado |
|------|--------|
| Supabase CLI instalado (v2.106.0) | ✅ |
| `supabase init` ejecutado | ✅ |
| Migración SQL creada (`supabase/migrations/`) | ✅ |
| Docker Desktop corriendo | ⏳ **Requiere acción manual** |
| `supabase start` ejecutado | ⏳ Pendiente de Docker |
| `.env.local` con credenciales del emulador | ⏳ Pendiente de `supabase start` |

---

## Paso a paso para completar el setup

### 1. Abre Docker Desktop

Busca **Docker Desktop** en el menú Inicio de Windows y ábrelo.  
Espera hasta ver el ícono de ballena en la barra del sistema con estado **"Engine running"**.

### 2. Levanta el emulador

```bash
cd C:\Users\ojlh\OneDrive\Desktop\ReceiptWell
supabase start
```

Esto descarga las imágenes de Docker (solo la primera vez, ~500 MB) y aplica la migración automáticamente.  
Cuando termine, verás una salida como esta:

```
Started supabase local development setup.

         API URL: http://127.0.0.1:54321
     GraphQL URL: http://127.0.0.1:54321/graphql/v1
  S3 Storage URL: http://127.0.0.1:54321/storage/v1/s3
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      Studio URL: http://127.0.0.1:54323
    Inbucket URL: http://127.0.0.1:54324
      anon key: eyJhbGciO...
  service_role key: eyJhbGciO...
```

### 3. Copia las credenciales a `.env.local`

```bash
cp .env.local.example .env.local
```

Luego edita `.env.local` y pega los valores que devolvió `supabase start`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<anon key del paso anterior>
SUPABASE_SERVICE_ROLE_KEY=<service_role key del paso anterior>
```

### 4. Verifica que todo está corriendo

```bash
supabase status
```

Debe mostrar: `supabase local development setup is running`.

### 5. Abre Supabase Studio

Ve a **http://localhost:54323** en el navegador.  
Deberías ver las 4 tablas creadas:
- `users`
- `receipts`
- `reports`
- `score_history`

Y en **Storage** el bucket `receipts`.

---

## Verificación rápida de las tablas

En el SQL Editor de Studio (http://localhost:54323/project/default/sql), ejecuta:

```sql
select table_name from information_schema.tables
where table_schema = 'public'
order by table_name;
```

Resultado esperado: `receipts`, `reports`, `score_history`, `users`.

---

## Comandos útiles

| Comando | Descripción |
|---------|-------------|
| `supabase start` | Levanta el emulador |
| `supabase stop` | Detiene el emulador |
| `supabase status` | Muestra URLs y estado |
| `supabase db reset --local` | Borra y recrea la base (aplica migraciones desde cero) |
| `supabase migration new <nombre>` | Crea una nueva migración |

---

## Estructura de archivos creados en esta fase

```
ReceiptWell/
├── supabase/
│   ├── config.toml                          # Config del proyecto Supabase
│   └── migrations/
│       └── 20240101000000_initial_schema.sql  # 4 tablas + bucket
├── .env.local.example                       # Plantilla de credenciales
└── SETUP_SUPABASE.md                        # Este archivo
```

---

## Esquema de base de datos

```
users            → perfil del usuario (RLS: solo ve el propio)
receipts         → boletas escaneadas con motor_json (RLS: solo ve las propias)
reports          → reportes de 4 capas con report_json (RLS: solo ve los propios)
score_history    → historial de scores para tendencia (RLS: solo ve/inserta el propio)
storage/receipts → bucket privado para imágenes de boletas
```

Todas las tablas tienen **Row Level Security (RLS)** habilitado.

---

## Troubleshooting

**"failed to inspect service: error during connect"**  
→ Docker Desktop no está corriendo. Ábrelo desde el menú Inicio.

**"port already in use"**  
→ Otro proceso usa el puerto 54321/54322/54323. Ejecuta `supabase stop` y vuelve a intentar.

**"supabase: command not found"**  
→ `npm install -g supabase` y reinicia la terminal.

**Migraciones no se aplicaron**  
→ `supabase db reset --local` para recrear desde cero.
