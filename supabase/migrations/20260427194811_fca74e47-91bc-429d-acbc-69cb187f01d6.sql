
-- SECTORS
CREATE TABLE public.sectors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read sectors" ON public.sectors FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage sectors" ON public.sectors FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER trg_sectors_touch BEFORE UPDATE ON public.sectors
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- EMPLOYEES
CREATE TABLE public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT DEFAULT '',
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  user_id UUID,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read employees" ON public.employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage employees" ON public.employees FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER trg_employees_touch BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_employees_user ON public.employees(user_id);
CREATE INDEX idx_employees_sector ON public.employees(sector_id);

-- EMPLOYEE GOALS (mensal)
CREATE TABLE public.employee_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_month DATE NOT NULL, -- usa o dia 01 do mês
  goal_value NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'un',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, period_month)
);
ALTER TABLE public.employee_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read goals" ON public.employee_goals FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage goals" ON public.employee_goals FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER trg_goals_touch BEFORE UPDATE ON public.employee_goals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- DAILY PRODUCTIONS
CREATE TABLE public.daily_productions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  production_date DATE NOT NULL,
  realized_value NUMERIC NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'no_prazo', -- no_prazo | atrasado | nao_preenchido
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, production_date)
);
ALTER TABLE public.daily_productions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read productions" ON public.daily_productions FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage productions" ON public.daily_productions FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "employee insert own production" ON public.daily_productions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
  );
CREATE POLICY "employee update own production" ON public.daily_productions FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
  );
CREATE TRIGGER trg_prod_touch BEFORE UPDATE ON public.daily_productions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_prod_emp_date ON public.daily_productions(employee_id, production_date);

-- PUSH SUBSCRIPTIONS
CREATE TABLE public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  user_agent TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user read own push" ON public.push_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "user insert own push" ON public.push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "user delete own push" ON public.push_subscriptions FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role));

-- PRODUCTION ALERTS log
CREATE TABLE public.production_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reference_date DATE NOT NULL,
  alert_type TEXT NOT NULL, -- pre_alerta | alerta | repeticao
  status TEXT NOT NULL DEFAULT 'enviado',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.production_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read alerts" ON public.production_alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage alerts" ON public.production_alerts FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE INDEX idx_alerts_emp_date ON public.production_alerts(employee_id, reference_date);
