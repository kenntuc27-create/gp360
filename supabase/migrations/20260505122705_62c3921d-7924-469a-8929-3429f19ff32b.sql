
-- 1. Tabela de empresas do grupo
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL UNIQUE CHECK (tipo IN ('empreendimentos','medicamentos')),
  display_name text NOT NULL,
  razao_social text NOT NULL,
  cnpj text NOT NULL,
  inscricao_estadual text DEFAULT '',
  endereco text DEFAULT '',
  bairro text DEFAULT '',
  cidade text DEFAULT '',
  estado text DEFAULT '',
  cep text DEFAULT '',
  telefone text DEFAULT '',
  email text DEFAULT '',
  logo_url text DEFAULT '',
  primary_color text DEFAULT '#0F3460',
  slogan text DEFAULT 'Fé, Confiança e Compromisso',
  banco text DEFAULT '',
  agencia text DEFAULT '',
  conta text DEFAULT '',
  pix text DEFAULT '',
  socio_nome text DEFAULT '',
  socio_cpf text DEFAULT '',
  socio_rg text DEFAULT '',
  declaracoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposal_validity_days int NOT NULL DEFAULT 60,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read companies" ON public.companies
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage companies" ON public.companies
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_companies_updated
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Popular com os dados confirmados pelo usuário
INSERT INTO public.companies (
  tipo, display_name, razao_social, cnpj, inscricao_estadual,
  endereco, bairro, cidade, estado, cep, telefone, email, logo_url,
  banco, agencia, conta, pix, socio_nome, socio_cpf, socio_rg,
  declaracoes, proposal_validity_days
) VALUES
(
  'empreendimentos',
  'Pará Empreendimentos',
  'PARA EMPREENDIMENTOS COMERCIO E PRESTACAO DE SERVICOS LTDA',
  '07.947.570/0001-32',
  '15.272.894-5',
  'Av. Sete de Setembro, 125C',
  'Belém',
  'Tucuruí',
  'PA',
  '68.459-210',
  '(94) 99155-0011',
  'paraempreendimentolc@hotmail.com',
  '/logo-empreendimentos.png',
  '756 - SICOOB',
  '4345',
  '84.021-1',
  '07.947.570/0001-32',
  'CLOVIS TEODORO DA FONSECA',
  '782.061.891-49',
  '8366093 PC/PA',
  '[
    "Declaro para os devidos fins que nos preços oferecidos estão incluídas todas as despesas incidentes sobre o fornecimento referente a frete, tributos, deslocamento de pessoal e demais ônus pertinentes ao objeto licitado.",
    "Que inexistem fatos impeditivos para sua habilitação no certame, ciente da obrigatoriedade de declarar ocorrências posteriores;",
    "Que cumpre os requisitos estabelecidos no artigo 3° da Lei Complementar nº 123, de 2006, estando apto a usufruir do tratamento favorecido estabelecido em seus arts. 42 a 49.",
    "Que está ciente e concorda com as condições do edital da DISPENSA de licitação e seus anexos;",
    "Que assume a responsabilidade pelas transações que forem efetuadas no sistema, assumindo como firmes e verdadeiras;",
    "Que cumpre as exigências de reserva de cargos para pessoa com deficiência e para reabilitado da Previdência Social, de que trata o art. 93 da Lei nº 8.213/91.",
    "Que não emprega menor de 18 anos em trabalho noturno, perigoso ou insalubre e não emprega menor de 16 anos, salvo menor, a partir de 14 anos, na condição de aprendiz, nos termos do artigo 7°, XXXIII, da Constituição;"
  ]'::jsonb,
  60
),
(
  'medicamentos',
  'Pará Medicamentos',
  'PARA MEDICAMENTOS E SERVICOS MEDICOS LTDA',
  '26.123.476/0001-03',
  '15.536.640-8',
  'Av. Sete de Setembro, 125C',
  'Belém',
  'Tucuruí',
  'PA',
  '68.459-210',
  '(94) 99155-0011',
  'paramedicamentos2024@gmail.com',
  '/logo-medicamentos.png',
  '',
  '',
  '',
  '26.123.476/0001-03',
  'CLOVIS TEODORO DA FONSECA',
  '782.061.891-49',
  '8366093 PC/PA',
  '[
    "Declaramos que nos preços acima propostos, estão inclusos todos os custos necessários para a execução dos serviços, objeto da cotação em referência, bem como todos os tributos, fretes, seguros, encargos trabalhistas, comerciais e quaisquer outras despesas que incidam ou venham a incidir sobre o objeto desta licitação."
  ]'::jsonb,
  90
)
ON CONFLICT (tipo) DO NOTHING;

-- 2. Isolamento de fornecedores por empresa
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS company_tipo text
  CHECK (company_tipo IS NULL OR company_tipo IN ('empreendimentos','medicamentos'));

-- 3. Catálogo de imagens de produtos (reutilizável entre cotações)
CREATE TABLE IF NOT EXISTS public.catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao_normalizada text NOT NULL,
  descricao text NOT NULL,
  marca text DEFAULT '',
  modelo text DEFAULT '',
  image_url text DEFAULT '',
  image_source text NOT NULL DEFAULT 'manual' CHECK (image_source IN ('manual','ia')),
  company_tipo text CHECK (company_tipo IS NULL OR company_tipo IN ('empreendimentos','medicamentos')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (descricao_normalizada, company_tipo)
);

CREATE INDEX IF NOT EXISTS idx_catalog_items_desc ON public.catalog_items (descricao_normalizada);
CREATE INDEX IF NOT EXISTS idx_catalog_items_tipo ON public.catalog_items (company_tipo);

ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read catalog" ON public.catalog_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert catalog" ON public.catalog_items
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update catalog" ON public.catalog_items
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin delete catalog" ON public.catalog_items
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_catalog_items_updated
  BEFORE UPDATE ON public.catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. Bucket público para imagens de catálogo
INSERT INTO storage.buckets (id, name, public)
VALUES ('catalog-images', 'catalog-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Catalog images public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'catalog-images');

CREATE POLICY "Authenticated can upload catalog images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'catalog-images');

CREATE POLICY "Authenticated can update catalog images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'catalog-images')
  WITH CHECK (bucket_id = 'catalog-images');

CREATE POLICY "Admin can delete catalog images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'catalog-images' AND has_role(auth.uid(), 'admin'::app_role));
