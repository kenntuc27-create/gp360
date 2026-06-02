
CREATE TABLE IF NOT EXISTS public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid,
  user_id uuid,
  reference_date date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL, -- 'ponto' | 'producao'
  kind text NOT NULL,     -- 'entrada','saida_intervalo','volta_intervalo','saida','producao'
  stage text NOT NULL DEFAULT 'aviso', -- 'aviso','reforco','amarelo','vermelho'
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  sent_at timestamptz NOT NULL DEFAULT now(),
  delivered_count int NOT NULL DEFAULT 0,
  clicked_at timestamptz,
  acknowledged_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_notif_log_emp_date ON public.notification_log(employee_id, reference_date);
CREATE INDEX IF NOT EXISTS idx_notif_log_user_date ON public.notification_log(user_id, reference_date);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read own notif log"
ON public.notification_log FOR SELECT TO authenticated
USING (user_id = auth.uid() OR has_role(auth.uid(),'admin'));

CREATE POLICY "auth insert notif log"
ON public.notification_log FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "auth update own notif log"
ON public.notification_log FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR has_role(auth.uid(),'admin'))
WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(),'admin'));

CREATE POLICY "admin delete notif log"
ON public.notification_log FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin'));
