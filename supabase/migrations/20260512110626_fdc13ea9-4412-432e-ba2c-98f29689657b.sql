
create or replace function public.resolve_login_email(_identifier text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _norm text := lower(regexp_replace(coalesce(_identifier,''), '[^a-z0-9@._-]', '', 'g'));
  _email text;
begin
  if _norm = '' then return null; end if;
  if position('@' in _norm) > 0 then return _norm; end if;

  select email into _email from public.profiles
   where lower(username) = _norm limit 1;
  if _email is not null then return _email; end if;

  select email into _email from public.profiles
   where email ilike (_norm || '@%') limit 1;
  if _email is not null then return _email; end if;

  return _norm || '@interno.local';
end;
$$;

grant execute on function public.resolve_login_email(text) to anon, authenticated;
