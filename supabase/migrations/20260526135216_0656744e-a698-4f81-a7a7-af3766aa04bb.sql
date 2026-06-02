-- Garante que os buckets existem
INSERT INTO storage.buckets (id, name, public) 
VALUES 
  ('editais', 'editais', true),
  ('logos', 'logos', true),
  ('supplier-quotes', 'supplier-quotes', false),
  ('delivery-evidences', 'delivery-evidences', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Remove políticas antigas se existirem para evitar conflitos (opcional, mas seguro)
-- Nota: Supabase storage policies são baseadas em nomes, mas aqui vamos apenas adicionar as novas.

-- Políticas para 'editais'
CREATE POLICY "Leitura pública de editais"
ON storage.objects FOR SELECT
USING (bucket_id = 'editais');

CREATE POLICY "Upload de editais por autenticados"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'editais');

CREATE POLICY "Edição de editais por autenticados"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'editais');

-- Políticas para 'logos'
CREATE POLICY "Leitura pública de logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'logos');

CREATE POLICY "Upload de logos por autenticados"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'logos');

-- Políticas para 'supplier-quotes'
CREATE POLICY "Leitura de cotações por autenticados"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'supplier-quotes');

CREATE POLICY "Upload de cotações por autenticados"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'supplier-quotes');

-- Políticas para 'delivery-evidences'
CREATE POLICY "Leitura de evidências por autenticados"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'delivery-evidences');

CREATE POLICY "Upload de evidências por autenticados"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'delivery-evidences');
