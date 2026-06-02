-- 1. Sincronizar dados e disparar gatilhos de cálculo
UPDATE public.bid_items 
SET 
    quoted_value = COALESCE(NULLIF(quoted_value, 0), custo_unitario, 0),
    homologated_value = COALESCE(NULLIF(homologated_value, 0), preco_homologado, 0),
    estimated_value = COALESCE(NULLIF(estimated_value, 0), valor_unitario, 0),
    status = CASE 
        WHEN venceu = true AND (status IS NULL OR status = 'ok' OR status = '') THEN 'won'
        ELSE status
    END;

-- 2. Garantir que bid_items tenha um custo estimado se estiver zerado (fallback operacional de 60%)
UPDATE public.bid_items
SET quoted_value = estimated_value * 0.6
WHERE (quoted_value = 0 OR quoted_value IS NULL) AND estimated_value > 0;
