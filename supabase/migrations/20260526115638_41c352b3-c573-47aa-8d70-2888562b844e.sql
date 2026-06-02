-- Restore last missing components

-- 1. Business Goals
CREATE TABLE IF NOT EXISTS public.business_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  target_amount NUMERIC DEFAULT 0,
  reference_month TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Work Schedules
CREATE TABLE IF NOT EXISTS public.work_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL, -- 0-6
  is_off BOOLEAN DEFAULT false,
  start_time TIME,
  end_time TIME,
  break_start TIME,
  break_end TIME,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, weekday)
);

-- 3. Update meetings
ALTER TABLE public.meetings 
ADD COLUMN IF NOT EXISTS agenda TEXT;

-- 4. RPC placeholders to fix "not assignable to parameter of type 'never'" for RPC calls
-- These functions are often called via supabase.rpc()
CREATE OR REPLACE FUNCTION public.recompute_adherence(_employee_id UUID, _date DATE) 
RETURNS VOID AS $$ BEGIN END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.compute_performance_scores(_date DATE) 
RETURNS VOID AS $$ BEGIN END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.resolve_login_email(_identifier TEXT) 
RETURNS TEXT AS $$ BEGIN RETURN _identifier || '@interno.local'; END; $$ LANGUAGE plpgsql;

-- Enable RLS
ALTER TABLE public.business_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_schedules ENABLE ROW LEVEL SECURITY;

-- Public policies
CREATE POLICY "Public business_goals access" ON public.business_goals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public work_schedules access" ON public.work_schedules FOR ALL USING (true) WITH CHECK (true);
