-- Create updated_at function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create enum for import status (if not exists)
DO $$ BEGIN
    CREATE TYPE public.import_status AS ENUM ('pending', 'processing_ocr', 'processing_ai', 'completed', 'error');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Main table for edital imports
CREATE TABLE IF NOT EXISTS public.edital_imports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  status public.import_status NOT NULL DEFAULT 'pending',
  progress_pct INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  extracted_json JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Staging table for items
CREATE TABLE IF NOT EXISTS public.edital_staging_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES public.edital_imports(id) ON DELETE CASCADE,
  item_number INTEGER,
  lote TEXT,
  descricao TEXT NOT NULL,
  unidade TEXT,
  quantidade NUMERIC,
  valor_unitario NUMERIC,
  valor_total NUMERIC,
  marca TEXT,
  catmat TEXT,
  me_epp BOOLEAN DEFAULT false,
  confidence_score NUMERIC DEFAULT 1.0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Detailed logs
CREATE TABLE IF NOT EXISTS public.edital_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES public.edital_imports(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.edital_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edital_staging_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edital_logs ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.edital_imports TO authenticated;
GRANT ALL ON public.edital_imports TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.edital_staging_items TO authenticated;
GRANT ALL ON public.edital_staging_items TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.edital_logs TO authenticated;
GRANT ALL ON public.edital_logs TO service_role;

-- Policies
DO $$ BEGIN
    CREATE POLICY "Users can manage their own imports" ON public.edital_imports FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can manage their own staging items" ON public.edital_staging_items FOR ALL USING (EXISTS (
      SELECT 1 FROM public.edital_imports WHERE public.edital_imports.id = import_id AND public.edital_imports.user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can view their own logs" ON public.edital_logs FOR SELECT USING (EXISTS (
      SELECT 1 FROM public.edital_imports WHERE public.edital_imports.id = import_id AND public.edital_imports.user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Trigger
DROP TRIGGER IF EXISTS update_edital_imports_updated_at ON public.edital_imports;
CREATE TRIGGER update_edital_imports_updated_at
BEFORE UPDATE ON public.edital_imports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
