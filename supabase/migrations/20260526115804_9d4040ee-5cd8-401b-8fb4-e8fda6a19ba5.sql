-- Resyncing schema to match application expectations and fix build errors

-- 1. Ensure profiles has all expected fields
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS username TEXT,
ADD COLUMN IF NOT EXISTS cargo TEXT,
ADD COLUMN IF NOT EXISTS segmento TEXT,
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS full_name TEXT;

-- 2. Ensure employees has correct fields
ALTER TABLE public.employees 
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS cargo TEXT,
ADD COLUMN IF NOT EXISTS segmento TEXT,
ADD COLUMN IF NOT EXISTS user_id UUID;

-- 3. Ensure daily_production_metrics has notes
ALTER TABLE public.daily_production_metrics 
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ DEFAULT now();

-- 4. Ensure meetings has all UI-referenced fields
ALTER TABLE public.meetings 
ADD COLUMN IF NOT EXISTS meeting_type TEXT,
ADD COLUMN IF NOT EXISTS agenda TEXT,
ADD COLUMN IF NOT EXISTS guidelines TEXT,
ADD COLUMN IF NOT EXISTS area TEXT;

-- 5. Ensure adherence_status has production_ok
ALTER TABLE public.adherence_status 
ADD COLUMN IF NOT EXISTS production_ok BOOLEAN DEFAULT true;

-- 6. Grant broad access for development restoration phase
DO $$ 
BEGIN
    EXECUTE (SELECT string_agg('GRANT ALL ON TABLE public.' || quote_ident(tablename) || ' TO postgres, anon, authenticated, service_role;', ' ')
             FROM pg_tables 
             WHERE schemaname = 'public');
END $$;
