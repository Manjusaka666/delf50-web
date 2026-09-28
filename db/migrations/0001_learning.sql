-- DELF50 · learning records
--
-- Identity is Neon Auth (neon_auth.user / neon_auth.session). Every private
-- row carries user_id → neon_auth.user(id), defaulting to the caller, and
-- row-level security limits the API role (delf50_api) to the user the API
-- sets in app.user_id for the current transaction. Idempotent.

create schema if not exists delf50;

do $$ begin
  if not exists (select from pg_roles where rolname = 'delf50_api') then create role delf50_api nologin; end if;
end $$;

create table if not exists delf50.schema_migrations (version text primary key, applied_at timestamptz not null default now());

-- The caller, as set by the API for the current transaction.
create or replace function delf50.uid() returns uuid language sql stable as
$$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

-- Resolves a Neon Auth session token (the session cookie's value before the
-- signature) to its user. Security definer: delf50_api cannot read neon_auth.
create or replace function delf50.session_user(p_token text) returns table (id uuid, email text, name text)
language sql stable security definer set search_path = '' as
$$ select u.id, u.email, u.name from neon_auth.session s join neon_auth."user" u on u.id = s."userId"
    where s.token = p_token and s."expiresAt" > now() $$;
revoke all on function delf50.session_user(text) from public;

-- Applies [[path…], value] (set) and [[path…]] (delete) operations to a document.
create or replace function delf50.jsonb_patch(d jsonb, ops jsonb) returns jsonb language plpgsql immutable as $$
declare o jsonb; p text[];
begin
  for o in select * from jsonb_array_elements(ops) loop
    p := array(select jsonb_array_elements_text(o->0));
    d := case when jsonb_array_length(o) > 1 then jsonb_set(d, p, o->1, true) else d #- p end;
  end loop;
  return d;
end $$;

-- The app's working state that is not a learning record: study plan, day
-- routing, cursors, counters and settings. One row per learner.
create table if not exists delf50.study_state (
  user_id    uuid primary key default delf50.uid() references neon_auth."user"(id) on delete cascade,
  doc        jsonb not null default '{}',
  rev        bigint not null default 0,
  device     text,
  updated_at timestamptz not null default now()
);

create table if not exists delf50.reading_answers (
  user_id     uuid not null default delf50.uid() references neon_auth."user"(id) on delete cascade,
  answer_key  text not null,
  day         int,
  content_id  text,
  q_index     int,
  selected    int,
  value       jsonb,
  answered_at timestamptz not null default now(),
  primary key (user_id, answer_key)
);

create table if not exists delf50.listening_answers (
  user_id     uuid not null default delf50.uid() references neon_auth."user"(id) on delete cascade,
  answer_key  text not null,
  day         int,
  content_id  text,
  q_index     int,
  selected    int,
  value       jsonb,
  answered_at timestamptz not null default now(),
  primary key (user_id, answer_key)
);

-- Append-only history: one row per distinct answer time, so a re-answer adds
-- a row and a replayed request changes nothing. The latest row is current.
create table if not exists delf50.grammar_attempts (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default delf50.uid() references neon_auth."user"(id) on delete cascade,
  answer_key    text not null,
  day           int,
  content_id    text,
  node_id       text,
  question      text,
  selected      int,
  correct_index int,
  correct       boolean,
  answered_at   timestamptz,
  extra         jsonb,
  created_at    timestamptz not null default now()
);
create unique index if not exists grammar_attempts_once on delf50.grammar_attempts (user_id, answer_key, answered_at) nulls not distinct;

-- Learner productions and the error log, in the app's order (pos).
create table if not exists delf50.writing_submissions (
  user_id    uuid not null default delf50.uid() references neon_auth."user"(id) on delete cascade,
  item_key   text not null,
  pos        float8 not null,
  day        int,
  content_id text,
  title      text,
  body       text,
  word_count int,
  created_at timestamptz,
  extra      jsonb,
  primary key (user_id, item_key)
);

create table if not exists delf50.application_submissions (
  user_id    uuid not null default delf50.uid() references neon_auth."user"(id) on delete cascade,
  item_key   text not null,
  pos        float8 not null,
  day        int,
  content_id text,
  title      text,
  body       text,
  created_at timestamptz,
  extra      jsonb,
  primary key (user_id, item_key)
);

create table if not exists delf50.speaking_attempts (
  user_id      uuid not null default delf50.uid() references neon_auth."user"(id) on delete cascade,
  item_key     text not null,
  pos          float8 not null,
  day          int,
  content_id   text,
  title        text,
  clip_id      text,
  duration_sec int,
  created_at   timestamptz,
  extra        jsonb,
  primary key (user_id, item_key)
);

create table if not exists delf50.error_items (
  user_id     uuid not null default delf50.uid() references neon_auth."user"(id) on delete cascade,
  item_key    text not null,
  pos         float8 not null,
  skill       text,
  original    text,
  correction  text,
  explanation text,
  created_at  timestamptz,
  extra       jsonb,
  primary key (user_id, item_key)
);

-- Work in progress, saved while typing.
create table if not exists delf50.drafts (
  user_id    uuid not null default delf50.uid() references neon_auth."user"(id) on delete cascade,
  kind       text not null,
  draft_key  text not null,
  body       text,
  value      jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, draft_key)
);

create table if not exists delf50.content_completions (
  user_id            uuid not null default delf50.uid() references neon_auth."user"(id) on delete cascade,
  module             text not null,
  content_id         text not null,
  day                int,
  correct            boolean,
  first_completed_at timestamptz,
  last_completed_at  timestamptz,
  extra              jsonb,
  primary key (user_id, module, content_id)
);

-- Binary objects live in R2; this is their record.
create table if not exists delf50.media_objects (
  user_id     uuid not null default delf50.uid() references neon_auth."user"(id) on delete cascade,
  clip_id     text not null,
  object_key  text not null unique,
  mime_type   text not null,
  size_bytes  bigint not null,
  parts       int not null default 1,
  status      text not null default 'pending' check (status in ('pending', 'stored')),
  created_at  timestamptz not null default now(),
  uploaded_at timestamptz,
  primary key (user_id, clip_id)
);

-- Vocabulary with spaced repetition (SM-2). The dictionary is shared.
create table if not exists delf50.vocabulary_items (
  id             uuid primary key default gen_random_uuid(),
  lemma          text not null,
  language       text not null default 'fr',
  part_of_speech text not null default '',
  definition     text,
  example        text,
  created_at     timestamptz not null default now(),
  unique (language, lemma, part_of_speech)
);

create table if not exists delf50.user_vocabulary (
  user_id          uuid not null default delf50.uid() references neon_auth."user"(id) on delete cascade,
  vocabulary_id    uuid not null references delf50.vocabulary_items(id) on delete cascade,
  status           text not null default 'learning' check (status in ('learning', 'known', 'suspended')),
  ease_factor      real not null default 2.5,
  interval_days    int not null default 0,
  repetitions      int not null default 0,
  lapses           int not null default 0,
  next_review_at   timestamptz not null default now(),
  last_reviewed_at timestamptz,
  created_at       timestamptz not null default now(),
  primary key (user_id, vocabulary_id)
);
create index if not exists user_vocabulary_due on delf50.user_vocabulary (user_id, next_review_at);

create table if not exists delf50.vocabulary_reviews (
  id                bigint generated always as identity primary key,
  user_id           uuid not null default delf50.uid() references neon_auth."user"(id) on delete cascade,
  vocabulary_id     uuid not null references delf50.vocabulary_items(id) on delete cascade,
  rating            smallint not null check (rating between 0 and 5),
  previous_interval int not null,
  next_interval     int not null,
  reviewed_at       timestamptz not null default now()
);

-- Daily activity, derived from the records (never stored twice).
create or replace view delf50.daily_activity with (security_invoker = true) as
            select user_id, answered_at::date as day, 'grammar' as module, count(*) as n from delf50.grammar_attempts group by 1, 2
  union all select user_id, answered_at::date, 'reading', count(*) from delf50.reading_answers group by 1, 2
  union all select user_id, answered_at::date, 'listening', count(*) from delf50.listening_answers group by 1, 2
  union all select user_id, created_at::date, 'writing', count(*) from delf50.writing_submissions group by 1, 2
  union all select user_id, created_at::date, 'application', count(*) from delf50.application_submissions group by 1, 2
  union all select user_id, created_at::date, 'speaking', count(*) from delf50.speaking_attempts group by 1, 2
  union all select user_id, created_at::date, 'errors', count(*) from delf50.error_items group by 1, 2
  union all select user_id, reviewed_at::date, 'vocabulary', count(*) from delf50.vocabulary_reviews group by 1, 2;

-- ─── access ─────────────────────────────────────────────────────────────────
grant usage on schema delf50 to delf50_api;
grant execute on function delf50.uid(), delf50.session_user(text), delf50.jsonb_patch(jsonb, jsonb) to delf50_api;
grant select, insert, update, delete on all tables in schema delf50 to delf50_api;
revoke all on delf50.schema_migrations from delf50_api;

do $$
declare t text;
begin
  foreach t in array array['study_state', 'reading_answers', 'listening_answers', 'grammar_attempts',
    'writing_submissions', 'application_submissions', 'speaking_attempts', 'error_items', 'drafts',
    'content_completions', 'media_objects', 'user_vocabulary', 'vocabulary_reviews'] loop
    execute format('alter table delf50.%I enable row level security', t);
    execute format('drop policy if exists own on delf50.%I', t);
    execute format('create policy own on delf50.%I to delf50_api using (user_id = delf50.uid()) with check (user_id = delf50.uid())', t);
  end loop;
end $$;

alter table delf50.vocabulary_items enable row level security;
drop policy if exists read_all on delf50.vocabulary_items;
drop policy if exists add_any on delf50.vocabulary_items;
create policy read_all on delf50.vocabulary_items for select to delf50_api using (true);
create policy add_any on delf50.vocabulary_items for insert to delf50_api with check (delf50.uid() is not null);

insert into delf50.schema_migrations (version) values ('0001_learning') on conflict do nothing;
