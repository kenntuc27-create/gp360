
-- Pós-Entrega e Aceite

CREATE TABLE public.bid_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_id uuid NOT NULL,
  delivery_date date,
  delivery_time time,
  responsavel text NOT NULL DEFAULT '',
  transportadora text NOT NULL DEFAULT '',
  nfe_numero text NOT NULL DEFAULT '',
  nfe_chave text NOT NULL DEFAULT '',
  empenho_numero text NOT NULL DEFAULT '',
  ordem_fornecimento text NOT NULL DEFAULT '',
  local_entrega text NOT NULL DEFAULT '',
  observacoes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'aguardando_entrega',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX idx_bid_deliveries_bid ON public.bid_deliveries(bid_id);

CREATE TABLE public.bid_delivery_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES public.bid_deliveries(id) ON DELETE CASCADE,
  nfe_emitida boolean NOT NULL DEFAULT false,
  danfe_anexada boolean NOT NULL DEFAULT false,
  empenho_anexado boolean NOT NULL DEFAULT false,
  of_anexada boolean NOT NULL DEFAULT false,
  mercadoria_entregue boolean NOT NULL DEFAULT false,
  termo_assinado boolean NOT NULL DEFAULT false,
  evidencias_anexadas boolean NOT NULL DEFAULT false,
  confirmacao_orgao boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_checklist_delivery ON public.bid_delivery_checklist(delivery_id);

CREATE TABLE public.bid_delivery_evidences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES public.bid_deliveries(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'foto',
  nome text NOT NULL DEFAULT '',
  url text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  mime_type text NOT NULL DEFAULT '',
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid
);
CREATE INDEX idx_evidences_delivery ON public.bid_delivery_evidences(delivery_id);

CREATE TABLE public.bid_delivery_acceptance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES public.bid_deliveries(id) ON DELETE CASCADE,
  servidor_nome text NOT NULL DEFAULT '',
  servidor_cargo text NOT NULL DEFAULT '',
  servidor_matricula text NOT NULL DEFAULT '',
  servidor_cpf text NOT NULL DEFAULT '',
  orgao_setor text NOT NULL DEFAULT '',
  signature_data_url text NOT NULL DEFAULT '',
  carimbo_url text NOT NULL DEFAULT '',
  acceptance_date date NOT NULL DEFAULT CURRENT_DATE,
  pdf_url text NOT NULL DEFAULT '',
  observacoes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_acceptance_delivery ON public.bid_delivery_acceptance(delivery_id);

-- helper: verifica se o usuário tem acesso à licitação (mesma regra de bids RLS)
CREATE OR REPLACE FUNCTION public.user_can_access_bid(_bid_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_admin_user() OR EXISTS (
    SELECT 1 FROM public.bids b
    WHERE b.id = _bid_id AND b.tipo_cotacao = current_user_company_tipo()
  )
$$;

-- RLS
ALTER TABLE public.bid_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bid_delivery_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bid_delivery_evidences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bid_delivery_acceptance ENABLE ROW LEVEL SECURITY;

CREATE POLICY del_select ON public.bid_deliveries FOR SELECT TO authenticated USING (user_can_access_bid(bid_id));
CREATE POLICY del_insert ON public.bid_deliveries FOR INSERT TO authenticated WITH CHECK (user_can_access_bid(bid_id));
CREATE POLICY del_update ON public.bid_deliveries FOR UPDATE TO authenticated USING (user_can_access_bid(bid_id)) WITH CHECK (user_can_access_bid(bid_id));
CREATE POLICY del_delete ON public.bid_deliveries FOR DELETE TO authenticated USING (is_admin_user());

CREATE POLICY chk_all ON public.bid_delivery_checklist FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bid_deliveries d WHERE d.id = delivery_id AND user_can_access_bid(d.bid_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.bid_deliveries d WHERE d.id = delivery_id AND user_can_access_bid(d.bid_id)));

CREATE POLICY ev_all ON public.bid_delivery_evidences FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bid_deliveries d WHERE d.id = delivery_id AND user_can_access_bid(d.bid_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.bid_deliveries d WHERE d.id = delivery_id AND user_can_access_bid(d.bid_id)));

CREATE POLICY ac_all ON public.bid_delivery_acceptance FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bid_deliveries d WHERE d.id = delivery_id AND user_can_access_bid(d.bid_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.bid_deliveries d WHERE d.id = delivery_id AND user_can_access_bid(d.bid_id)));

-- Triggers updated_at
CREATE TRIGGER trg_deliveries_updated BEFORE UPDATE ON public.bid_deliveries FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_checklist_updated BEFORE UPDATE ON public.bid_delivery_checklist FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_acceptance_updated BEFORE UPDATE ON public.bid_delivery_acceptance FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Audit
CREATE TRIGGER trg_deliveries_audit AFTER INSERT OR UPDATE OR DELETE ON public.bid_deliveries FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER trg_acceptance_audit AFTER INSERT OR UPDATE OR DELETE ON public.bid_delivery_acceptance FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

-- Storage bucket privado para evidências
INSERT INTO storage.buckets (id, name, public) VALUES ('delivery-evidences', 'delivery-evidences', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth read delivery-evidences" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'delivery-evidences');
CREATE POLICY "auth insert delivery-evidences" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'delivery-evidences');
CREATE POLICY "auth update delivery-evidences" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'delivery-evidences');
CREATE POLICY "admin delete delivery-evidences" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'delivery-evidences' AND is_admin_user());
