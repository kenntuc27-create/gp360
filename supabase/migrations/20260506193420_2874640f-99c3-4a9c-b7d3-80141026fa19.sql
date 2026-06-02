ALTER TABLE public.bid_items
  ADD COLUMN IF NOT EXISTS disputar boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS custo_unitario numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preco_venda_manual numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preco_modo text NOT NULL DEFAULT 'margem';