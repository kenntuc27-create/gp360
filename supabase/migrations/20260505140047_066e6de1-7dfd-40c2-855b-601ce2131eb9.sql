ALTER TABLE public.bids
  ADD COLUMN IF NOT EXISTS uasg text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS data_inicio_propostas text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS data_encerramento_propostas text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS data_limite_entrega text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS bids_uasg_idx ON public.bids (uasg);