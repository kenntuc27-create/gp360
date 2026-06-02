
CREATE TABLE IF NOT EXISTS public.performance_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  reference_date date NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  classification text NOT NULL DEFAULT 'D',
  production_score numeric NOT NULL DEFAULT 0,
  tasks_score numeric NOT NULL DEFAULT 0,
  behavior_score numeric NOT NULL DEFAULT 0,
  previous_classification text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, reference_date)
);

ALTER TABLE public.performance_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read performance_scores" ON public.performance_scores FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage performance_scores" ON public.performance_scores FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_perf_scores_date ON public.performance_scores(reference_date DESC);
CREATE INDEX IF NOT EXISTS idx_perf_scores_emp ON public.performance_scores(employee_id, reference_date DESC);

CREATE OR REPLACE FUNCTION public.compute_performance_scores(_date date DEFAULT CURRENT_DATE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _emp record;
  _start date := (_date - INTERVAL '29 days')::date;
  _prod_pct numeric;
  _tasks_pct numeric;
  _behavior numeric;
  _score numeric;
  _class text;
  _prev_class text;
  _goal_total numeric;
  _real_total numeric;
  _tasks_total int;
  _tasks_ok int;
  _alerts int;
  _occ int;
  _adesao_bad int;
BEGIN
  FOR _emp IN SELECT id FROM public.employees WHERE active = true LOOP

    -- Produção: realizado vs meta diária * dias no período (últimos 30 dias)
    SELECT COALESCE(SUM(sm.daily_goal),0) * 30, COALESCE(SUM(d.realized_value),0)
    INTO _goal_total, _real_total
    FROM public.employees e
    LEFT JOIN public.sector_metrics sm ON sm.sector_id = e.sector_id AND sm.active = true
    LEFT JOIN public.daily_production_metrics d
      ON d.metric_id = sm.id AND d.employee_id = e.id
     AND d.production_date BETWEEN _start AND _date
    WHERE e.id = _emp.id;

    _prod_pct := CASE WHEN _goal_total > 0 THEN LEAST(100, (_real_total / _goal_total) * 100) ELSE 0 END;

    -- Tarefas: % concluídas no prazo (últimos 30 dias)
    SELECT COUNT(*),
           COUNT(*) FILTER (
             WHERE status = 'concluida'
             AND (due_date IS NULL OR updated_at::date <= due_date)
           )
    INTO _tasks_total, _tasks_ok
    FROM public.tasks
    WHERE assignee_id = _emp.id
      AND created_at::date BETWEEN _start AND _date;

    _tasks_pct := CASE WHEN _tasks_total > 0 THEN (_tasks_ok::numeric / _tasks_total) * 100 ELSE 100 END;

    -- Comportamento: alertas + ocorrências + dias não aderentes (penalidades)
    SELECT COUNT(*) INTO _alerts FROM public.adherence_alerts
      WHERE employee_id = _emp.id AND reference_date BETWEEN _start AND _date;
    SELECT COUNT(*) INTO _occ FROM public.occurrences
      WHERE employee_id = _emp.id AND occurrence_date BETWEEN _start AND _date;
    SELECT COUNT(*) INTO _adesao_bad FROM public.adherence_status
      WHERE employee_id = _emp.id AND reference_date BETWEEN _start AND _date AND status <> 'regular';

    _behavior := GREATEST(0, 100 - (_alerts * 5) - (_occ * 10) - (_adesao_bad * 3));

    _score := ROUND((_prod_pct * 0.5) + (_tasks_pct * 0.3) + (_behavior * 0.2), 2);

    _class := CASE
      WHEN _score >= 90 THEN 'A'
      WHEN _score >= 70 THEN 'B'
      WHEN _score >= 50 THEN 'C'
      ELSE 'D'
    END;

    SELECT classification INTO _prev_class FROM public.performance_scores
      WHERE employee_id = _emp.id AND reference_date = (_date - 1);

    INSERT INTO public.performance_scores
      (employee_id, reference_date, score, classification, production_score, tasks_score, behavior_score, previous_classification, details, computed_at)
    VALUES (_emp.id, _date, _score, _class, ROUND(_prod_pct,2), ROUND(_tasks_pct,2), ROUND(_behavior,2), _prev_class,
      jsonb_build_object('goal_total',_goal_total,'real_total',_real_total,'tasks_total',_tasks_total,'tasks_ok',_tasks_ok,'alerts',_alerts,'occurrences',_occ,'adesao_bad',_adesao_bad), now())
    ON CONFLICT (employee_id, reference_date) DO UPDATE
      SET score=EXCLUDED.score, classification=EXCLUDED.classification,
          production_score=EXCLUDED.production_score, tasks_score=EXCLUDED.tasks_score,
          behavior_score=EXCLUDED.behavior_score, previous_classification=EXCLUDED.previous_classification,
          details=EXCLUDED.details, computed_at=now();

    -- Alertas: queda de nível ou score crítico
    IF _prev_class IS NOT NULL AND _prev_class <> _class
       AND ('ABCD' ~ _prev_class) AND POSITION(_class IN 'ABCD') > POSITION(_prev_class IN 'ABCD') THEN
      INSERT INTO public.adherence_alerts (employee_id, reference_date, alert_type, severity, message)
      VALUES (_emp.id, _date, 'score', 'atencao', 'Queda de classificação: '||_prev_class||' → '||_class||' (score '||_score||')');
    END IF;

    IF _score < 50 THEN
      INSERT INTO public.adherence_alerts (employee_id, reference_date, alert_type, severity, message)
      VALUES (_emp.id, _date, 'score', 'critico', 'Score crítico: '||_score||' (classificação D)');

      INSERT INTO public.occurrences (employee_id, occurrence_type, severity, source, notes, occurrence_date)
      SELECT _emp.id, 'performance', 'alta', 'auto',
             'Score de performance crítico em '||_date||': '||_score||' (D)', _date
      WHERE NOT EXISTS (
        SELECT 1 FROM public.occurrences
        WHERE employee_id = _emp.id AND occurrence_date = _date AND occurrence_type = 'performance'
      );
    END IF;
  END LOOP;
END;
$$;
