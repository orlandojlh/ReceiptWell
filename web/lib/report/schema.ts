import { z } from "zod";

export const HouseholdProfileSchema = z.object({
  adultos: z.number().int().min(1).default(1),
  ninos: z.number().int().min(0).default(0),
  objetivo: z.enum(["ahorrar", "salud", "equilibrio"]).default("equilibrio"),
  condiciones: z
    .array(z.enum(["hipertension", "diabetes", "sobrepeso", "colesterol"]))
    .default([]),
});

export type HouseholdProfile = z.infer<typeof HouseholdProfileSchema>;

const SwapSchema = z.object({
  producto: z.string(),
  alternativa: z.string(),
  tipo: z.enum(["salud", "dinero", "equilibrio"]),
  ahorroCLPMes: z.number().int(),
  diferenciaNutricional: z.string(),
  disponibleEn: z.array(
    z.enum(["Líder", "Jumbo", "Santa Isabel", "Unimarc"])
  ),
});

export type Swap = z.infer<typeof SwapSchema>;

export const ReportSchema = z.object({
  version: z.literal("report-v1"),
  boletaId: z.string(),
  fecha: z.string(),
  capa1_espejoFinanciero: z.object({
    totalBoleta: z.number(),
    totalUltraprocesados: z.number(),
    pctUltraprocesados: z.number(),
    proyeccionAnualUltra: z.number(),
    frecuenciaAsumida: z.number(),
  }),
  capa2_riesgoSalud: z.object({
    nivel: z.enum(["bajo", "moderado", "alto"]),
    factores: z.array(z.string()),
    narrativa: z.string(),
    disclaimer: z.string(),
  }),
  capa3_costoEnSudor: z.object({
    caloriasTotales: z.number(),
    caloriasUltra: z.number(),
    equivalencias: z.object({
      caminataHoras: z.number(),
      troteHoras: z.number(),
      gimnasioSesiones: z.number(),
    }),
  }),
  capa4_planCorreccion: z.object({
    swaps: z.array(SwapSchema).length(3),
  }),
  marcador: z.object({
    ahorroAcumuladoCLP: z.number(),
    score: z.number().int().min(0).max(100),
    tendencia: z.enum([
      "mejorando",
      "estable",
      "empeorando",
      "primera_boleta",
    ]),
  }),
});

export type Report = z.infer<typeof ReportSchema>;
