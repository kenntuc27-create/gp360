ALTER TABLE public.sector_metrics
ADD COLUMN IF NOT EXISTS value_type text NOT NULL DEFAULT 'quantidade'
CHECK (value_type IN ('quantidade', 'monetario'));