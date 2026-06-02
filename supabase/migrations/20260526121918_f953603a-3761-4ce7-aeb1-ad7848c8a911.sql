-- Create user_access_logs table
CREATE TABLE IF NOT EXISTS public.user_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  username TEXT,
  action TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_access_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access" ON public.user_access_logs FOR ALL USING (true) WITH CHECK (true);
