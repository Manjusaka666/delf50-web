-- DELF50 · the self-reported vocabulary/review counters are replaced by
-- lexicon_marks and review_answers (0005); nothing reads them. Run after the
-- app that no longer writes them is deployed. Idempotent.

drop table if exists delf50.practice_counters;

insert into delf50.schema_migrations (version) values ('0006_drop_practice_counters') on conflict do nothing;
