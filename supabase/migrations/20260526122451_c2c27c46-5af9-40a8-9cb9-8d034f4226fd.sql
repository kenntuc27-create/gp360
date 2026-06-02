-- Adicionar coluna active faltante na tabela companies
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
