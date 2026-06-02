
-- Settings (singleton)
CREATE TABLE public.company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT 'Minha Empresa',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  city TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  primary_color TEXT NOT NULL DEFAULT '#0F3460',
  proposal_validity_days INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.company_settings (company_name) VALUES ('Minha Empresa');

CREATE TABLE public.suppliers (
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

CREATE TABLE public.bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orgao TEXT DEFAULT '',
  processo TEXT DEFAULT '',
  objeto TEXT DEFAULT '',
  modalidade TEXT DEFAULT '',
  data_abertura TEXT DEFAULT '',
  prazo_entrega TEXT DEFAULT '',
  local_entrega TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'rascunho',
  source_file_url TEXT DEFAULT '',
  source_file_name TEXT DEFAULT '',
  raw_text TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.bid_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_id UUID NOT NULL REFERENCES public.bids(id) ON DELETE CASCADE,
  item_number INTEGER NOT NULL DEFAULT 1,
  descricao TEXT NOT NULL DEFAULT '',
  unidade TEXT DEFAULT 'UN',
  quantidade NUMERIC NOT NULL DEFAULT 1,
  marca TEXT DEFAULT '',
  valor_unitario NUMERIC DEFAULT 0,
  prazo TEXT DEFAULT '',
  observacao TEXT DEFAULT '',
  needs_review BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bid_items_bid_id ON public.bid_items(bid_id);
CREATE INDEX idx_bids_created ON public.bids(created_at DESC);

-- RLS (sistema interno: acesso público)
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bid_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public all" ON public.company_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all" ON public.suppliers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all" ON public.bids FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all" ON public.bid_items FOR ALL USING (true) WITH CHECK (true);

-- Updated_at triggers
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER t_settings_upd BEFORE UPDATE ON public.company_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_supp_upd BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_bids_upd BEFORE UPDATE ON public.bids FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Storage
INSERT INTO storage.buckets (id, name, public) VALUES ('logos', 'logos', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('editais', 'editais', true) ON CONFLICT DO NOTHING;

CREATE POLICY "logos public read" ON storage.objects FOR SELECT USING (bucket_id = 'logos');
CREATE POLICY "logos public write" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'logos');
CREATE POLICY "logos public update" ON storage.objects FOR UPDATE USING (bucket_id = 'logos');
CREATE POLICY "logos public delete" ON storage.objects FOR DELETE USING (bucket_id = 'logos');
CREATE POLICY "editais public read" ON storage.objects FOR SELECT USING (bucket_id = 'editais');
CREATE POLICY "editais public write" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'editais');
CREATE POLICY "editais public update" ON storage.objects FOR UPDATE USING (bucket_id = 'editais');
CREATE POLICY "editais public delete" ON storage.objects FOR DELETE USING (bucket_id = 'editais');
