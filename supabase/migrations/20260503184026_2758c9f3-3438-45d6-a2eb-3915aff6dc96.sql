
ALTER TABLE public.bid_supplier_item_prices
  ADD COLUMN IF NOT EXISTS unidade_fornecedor text DEFAULT '',
  ADD COLUMN IF NOT EXISTS preco_embalagem_fornecedor numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fator_conversao numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS divergence_reason text DEFAULT '';
