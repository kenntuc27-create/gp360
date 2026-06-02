-- 1. Melhorar a tabela de audit_log para suportar metadados de rede
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS device_id TEXT;

-- 2. Função genérica de auditoria
CREATE OR REPLACE FUNCTION public.process_audit_log()
RETURNS TRIGGER AS $$
DECLARE
    current_user_id UUID;
    v_old_data JSONB := NULL;
    v_new_data JSONB := NULL;
BEGIN
    -- Tenta obter o ID do usuário do auth.uid()
    current_user_id := auth.uid();

    IF (TG_OP = 'DELETE') THEN
        v_old_data := to_jsonb(OLD);
    ELSIF (TG_OP = 'UPDATE') THEN
        v_old_data := to_jsonb(OLD);
        v_new_data := to_jsonb(NEW);
    ELSIF (TG_OP = 'INSERT') THEN
        v_new_data := to_jsonb(NEW);
    END IF;

    INSERT INTO public.audit_log (
        user_id,
        action,
        table_name,
        record_id,
        old_data,
        new_data,
        created_at
    ) VALUES (
        current_user_id,
        TG_OP,
        TG_TABLE_NAME,
        CASE 
            WHEN TG_OP = 'DELETE' THEN OLD.id::text 
            ELSE NEW.id::text 
        END,
        v_old_data,
        v_new_data,
        now()
    );

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Aplicar triggers nas tabelas críticas
-- Bids
DROP TRIGGER IF EXISTS trg_audit_bids ON public.bids;
CREATE TRIGGER trg_audit_bids AFTER INSERT OR UPDATE OR DELETE ON public.bids FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

-- Bid Items
DROP TRIGGER IF EXISTS trg_audit_bid_items ON public.bid_items;
CREATE TRIGGER trg_audit_bid_items AFTER INSERT OR UPDATE OR DELETE ON public.bid_items FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

-- Suppliers
DROP TRIGGER IF EXISTS trg_audit_suppliers ON public.suppliers;
CREATE TRIGGER trg_audit_suppliers AFTER INSERT OR UPDATE OR DELETE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

-- Profiles
DROP TRIGGER IF EXISTS trg_audit_profiles ON public.profiles;
CREATE TRIGGER trg_audit_profiles AFTER INSERT OR UPDATE OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

-- Supplier Responses
DROP TRIGGER IF EXISTS trg_audit_responses ON public.bid_supplier_responses;
CREATE TRIGGER trg_audit_responses AFTER INSERT OR UPDATE OR DELETE ON public.bid_supplier_responses FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

-- 4. Correção de RLS (Exemplos de políticas seguras)
-- Tabela Bids
ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their allowed bids" ON public.bids;
CREATE POLICY "Users can view their allowed bids" ON public.bids
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = auth.uid() 
        AND (p.nivel_acesso = 'admin' OR p.company_tipo = bids.tipo_cotacao)
    )
);

-- Tabela Suppliers
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Everyone can view suppliers" ON public.suppliers;
CREATE POLICY "Everyone can view suppliers" ON public.suppliers
FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can manage suppliers" ON public.suppliers;
CREATE POLICY "Admins can manage suppliers" ON public.suppliers
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = auth.uid() AND p.nivel_acesso IN ('admin', 'gerente')
    )
);
