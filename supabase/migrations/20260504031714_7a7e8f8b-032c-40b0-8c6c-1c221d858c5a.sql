
CREATE TABLE public.work_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekday smallint NOT NULL UNIQUE CHECK (weekday BETWEEN 0 AND 6),
  is_off boolean NOT NULL DEFAULT false,
  start_time time,
  end_time time,
  break_start time,
  break_end time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.work_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read work_schedules" ON public.work_schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage work_schedules" ON public.work_schedules FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

INSERT INTO public.work_schedules (weekday, is_off, start_time, end_time, break_start, break_end) VALUES
  (0, true, NULL, NULL, NULL, NULL),
  (1, false, '08:00', '18:00', '12:00', '14:00'),
  (2, false, '08:00', '18:00', '12:00', '14:00'),
  (3, false, '08:00', '18:00', '12:00', '14:00'),
  (4, false, '08:00', '18:00', '12:00', '14:00'),
  (5, false, '08:00', '18:00', '12:00', '14:00'),
  (6, false, '08:00', '12:00', NULL, NULL);

CREATE TABLE public.time_punches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  punch_date date NOT NULL DEFAULT CURRENT_DATE,
  punch_type text NOT NULL CHECK (punch_type IN ('entrada','saida_intervalo','volta_intervalo','saida')),
  punch_time timestamptz NOT NULL DEFAULT now(),
  delay_minutes integer NOT NULL DEFAULT 0,
  classification text NOT NULL DEFAULT 'ok' CHECK (classification IN ('ok','leve','critico')),
  source text NOT NULL DEFAULT 'manual',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, punch_date, punch_type)
);
CREATE INDEX idx_time_punches_emp_date ON public.time_punches(employee_id, punch_date);
ALTER TABLE public.time_punches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read time_punches" ON public.time_punches FOR SELECT TO authenticated USING (true);
CREATE POLICY "employee insert own punches" ON public.time_punches FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = time_punches.employee_id AND e.user_id = auth.uid())
  OR has_role(auth.uid(),'admin'::app_role)
);
CREATE POLICY "employee update own punches" ON public.time_punches FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = time_punches.employee_id AND e.user_id = auth.uid())
  OR has_role(auth.uid(),'admin'::app_role)
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = time_punches.employee_id AND e.user_id = auth.uid())
  OR has_role(auth.uid(),'admin'::app_role)
);
CREATE POLICY "admin delete punches" ON public.time_punches FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
