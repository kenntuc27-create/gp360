-- 1) Adiciona slug e business_id em businesses/companies
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS slug text UNIQUE;

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_companies_business_id ON public.companies(business_id);

-- 2) Adiciona business_id em profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_business_id ON public.profiles(business_id);

-- 3) Seed dos 3 negócios
INSERT INTO public.businesses (name, slug, active)
VALUES
  ('Posto', 'posto', true),
  ('Crédito', 'credito', true),
  ('Licitação', 'licitacao', true)
ON CONFLICT (slug) DO NOTHING;

-- 4) Cria empresas faltantes (Auto Posto Pará, Pará Serviços) ligadas ao negócio
INSERT INTO public.companies (name, display_name, tipo, business_id, active)
SELECT 'Auto Posto Pará LTDA', 'Auto Posto Pará', NULL, b.id, true
FROM public.businesses b WHERE b.slug = 'posto'
  AND NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.display_name = 'Auto Posto Pará');

INSERT INTO public.companies (name, display_name, tipo, business_id, active)
SELECT 'Pará Serviços LTDA', 'Pará Serviços', NULL, b.id, true
FROM public.businesses b WHERE b.slug = 'credito'
  AND NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.display_name = 'Pará Serviços');

-- 5) Vincula Pará Empreendimentos e Pará Medicamentos ao negócio Licitação
UPDATE public.companies
SET business_id = (SELECT id FROM public.businesses WHERE slug = 'licitacao')
WHERE tipo IN ('empreendimentos', 'medicamentos') AND business_id IS NULL;

-- 6) GRANTs já existem nas tabelas; garantir leitura para authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON public.businesses TO authenticated;
GRANT ALL ON public.businesses TO service_role;