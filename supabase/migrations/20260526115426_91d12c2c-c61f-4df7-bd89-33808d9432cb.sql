-- Adding missing fields to pos-entrega tables

-- 1. Bids additional column
ALTER TABLE public.bids 
ADD COLUMN IF NOT EXISTS data_limite_entrega DATE;

-- 2. Bid Deliveries additional columns
ALTER TABLE public.bid_deliveries 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pendente',
ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;

-- 3. Bid Delivery Checklist additional columns
ALTER TABLE public.bid_delivery_checklist 
ADD COLUMN IF NOT EXISTS evidencias_anexadas BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS mercadoria_entregue BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS nfe_emitida BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS of_anexada BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS termo_assinado BOOLEAN DEFAULT false;

-- 4. Bid Delivery Evidences additional columns
ALTER TABLE public.bid_delivery_evidences 
ADD COLUMN IF NOT EXISTS mime_type TEXT,
ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ DEFAULT now();

-- 5. Bid Delivery Acceptance additional columns
ALTER TABLE public.bid_delivery_acceptance 
ADD COLUMN IF NOT EXISTS orgao_setor TEXT,
ADD COLUMN IF NOT EXISTS signature_data_url TEXT,
ADD COLUMN IF NOT EXISTS acceptance_date DATE,
ADD COLUMN IF NOT EXISTS pdf_url TEXT,
ADD COLUMN IF NOT EXISTS observacoes TEXT;
