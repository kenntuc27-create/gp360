
ALTER TABLE public.bid_supplier_responses
  ADD COLUMN IF NOT EXISTS extraction_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS extraction_progress integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extraction_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extraction_error text NOT NULL DEFAULT '';
