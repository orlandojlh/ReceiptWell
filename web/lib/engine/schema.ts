import { z } from "zod";

const ProductoSchema = z.object({
  nombre: z.string(),
  nombre_boleta: z.string(),
  precio: z.number().int(),
  cantidad: z.number(),
  categoria_nova: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  confianza_nova: z.union([z.literal("alta"), z.literal("media"), z.literal("baja")]),
  calorias_estimadas: z.number().int(),
  es_alimento: z.boolean(),
});

const TotalesSchema = z.object({
  total_boleta: z.number().int(),
  total_alimentos: z.number().int(),
  total_nova4: z.number().int(),
  porcentaje_ultraprocesado: z.number(),
  calorias_totales: z.number().int(),
});

export const ResultadoOkSchema = z.object({
  estado: z.literal("ok"),
  supermercado: z.union([
    z.literal("Lider"),
    z.literal("Jumbo"),
    z.literal("Santa Isabel"),
    z.literal("Unimarc"),
    z.literal("otro"),
  ]),
  fecha_boleta: z.string().nullable(),
  productos: z.array(ProductoSchema),
  totales: TotalesSchema,
  advertencias: z.array(z.string()),
});

export const ResultadoRechazoSchema = z.object({
  estado: z.literal("rechazo"),
  motivo: z.union([
    z.literal("ilegible"),
    z.literal("no_es_supermercado"),
    z.literal("no_es_boleta"),
  ]),
  mensaje_usuario: z.string(),
  se_proceso: z.boolean(),
});

export const ResultadoSchema = z.discriminatedUnion("estado", [
  ResultadoOkSchema,
  ResultadoRechazoSchema,
]);

export type Producto = z.infer<typeof ProductoSchema>;
export type Totales = z.infer<typeof TotalesSchema>;
export type ResultadoOk = z.infer<typeof ResultadoOkSchema>;
export type ResultadoRechazo = z.infer<typeof ResultadoRechazoSchema>;
export type Resultado = z.infer<typeof ResultadoSchema>;
