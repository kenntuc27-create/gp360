-- Recriar policies separando DELETE (somente admin) de INSERT/UPDATE/SELECT (autenticados)

-- bids
DROP POLICY IF EXISTS "Authenticated can manage bids" ON public.bids;
CREATE POLICY "Authenticated can read bids" ON public.bids FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert bids" ON public.bids FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update bids" ON public.bids FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins can delete bids" ON public.bids FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- bid_items
DROP POLICY IF EXISTS "Authenticated can manage bid_items" ON public.bid_items;
CREATE POLICY "Authenticated can read bid_items" ON public.bid_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert bid_items" ON public.bid_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update bid_items" ON public.bid_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins can delete bid_items" ON public.bid_items FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- bid_supplier_responses
DROP POLICY IF EXISTS "Authenticated can manage supplier responses" ON public.bid_supplier_responses;
CREATE POLICY "Authenticated can read supplier responses" ON public.bid_supplier_responses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert supplier responses" ON public.bid_supplier_responses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update supplier responses" ON public.bid_supplier_responses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins can delete supplier responses" ON public.bid_supplier_responses FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- bid_supplier_item_prices
DROP POLICY IF EXISTS "Authenticated can manage supplier item prices" ON public.bid_supplier_item_prices;
CREATE POLICY "Authenticated can read supplier item prices" ON public.bid_supplier_item_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert supplier item prices" ON public.bid_supplier_item_prices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update supplier item prices" ON public.bid_supplier_item_prices FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins can delete supplier item prices" ON public.bid_supplier_item_prices FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- suppliers
DROP POLICY IF EXISTS "Authenticated can manage suppliers" ON public.suppliers;
CREATE POLICY "Authenticated can read suppliers" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert suppliers" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update suppliers" ON public.suppliers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins can delete suppliers" ON public.suppliers FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));