-- Adicionar campos de desconto global na resposta do fornecedor
ALTER TABLE public.bid_supplier_responses
ADD COLUMN IF NOT EXISTS global_discount_type TEXT DEFAULT 'percentage',
ADD COLUMN IF NOT EXISTS global_discount_value NUMERIC DEFAULT 0;

-- Adicionar campos de desconto por item na tabela de preços
ALTER TABLE public.bid_supplier_item_prices
ADD COLUMN IF NOT EXISTS supplier_discount_type TEXT DEFAULT 'percentage',
ADD COLUMN IF NOT EXISTS supplier_discount_value NUMERIC DEFAULT 0;
