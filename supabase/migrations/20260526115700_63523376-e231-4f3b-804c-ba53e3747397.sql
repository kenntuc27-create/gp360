-- Restore final missing fields

-- 1. Meetings additional columns
ALTER TABLE public.meetings 
ADD COLUMN IF NOT EXISTS guidelines TEXT;

-- 2. Time Punches additional columns
ALTER TABLE public.time_punches 
ADD COLUMN IF NOT EXISTS delay_minutes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS classification TEXT;

-- 3. Update RPCs with correct parameters
CREATE OR REPLACE FUNCTION public.recompute_adherence(_employee_id UUID, _date DATE) 
RETURNS VOID AS $$ BEGIN END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.compute_performance_scores(_date DATE) 
RETURNS VOID AS $$ BEGIN END; $$ LANGUAGE plpgsql;
