-- DELF50 · courses (CEFR levels)
--
-- One Neon Auth account can study several courses (delf-b1 now; delf-b2,
-- dalf-c1, dalf-c2 later). Every learning table gets `course`, part of its
-- primary key, so each course has its own study state, plan, progress and
-- history and content ids may repeat across levels. Existing rows belong to
-- delf-b1 (the default). Vocabulary stays one deck across courses: the
-- dictionary gets its CEFR level, the deck and review log the course a word
-- came from. The course registry lives in api/_lib/courses.js; opening a new
-- level needs no schema change. Idempotent.

do $$
declare t record; pk name;
begin
  for t in select * from (values
    ('study_state',             'user_id, course'),
    ('reading_answers',         'user_id, course, answer_key'),
    ('listening_answers',       'user_id, course, answer_key'),
    ('writing_submissions',     'user_id, course, item_key'),
    ('application_submissions', 'user_id, course, item_key'),
    ('speaking_attempts',       'user_id, course, item_key'),
    ('error_items',             'user_id, course, item_key'),
    ('drafts',                  'user_id, course, kind, draft_key'),
    ('content_completions',     'user_id, course, module, content_id'),
    ('media_objects',           'user_id, course, clip_id'),
    ('grammar_productions',     'user_id, course, prod_key'),
    ('task_checks',             'user_id, course, task_key'),
    ('daily_progress',          'user_id, course, day_key'),
    ('study_days',              'user_id, course, day_key'),
    ('practice_counters',       'user_id, course, day_key')
  ) as v(tbl, cols) loop
    execute format('alter table delf50.%I add column if not exists course text not null default %L', t.tbl, 'delf-b1');
    select conname into pk from pg_constraint where conrelid = format('delf50.%I', t.tbl)::regclass and contype = 'p';
    if pg_get_constraintdef((select oid from pg_constraint where conrelid = format('delf50.%I', t.tbl)::regclass and contype = 'p')) not like '%course%' then
      execute format('alter table delf50.%I drop constraint %I, add primary key (%s)', t.tbl, pk, t.cols);
    end if;
  end loop;
end $$;

-- Append-only history: the latest row per (course, answer).
alter table delf50.grammar_attempts add column if not exists course text not null default 'delf-b1';
drop index if exists delf50.grammar_attempts_latest;
create index if not exists grammar_attempts_latest on delf50.grammar_attempts (user_id, course, answer_key, id desc);

-- Vocabulary: one deck across courses.
alter table delf50.vocabulary_items add column if not exists cefr_level text check (cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));
alter table delf50.user_vocabulary add column if not exists course text;
alter table delf50.vocabulary_reviews add column if not exists course text;

-- Daily activity per course (course is appended as the last column).
create or replace view delf50.daily_activity with (security_invoker = true) as
            select user_id, answered_at::date as day, 'grammar' as module, count(*) as n, course from delf50.grammar_attempts where not deleted group by user_id, 2, course
  union all select user_id, recorded_at::date, 'grammar_production', count(*), course from delf50.grammar_productions where done group by user_id, 2, course
  union all select user_id, answered_at::date, 'reading', count(*), course from delf50.reading_answers group by user_id, 2, course
  union all select user_id, answered_at::date, 'listening', count(*), course from delf50.listening_answers group by user_id, 2, course
  union all select user_id, created_at::date, 'writing', count(*), course from delf50.writing_submissions group by user_id, 2, course
  union all select user_id, created_at::date, 'application', count(*), course from delf50.application_submissions group by user_id, 2, course
  union all select user_id, created_at::date, 'speaking', count(*), course from delf50.speaking_attempts group by user_id, 2, course
  union all select user_id, created_at::date, 'errors', count(*), course from delf50.error_items group by user_id, 2, course
  union all select user_id, reviewed_at::date, 'vocabulary', count(*), coalesce(course, 'delf-b1') from delf50.vocabulary_reviews group by user_id, 2, 5;

insert into delf50.schema_migrations (version) values ('0004_courses') on conflict do nothing;
