
-- 1) Adiciona coluna de grupo de receita
ALTER TABLE public.sectors ADD COLUMN IF NOT EXISTS revenue_group text;

-- 2) Define grupos
UPDATE public.sectors SET revenue_group = 'posto' WHERE name IN ('Posto','Financeiro');
UPDATE public.sectors SET revenue_group = 'licitacao' WHERE name IN ('Captura de licitação','Operação de Licitação','Empreendimentos','Medicamentos');

-- 3) Alinha metas atuais entre setores do mesmo grupo
-- Posto/Financeiro: usa o valor do Financeiro (500000) como referência
UPDATE public.sectors SET monthly_revenue_target = 500000 WHERE revenue_group = 'posto';
-- Licitação: mantém 100000
UPDATE public.sectors SET monthly_revenue_target = 100000 WHERE revenue_group = 'licitacao';

-- 4) Substitui trigger para propagar dentro do grupo e recalcular métricas
CREATE OR REPLACE FUNCTION public.trg_sectors_target_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _peer record;
BEGIN
  IF NEW.monthly_revenue_target IS DISTINCT FROM OLD.monthly_revenue_target THEN
    -- Propaga para os setores do mesmo grupo (sem disparar recursão infinita)
    IF NEW.revenue_group IS NOT NULL THEN
      FOR _peer IN
        SELECT id FROM public.sectors
        WHERE revenue_group = NEW.revenue_group
          AND id <> NEW.id
          AND monthly_revenue_target IS DISTINCT FROM NEW.monthly_revenue_target
      LOOP
        UPDATE public.sectors
        SET monthly_revenue_target = NEW.monthly_revenue_target
        WHERE id = _peer.id;
      END LOOP;
    END IF;

    -- Recalcula métricas do próprio setor
    PERFORM public.recalc_sector_metrics(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- 5) Recalcula métricas atuais com base nas novas metas alinhadas
DO $$
DECLARE _s record;
BEGIN
  FOR _s IN SELECT id FROM public.sectors LOOP
    PERFORM public.recalc_sector_metrics(_s.id);
  END LOOP;
END$$;
