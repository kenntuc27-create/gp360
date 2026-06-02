-- Final schema adjustments to resolve remaining TS errors

-- 1. Audit Log (Restoring for AuditoriaRoute)
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  user_email TEXT,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Push Subscriptions (Restoring for push notifications)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT,
  auth TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Company Settings (Singleton for brand settings)
CREATE TABLE IF NOT EXISTS public.company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT DEFAULT 'Gestão Pará',
  phone TEXT,
  email TEXT,
  city TEXT,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#1e3a6f',
  proposal_validity_days INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Bid Items - missing complex columns
ALTER TABLE public.bid_items 
ADD COLUMN IF NOT EXISTS modelo TEXT,
ADD COLUMN IF NOT EXISTS chosen_response_id UUID,
ADD COLUMN IF NOT EXISTS chosen_manual BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS categoria TEXT,
ADD COLUMN IF NOT EXISTS catmat TEXT,
ADD COLUMN IF NOT EXISTS lote TEXT,
ADD COLUMN IF NOT EXISTS me_epp BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS dispute_value NUMERIC,
ADD COLUMN IF NOT EXISTS invoiced_value NUMERIC,
ADD COLUMN IF NOT EXISTS received_value NUMERIC,
ADD COLUMN IF NOT EXISTS profit_margin_pct NUMERIC;

-- 5. Bid Supplier Responses - missing complex columns
ALTER TABLE public.bid_supplier_responses 
ADD COLUMN IF NOT EXISTS global_discount_type TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS global_discount_value NUMERIC DEFAULT 0;

-- 6. Bid Supplier Item Prices - missing complex columns
ALTER TABLE public.bid_supplier_item_prices 
ADD COLUMN IF NOT EXISTS supplier_discount_type TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS supplier_discount_value NUMERIC DEFAULT 0;

-- 7. Suppliers - missing 'tipo'
ALTER TABLE public.suppliers 
ADD COLUMN IF NOT EXISTS tipo TEXT;

-- 8. Companies - missing brand columns
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS display_name TEXT,
ADD COLUMN IF NOT EXISTS razao_social TEXT,
ADD COLUMN IF NOT EXISTS cnpj TEXT,
ADD COLUMN IF NOT EXISTS declaracoes TEXT[];

-- 9. User Roles - missing sector_id
ALTER TABLE public.user_roles 
ADD COLUMN IF NOT EXISTS sector_id UUID REFERENCES public.sectors(id);

-- 10. Daily Production Metrics - missing metric_id
ALTER TABLE public.daily_production_metrics 
ADD COLUMN IF NOT EXISTS metric_id UUID REFERENCES public.sector_metrics(id);

-- Enable RLS
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- Public policies
CREATE POLICY "Public audit_log access" ON public.audit_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public push_subscriptions access" ON public.push_subscriptions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public company_settings access" ON public.company_settings FOR ALL USING (true) WITH CHECK (true);
