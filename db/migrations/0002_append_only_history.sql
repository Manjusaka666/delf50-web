-- DELF50 · truly append-only history, idempotent revisions
--
-- grammar_attempts: every change of an answer appends a row (sig = content
-- signature; a replay of the current content appends nothing); removing an
-- answer appends a tombstone (deleted = true). The API role may only insert
-- into the history tables. study_state.batch lets a replayed batch keep its
-- revision. Idempotent.

alter table delf50.grammar_attempts add column if not exists sig text not null default '';
alter table delf50.grammar_attempts add column if not exists deleted boolean not null default false;
drop index if exists delf50.grammar_attempts_once;
create index if not exists grammar_attempts_latest on delf50.grammar_attempts (user_id, answer_key, id desc);

revoke update, delete on delf50.grammar_attempts, delf50.vocabulary_reviews from delf50_api;

alter table delf50.study_state add column if not exists batch text;

drop view if exists delf50.daily_activity;
create view delf50.daily_activity with (security_invoker = true) as
            select user_id, answered_at::date as day, 'grammar' as module, count(*) as n from delf50.grammar_attempts where not deleted group by 1, 2
  union all select user_id, answered_at::date, 'reading', count(*) from delf50.reading_answers group by 1, 2
  union all select user_id, answered_at::date, 'listening', count(*) from delf50.listening_answers group by 1, 2
  union all select user_id, created_at::date, 'writing', count(*) from delf50.writing_submissions group by 1, 2
  union all select user_id, created_at::date, 'application', count(*) from delf50.application_submissions group by 1, 2
  union all select user_id, created_at::date, 'speaking', count(*) from delf50.speaking_attempts group by 1, 2
  union all select user_id, created_at::date, 'errors', count(*) from delf50.error_items group by 1, 2
  union all select user_id, reviewed_at::date, 'vocabulary', count(*) from delf50.vocabulary_reviews group by 1, 2;

insert into delf50.schema_migrations (version) values ('0002_append_only_history') on conflict do nothing;
