-- Final fixes for all build errors

-- 1. Profiles additional columns
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS username TEXT,
ADD COLUMN IF NOT EXISTS cargo TEXT,
ADD COLUMN IF NOT EXISTS segmento TEXT,
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;

-- 2. Daily Production Metrics additional columns
ALTER TABLE public.daily_production_metrics 
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ DEFAULT now();

-- 3. Employees additional columns (for consistency)
ALTER TABLE public.employees 
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS cargo TEXT,
ADD COLUMN IF NOT EXISTS segmento TEXT;

-- Ensure all tables exist and have basic structure
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    role TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Re-grant access just in case
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
