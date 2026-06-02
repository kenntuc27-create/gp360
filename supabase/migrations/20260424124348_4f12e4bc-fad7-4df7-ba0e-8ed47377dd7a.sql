-- Resposta do fornecedor para uma cotação
CREATE TABLE public.bid_supplier_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_id UUID NOT NULL REFERENCES public.bids(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  response_date DATE NOT NULL DEFAULT CURRENT_DATE,
  proposal_validity TEXT DEFAULT '',
  observations TEXT DEFAULT '',
  source_file_url TEXT DEFAULT '',
  source_file_name TEXT DEFAULT '',
  raw_text TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bid_id, supplier_id)
);

ALTER TABLE public.bid_supplier_responses ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER touch_bid_supplier_responses_updated_at
  BEFORE UPDATE ON public.bid_supplier_responses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "Authenticated can manage supplier responses"
  ON public.bid_supplier_responses FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- Preços por item
CREATE TABLE public.bid_supplier_item_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID NOT NULL REFERENCES public.bid_supplier_responses(id) ON DELETE CASCADE,
  bid_item_id UUID NOT NULL REFERENCES public.bid_items(id) ON DELETE CASCADE,
  valor_unitario NUMERIC DEFAULT 0,
  marca TEXT DEFAULT '',
  prazo TEXT DEFAULT '',
  observacao TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (response_id, bid_item_id)
);

ALTER TABLE public.bid_supplier_item_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage supplier item prices"
  ON public.bid_supplier_item_prices FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_bsip_response ON public.bid_supplier_item_prices(response_id);
CREATE INDEX idx_bsip_item ON public.bid_supplier_item_prices(bid_item_id);

-- Bucket privado para arquivos enviados pelos fornecedores
INSERT INTO storage.buckets (id, name, public) VALUES ('supplier-quotes', 'supplier-quotes', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated can upload supplier quote files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'supplier-quotes');

CREATE POLICY "Authenticated can read supplier quote files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'supplier-quotes');

CREATE POLICY "Authenticated can delete supplier quote files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'supplier-quotes');