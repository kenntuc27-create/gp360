
-- ATA de Reunião + Tarefas + Ocorrências
CREATE TABLE public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_date date NOT NULL DEFAULT CURRENT_DATE,
  meeting_time time NOT NULL DEFAULT CURRENT_TIME,
  meeting_type text NOT NULL DEFAULT 'reuniao',
  area text NOT NULL DEFAULT 'geral',
  agenda text NOT NULL DEFAULT '',
  guidelines jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'concluido',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.meeting_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  present boolean NOT NULL DEFAULT true,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, employee_id)
);

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  assignee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  due_date date,
  status text NOT NULL DEFAULT 'pendente',
  source text NOT NULL DEFAULT 'manual',
  source_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  occurrence_type text NOT NULL,
  occurrence_date date NOT NULL DEFAULT CURRENT_DATE,
  severity text NOT NULL DEFAULT 'media',
  source text NOT NULL DEFAULT 'manual',
  source_id uuid,
  notes text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.occurrences ENABLE ROW LEVEL SECURITY;

-- Meetings
CREATE POLICY "auth read meetings" ON public.meetings FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert meetings" ON public.meetings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update meetings" ON public.meetings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin delete meetings" ON public.meetings FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));

-- Participants
CREATE POLICY "auth read participants" ON public.meeting_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert participants" ON public.meeting_participants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update participants" ON public.meeting_participants FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete participants" ON public.meeting_participants FOR DELETE TO authenticated USING (true);

-- Tasks
CREATE POLICY "auth read tasks" ON public.tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert tasks" ON public.tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update tasks" ON public.tasks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin delete tasks" ON public.tasks FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));

-- Occurrences
CREATE POLICY "auth read occurrences" ON public.occurrences FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert occurrences" ON public.occurrences FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update occurrences" ON public.occurrences FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin delete occurrences" ON public.occurrences FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER meetings_touch BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER tasks_touch BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_meetings_date ON public.meetings(meeting_date DESC);
CREATE INDEX idx_tasks_assignee ON public.tasks(assignee_id);
CREATE INDEX idx_tasks_source ON public.tasks(source, source_id);
CREATE INDEX idx_occurrences_employee ON public.occurrences(employee_id);
CREATE INDEX idx_occurrences_source ON public.occurrences(source, source_id);
