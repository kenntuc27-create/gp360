ALTER TABLE public.bids
  ADD COLUMN IF NOT EXISTS resultado text,
  ADD COLUMN IF NOT EXISTS resultado_motivo text DEFAULT '',
  ADD COLUMN IF NOT EXISTS finalizada_em timestamptz;

ALTER TABLE public.bid_items
  ADD COLUMN IF NOT EXISTS venceu boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preco_homologado numeric NOT NULL DEFAULT 0;