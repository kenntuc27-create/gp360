-- Restore remaining pos-entrega tables

-- 1. Bid Deliveries
CREATE TABLE IF NOT EXISTS public.bid_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_id UUID NOT NULL REFERENCES public.bids(id) ON DELETE CASCADE,
  delivery_date DATE,
  delivery_time TIME,
  responsavel TEXT,
  transportadora TEXT,
  nfe_numero TEXT,
  nfe_chave TEXT,
  empenho_numero TEXT,
  ordem_fornecimento TEXT,
  local_entrega TEXT,
  observacoes TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Bid Delivery Checklist
CREATE TABLE IF NOT EXISTS public.bid_delivery_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.bid_deliveries(id) ON DELETE CASCADE,
  confirmacao_orgao BOOLEAN DEFAULT false,
  danfe_anexada BOOLEAN DEFAULT false,
  empenho_anexado BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Bid Delivery Evidences
CREATE TABLE IF NOT EXISTS public.bid_delivery_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.bid_deliveries(id) ON DELETE CASCADE,
  tipo TEXT,
  nome TEXT,
  url TEXT,
  size_bytes INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Bid Delivery Acceptance
CREATE TABLE IF NOT EXISTS public.bid_delivery_acceptance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.bid_deliveries(id) ON DELETE CASCADE,
  servidor_nome TEXT,
  servidor_cargo TEXT,
  servidor_matricula TEXT,
  servidor_cpf TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Additional bids column
ALTER TABLE public.bids 
ADD COLUMN IF NOT EXISTS data_encerramento_propostas TIMESTAMPTZ;

-- Enable RLS
ALTER TABLE public.bid_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bid_delivery_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bid_delivery_evidences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bid_delivery_acceptance ENABLE ROW LEVEL SECURITY;

-- Public policies
CREATE POLICY "Public bid_deliveries access" ON public.bid_deliveries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public bid_delivery_checklist access" ON public.bid_delivery_checklist FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public bid_delivery_evidences access" ON public.bid_delivery_evidences FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public bid_delivery_acceptance access" ON public.bid_delivery_acceptance FOR ALL USING (true) WITH CHECK (true);
