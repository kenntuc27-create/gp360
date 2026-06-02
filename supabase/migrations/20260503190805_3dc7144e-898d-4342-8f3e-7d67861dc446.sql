
-- Tabelas de adesão
CREATE TABLE public.adherence_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  reference_date date NOT NULL,
  status text NOT NULL DEFAULT 'regular', -- regular | atencao | nao_aderente
  production_ok boolean NOT NULL DEFAULT false,
  tasks_ok boolean NOT NULL DEFAULT true,
  meetings_ok boolean NOT NULL DEFAULT true,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, reference_date)
);
ALTER TABLE public.adherence_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read adherence_status" ON public.adherence_status FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage adherence_status" ON public.adherence_status FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.adherence_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  reference_date date NOT NULL,
  alert_type text NOT NULL, -- producao | tarefa | reuniao | reincidencia
  severity text NOT NULL DEFAULT 'informativo', -- informativo | atencao | critico
  message text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'auto',
  source_id uuid,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.adherence_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read adherence_alerts" ON public.adherence_alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert adherence_alerts" ON public.adherence_alerts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update adherence_alerts" ON public.adherence_alerts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin delete adherence_alerts" ON public.adherence_alerts FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));

CREATE INDEX idx_adh_status_date ON public.adherence_status(reference_date);
CREATE INDEX idx_adh_alerts_emp_date ON public.adherence_alerts(employee_id, reference_date);

-- Função de cálculo diário
CREATE OR REPLACE FUNCTION public.recompute_adherence(_date date DEFAULT CURRENT_DATE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _emp record;
  _has_prod boolean;
  _prod_late boolean;
  _overdue_tasks int;
  _critical_overdue int;
  _absent int;
  _status text;
  _recent_misses int;
BEGIN
  FOR _emp IN SELECT id, full_name FROM public.employees WHERE active = true LOOP
    -- Produção
    SELECT EXISTS (
      SELECT 1 FROM public.daily_production_metrics
      WHERE employee_id = _emp.id AND production_date = _date
    ) INTO _has_prod;

    SELECT EXISTS (
      SELECT 1 FROM public.daily_production_metrics
      WHERE employee_id = _emp.id AND production_date = _date
        AND submitted_at::date > _date
    ) INTO _prod_late;

    -- Tarefas em atraso (não concluídas)
    SELECT COUNT(*) INTO _overdue_tasks
    FROM public.tasks
    WHERE assignee_id = _emp.id
      AND status <> 'concluida'
      AND due_date IS NOT NULL
      AND due_date < _date;

    SELECT COUNT(*) INTO _critical_overdue
    FROM public.tasks
    WHERE assignee_id = _emp.id
      AND status <> 'concluida'
      AND due_date IS NOT NULL
      AND due_date < (_date - INTERVAL '2 days')::date;

    -- Ausências em reuniões hoje
    SELECT COUNT(*) INTO _absent
    FROM public.meeting_participants mp
    JOIN public.meetings m ON m.id = mp.meeting_id
    WHERE mp.employee_id = _emp.id AND mp.present = false AND m.meeting_date = _date;

    -- Reincidência: dias sem produção nos últimos 5
    SELECT COUNT(*) INTO _recent_misses
    FROM generate_series(_date - INTERVAL '4 days', _date, '1 day'::interval) g(d)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.daily_production_metrics
      WHERE employee_id = _emp.id AND production_date = g.d::date
    );

    -- Classificação
    IF NOT _has_prod OR _critical_overdue > 0 OR _absent > 0 OR _recent_misses >= 3 THEN
      _status := 'nao_aderente';
    ELSIF _prod_late OR _overdue_tasks > 0 THEN
      _status := 'atencao';
    ELSE
      _status := 'regular';
    END IF;

    INSERT INTO public.adherence_status (employee_id, reference_date, status, production_ok, tasks_ok, meetings_ok, details, computed_at)
    VALUES (
      _emp.id, _date, _status, _has_prod, (_overdue_tasks = 0), (_absent = 0),
      jsonb_build_object('overdue_tasks',_overdue_tasks,'critical_overdue',_critical_overdue,'absent',_absent,'prod_late',_prod_late,'recent_misses',_recent_misses),
      now()
    )
    ON CONFLICT (employee_id, reference_date) DO UPDATE
      SET status = EXCLUDED.status,
          production_ok = EXCLUDED.production_ok,
          tasks_ok = EXCLUDED.tasks_ok,
          meetings_ok = EXCLUDED.meetings_ok,
          details = EXCLUDED.details,
          computed_at = now();

    -- Alertas
    IF NOT _has_prod THEN
      INSERT INTO public.adherence_alerts (employee_id, reference_date, alert_type, severity, message)
      VALUES (_emp.id, _date, 'producao',
              CASE WHEN _recent_misses >= 3 THEN 'critico' WHEN _recent_misses >= 2 THEN 'atencao' ELSE 'informativo' END,
              'Produção do dia não preenchida' || CASE WHEN _recent_misses>=2 THEN ' ('||_recent_misses||' dias sem registro)' ELSE '' END);
    END IF;
    IF _overdue_tasks > 0 THEN
      INSERT INTO public.adherence_alerts (employee_id, reference_date, alert_type, severity, message)
      VALUES (_emp.id, _date, 'tarefa',
              CASE WHEN _critical_overdue > 0 THEN 'critico' ELSE 'atencao' END,
              _overdue_tasks||' tarefa(s) em atraso');
    END IF;
    IF _absent > 0 THEN
      INSERT INTO public.adherence_alerts (employee_id, reference_date, alert_type, severity, message)
      VALUES (_emp.id, _date, 'reuniao', 'atencao', 'Ausência em reunião registrada');
    END IF;

    -- Alerta crítico → ocorrência automática
    IF _status = 'nao_aderente' THEN
      INSERT INTO public.occurrences (employee_id, occurrence_type, severity, source, notes, occurrence_date)
      SELECT _emp.id, 'adesao', 'alta', 'auto',
             'Não aderente em '||_date||' — produção:'||_has_prod||' tarefas atrasadas:'||_overdue_tasks||' ausências:'||_absent,
             _date
      WHERE NOT EXISTS (
        SELECT 1 FROM public.occurrences
        WHERE employee_id = _emp.id AND occurrence_date = _date AND occurrence_type = 'adesao'
      );
    END IF;
  END LOOP;
END;
$$;
