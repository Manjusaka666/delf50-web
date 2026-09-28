-- DELF50 · every learning-record type the app writes, as its own entity
--
-- From the app's code: grammar output practice (S.prodDone), the daily task
-- checklist (S.taskDone), per-day counters (S.daily), study days
-- (S.dayHistory171) and vocabulary/review practice (S.practiceCounters172).
-- A fixed error leaves the app's list but stays here (resolved_at). Idempotent.

create table if not exists delf50.grammar_productions (
  user_id      uuid not null default delf50.uid() references neon_auth."user"(id) on delete cascade,
  prod_key     text not null,            -- "<day>:<grammar node>:<prompt index>"
  day          int,
  node_id      text,
  prompt_index int,
  done         boolean,
  value        jsonb,
  recorded_at  timestamptz not null default now(),
  primary key (user_id, prod_key)
);

create table if not exists delf50.task_checks (
  user_id    uuid not null default delf50.uid() references neon_auth."user"(id) on delete cascade,
  task_key   text not null,              -- "<day>:<task id>"
  day        int,
  task_id    text,
  done       boolean,
  value      jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, task_key)
);

create table if not exists delf50.daily_progress (
  user_id      uuid not null default delf50.uid() references neon_auth."user"(id) on delete cascade,
  day_key      text not null,
  day          int,
  grammar      int,
  grammar_prod int,
  reading      int,
  listening    int,
  writing      int,
  speaking     int,
  application  int,
  extra        jsonb,
  primary key (user_id, day_key)
);

create table if not exists delf50.study_days (
  user_id           uuid not null default delf50.uid() references neon_auth."user"(id) on delete cascade,
  day_key           text not null,
  day               int,
  first_activity_at timestamptz,
  last_activity_at  timestamptz,
  actions           int,
  last_action       text,
  extra             jsonb,
  primary key (user_id, day_key)
);

create table if not exists delf50.practice_counters (
  user_id         uuid not null default delf50.uid() references neon_auth."user"(id) on delete cascade,
  day_key         text not null,
  day             int,
  vocab           int,
  review          int,
  legacy_inferred boolean,
  extra           jsonb,
  primary key (user_id, day_key)
);

alter table delf50.error_items add column if not exists resolved_at timestamptz;

grant select, insert, update, delete on delf50.grammar_productions, delf50.task_checks, delf50.daily_progress,
  delf50.study_days, delf50.practice_counters to delf50_api;

do $$
declare t text;
begin
  foreach t in array array['grammar_productions', 'task_checks', 'daily_progress', 'study_days', 'practice_counters'] loop
    execute format('alter table delf50.%I enable row level security', t);
    execute format('drop policy if exists own on delf50.%I', t);
    execute format('create policy own on delf50.%I to delf50_api using (user_id = delf50.uid()) with check (user_id = delf50.uid())', t);
  end loop;
end $$;

drop view if exists delf50.daily_activity;
create view delf50.daily_activity with (security_invoker = true) as
            select user_id, answered_at::date as day, 'grammar' as module, count(*) as n from delf50.grammar_attempts where not deleted group by 1, 2
  union all select user_id, recorded_at::date, 'grammar_production', count(*) from delf50.grammar_productions where done group by 1, 2
  union all select user_id, answered_at::date, 'reading', count(*) from delf50.reading_answers group by 1, 2
  union all select user_id, answered_at::date, 'listening', count(*) from delf50.listening_answers group by 1, 2
  union all select user_id, created_at::date, 'writing', count(*) from delf50.writing_submissions group by 1, 2
  union all select user_id, created_at::date, 'application', count(*) from delf50.application_submissions group by 1, 2
  union all select user_id, created_at::date, 'speaking', count(*) from delf50.speaking_attempts group by 1, 2
  union all select user_id, created_at::date, 'errors', count(*) from delf50.error_items group by 1, 2
  union all select user_id, reviewed_at::date, 'vocabulary', count(*) from delf50.vocabulary_reviews group by 1, 2;

insert into delf50.schema_migrations (version) values ('0003_all_record_types') on conflict do nothing;
