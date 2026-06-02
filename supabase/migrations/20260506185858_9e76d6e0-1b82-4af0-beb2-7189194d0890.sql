
ALTER TABLE public.bid_items
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS extraction_method text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS extraction_score numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS extraction_reason text NOT NULL DEFAULT '';

ALTER TABLE public.bids
  ADD COLUMN IF NOT EXISTS extraction_method text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS extraction_score numeric NOT NULL DEFAULT 100;

CREATE INDEX IF NOT EXISTS idx_bid_items_status ON public.bid_items(bid_id, status);
