-- Criar tabela de Segmentos Operacionais
CREATE TABLE IF NOT EXISTS public.segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Segmentos visíveis por todos autenticados" ON public.segments
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Apenas admins gerenciam segmentos" ON public.segments
    FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Inserir segmentos iniciais sugeridos pelo usuário
INSERT INTO public.segments (name) VALUES 
('Medicamentos'),
('Material hospitalar'),
('Material de escritório'),
('Informática'),
('Construção'),
('Móveis'),
('Equipamentos'),
('Gêneros alimentícios'),
('Limpeza'),
('EPIs')
ON CONFLICT (name) DO NOTHING;

-- Tabela de vínculo Usuário <-> Segmento (Segurança Operacional)
CREATE TABLE IF NOT EXISTS public.user_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    segment_id UUID REFERENCES public.segments(id) ON DELETE CASCADE,
    UNIQUE(user_id, segment_id)
);

ALTER TABLE public.user_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem seus próprios vínculos de segmento" ON public.user_segments
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins gerenciam vínculos de segmento" ON public.user_segments
    FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Tabela de vínculo Fornecedor <-> Segmento
CREATE TABLE IF NOT EXISTS public.supplier_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE CASCADE,
    segment_id UUID REFERENCES public.segments(id) ON DELETE CASCADE,
    UNIQUE(supplier_id, segment_id)
);

ALTER TABLE public.supplier_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vínculos de fornecedor visíveis por todos" ON public.supplier_segments
    FOR SELECT TO authenticated USING (true);

-- Atualizar tabela de Fornecedores com campos estratégicos
ALTER TABLE public.suppliers 
ADD COLUMN IF NOT EXISTS whatsapp TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS representative TEXT,
ADD COLUMN IF NOT EXISTS city_uf TEXT,
ADD COLUMN IF NOT EXISTS standard_discount_type TEXT DEFAULT 'percentage', -- 'percentage' ou 'fixed'
ADD COLUMN IF NOT EXISTS standard_discount_value NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS performance_metrics JSONB DEFAULT '{
    "quote_count": 0,
    "response_rate": 0,
    "win_rate": 0,
    "avg_discount": 0,
    "avg_lead_time": 0
}'::jsonb;

-- Atualizar Licitações (Bids) com Segmento e Financeiro
ALTER TABLE public.bids 
ADD COLUMN IF NOT EXISTS segment_id UUID REFERENCES public.segments(id),
ADD COLUMN IF NOT EXISTS sold_total NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS bought_total NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS profit_value NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS roi NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS loss_reason TEXT,
ADD COLUMN IF NOT EXISTS margin_percentage NUMERIC DEFAULT 0;

-- Atualizar Itens da Licitação (Bid Items) para Cotação Estratégica
ALTER TABLE public.bid_items
ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id),
ADD COLUMN IF NOT EXISTS cost_price NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS final_price NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS supplier_discount_type TEXT DEFAULT 'percentage',
ADD COLUMN IF NOT EXISTS supplier_discount_value NUMERIC DEFAULT 0;

-- Criar função para calcular financeiro do item automaticamente (opcional via trigger, mas faremos no app para flexibilidade)
-- Adicionar índice para performance
CREATE INDEX IF NOT EXISTS idx_bids_segment_id ON public.bids(segment_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_metrics ON public.suppliers USING gin(performance_metrics);
