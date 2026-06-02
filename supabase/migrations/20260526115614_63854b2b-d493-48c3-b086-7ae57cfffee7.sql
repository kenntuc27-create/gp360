-- Final final fixes for schema

-- 1. Employee Businesses junction table
CREATE TABLE IF NOT EXISTS public.employee_businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, business_id)
);

-- 2. System configs table (referenced in some routes)
CREATE TABLE IF NOT EXISTS public.system_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Update sectors
ALTER TABLE public.sectors 
ADD COLUMN IF NOT EXISTS monthly_revenue_target NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS working_days INTEGER DEFAULT 22;

-- 4. Update meetings
ALTER TABLE public.meetings 
ADD COLUMN IF NOT EXISTS area TEXT;

-- Enable RLS
ALTER TABLE public.employee_businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_configs ENABLE ROW LEVEL SECURITY;

-- Public policies
CREATE POLICY "Public employee_businesses access" ON public.employee_businesses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public system_configs access" ON public.system_configs FOR ALL USING (true) WITH CHECK (true);
