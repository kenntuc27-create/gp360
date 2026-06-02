-- Adicionar colunas de rastreamento na tabela bids
ALTER TABLE public.bids 
ADD COLUMN IF NOT EXISTS structural_map JSONB DEFAULT '{}'::jsonb;

-- Adicionar colunas de rastreamento na tabela bid_items
ALTER TABLE public.bid_items 
ADD COLUMN IF NOT EXISTS extraction_page INTEGER,
ADD COLUMN IF NOT EXISTS extraction_metadata JSONB DEFAULT '{}'::jsonb;

-- Criar índices para melhorar a performance de consultas por metadados se necessário futuramente
CREATE INDEX IF NOT EXISTS idx_bid_items_extraction_page ON public.bid_items(extraction_page);
