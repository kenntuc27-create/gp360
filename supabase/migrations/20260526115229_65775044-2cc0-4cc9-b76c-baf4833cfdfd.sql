-- Re-create complete schema starting with parent tables

-- 1. Suppliers
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social TEXT NOT NULL,
  cnpj TEXT DEFAULT '',
  contato TEXT DEFAULT '',
  telefone TEXT DEFAULT '',
  whatsapp TEXT DEFAULT '',
  email TEXT DEFAULT '',
  cidade TEXT DEFAULT '',
  segmento TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Bids
CREATE TABLE IF NOT EXISTS public.bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orgao TEXT DEFAULT '',
  processo TEXT DEFAULT '',
  objeto TEXT DEFAULT '',
  modalidade TEXT DEFAULT '',
  data_abertura TEXT DEFAULT '',
  prazo_entrega TEXT DEFAULT '',
  local_entrega TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'rascunho',
  resultado TEXT,
  tipo_cotacao TEXT,
  segment_id TEXT,
  valor_total_estimado NUMERIC DEFAULT 0,
  sold_total NUMERIC DEFAULT 0,
  bought_total NUMERIC DEFAULT 0,
  profit_value NUMERIC DEFAULT 0,
  total_homologated NUMERIC DEFAULT 0,
  total_quoted NUMERIC DEFAULT 0,
  source_file_url TEXT DEFAULT '',
  source_file_name TEXT DEFAULT '',
  raw_text TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Bid Items
CREATE TABLE IF NOT EXISTS public.bid_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_id UUID NOT NULL REFERENCES public.bids(id) ON DELETE CASCADE,
  item_number INTEGER NOT NULL DEFAULT 1,
  descricao TEXT NOT NULL DEFAULT '',
  unidade TEXT DEFAULT 'UN',
  quantidade NUMERIC NOT NULL DEFAULT 1,
  marca TEXT DEFAULT '',
  valor_unitario NUMERIC DEFAULT 0,
  custo_unitario NUMERIC DEFAULT 0,
  preco_venda_manual NUMERIC DEFAULT 0,
  margin_pct NUMERIC DEFAULT 0,
  disputar BOOLEAN DEFAULT true,
  venceu BOOLEAN DEFAULT false,
  preco_homologado NUMERIC DEFAULT 0,
  valor_estimado_total NUMERIC DEFAULT 0,
  valor_maximo NUMERIC DEFAULT 0,
  status TEXT,
  estimated_value NUMERIC DEFAULT 0,
  quoted_value NUMERIC DEFAULT 0,
  homologated_value NUMERIC DEFAULT 0,
  profit_value NUMERIC DEFAULT 0,
  prazo TEXT DEFAULT '',
  observacao TEXT DEFAULT '',
  needs_review BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL,
  company_id UUID,
  company_tipo TEXT,
  nivel_acesso TEXT DEFAULT 'operacional',
  must_change_password BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Employees
CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL,
  full_name TEXT,
  sector_id UUID,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Sectors
CREATE TABLE IF NOT EXISTS public.sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_operational BOOLEAN DEFAULT true,
  business_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. User Roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role)
);

-- 8. Performance Scores
CREATE TABLE IF NOT EXISTS public.performance_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  score NUMERIC DEFAULT 0,
  classification TEXT,
  production_score NUMERIC DEFAULT 0,
  tasks_score NUMERIC DEFAULT 0,
  behavior_score NUMERIC DEFAULT 0,
  reference_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Employee Goals
CREATE TABLE IF NOT EXISTS public.employee_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  target_amount NUMERIC DEFAULT 0,
  working_days INTEGER DEFAULT 22,
  reference_month TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. Daily Production Metrics
CREATE TABLE IF NOT EXISTS public.daily_production_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  realized_value NUMERIC DEFAULT 0,
  production_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. Time Punches
CREATE TABLE IF NOT EXISTS public.time_punches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  punch_date DATE NOT NULL DEFAULT CURRENT_DATE,
  punch_time TIMESTAMPTZ DEFAULT now(),
  punch_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 12. Bid Supplier Responses
CREATE TABLE IF NOT EXISTS public.bid_supplier_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_id UUID NOT NULL REFERENCES public.bids(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
  source_file_name TEXT,
  source_file_url TEXT,
  raw_text TEXT,
  response_date TIMESTAMPTZ DEFAULT now(),
  extraction_status TEXT DEFAULT 'pending',
  extraction_progress INTEGER DEFAULT 0,
  extraction_total INTEGER DEFAULT 0,
  extraction_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 13. Bid Supplier Item Prices
CREATE TABLE IF NOT EXISTS public.bid_supplier_item_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID NOT NULL REFERENCES public.bid_supplier_responses(id) ON DELETE CASCADE,
  bid_item_id UUID NOT NULL REFERENCES public.bid_items(id) ON DELETE CASCADE,
  valor_unitario NUMERIC DEFAULT 0,
  fator_conversao NUMERIC DEFAULT 1,
  preco_embalagem_fornecedor NUMERIC DEFAULT 0,
  unidade_fornecedor TEXT,
  needs_review BOOLEAN DEFAULT false,
  divergence_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 14. Adherence Alerts
CREATE TABLE IF NOT EXISTS public.adherence_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'aviso',
  reference_date DATE DEFAULT CURRENT_DATE,
  alert_type TEXT,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 15. Tasks
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  assignee_id UUID REFERENCES public.employees(id),
  due_date DATE,
  status TEXT DEFAULT 'pendente',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bid_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_production_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_punches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bid_supplier_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bid_supplier_item_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adherence_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Public access policies
CREATE POLICY "Public suppliers access" ON public.suppliers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public bids access" ON public.bids FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public bid_items access" ON public.bid_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public profiles access" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public employees access" ON public.employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public sectors access" ON public.sectors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public user_roles access" ON public.user_roles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public performance_scores access" ON public.performance_scores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public employee_goals access" ON public.employee_goals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public daily_production_metrics access" ON public.daily_production_metrics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public time_punches access" ON public.time_punches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public bid_supplier_responses access" ON public.bid_supplier_responses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public bid_supplier_item_prices access" ON public.bid_supplier_item_prices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public adherence_alerts access" ON public.adherence_alerts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public tasks access" ON public.tasks FOR ALL USING (true) WITH CHECK (true);
