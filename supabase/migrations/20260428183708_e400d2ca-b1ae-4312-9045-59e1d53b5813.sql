ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL AND username <> '';