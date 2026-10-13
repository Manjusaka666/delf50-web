-- DELF50 · account-wide preferences: interface language, appearance and the
-- listening voice. They follow the account across devices and courses, and
-- are not learning records (nothing is derived from them). Additive: no
-- existing table or row changes. Idempotent.

create table if not exists delf50.user_settings (
  user_id    uuid primary key default delf50.uid() references neon_auth."user"(id) on delete cascade,
  prefs      jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on delf50.user_settings to delf50_api;
alter table delf50.user_settings enable row level security;
drop policy if exists own on delf50.user_settings;
create policy own on delf50.user_settings to delf50_api using (user_id = delf50.uid()) with check (user_id = delf50.uid());

insert into delf50.schema_migrations (version) values ('0007_user_settings') on conflict do nothing;
