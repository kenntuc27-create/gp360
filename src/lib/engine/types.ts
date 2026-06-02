import { z } from "zod";

export const ExtractionConfidenceSchema = z.object({
  score: z.number().min(0).max(100),
  reason: z.string().optional(),
  page: z.number().optional(),
  region: z.string().optional(),
  field_confidence: z.record(z.string(), z.number()).optional(), // Score por campo
});

export const EngineItemSchema = z.object({
  item_number: z.number(),
  lote: z.string().optional(),
  descricao: z.string(),
  unidade: z.string().default("UN"),
  quantidade: z.number(),
  valor_unitario: z.number().optional().default(0),
  valor_total: z.number().optional().default(0),
  marca: z.string().optional(),
  catmat: z.string().optional(),
  me_epp: z.boolean().optional(),
  confidence: ExtractionConfidenceSchema.optional(),
});

export const EngineHeaderSchema = z.object({
  orgao: z.string().default(""),
  secretaria: z.string().optional(),
  uasg: z.string().optional(),
  modalidade: z.string().optional(),
  numero_pregao: z.string().optional(),
  processo: z.string().optional(),
  objeto: z.string().default(""),
  data_abertura: z.string().optional(),
  data_inicio_propostas: z.string().optional(),
  data_encerramento_propostas: z.string().optional(),
  data_limite_entrega: z.string().optional(),
  prazo_entrega: z.string().optional(),
  local_entrega: z.string().optional(),
  portal: z.string().optional(),
  cidade_uf: z.string().optional(),
  contato_responsavel: z.string().optional(),
  contato_email: z.string().optional(),
  contato_tel: z.string().optional(),
  valor_total_estimado: z.number().optional(),
  confidence: ExtractionConfidenceSchema.optional(),
});

export const StructuralRegionSchema = z.object({
  type: z.enum(["header", "items", "financial", "attachments", "legal", "signatures", "other"]),
  pages: z.array(z.number()),
  confidence: z.number().min(0).max(100),
  description: z.string().optional(),
  coordinates: z.any().optional(), // Para visualização futura
});

export const DocumentMapSchema = z.object({
  regions: z.array(StructuralRegionSchema),
  total_pages: z.number(),
  is_scanned: z.boolean().default(false),
  has_tables: z.boolean().default(true),
  rotation_needed: z.number().optional().default(0),
});

export type EngineItem = z.infer<typeof EngineItemSchema>;
export type EngineHeader = z.infer<typeof EngineHeaderSchema>;
export type DocumentMap = z.infer<typeof DocumentMapSchema>;
export type StructuralRegion = z.infer<typeof StructuralRegionSchema>;
export type ExtractionConfidence = z.infer<typeof ExtractionConfidenceSchema>;
