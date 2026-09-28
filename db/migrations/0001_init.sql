-- DELF50 cloud storage · schema v1
--
-- Source of truth: delf50.learning_state holds, per user, the exact text of the
-- browser's localStorage['delf50_v12_state'] document (Schema 2), stored as text
-- byte-for-byte (jsonb would reorder keys), so a device that pulls it writes back
-- exactly what another device pushed and the SHA-256 matches. The API validates
-- it as JSON before storing; query it with state_text::jsonb.
--
-- Everything below learning_state_revisions is a read model (projection) derived
-- from that document on every push. It exists for the progress API, analytics and
-- future native clients; it is never read back into the web app.
--
-- Idempotent: safe to run again.

create schema if not exists delf50;

create table if not exists delf50.schema_migrations (
  version    text primary key,
  applied_at timestamptz not null default now()
);

-- ─── identity ───────────────────────────────────────────────────────────────

create table if not exists delf50.users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  email_norm    text not null unique,
  display_name  text not null,
  password_hash text not null,
  role          text not null default 'learner' check (role in ('learner', 'admin')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  disabled_at   timestamptz
);

-- One row per installation (browser profile, phone app install). The client
-- generates client_device_id once and keeps it.
create table if not exists delf50.devices (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references delf50.users(id) on delete cascade,
  client_device_id text not null,
  platform         text not null check (platform in ('web', 'ios', 'android', 'desktop', 'other')),
  name             text,
  user_agent       text,
  app_version      text,
  created_at       timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  unique (user_id, client_device_id)
);

-- Opaque tokens; only SHA-256(token) is stored. `cookie` sessions serve the web
-- app (HttpOnly cookie), `bearer` sessions serve native apps / scripts.
create table if not exists delf50.sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references delf50.users(id) on delete cascade,
  device_id    uuid references delf50.devices(id) on delete set null,
  token_hash   bytea not null unique,
  transport    text not null check (transport in ('cookie', 'bearer')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  ip           text,
  user_agent   text
);
create index if not exists sessions_user_active on delf50.sessions (user_id) where revoked_at is null;

create table if not exists delf50.auth_attempts (
  id      bigint generated always as identity primary key,
  kind    text not null check (kind in ('login', 'register', 'password')),
  subject text not null,
  ok      boolean not null,
  at      timestamptz not null default now()
);
create index if not exists auth_attempts_lookup on delf50.auth_attempts (kind, subject, at desc);

-- ─── learning state (source of truth) ──────────────────────────────────────

create table if not exists delf50.learning_state (
  user_id            uuid primary key references delf50.users(id) on delete cascade,
  rev                bigint not null check (rev > 0),
  hash               text not null check (hash ~ '^[0-9a-f]{64}$'),
  state_text         text not null,
  size_bytes         integer not null,
  schema_version     integer,
  app_version        text,
  projection_version integer not null default 0,
  updated_at         timestamptz not null default now(),
  updated_by_device  uuid references delf50.devices(id) on delete set null
);

-- Head history, gzip-compressed. Pruned by delf50.prune_revisions(); revisions
-- whose reason is not 'push' are never pruned.
create table if not exists delf50.learning_state_revisions (
  user_id     uuid not null references delf50.users(id) on delete cascade,
  rev         bigint not null,
  parent_rev  bigint not null,
  hash        text not null,
  state_gz    bytea not null,
  size_bytes  integer not null,
  reason      text not null check (reason in ('push', 'merge', 'claim', 'adopt', 'restore', 'import')),
  app_version text,
  device_id   uuid references delf50.devices(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (user_id, rev)
);

-- A device's local document that was replaced (e.g. the learner chose the cloud
-- copy over it). Kept so that no local learning evidence is ever silently lost.
create table if not exists delf50.state_archives (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references delf50.users(id) on delete cascade,
  hash        text not null,
  state_gz    bytea not null,
  size_bytes  integer not null,
  reason      text not null,
  device_id   uuid references delf50.devices(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (user_id, hash)
);

-- ─── read model (projection of learning_state) ─────────────────────────────

create table if not exists delf50.learning_stats (
  user_id             uuid primary key references delf50.users(id) on delete cascade,
  selected_day        integer,
  intensity           text,
  app_version         text,
  started_at          timestamptz,
  last_saved_at       timestamptz,
  grammar_attempts    integer not null default 0,
  grammar_correct     integer not null default 0,
  reading_attempts    integer not null default 0,
  reading_correct     integer not null default 0,
  listening_attempts  integer not null default 0,
  listening_correct   integer not null default 0,
  writing_count       integer not null default 0,
  application_count   integer not null default 0,
  speaking_count      integer not null default 0,
  speaking_total_sec  integer not null default 0,
  errors_count        integer not null default 0,
  updated_at          timestamptz not null default now()
);

create table if not exists delf50.daily_progress (
  user_id           uuid not null references delf50.users(id) on delete cascade,
  day               integer not null check (day between 1 and 366),
  metrics           jsonb not null,
  first_activity_at timestamptz,
  last_activity_at  timestamptz,
  updated_at        timestamptz not null default now(),
  primary key (user_id, day)
);

-- One row per answered objective item. answer_key is the key used by the web app
-- ("<day>:<contentId>:<q>" for reading/listening, "<day>:<contentId>" for grammar).
create table if not exists delf50.item_answers (
  user_id     uuid not null references delf50.users(id) on delete cascade,
  module      text not null check (module in ('grammar', 'reading', 'listening')),
  answer_key  text not null,
  day         integer,
  content_id  text,
  q_index     integer,
  selected    integer,
  correct     boolean,
  answered_at timestamptz,
  detail      jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_id, module, answer_key)
);
create index if not exists item_answers_day on delf50.item_answers (user_id, day);

create table if not exists delf50.content_completions (
  user_id            uuid not null references delf50.users(id) on delete cascade,
  module             text not null,
  content_id         text not null,
  day                integer,
  correct            boolean,
  first_completed_at timestamptz,
  last_completed_at  timestamptz,
  updated_at         timestamptz not null default now(),
  primary key (user_id, module, content_id)
);

-- Writing, application and speaking records (learner production).
create table if not exists delf50.production_records (
  user_id      uuid not null references delf50.users(id) on delete cascade,
  module       text not null check (module in ('writing', 'application', 'speaking')),
  record_key   text not null,
  day          integer,
  content_id   text,
  title        text,
  body         text,
  words        integer,
  duration_sec integer,
  clip_id      text,
  created_at   timestamptz,
  detail       jsonb,
  updated_at   timestamptz not null default now(),
  primary key (user_id, module, record_key)
);
create index if not exists production_records_day on delf50.production_records (user_id, day);

create table if not exists delf50.error_items (
  user_id    uuid not null references delf50.users(id) on delete cascade,
  item_key   text not null,
  day        integer,
  payload    jsonb not null,
  created_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, item_key)
);

-- ─── media (Cloudflare R2) ─────────────────────────────────────────────────

-- scope 'user'    : a learner's own object (speaking recordings, …); user_id set.
-- scope 'content' : shared course media (future listening audio); user_id null.
create table if not exists delf50.media_objects (
  id             uuid primary key default gen_random_uuid(),
  scope          text not null default 'user' check (scope in ('user', 'content')),
  user_id        uuid references delf50.users(id) on delete cascade,
  kind           text not null check (kind in ('speaking_recording', 'listening_audio', 'attachment')),
  client_clip_id text,
  object_key     text not null unique,
  content_type   text not null,
  size_bytes     bigint,
  sha256         text,
  status         text not null default 'pending' check (status in ('pending', 'stored', 'deleted')),
  day            integer,
  duration_sec   integer,
  meta           jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  stored_at      timestamptz,
  deleted_at     timestamptz,
  check ((scope = 'user') = (user_id is not null))
);
create unique index if not exists media_objects_user_clip on delf50.media_objects (user_id, client_clip_id) where client_clip_id is not null;

-- ─── event log (native clients) ────────────────────────────────────────────

-- Append-only, idempotent on (user_id, client_event_id). The web app syncs the
-- whole document instead; native clients can post fine-grained events here and
-- page through them with the seq cursor.
create table if not exists delf50.learning_events (
  seq             bigint generated always as identity primary key,
  id              uuid not null default gen_random_uuid() unique,
  user_id         uuid not null references delf50.users(id) on delete cascade,
  device_id       uuid references delf50.devices(id) on delete set null,
  client_event_id text not null,
  type            text not null,
  day             integer,
  module          text,
  content_id      text,
  occurred_at     timestamptz not null,
  received_at     timestamptz not null default now(),
  payload         jsonb not null default '{}'::jsonb,
  unique (user_id, client_event_id)
);
create index if not exists learning_events_user_seq on delf50.learning_events (user_id, seq);

-- ─── functions ─────────────────────────────────────────────────────────────

-- Retention: every non-'push' revision, the newest 40 pushes, the first push of
-- each hour for 14 days and the first push of each day forever.
create or replace function delf50.prune_revisions(p_user uuid) returns void
language sql as $$
  with ranked as (
    select rev, reason, created_at,
           row_number() over (order by rev desc) as recent,
           row_number() over (partition by date_trunc('hour', created_at) order by rev) as in_hour,
           row_number() over (partition by date_trunc('day', created_at) order by rev) as in_day
    from delf50.learning_state_revisions
    where user_id = p_user
  )
  delete from delf50.learning_state_revisions r
  using ranked k
  where r.user_id = p_user and r.rev = k.rev
    and k.reason = 'push'
    and k.recent > 40
    and k.in_day > 1
    and not (k.in_hour = 1 and k.created_at > now() - interval '14 days')
    and r.rev <> (select s.rev from delf50.learning_state s where s.user_id = p_user);
$$;

-- p_proj: {"rebuild":bool, "stats":{…}|null,
--          "<table>":{"upsert":[rows…], "delete":[keys…]}} for tables
--          daily, answers, completions, productions, errors.
create or replace function delf50.apply_projection(p_user uuid, p_proj jsonb) returns void
language plpgsql as $$
begin
  if p_proj is null then return; end if;

  if coalesce((p_proj->>'rebuild')::boolean, false) then
    delete from delf50.daily_progress      where user_id = p_user;
    delete from delf50.item_answers        where user_id = p_user;
    delete from delf50.content_completions where user_id = p_user;
    delete from delf50.production_records  where user_id = p_user;
    delete from delf50.error_items         where user_id = p_user;
  end if;

  if p_proj ? 'stats' and jsonb_typeof(p_proj->'stats') = 'object' then
    insert into delf50.learning_stats as t (
      user_id, selected_day, intensity, app_version, started_at, last_saved_at,
      grammar_attempts, grammar_correct, reading_attempts, reading_correct,
      listening_attempts, listening_correct, writing_count, application_count,
      speaking_count, speaking_total_sec, errors_count, updated_at)
    select p_user, x.selected_day, x.intensity, x.app_version, x.started_at, x.last_saved_at,
           coalesce(x.grammar_attempts, 0), coalesce(x.grammar_correct, 0),
           coalesce(x.reading_attempts, 0), coalesce(x.reading_correct, 0),
           coalesce(x.listening_attempts, 0), coalesce(x.listening_correct, 0),
           coalesce(x.writing_count, 0), coalesce(x.application_count, 0),
           coalesce(x.speaking_count, 0), coalesce(x.speaking_total_sec, 0), coalesce(x.errors_count, 0), now()
    from jsonb_to_record(p_proj->'stats') as x(
      selected_day int, intensity text, app_version text, started_at timestamptz, last_saved_at timestamptz,
      grammar_attempts int, grammar_correct int, reading_attempts int, reading_correct int,
      listening_attempts int, listening_correct int, writing_count int, application_count int,
      speaking_count int, speaking_total_sec int, errors_count int)
    on conflict (user_id) do update set
      selected_day = excluded.selected_day, intensity = excluded.intensity,
      app_version = excluded.app_version, started_at = excluded.started_at,
      last_saved_at = excluded.last_saved_at,
      grammar_attempts = excluded.grammar_attempts, grammar_correct = excluded.grammar_correct,
      reading_attempts = excluded.reading_attempts, reading_correct = excluded.reading_correct,
      listening_attempts = excluded.listening_attempts, listening_correct = excluded.listening_correct,
      writing_count = excluded.writing_count, application_count = excluded.application_count,
      speaking_count = excluded.speaking_count, speaking_total_sec = excluded.speaking_total_sec,
      errors_count = excluded.errors_count, updated_at = now();
  end if;

  -- daily_progress
  delete from delf50.daily_progress t
   where t.user_id = p_user
     and t.day in (select (v)::int from jsonb_array_elements_text(coalesce(p_proj->'daily'->'delete', '[]')) v);
  insert into delf50.daily_progress as t (user_id, day, metrics, first_activity_at, last_activity_at, updated_at)
  select p_user, x.day, x.metrics, x.first_activity_at, x.last_activity_at, now()
  from jsonb_to_recordset(coalesce(p_proj->'daily'->'upsert', '[]')) as x(
    day int, metrics jsonb, first_activity_at timestamptz, last_activity_at timestamptz)
  on conflict (user_id, day) do update set
    metrics = excluded.metrics, first_activity_at = excluded.first_activity_at,
    last_activity_at = excluded.last_activity_at, updated_at = now();

  -- item_answers (delete keys are "<module>|<answer_key>")
  delete from delf50.item_answers t
   where t.user_id = p_user
     and (t.module || '|' || t.answer_key) in (select v from jsonb_array_elements_text(coalesce(p_proj->'answers'->'delete', '[]')) v);
  insert into delf50.item_answers as t (user_id, module, answer_key, day, content_id, q_index, selected, correct, answered_at, detail, updated_at)
  select p_user, x.module, x.answer_key, x.day, x.content_id, x.q_index, x.selected, x.correct, x.answered_at, x.detail, now()
  from jsonb_to_recordset(coalesce(p_proj->'answers'->'upsert', '[]')) as x(
    module text, answer_key text, day int, content_id text, q_index int, selected int,
    correct boolean, answered_at timestamptz, detail jsonb)
  on conflict (user_id, module, answer_key) do update set
    day = excluded.day, content_id = excluded.content_id, q_index = excluded.q_index,
    selected = excluded.selected, correct = excluded.correct, answered_at = excluded.answered_at,
    detail = excluded.detail, updated_at = now();

  -- content_completions (delete keys are "<module>|<content_id>")
  delete from delf50.content_completions t
   where t.user_id = p_user
     and (t.module || '|' || t.content_id) in (select v from jsonb_array_elements_text(coalesce(p_proj->'completions'->'delete', '[]')) v);
  insert into delf50.content_completions as t (user_id, module, content_id, day, correct, first_completed_at, last_completed_at, updated_at)
  select p_user, x.module, x.content_id, x.day, x.correct, x.first_completed_at, x.last_completed_at, now()
  from jsonb_to_recordset(coalesce(p_proj->'completions'->'upsert', '[]')) as x(
    module text, content_id text, day int, correct boolean,
    first_completed_at timestamptz, last_completed_at timestamptz)
  on conflict (user_id, module, content_id) do update set
    day = excluded.day, correct = excluded.correct, first_completed_at = excluded.first_completed_at,
    last_completed_at = excluded.last_completed_at, updated_at = now();

  -- production_records (delete keys are "<module>|<record_key>")
  delete from delf50.production_records t
   where t.user_id = p_user
     and (t.module || '|' || t.record_key) in (select v from jsonb_array_elements_text(coalesce(p_proj->'productions'->'delete', '[]')) v);
  insert into delf50.production_records as t (user_id, module, record_key, day, content_id, title, body, words, duration_sec, clip_id, created_at, detail, updated_at)
  select p_user, x.module, x.record_key, x.day, x.content_id, x.title, x.body, x.words, x.duration_sec, x.clip_id, x.created_at, x.detail, now()
  from jsonb_to_recordset(coalesce(p_proj->'productions'->'upsert', '[]')) as x(
    module text, record_key text, day int, content_id text, title text, body text,
    words int, duration_sec int, clip_id text, created_at timestamptz, detail jsonb)
  on conflict (user_id, module, record_key) do update set
    day = excluded.day, content_id = excluded.content_id, title = excluded.title, body = excluded.body,
    words = excluded.words, duration_sec = excluded.duration_sec, clip_id = excluded.clip_id,
    created_at = excluded.created_at, detail = excluded.detail, updated_at = now();

  -- error_items
  delete from delf50.error_items t
   where t.user_id = p_user
     and t.item_key in (select v from jsonb_array_elements_text(coalesce(p_proj->'errors'->'delete', '[]')) v);
  insert into delf50.error_items as t (user_id, item_key, day, payload, created_at, updated_at)
  select p_user, x.item_key, x.day, x.payload, x.created_at, now()
  from jsonb_to_recordset(coalesce(p_proj->'errors'->'upsert', '[]')) as x(
    item_key text, day int, payload jsonb, created_at timestamptz)
  on conflict (user_id, item_key) do update set
    day = excluded.day, payload = excluded.payload, created_at = excluded.created_at, updated_at = now();
end;
$$;

-- Compare-and-swap of the head document. Returns one row:
--   status 'ok'        new head written (rev = new rev)
--   status 'unchanged' base matches and the text is identical; nothing written
--   status 'same'      head already equals this text (a retried push); nothing written
--   status 'conflict'  head moved past p_base_rev; rev/hash describe the head
-- The projection and revision are written in the same transaction as the head,
-- so a push is all-or-nothing.
create or replace function delf50.push_state(
  p_user uuid, p_base_rev bigint, p_hash text, p_text text, p_gz_b64 text, p_size integer,
  p_schema integer, p_app text, p_device uuid, p_reason text, p_proj jsonb, p_proj_version integer)
returns table (status text, rev bigint, hash text)
language plpgsql as $$
declare
  cur_rev  bigint;
  cur_hash text;
  new_rev  bigint;
  inserted integer;
begin
  select s.rev, s.hash into cur_rev, cur_hash
    from delf50.learning_state s where s.user_id = p_user for update;

  if not found then
    if p_base_rev <> 0 then
      return query select 'conflict'::text, 0::bigint, null::text; return;
    end if;
    new_rev := 1;
    insert into delf50.learning_state (user_id, rev, hash, state_text, size_bytes, schema_version,
                                       app_version, projection_version, updated_at, updated_by_device)
    values (p_user, new_rev, p_hash, p_text, p_size, p_schema, p_app, p_proj_version, now(), p_device)
    on conflict (user_id) do nothing;
    get diagnostics inserted = row_count;
    if inserted = 0 then
      select s.rev, s.hash into cur_rev, cur_hash from delf50.learning_state s where s.user_id = p_user;
      if cur_hash = p_hash then
        return query select 'same'::text, cur_rev, cur_hash; return;
      end if;
      return query select 'conflict'::text, cur_rev, cur_hash; return;
    end if;
  else
    if cur_rev <> p_base_rev then
      if cur_hash = p_hash then
        return query select 'same'::text, cur_rev, cur_hash; return;
      end if;
      return query select 'conflict'::text, cur_rev, cur_hash; return;
    end if;
    if cur_hash = p_hash then
      return query select 'unchanged'::text, cur_rev, cur_hash; return;
    end if;
    new_rev := cur_rev + 1;
    update delf50.learning_state s set
      rev = new_rev, hash = p_hash, state_text = p_text, size_bytes = p_size,
      schema_version = p_schema, app_version = p_app, projection_version = p_proj_version,
      updated_at = now(), updated_by_device = p_device
    where s.user_id = p_user;
  end if;

  insert into delf50.learning_state_revisions (user_id, rev, parent_rev, hash, state_gz, size_bytes, reason, app_version, device_id)
  values (p_user, new_rev, p_base_rev, p_hash, decode(p_gz_b64, 'base64'), p_size, p_reason, p_app, p_device);

  perform delf50.apply_projection(p_user, p_proj);
  perform delf50.prune_revisions(p_user);

  return query select 'ok'::text, new_rev, p_hash;
end;
$$;

insert into delf50.schema_migrations (version) values ('0001_init') on conflict do nothing;
