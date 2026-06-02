-- Negócios (empresas/CNPJs)
CREATE TABLE public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  cnpj TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read businesses" ON public.businesses FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage businesses" ON public.businesses FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_businesses_updated BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Vínculo N:N entre funcionário e negócio (ex: Juliana e Val em 2 negócios)
CREATE TABLE public.employee_businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  business_id UUID NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, business_id)
);
ALTER TABLE public.employee_businesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read emp_biz" ON public.employee_businesses FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage emp_biz" ON public.employee_businesses FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- Setor pertence a um negócio
ALTER TABLE public.sectors ADD COLUMN business_id UUID;

-- Meta por negócio/mês (substitui global_goals — mantida por compatibilidade)
CREATE TABLE public.business_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  reference_month DATE NOT NULL,
  target_amount NUMERIC NOT NULL DEFAULT 0,
  working_days INT NOT NULL DEFAULT 22,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, reference_month)
);
ALTER TABLE public.business_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read business_goals" ON public.business_goals FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage business_goals" ON public.business_goals FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_business_goals_updated BEFORE UPDATE ON public.business_goals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Meta por funcionário pode ser vinculada a um negócio (mesma pessoa em 2 negócios)
ALTER TABLE public.employee_goals ADD COLUMN business_id UUID;

CREATE INDEX idx_sectors_business ON public.sectors(business_id);
CREATE INDEX idx_emp_goals_business ON public.employee_goals(business_id);
CREATE INDEX idx_business_goals_month ON public.business_goals(reference_month);

-- Seed dos 4 negócios
INSERT INTO public.businesses (name, cnpj, sort_order) VALUES
  ('Auto Posto Pará', '', 1),
  ('Pará Serviços (Crédito)', '', 2),
  ('Pará Medicamentos', '', 3),
  ('Pará Empreendimentos', '', 4);