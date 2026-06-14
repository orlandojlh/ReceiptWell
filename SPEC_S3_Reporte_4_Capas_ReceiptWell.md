# SPEC PARA CLAUDE CODE — ReceiptWell · Semana 3: Reporte de 4 Capas

> **Cómo usar este archivo:** abre Claude Code en la carpeta existente `receiptwell` y pégale:
> *"Lee el archivo SPEC_S3_Reporte_4_Capas_ReceiptWell.md e implementa todo exactamente como dice, fase por fase. Confírmame al terminar cada fase. No toques el motor de extracción existente (src/engine/analyze.ts, schema.ts, prompts extract-v1/v2): el reporte se construye SOBRE su salida JSON."*

---

## OBJETIVO (criterio de éxito de S3)

Una función `buildReport()` que recibe el **JSON validado del motor de S1-2** + un **perfil de hogar mínimo** y devuelve un **JSON de reporte con las 4 capas**, listo para que el frontend (S4) lo renderice sin lógica adicional.

**Principio arquitectónico clave:** todo lo que es **matemática se calcula en TypeScript** (determinístico, gratis, testeable). La IA solo se usa para lo que requiere conocimiento: **swaps** (capa 4) y **narrativa de salud** (capa 2). Esto mantiene el costo por boleta en ~US$0,02 y la precisión numérica en 100%.

**Cortes de aceptación S3:**
- Reporte completo en <30 segundos adicionales al análisis (total boleta→reporte <90 seg).
- Capas 1 y 3: cifras exactas verificables a mano (0 errores en 10 boletas de prueba).
- Capa 2: SIEMPRE contiene lenguaje "asociado a" / "puede contribuir a" + disclaimer. Test automático que falla si falta.
- Capa 4: 3 swaps por reporte, cada uno con ahorro en $ CLP/mes y diferencia nutricional concreta.

**Fuera de alcance S3:** usuarios, frontend, pagos, límites freemium (eso es S4-S5). El historial para score/ahorro acumulado se persiste en un archivo JSON local como stub — en S4 se reemplaza por Supabase sin cambiar la interfaz.

---

## FASE 1 — Esquemas y perfil de hogar (día 1)

### 1.1 Nuevo archivo `src/report/schema.ts` (Zod)

```ts
// Perfil de hogar (entrada, mínimo viable)
HouseholdProfile = {
  adultos: number,            // default 1
  ninos: number,              // default 0
  objetivo: "ahorrar" | "salud" | "equilibrio",  // default "equilibrio"
  condiciones: string[]       // opcional, autodeclaradas: "hipertension" | "diabetes" | "sobrepeso" | "colesterol"
}

// Reporte (salida)
Report = {
  version: "report-v1",
  boletaId: string,
  fecha: string,
  capa1_espejoFinanciero: {
    totalBoleta: number,
    totalUltraprocesados: number,        // suma NOVA 4
    pctUltraprocesados: number,          // 0-100, 1 decimal
    proyeccionAnualUltra: number,        // totalUltra × frecuencia mensual estimada × 12
    frecuenciaAsumida: number            // boletas/mes usadas en la proyección (default 4)
  },
  capa2_riesgoSalud: {
    nivel: "bajo" | "moderado" | "alto", // calculado por reglas (ver 2.2)
    factores: string[],                  // ej: "62% del gasto en NOVA 4"
    narrativa: string,                   // generada por IA, lenguaje protegido
    disclaimer: string                   // SIEMPRE: "Este reporte no constituye consejo médico..."
  },
  capa3_costoEnSudor: {
    caloriasTotales: number,
    caloriasUltra: number,
    equivalencias: {
      caminataHoras: number,             // kcalUltra / 250 kcal/h
      troteHoras: number,                // kcalUltra / 600 kcal/h
      gimnasioSesiones: number           // kcalUltra / 400 kcal/sesión (1h)
    }
  },
  capa4_planCorreccion: {
    swaps: [                             // exactamente 3
      {
        producto: string,                // producto de la boleta a reemplazar
        alternativa: string,
        tipo: "salud" | "dinero" | "equilibrio",
        ahorroCLPMes: number,            // puede ser 0 o negativo si el swap es por salud
        diferenciaNutricional: string,   // concreta: "-12 g azúcar por porción"
        disponibleEn: string[]           // subset de [Líder, Jumbo, Santa Isabel, Unimarc]
      }
    ]
  },
  marcador: {
    ahorroAcumuladoCLP: number,          // suma histórica de swaps aceptados (stub local)
    score: number,                       // 0-100 (ver 2.3)
    tendencia: "mejorando" | "estable" | "empeorando" | "primera_boleta"
  }
}
```

### 1.2 Validar con Zod en la frontera: si la IA devuelve swaps malformados → 1 reintento → si falla, swaps de fallback genéricos por categoría (hardcodeados en `src/report/fallback-swaps.ts`).

---

## FASE 2 — Cálculos determinísticos (días 2-3)

### 2.1 `src/report/calc.ts` — Capas 1 y 3 (puro TypeScript, sin IA)

- **Capa 1:** sumas y porcentajes directos del JSON del motor. Proyección anual = totalUltra × 4 boletas/mes × 12 (el 4 es configurable; cuando exista historial real en S4, se reemplaza por la frecuencia observada).
- **Capa 3:** usar calorías estimadas del motor. Constantes (adulto ~70 kg, valores estándar): caminata 250 kcal/h, trote 600 kcal/h, sesión gimnasio 400 kcal. Redondear a 1 decimal. Comentar las constantes en el código con su fuente para auditoría futura.

### 2.2 `src/report/risk.ts` — Nivel de riesgo por reglas (sin IA)

Base por % de gasto NOVA 4: <25% bajo · 25-50% moderado · >50% alto.
Modificadores: +1 nivel si hay `condiciones` declaradas Y pctUltra >25% · +1 nivel si hay niños Y pctUltra >40% (tope: "alto"). Los `factores` se generan de las reglas que dispararon (texto fijo, no IA).

### 2.3 `src/report/score.ts` — Score 0-100

`score = 100 − pctUltraprocesados`, ajustado: −5 si nivel "alto" con condiciones declaradas, +5 si hay ≥2 productos NOVA 1 en el top-5 de gasto. Clamp 0-100.
**Tendencia:** comparar contra promedio de las últimas 3 boletas del historial; diferencia ±3 puntos = "estable".

### 2.4 `src/report/history.ts` — Persistencia stub

Lee/escribe `data/history.json` (array de {fecha, score, ahorroAceptadoCLP}). Interfaz `HistoryStore` con métodos `append()` y `recent(n)` — en S4 se implementa la misma interfaz contra Supabase.

### 2.5 Tests: `eval/test-calc.ts` con 3 boletas sintéticas de cifras conocidas. Las capas 1 y 3 deben dar exacto.

---

## FASE 3 — Prompt de IA para capas 2 y 4 (días 3-5)

### 3.1 Nuevo prompt versionado `src/prompts/report-v1.ts`

Una sola llamada a la IA (reutilizar el cliente existente en `src/engine/client.ts`) que recibe: lista de productos con NOVA y precios + perfil de hogar + nivel de riesgo ya calculado. Devuelve SOLO JSON con: `narrativaSalud` (capa 2) y `swaps[3]` (capa 4).

**Reglas duras dentro del prompt:**
1. Narrativa de salud: máximo 3 frases, SOLO lenguaje "asociado a" / "puede contribuir a". Prohibido: "causa", "provoca", "tendrás", diagnósticos. Tono: error + solución, nunca culpa sola.
2. Swaps: exactamente 3, uno de cada tipo (salud / dinero / equilibrio) cuando sea posible. Cada uno reemplaza un producto REAL de la boleta. Alternativas de marcas/formatos disponibles en Líder, Jumbo, Santa Isabel y Unimarc (preferir marcas propias: Great Value, Cuisine&Co, Líder, Jumbo). Ahorro mensual = (precio actual − precio alternativa estimado) × compras/mes estimadas, en CLP enteros.
3. Si la boleta tiene <3 productos NOVA 3-4, completar con swaps de "optimización de precio" (mismo producto, formato más conveniente).
4. El disclaimer NO lo genera la IA: se concatena fijo en código: *"Este reporte no constituye consejo médico. Consulta a un profesional de la salud para decisiones sobre tu alimentación."*

### 3.2 Guardia post-IA `src/report/guard.ts`

Regex que escanea la narrativa: si contiene palabras prohibidas ("causa", "provoca", "enfermarás", "tendrás diabetes", etc.) → 1 reintento con instrucción correctiva → si persiste, narrativa de fallback fija por nivel de riesgo. Test automático en `eval/test-guard.ts`.

---

## FASE 4 — Integración y CLI (día 5)

### 4.1 `src/report/build.ts`

```ts
buildReport(motorJSON, profile, historyStore): Promise<Report>
// orquesta: calc → risk → llamada IA → guard → score → history.append → Report validado por Zod
```

### 4.2 Extender `src/cli.ts`

`npx tsx src/cli.ts ./boletas/foto1.jpg --reporte --perfil ./perfil.json`
Imprime el reporte formateado en consola (legible) Y guarda el JSON en `data/reportes/`. Incluir `perfil.ejemplo.json` en el repo.

---

## FASE 5 — Evaluación con boletas reales (días 6-7)

1. Correr las 8 boletas válidas de S1-2 con 2 perfiles distintos (hogar 1 adulto objetivo "ahorrar" / hogar 2 adultos + 2 niños con "hipertension" objetivo "salud").
2. Checklist por reporte (rellenar en `eval/checklist-s3.md`):
   - [ ] Capa 1: cifras exactas vs. cálculo manual
   - [ ] Capa 2: lenguaje protegido + disclaimer presente
   - [ ] Capa 3: equivalencias correctas
   - [ ] Capa 4: 3 swaps, productos reales de la boleta, ahorro en CLP, disponibles en los 4 supermercados
   - [ ] Tiempo total <90 seg
3. **Corte:** 16/16 reportes pasan el checklist → S3 cerrada, avanzamos a S4 (backend/usuarios). Si fallan swaps, iterar a `report-v2.ts` (nunca editar v1: prompts versionados).

---

## NOTAS DE COSTO Y PLAZO

- S3 agrega **1 llamada IA por boleta** (la de swaps/narrativa). Costo estimado total por boleta sigue ≤US$0,03 — dentro de la economía unitaria aprobada.
- Si sigue activo el límite de 20 análisis/día del plan gratuito: las Fases 1-2 y los tests de cálculo NO consumen cuota (son TypeScript puro). Reservar la cuota para Fases 3 y 5.
- Backlog Capa 2-3 (anotado, NO construir): personalización de swaps por historial de aceptación; equivalencias de sudor ajustadas por peso real del usuario.
