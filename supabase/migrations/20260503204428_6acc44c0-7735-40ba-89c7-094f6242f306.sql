
CREATE TABLE IF NOT EXISTS public.global_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_month date NOT NULL UNIQUE,
  target_amount numeric NOT NULL DEFAULT 0,
  working_days integer NOT NULL DEFAULT 22,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.global_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read global_goals" ON public.global_goals
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage global_goals" ON public.global_goals
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_global_goals_updated
  BEFORE UPDATE ON public.global_goals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.employee_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  reference_month date NOT NULL,
  target_amount numeric NOT NULL DEFAULT 0,
  working_days integer NOT NULL DEFAULT 22,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, reference_month)
);

ALTER TABLE public.employee_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read employee_goals" ON public.employee_goals
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage employee_goals" ON public.employee_goals
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_employee_goals_updated
  BEFORE UPDATE ON public.employee_goals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_employee_goals_month ON public.employee_goals(reference_month);
CREATE INDEX IF NOT EXISTS idx_employee_goals_emp ON public.employee_goals(employee_id);
