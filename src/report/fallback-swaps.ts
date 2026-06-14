import type { Swap } from "./schema.js";

// Swaps genéricos de fallback por categoría, usados cuando la IA falla 2 veces.
// Cubre los 3 tipos requeridos: salud, dinero, equilibrio.
export const FALLBACK_SWAPS: Swap[] = [
  {
    producto: "Bebida azucarada",
    alternativa: "Agua mineral o agua saborizada sin azúcar (marca propia)",
    tipo: "salud",
    ahorroCLPMes: 3200,
    diferenciaNutricional: "-27 g azúcar por porción de 500 ml",
    disponibleEn: ["Líder", "Jumbo", "Santa Isabel", "Unimarc"],
  },
  {
    producto: "Snack ultraprocesado",
    alternativa: "Frutos secos o maní tostado sin sal (Great Value / Jumbo)",
    tipo: "dinero",
    ahorroCLPMes: 1800,
    diferenciaNutricional: "-8 g grasa saturada por porción de 30 g",
    disponibleEn: ["Líder", "Jumbo"],
  },
  {
    producto: "Cereal azucarado",
    alternativa: "Avena tradicional (Cuisine&Co / Líder)",
    tipo: "equilibrio",
    ahorroCLPMes: 2500,
    diferenciaNutricional: "-18 g azúcar por porción de 40 g, +4 g fibra",
    disponibleEn: ["Líder", "Jumbo", "Santa Isabel", "Unimarc"],
  },
];
