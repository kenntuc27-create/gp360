-- Restore team and meeting tables

-- 1. Adherence Status
CREATE TABLE IF NOT EXISTS public.adherence_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  reference_date DATE NOT NULL,
  status TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Meetings
CREATE TABLE IF NOT EXISTS public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  meeting_date DATE NOT NULL,
  meeting_time TIME,
  location TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Meeting Participants
CREATE TABLE IF NOT EXISTS public.meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  present BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Occurrences
CREATE TABLE IF NOT EXISTS public.occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  title TEXT NOT NULL,
  description TEXT,
  occurrence_date DATE NOT NULL DEFAULT CURRENT_DATE,
  severity TEXT DEFAULT 'normal',
  source TEXT,
  source_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Additional columns for metrics
ALTER TABLE public.sector_metrics 
ADD COLUMN IF NOT EXISTS value_type TEXT DEFAULT 'currency';

ALTER TABLE public.daily_production_metrics 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'finalizado';

-- 6. Add detailed columns to tasks (which was previously created basic)
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS source TEXT,
ADD COLUMN IF NOT EXISTS source_id TEXT,
ADD COLUMN IF NOT EXISTS created_by UUID;

-- Enable RLS
ALTER TABLE public.adherence_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.occurrences ENABLE ROW LEVEL SECURITY;

-- Public policies
CREATE POLICY "Public adherence_status access" ON public.adherence_status FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public meetings access" ON public.meetings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public meeting_participants access" ON public.meeting_participants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public occurrences access" ON public.occurrences FOR ALL USING (true) WITH CHECK (true);
