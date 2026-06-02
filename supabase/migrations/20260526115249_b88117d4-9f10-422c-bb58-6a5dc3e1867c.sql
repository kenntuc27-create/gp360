-- Expand schema to match application requirements and fix TS errors

-- 1. Segments (Needed for dashboard filters and extraction)
CREATE TABLE IF NOT EXISTS public.segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Companies (Needed for exporters)
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tipo TEXT, -- empreendimentos / medicamentos
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Sector Metrics (Needed for SectorRanking)
CREATE TABLE IF NOT EXISTS public.sector_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES public.sectors(id),
  daily_goal NUMERIC DEFAULT 0,
  reference_month TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Add missing columns to performance_scores
ALTER TABLE public.performance_scores 
ADD COLUMN IF NOT EXISTS previous_classification TEXT;

-- 5. Add missing columns to bid_supplier_responses
ALTER TABLE public.bid_supplier_responses 
ADD COLUMN IF NOT EXISTS proposal_validity TEXT,
ADD COLUMN IF NOT EXISTS observations TEXT;

-- 6. Add missing columns to bid_supplier_item_prices
ALTER TABLE public.bid_supplier_item_prices 
ADD COLUMN IF NOT EXISTS frete_unitario NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS imposto_pct NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS marca TEXT,
ADD COLUMN IF NOT EXISTS prazo TEXT,
ADD COLUMN IF NOT EXISTS observacao TEXT;

-- 7. Add missing column to suppliers for ranking
ALTER TABLE public.suppliers 
ADD COLUMN IF NOT EXISTS performance_metrics JSONB DEFAULT '{}'::jsonb;

-- Enable RLS
ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sector_metrics ENABLE ROW LEVEL SECURITY;

-- Public access policies
CREATE POLICY "Public segments access" ON public.segments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public companies access" ON public.companies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public sector_metrics access" ON public.sector_metrics FOR ALL USING (true) WITH CHECK (true);
