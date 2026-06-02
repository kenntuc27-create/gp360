-- 1. Criar Tipo de Status Master para consistência
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'licitation_status') THEN
        CREATE TYPE public.licitation_status AS ENUM (
            'imported', 'pre_quoted', 'quoted', 'approved', 'dispute', 
            'won', 'lost', 'homologated', 'invoiced', 'delivered', 
            'received', 'closed'
        );
    END IF;
END $$;

-- 2. Ajustar tabela de itens (bid_items) com a nova arquitetura de valores
-- Adicionar/Renomear colunas para seguir o padrão do Engine
ALTER TABLE public.bid_items 
ADD COLUMN IF NOT EXISTS global_item_id UUID DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS estimated_value NUMERIC(15,2) DEFAULT 0, -- valor unitário edital
ADD COLUMN IF NOT EXISTS quoted_value NUMERIC(15,2) DEFAULT 0,    -- valor unitário custo
ADD COLUMN IF NOT EXISTS dispute_value NUMERIC(15,2) DEFAULT 0,   -- valor unitário lance
ADD COLUMN IF NOT EXISTS homologated_value NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS invoiced_value NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS received_value NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS profit_margin_pct NUMERIC(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS profit_value NUMERIC(15,2) DEFAULT 0;

-- Migrar dados existentes para novas colunas para não perder informação
UPDATE public.bid_items 
SET 
    estimated_value = COALESCE(valor_unitario, 0),
    quoted_value = COALESCE(custo_unitario, 0),
    dispute_value = COALESCE(preco_venda_manual, final_price, 0),
    homologated_value = COALESCE(preco_homologado, 0);

-- 3. Ajustar tabela principal (bids) para consolidar KPIs reais
ALTER TABLE public.bids
ADD COLUMN IF NOT EXISTS total_estimated NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_quoted NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_dispute NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_homologated NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_invoiced NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_received NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_profit_real NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_margin_real_pct NUMERIC(5,2) DEFAULT 0;

-- 4. LICITATION ENGINE: Função centralizada de cálculo
CREATE OR REPLACE FUNCTION public.calculate_item_metrics()
RETURNS TRIGGER AS $$
BEGIN
    -- Cálculo de lucro e margem do item (Baseado no lance atual/disputa)
    -- Lucro = (Lance - Custo) * Qtd
    IF NEW.dispute_value > 0 THEN
        NEW.profit_value := (NEW.dispute_value - NEW.quoted_value) * NEW.quantidade;
        NEW.profit_margin_pct := ((NEW.dispute_value - NEW.quoted_value) / NULLIF(NEW.dispute_value, 0)) * 100;
    ELSE
        NEW.profit_value := 0;
        NEW.profit_margin_pct := 0;
    END IF;

    -- Se o item já foi homologado, o lucro real usa o valor homologado
    IF NEW.status = 'homologated' AND NEW.homologated_value > 0 THEN
        NEW.profit_value := (NEW.homologated_value - NEW.quoted_value) * NEW.quantidade;
        NEW.profit_margin_pct := ((NEW.homologated_value - NEW.quoted_value) / NULLIF(NEW.homologated_value, 0)) * 100;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para calcular métricas do item antes de salvar
DROP TRIGGER IF EXISTS trg_calculate_item_metrics ON public.bid_items;
CREATE TRIGGER trg_calculate_item_metrics
BEFORE INSERT OR UPDATE ON public.bid_items
FOR EACH ROW EXECUTE FUNCTION public.calculate_item_metrics();

-- 5. LICITATION ENGINE: Função de consolidação da Licitação (Header)
CREATE OR REPLACE FUNCTION public.consolidate_bid_metrics()
RETURNS TRIGGER AS $$
DECLARE
    v_bid_id UUID;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        v_bid_id := OLD.bid_id;
    ELSE
        v_bid_id := NEW.bid_id;
    END IF;

    UPDATE public.bids
    SET 
        total_estimated = (SELECT SUM(estimated_value * quantidade) FROM public.bid_items WHERE bid_id = v_bid_id),
        total_quoted = (SELECT SUM(quoted_value * quantidade) FROM public.bid_items WHERE bid_id = v_bid_id),
        total_dispute = (SELECT SUM(dispute_value * quantidade) FROM public.bid_items WHERE bid_id = v_bid_id),
        -- KPI Real: Somente o que foi GANHO ou HOMOLOGADO
        total_homologated = (SELECT SUM(homologated_value * quantidade) FROM public.bid_items WHERE bid_id = v_bid_id AND status IN ('won', 'homologated', 'invoiced', 'delivered', 'received')),
        total_invoiced = (SELECT SUM(invoiced_value * quantidade) FROM public.bid_items WHERE bid_id = v_bid_id),
        total_received = (SELECT SUM(received_value * quantidade) FROM public.bid_items WHERE bid_id = v_bid_id),
        -- Lucro Real consolidado (Baseado em itens ganhos/homologados)
        total_profit_real = (SELECT SUM(profit_value) FROM public.bid_items WHERE bid_id = v_bid_id AND status IN ('won', 'homologated', 'invoiced', 'delivered', 'received')),
        total_margin_real_pct = CASE 
            WHEN (SELECT SUM(homologated_value * quantidade) FROM public.bid_items WHERE bid_id = v_bid_id AND status IN ('won', 'homologated', 'invoiced', 'delivered', 'received')) > 0 
            THEN ((SELECT SUM(profit_value) FROM public.bid_items WHERE bid_id = v_bid_id AND status IN ('won', 'homologated', 'invoiced', 'delivered', 'received')) / 
                 (SELECT SUM(homologated_value * quantidade) FROM public.bid_items WHERE bid_id = v_bid_id AND status IN ('won', 'homologated', 'invoiced', 'delivered', 'received'))) * 100
            ELSE 0 
        END,
        updated_at = NOW()
    WHERE id = v_bid_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger para consolidar métricas no cabeçalho após qualquer mudança nos itens
DROP TRIGGER IF EXISTS trg_consolidate_bid_metrics ON public.bid_items;
CREATE TRIGGER trg_consolidate_bid_metrics
AFTER INSERT OR UPDATE OR DELETE ON public.bid_items
FOR EACH ROW EXECUTE FUNCTION public.consolidate_bid_metrics();
