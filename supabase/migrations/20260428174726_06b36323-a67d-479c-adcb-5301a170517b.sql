-- Limpar estrutura antiga
DROP TABLE IF EXISTS public.daily_productions CASCADE;
DROP TABLE IF EXISTS public.employee_goals CASCADE;

-- Métricas definidas por setor (com meta diária)
CREATE TABLE public.sector_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id uuid NOT NULL REFERENCES public.sectors(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'un',
  daily_goal numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sector_id, name)
);

CREATE INDEX idx_sector_metrics_sector ON public.sector_metrics(sector_id) WHERE active;

ALTER TABLE public.sector_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read sector_metrics" ON public.sector_metrics
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin manage sector_metrics" ON public.sector_metrics
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_sector_metrics_updated
  BEFORE UPDATE ON public.sector_metrics
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Lançamentos diários por métrica
CREATE TABLE public.daily_production_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  metric_id uuid NOT NULL REFERENCES public.sector_metrics(id) ON DELETE CASCADE,
  production_date date NOT NULL,
  realized_value numeric NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'no_prazo',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, metric_id, production_date)
);

CREATE INDEX idx_dpm_employee_date ON public.daily_production_metrics(employee_id, production_date);
CREATE INDEX idx_dpm_metric_date ON public.daily_production_metrics(metric_id, production_date);

ALTER TABLE public.daily_production_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read daily_production_metrics" ON public.daily_production_metrics
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin manage daily_production_metrics" ON public.daily_production_metrics
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "employee insert own dpm" ON public.daily_production_metrics
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = daily_production_metrics.employee_id AND e.user_id = auth.uid()
  ));

CREATE POLICY "employee update own dpm" ON public.daily_production_metrics
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = daily_production_metrics.employee_id AND e.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = daily_production_metrics.employee_id AND e.user_id = auth.uid()
  ));

CREATE TRIGGER trg_dpm_updated
  BEFORE UPDATE ON public.daily_production_metrics
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Semente: setor Marketing + suas duas métricas iniciais
INSERT INTO public.sectors (name)
SELECT 'Marketing'
WHERE NOT EXISTS (SELECT 1 FROM public.sectors WHERE lower(name) = 'marketing');

INSERT INTO public.sector_metrics (sector_id, name, unit, daily_goal, sort_order)
SELECT s.id, 'Disparos de mensagens', 'msgs', 0, 1
FROM public.sectors s
WHERE lower(s.name) = 'marketing'
  AND NOT EXISTS (
    SELECT 1 FROM public.sector_metrics m
    WHERE m.sector_id = s.id AND m.name = 'Disparos de mensagens'
  );

INSERT INTO public.sector_metrics (sector_id, name, unit, daily_goal, sort_order)
SELECT s.id, 'Respostas recebidas', 'resp', 0, 2
FROM public.sectors s
WHERE lower(s.name) = 'marketing'
  AND NOT EXISTS (
    SELECT 1 FROM public.sector_metrics m
    WHERE m.sector_id = s.id AND m.name = 'Respostas recebidas'
  );