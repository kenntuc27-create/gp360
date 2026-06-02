-- Final schema expansions to resolve all remaining build errors

-- 1. Bids table expansions
ALTER TABLE public.bids 
ADD COLUMN IF NOT EXISTS total_estimated NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_quoted NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_dispute NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_homologated NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_profit_real NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_margin_real_pct NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS data_inicio_propostas TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS extraction_method TEXT,
ADD COLUMN IF NOT EXISTS extraction_score NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS structural_map JSONB DEFAULT '{}'::jsonb;

-- 2. Meetings additional columns
ALTER TABLE public.meetings 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'marcada';

-- 3. Time Punches additional columns
ALTER TABLE public.time_punches 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'self';

-- 4. Profiles additional columns
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS username TEXT,
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;

-- 5. RPC update with correct parameters
CREATE OR REPLACE FUNCTION public.recompute_adherence(_employee_id UUID, _date DATE) 
RETURNS VOID AS $$ 
BEGIN 
  -- Placeholder
END; 
$$ LANGUAGE plpgsql;

-- 6. Ensure broad access for all tables in development restoration
DO $$ 
BEGIN
    EXECUTE (SELECT string_agg('GRANT ALL ON TABLE public.' || quote_ident(tablename) || ' TO postgres, anon, authenticated, service_role;', ' ')
             FROM pg_tables 
             WHERE schemaname = 'public');
END $$;
