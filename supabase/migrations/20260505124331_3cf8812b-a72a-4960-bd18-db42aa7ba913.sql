
-- =========================================================================
-- 1) NOVOS NÍVEIS DE ACESSO (enum app_role)
-- =========================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'gerente' AND enumtypid = 'public.app_role'::regtype) THEN
    ALTER TYPE public.app_role ADD VALUE 'gerente';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'operacional' AND enumtypid = 'public.app_role'::regtype) THEN
    ALTER TYPE public.app_role ADD VALUE 'operacional';
  END IF;
END $$;

-- =========================================================================
-- 2) PROFILES: vincular a empresa + nivel_acesso
-- =========================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company_tipo text,
  ADD COLUMN IF NOT EXISTS nivel_acesso text NOT NULL DEFAULT 'operacional';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_nivel_acesso_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_nivel_acesso_check
  CHECK (nivel_acesso IN ('admin','gerente','operacional'));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_company_tipo_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_company_tipo_check
  CHECK (company_tipo IS NULL OR company_tipo IN ('empreendimentos','medicamentos'));

-- =========================================================================
-- 3) FUNÇÕES DE CONTEXTO (SECURITY DEFINER -> evita recursão RLS)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
$$;

-- Retorna o tipo da empresa do usuário logado.
-- Prioridade: profiles.company_tipo -> roles legados (empreendimentos/medicamentos) -> NULL
CREATE OR REPLACE FUNCTION public.current_user_company_tipo()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.company_tipo FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1),
    (SELECT r.role::text FROM public.user_roles r
       WHERE r.user_id = auth.uid()
         AND r.role::text IN ('empreendimentos','medicamentos')
       LIMIT 1)
  )
$$;

CREATE OR REPLACE FUNCTION public.empresa_do_usuario_atual()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id FROM public.companies c
   WHERE c.tipo = public.current_user_company_tipo()
   LIMIT 1
$$;

-- =========================================================================
-- 4) RLS REAL — remove USING(true) e aplica isolamento por empresa
-- =========================================================================

-- ---------- BIDS ----------
DROP POLICY IF EXISTS "Authenticated can read bids" ON public.bids;
DROP POLICY IF EXISTS "Authenticated can insert bids" ON public.bids;
DROP POLICY IF EXISTS "Authenticated can update bids" ON public.bids;
DROP POLICY IF EXISTS "Admins can delete bids" ON public.bids;

CREATE POLICY "bids_select_isolated" ON public.bids
  FOR SELECT TO authenticated
  USING (
    public.is_admin_user()
    OR tipo_cotacao = public.current_user_company_tipo()
  );

CREATE POLICY "bids_insert_isolated" ON public.bids
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_user()
    OR tipo_cotacao = public.current_user_company_tipo()
  );

CREATE POLICY "bids_update_isolated" ON public.bids
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_user()
    OR tipo_cotacao = public.current_user_company_tipo()
  )
  WITH CHECK (
    public.is_admin_user()
    OR tipo_cotacao = public.current_user_company_tipo()
  );

CREATE POLICY "bids_delete_admin" ON public.bids
  FOR DELETE TO authenticated
  USING (public.is_admin_user());

-- ---------- BID_ITEMS (herda do bid) ----------
DROP POLICY IF EXISTS "Authenticated can read bid_items" ON public.bid_items;
DROP POLICY IF EXISTS "Authenticated can insert bid_items" ON public.bid_items;
DROP POLICY IF EXISTS "Authenticated can update bid_items" ON public.bid_items;
DROP POLICY IF EXISTS "Admins can delete bid_items" ON public.bid_items;

CREATE POLICY "bid_items_select_isolated" ON public.bid_items
  FOR SELECT TO authenticated
  USING (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.bids b
       WHERE b.id = bid_items.bid_id
         AND b.tipo_cotacao = public.current_user_company_tipo()
    )
  );

CREATE POLICY "bid_items_insert_isolated" ON public.bid_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.bids b
       WHERE b.id = bid_items.bid_id
         AND b.tipo_cotacao = public.current_user_company_tipo()
    )
  );

CREATE POLICY "bid_items_update_isolated" ON public.bid_items
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.bids b
       WHERE b.id = bid_items.bid_id
         AND b.tipo_cotacao = public.current_user_company_tipo()
    )
  )
  WITH CHECK (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.bids b
       WHERE b.id = bid_items.bid_id
         AND b.tipo_cotacao = public.current_user_company_tipo()
    )
  );

CREATE POLICY "bid_items_delete_admin" ON public.bid_items
  FOR DELETE TO authenticated
  USING (public.is_admin_user());

-- ---------- BID_SUPPLIER_RESPONSES (herda do bid) ----------
DROP POLICY IF EXISTS "Authenticated can read supplier responses" ON public.bid_supplier_responses;
DROP POLICY IF EXISTS "Authenticated can insert supplier responses" ON public.bid_supplier_responses;
DROP POLICY IF EXISTS "Authenticated can update supplier responses" ON public.bid_supplier_responses;
DROP POLICY IF EXISTS "Admins can delete supplier responses" ON public.bid_supplier_responses;

CREATE POLICY "bsr_select_isolated" ON public.bid_supplier_responses
  FOR SELECT TO authenticated
  USING (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.bids b
       WHERE b.id = bid_supplier_responses.bid_id
         AND b.tipo_cotacao = public.current_user_company_tipo()
    )
  );

CREATE POLICY "bsr_insert_isolated" ON public.bid_supplier_responses
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.bids b
       WHERE b.id = bid_supplier_responses.bid_id
         AND b.tipo_cotacao = public.current_user_company_tipo()
    )
  );

CREATE POLICY "bsr_update_isolated" ON public.bid_supplier_responses
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.bids b
       WHERE b.id = bid_supplier_responses.bid_id
         AND b.tipo_cotacao = public.current_user_company_tipo()
    )
  )
  WITH CHECK (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.bids b
       WHERE b.id = bid_supplier_responses.bid_id
         AND b.tipo_cotacao = public.current_user_company_tipo()
    )
  );

CREATE POLICY "bsr_delete_admin" ON public.bid_supplier_responses
  FOR DELETE TO authenticated
  USING (public.is_admin_user());

-- ---------- BID_SUPPLIER_ITEM_PRICES (herda da response -> bid) ----------
DROP POLICY IF EXISTS "Authenticated can read supplier item prices" ON public.bid_supplier_item_prices;
DROP POLICY IF EXISTS "Authenticated can insert supplier item prices" ON public.bid_supplier_item_prices;
DROP POLICY IF EXISTS "Authenticated can update supplier item prices" ON public.bid_supplier_item_prices;
DROP POLICY IF EXISTS "Admins can delete supplier item prices" ON public.bid_supplier_item_prices;

CREATE POLICY "bsip_select_isolated" ON public.bid_supplier_item_prices
  FOR SELECT TO authenticated
  USING (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.bid_supplier_responses r
       JOIN public.bids b ON b.id = r.bid_id
       WHERE r.id = bid_supplier_item_prices.response_id
         AND b.tipo_cotacao = public.current_user_company_tipo()
    )
  );

CREATE POLICY "bsip_insert_isolated" ON public.bid_supplier_item_prices
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.bid_supplier_responses r
       JOIN public.bids b ON b.id = r.bid_id
       WHERE r.id = bid_supplier_item_prices.response_id
         AND b.tipo_cotacao = public.current_user_company_tipo()
    )
  );

CREATE POLICY "bsip_update_isolated" ON public.bid_supplier_item_prices
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.bid_supplier_responses r
       JOIN public.bids b ON b.id = r.bid_id
       WHERE r.id = bid_supplier_item_prices.response_id
         AND b.tipo_cotacao = public.current_user_company_tipo()
    )
  )
  WITH CHECK (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.bid_supplier_responses r
       JOIN public.bids b ON b.id = r.bid_id
       WHERE r.id = bid_supplier_item_prices.response_id
         AND b.tipo_cotacao = public.current_user_company_tipo()
    )
  );

CREATE POLICY "bsip_delete_admin" ON public.bid_supplier_item_prices
  FOR DELETE TO authenticated
  USING (public.is_admin_user());

-- ---------- SUPPLIERS ----------
DROP POLICY IF EXISTS "Authenticated can read suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Authenticated can insert suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Authenticated can update suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Admins can delete suppliers" ON public.suppliers;

-- ADMIN vê tudo. Usuários veem fornecedores da sua empresa OU sem empresa atribuída (compartilhados/legado).
CREATE POLICY "suppliers_select_isolated" ON public.suppliers
  FOR SELECT TO authenticated
  USING (
    public.is_admin_user()
    OR company_tipo IS NULL
    OR company_tipo = public.current_user_company_tipo()
  );

CREATE POLICY "suppliers_insert_isolated" ON public.suppliers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_user()
    OR company_tipo IS NULL
    OR company_tipo = public.current_user_company_tipo()
  );

CREATE POLICY "suppliers_update_isolated" ON public.suppliers
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_user()
    OR company_tipo IS NULL
    OR company_tipo = public.current_user_company_tipo()
  )
  WITH CHECK (
    public.is_admin_user()
    OR company_tipo IS NULL
    OR company_tipo = public.current_user_company_tipo()
  );

CREATE POLICY "suppliers_delete_admin" ON public.suppliers
  FOR DELETE TO authenticated
  USING (public.is_admin_user());

-- =========================================================================
-- 5) AUDITORIA
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text,
  action text NOT NULL,           -- INSERT / UPDATE / DELETE
  table_name text NOT NULL,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table ON public.audit_log(table_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user  ON public.audit_log(user_id, created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_select_admin" ON public.audit_log;
CREATE POLICY "audit_select_admin" ON public.audit_log
  FOR SELECT TO authenticated USING (public.is_admin_user());

-- inserts são feitos por triggers (security definer) — não precisa de policy de insert para usuários

CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _rec_id text;
BEGIN
  SELECT email INTO _email FROM public.profiles WHERE user_id = _uid LIMIT 1;

  IF TG_OP = 'DELETE' THEN
    _rec_id := COALESCE((to_jsonb(OLD)->>'id'), NULL);
    INSERT INTO public.audit_log(user_id, user_email, action, table_name, record_id, old_data, new_data)
    VALUES (_uid, _email, TG_OP, TG_TABLE_NAME, _rec_id, to_jsonb(OLD), NULL);
    RETURN OLD;
  ELSE
    _rec_id := COALESCE((to_jsonb(NEW)->>'id'), NULL);
    INSERT INTO public.audit_log(user_id, user_email, action, table_name, record_id, old_data, new_data)
    VALUES (_uid, _email, TG_OP, TG_TABLE_NAME, _rec_id,
            CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
            to_jsonb(NEW));
    RETURN NEW;
  END IF;
END $$;

DROP TRIGGER IF EXISTS audit_bids ON public.bids;
CREATE TRIGGER audit_bids
AFTER INSERT OR UPDATE OR DELETE ON public.bids
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS audit_bid_items ON public.bid_items;
CREATE TRIGGER audit_bid_items
AFTER INSERT OR UPDATE OR DELETE ON public.bid_items
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS audit_suppliers ON public.suppliers;
CREATE TRIGGER audit_suppliers
AFTER INSERT OR UPDATE OR DELETE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS audit_companies ON public.companies;
CREATE TRIGGER audit_companies
AFTER INSERT OR UPDATE OR DELETE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
