-- DELF50 · vocabulary chunks and spaced review as records; legacy tables removed
--
-- lexicon_marks:  "<day>:<chunk>"                     = known | again (the learner's own recall)
-- review_answers: "<day>:<g|v>:<source day>:<item>"   = one spaced-review item done on <day>
-- The app derives the day's vocabulary and review progress from these rows.
-- content_completions, daily_progress, study_days and task_checks held
-- progress the app now derives from the records; nothing reads them. Idempotent.

create table if not exists delf50.lexicon_marks (
  user_id    uuid not null default delf50.uid() references neon_auth."user"(id) on delete cascade,
  course     text not null default 'delf-b1',
  mark_key   text not null,
  day        int,
  chunk_id   text,
  mark       text,
  value      jsonb,
  marked_at  timestamptz not null default now(),
  primary key (user_id, course, mark_key)
);

create table if not exists delf50.review_answers (
  user_id     uuid not null default delf50.uid() references neon_auth."user"(id) on delete cascade,
  course      text not null default 'delf-b1',
  answer_key  text not null,
  day         int,
  kind        text,
  source_day  int,
  content_id  text,
  selected    int,
  correct     boolean,
  answered_at timestamptz,
  extra       jsonb,
  primary key (user_id, course, answer_key)
);

grant select, insert, update, delete on delf50.lexicon_marks, delf50.review_answers to delf50_api;
do $$
declare t text;
begin
  foreach t in array array['lexicon_marks', 'review_answers'] loop
    execute format('alter table delf50.%I enable row level security', t);
    execute format('drop policy if exists own on delf50.%I', t);
    execute format('create policy own on delf50.%I to delf50_api using (user_id = delf50.uid()) with check (user_id = delf50.uid())', t);
  end loop;
end $$;

drop table if exists delf50.content_completions, delf50.daily_progress, delf50.study_days, delf50.task_checks;

drop view if exists delf50.daily_activity;
create view delf50.daily_activity with (security_invoker = true) as
            select user_id, answered_at::date as day, 'grammar' as module, count(*) as n, course from delf50.grammar_attempts where not deleted group by user_id, 2, course
  union all select user_id, recorded_at::date, 'grammar_production', count(*), course from delf50.grammar_productions where done group by user_id, 2, course
  union all select user_id, answered_at::date, 'reading', count(*), course from delf50.reading_answers group by user_id, 2, course
  union all select user_id, answered_at::date, 'listening', count(*), course from delf50.listening_answers group by user_id, 2, course
  union all select user_id, created_at::date, 'writing', count(*), course from delf50.writing_submissions group by user_id, 2, course
  union all select user_id, created_at::date, 'application', count(*), course from delf50.application_submissions group by user_id, 2, course
  union all select user_id, created_at::date, 'speaking', count(*), course from delf50.speaking_attempts group by user_id, 2, course
  union all select user_id, created_at::date, 'errors', count(*), course from delf50.error_items group by user_id, 2, course
  union all select user_id, marked_at::date, 'lexicon', count(*), course from delf50.lexicon_marks group by user_id, 2, course
  union all select user_id, answered_at::date, 'review', count(*), course from delf50.review_answers group by user_id, 2, course
  union all select user_id, reviewed_at::date, 'vocabulary', count(*), coalesce(course, 'delf-b1') from delf50.vocabulary_reviews group by user_id, 2, 5;

insert into delf50.schema_migrations (version) values ('0005_vocabulary_review') on conflict do nothing;
