-- Restore missing bid columns

ALTER TABLE public.bids 
ADD COLUMN IF NOT EXISTS uasg TEXT;

ALTER TABLE public.bid_items 
ADD COLUMN IF NOT EXISTS preco_modo TEXT DEFAULT 'preco';
