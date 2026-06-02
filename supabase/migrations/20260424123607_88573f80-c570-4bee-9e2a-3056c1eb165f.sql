-- Corrigir search_path da função antiga
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- Remover políticas permissivas das tabelas de negócio
DROP POLICY IF EXISTS "public all" ON public.bids;
DROP POLICY IF EXISTS "public all" ON public.bid_items;
DROP POLICY IF EXISTS "public all" ON public.suppliers;
DROP POLICY IF EXISTS "public all" ON public.company_settings;

-- Novas políticas: apenas autenticados
CREATE POLICY "Authenticated can manage bids"
  ON public.bids FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can manage bid_items"
  ON public.bid_items FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can manage suppliers"
  ON public.suppliers FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can read company_settings"
  ON public.company_settings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can modify company_settings"
  ON public.company_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));