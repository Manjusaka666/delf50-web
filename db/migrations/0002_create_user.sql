-- DELF50 cloud storage · atomic account creation
--
-- Checks the optional account cap and inserts the user under one transaction-
-- scoped advisory lock, so concurrent registrations cannot exceed the cap.
-- Returns one row: status 'ok' (with the new user), 'taken' or 'full'.
-- Idempotent: safe to run again.

create or replace function delf50.create_user(
  p_email text, p_email_norm text, p_display_name text, p_password_hash text, p_max_users integer)
returns table (status text, id uuid, email text, display_name text, role text)
language plpgsql as $$
declare
  active integer;
begin
  perform pg_advisory_xact_lock(hashtext('delf50.create_user'));
  if exists (select 1 from delf50.users u where u.email_norm = p_email_norm) then
    return query select 'taken'::text, null::uuid, null::text, null::text, null::text; return;
  end if;
  if p_max_users is not null then
    select count(*) into active from delf50.users u where u.disabled_at is null;
    if active >= p_max_users then
      return query select 'full'::text, null::uuid, null::text, null::text, null::text; return;
    end if;
  end if;
  return query
    insert into delf50.users as u (email, email_norm, display_name, password_hash)
    values (p_email, p_email_norm, p_display_name, p_password_hash)
    returning 'ok'::text, u.id, u.email, u.display_name, u.role;
end;
$$;

insert into delf50.schema_migrations (version) values ('0002_create_user') on conflict do nothing;
