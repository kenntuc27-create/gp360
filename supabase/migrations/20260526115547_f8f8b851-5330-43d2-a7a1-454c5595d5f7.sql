-- Fix remaining schema errors

-- 1. Businesses table (referenced in equipe.performance-geral)
CREATE TABLE IF NOT EXISTS public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Update sector_metrics
ALTER TABLE public.sector_metrics 
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS unit TEXT,
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- 3. Update employees
ALTER TABLE public.employees 
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS cargo TEXT,
ADD COLUMN IF NOT EXISTS segmento TEXT;

-- 4. Update profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS username TEXT,
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;

-- 5. Update meetings
ALTER TABLE public.meetings 
ADD COLUMN IF NOT EXISTS meeting_type TEXT;

-- 6. Update adherence_status
ALTER TABLE public.adherence_status 
ADD COLUMN IF NOT EXISTS production_ok BOOLEAN DEFAULT true;

-- Enable RLS
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public businesses access" ON public.businesses FOR ALL USING (true) WITH CHECK (true);
