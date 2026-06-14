# RESUMEN FASE 5 — ReceiptWell S3

_Generado: 2026-06-12T15:18:30.478Z_

> ⚠ **Ejecución parcial** — cuota de IA agotada. Completados 8/18 reportes.

## Resultados generales

| Métrica | Valor |
|---|---|
| Reportes completados | 8 / 18 |
| Boletas procesadas | 4 / 9 |
| Llamadas IA esta ejecución | 13 |
| Checklist global | ✅ PASA |

## Tiempos por reporte

| Boleta | Perfil | Tiempo reporte | %Ultra | Nivel | Score |
|--------|--------|---------------|--------|-------|-------|
| PRUEBA2 | P1_1adulto_ahorrar | 16.4s | 0.0% | bajo | 100 |
| PRUEBA2 | P2_2adultos2ninos_salud | 21.6s | 0.0% | bajo | 100 |
| PRUEBA3 | P1_1adulto_ahorrar | 20.3s | 53.4% | alto | 47 |
| PRUEBA3 | P2_2adultos2ninos_salud | 21.7s | 53.4% | alto | 42 |
| PRUEBA4 | P1_1adulto_ahorrar | 20.9s | 30.1% | moderado | 70 |
| PRUEBA4 | P2_2adultos2ninos_salud | 29.7s | 30.1% | alto | 65 |
| PRUEBA5 | P1_1adulto_ahorrar | 12.3s | 0.0% | bajo | 100 |
| PRUEBA5 | P2_2adultos2ninos_salud | 20.2s | 0.0% | bajo | 100 |
| PRUEBA6 | P1_1adulto_ahorrar | error | — | rechazo | — |
| PRUEBA6 | P2_2adultos2ninos_salud | error | — | rechazo | — |

## Checklist consolidado

- [x] Capa 1: cifras exactas verificables
- [x] Capa 2: lenguaje protegido (sin palabras prohibidas)
- [x] Capa 2: disclaimer siempre presente
- [x] Capa 3: equivalencias correctas
- [x] Capa 4: exactamente 3 swaps
- [x] Capa 4: productos reales de la boleta
- [x] Capa 4: ahorro en CLP
- [x] Capa 4: disponibleEn con ≥1 supermercado

## Reporte completo de ejemplo
_Boleta con mayor % ultraprocesados: **PRUEBA3** (53.4% NOVA4) — Perfil: P1_1adulto_ahorrar_

### Boleta: PRUEBA3 | Perfil: P1_1adulto_ahorrar

**ID:** fbd81e6a-17d4-46c2-9a81-d3ef4d96435e  
**Fecha:** 2026-06-12T15:15:59.324Z

#### CAPA 1 · Espejo Financiero

| Campo | Valor |
|---|---|
| Total boleta | $24.604 CLP |
| Total ultraprocesados | $13.149 CLP |
| % ultraprocesados | 53.4% |
| Proyección anual | $631.152 CLP |
| Frecuencia asumida | 4 boletas/mes |

#### CAPA 2 · Riesgo de Salud

**Nivel:** ALTO  
**Factores:** 53.4% del gasto en productos NOVA 4 (supera el umbral del 50%)  

**Narrativa:**
> La boleta muestra un alto consumo de productos ultraprocesados (53.4%), lo cual está asociado a un mayor riesgo de enfermedades crónicas no transmisibles. Este patrón alimentario, sumado a un nivel de riesgo alto, podría aumentar el riesgo de condiciones como la obesidad y enfermedades cardiovasculares, y se relaciona con un mayor gasto. Priorizar alimentos frescos y mínimamente procesados puede contribuir a mejorar la salud y optimizar el presupuesto, apoyando el objetivo de ahorro del hogar.

*Este reporte no constituye consejo médico. Consulta a un profesional de la salud para decisiones sobre tu alimentación.*

#### CAPA 3 · Costo en Sudor

| | |
|---|---|
| Calorías totales | 29972 kcal |
| Calorías ultraprocesados | 8498 kcal |
| Caminata equiv. | 34 h |
| Trote equiv. | 14.2 h |
| Gimnasio equiv. | 21.2 sesiones |

#### CAPA 4 · Plan de Corrección

**Swap 1 [SALUD]**  
- Reemplaza: Papas Pre-fritas Congeladas  
- Por: Papas frescas a granel para cocinar en casa  
- Ahorro/mes: $808 CLP  
- Diferencia nutricional: Contiene significativamente menos sodio y grasas saturadas al preparar en casa.  
- Disponible en: Líder, Jumbo, Santa Isabel, Unimarc  

**Swap 2 [DINERO]**  
- Reemplaza: Bebida Gaseosa Cola Zero  
- Por: Bebida Sabor Cola Zero marca Líder 3L  
- Ahorro/mes: $2.352 CLP  
- Diferencia nutricional: Mismo perfil nutricional sin azúcar, con edulcorantes.  
- Disponible en: Líder  

**Swap 3 [EQUILIBRIO]**  
- Reemplaza: Atún Lomito en Conserva  
- Por: Jurel Natural en Conserva marca Líder  
- Ahorro/mes: $160 CLP  
- Diferencia nutricional: Similar aporte de proteínas y omega-3, con menor costo.  
- Disponible en: Líder  

#### Marcador

| Score | Tendencia | Ahorro acumulado |
|---|---|---|
| 47/100 | empeorando | $0 CLP |

## Pendientes por cuota

Boletas sin procesar: PRUEBA6.pdf, PRUEBA7.pdf, PRUEBA8.pdf, PRUEBA9.pdf, WhatsApp Image 2026-06-11 at 22.16.19.jpeg  
Reportes faltantes: 10  
Para continuar: `npx tsx eval/fase5.ts` (los motores ya extraídos se reutilizan desde caché)
