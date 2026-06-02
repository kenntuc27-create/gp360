ALTER TABLE public.sectors
  ADD COLUMN IF NOT EXISTS is_operational boolean NOT NULL DEFAULT false;

-- Marca como operacionais os setores que correspondem aos módulos do sistema
UPDATE public.sectors
SET is_operational = true
WHERE lower(name) IN ('medicamentos', 'empreendimentos');