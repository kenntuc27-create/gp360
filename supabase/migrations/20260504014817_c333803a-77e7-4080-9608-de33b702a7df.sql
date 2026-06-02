
ALTER TABLE public.bid_items
  ADD COLUMN IF NOT EXISTS modelo text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS margin_pct numeric NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS chosen_response_id uuid,
  ADD COLUMN IF NOT EXISTS chosen_manual boolean NOT NULL DEFAULT false;

ALTER TABLE public.bid_supplier_item_prices
  ADD COLUMN IF NOT EXISTS frete_unitario numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS imposto_pct numeric NOT NULL DEFAULT 0;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'distribuidor';
