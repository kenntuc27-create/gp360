
-- 1. Adiciona meta mensal e dias úteis nos setores
ALTER TABLE public.sectors
  ADD COLUMN IF NOT EXISTS monthly_revenue_target NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS working_days INTEGER NOT NULL DEFAULT 25;

-- 2. Baseline em cada métrica para permitir escala proporcional
ALTER TABLE public.sector_metrics
  ADD COLUMN IF NOT EXISTS baseline_sector_target NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS baseline_daily_goal NUMERIC NOT NULL DEFAULT 0;

-- 3. Função que recalcula todas as métricas de um setor proporcionalmente
CREATE OR REPLACE FUNCTION public.recalc_sector_metrics(_sector_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _target NUMERIC;
BEGIN
  SELECT monthly_revenue_target INTO _target FROM public.sectors WHERE id = _sector_id;
  IF _target IS NULL OR _target = 0 THEN RETURN; END IF;

  UPDATE public.sector_metrics
  SET daily_goal = ROUND(baseline_daily_goal * (_target / NULLIF(baseline_sector_target, 0)), 2)
  WHERE sector_id = _sector_id
    AND active = true
    AND baseline_sector_target > 0
    AND baseline_daily_goal > 0;
END;
$$;

-- 4. Trigger para recálculo automático ao alterar a meta do setor
CREATE OR REPLACE FUNCTION public.trg_sectors_target_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.monthly_revenue_target IS DISTINCT FROM OLD.monthly_revenue_target THEN
    PERFORM public.recalc_sector_metrics(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sectors_target_recalc ON public.sectors;
CREATE TRIGGER sectors_target_recalc
AFTER UPDATE ON public.sectors
FOR EACH ROW EXECUTE FUNCTION public.trg_sectors_target_changed();
