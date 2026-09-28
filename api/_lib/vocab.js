'use strict';
/**
 * Vocabulary: a shared dictionary (vocabulary_items, with its CEFR level), each
 * learner's deck (user_vocabulary, SM-2 schedule) and the append-only review
 * log. The deck spans all courses: a word learned in B1 stays learned in B2;
 * `course` records where it was added.
 *
 *   GET    vocab[?due=1][&level=B2]                       deck, due first
 *   POST   vocab        {lemma, definition?, example?, partOfSpeech?, language?, level?}
 *   POST   vocab/review {vocabularyId, rating 0–5}       one SM-2 step
 *   DELETE vocab?id=
 */
const db = require('./db');
const { HttpError, send, str, int } = require('./http');

const ENTRY = `v.id, v.lemma, v.language, v.part_of_speech, v.cefr_level, v.definition, v.example, u.course, u.status, u.ease_factor, u.interval_days,
  u.repetitions, u.lapses, u.next_review_at, u.last_reviewed_at, u.created_at`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEVEL = /^(A1|A2|B1|B2|C1|C2)$/;

async function list(req, res, user) {
  const level = req.query.level ? str(req.query.level, 'level', { max: 2, pattern: LEVEL }) : null;
  const due = req.query.due === '1' ? 'and u.next_review_at <= now()' : '';
  const [rows] = await db.tx(user.id, [[`select ${ENTRY} from delf50.user_vocabulary u join delf50.vocabulary_items v on v.id = u.vocabulary_id
    where ($1::text is null or v.cefr_level = $1) ${due} order by u.next_review_at`, [level]]]);
  send(res, 200, { items: rows });
}

async function add(req, res, user, b, course) {
  const item = [str(b.lemma, 'lemma', { max: 200 }), b.language ? str(b.language, 'language', { max: 8 }) : 'fr', b.partOfSpeech ? str(b.partOfSpeech, 'partOfSpeech', { max: 40 }) : ''];
  const level = b.level ? str(b.level, 'level', { max: 2, pattern: LEVEL }) : null;
  const [, rows] = await db.tx(user.id, [
    [`insert into delf50.vocabulary_items (lemma, language, part_of_speech, definition, example, cefr_level) values ($1, $2, $3, $4, $5, $6) on conflict do nothing`,
      [...item, b.definition ? String(b.definition).slice(0, 2000) : null, b.example ? String(b.example).slice(0, 2000) : null, level]],
    [`with i as (select id from delf50.vocabulary_items where lemma = $1 and language = $2 and part_of_speech = $3),
          ins as (insert into delf50.user_vocabulary (vocabulary_id, course) select id, $4 from i on conflict do nothing)
     select id from i`, [...item, course]]
  ]);
  const [entry] = await db.tx(user.id, [[`select ${ENTRY} from delf50.user_vocabulary u join delf50.vocabulary_items v on v.id = u.vocabulary_id where v.id = $1`, [rows[0].id]]]);
  send(res, 201, { item: entry[0] });
}

async function review(req, res, user, b) {
  const id = str(b.vocabularyId, 'vocabularyId', { max: 36, pattern: UUID });
  const q = int(b.rating, 'rating', { min: 0, max: 5 });
  const [rows] = await db.tx(user.id, [[
    `with p as (select * from delf50.user_vocabulary where vocabulary_id = $1 for update),
     n as (select vocabulary_id, interval_days as prev_i,
             case when $2 < 3 or repetitions = 0 then 1 when repetitions = 1 then 6 else round(interval_days * ease_factor)::int end as i,
             case when $2 < 3 then 0 else repetitions + 1 end as reps,
             greatest(1.3, ease_factor + (0.1 - (5 - $2) * (0.08 + (5 - $2) * 0.02))) as ef,
             lapses + ($2 < 3)::int as lapses from p),
     u as (update delf50.user_vocabulary u set interval_days = n.i, repetitions = n.reps, ease_factor = n.ef, lapses = n.lapses,
             last_reviewed_at = now(), next_review_at = now() + make_interval(days => n.i)
           from n where u.vocabulary_id = n.vocabulary_id returning u.*),
     r as (insert into delf50.vocabulary_reviews (vocabulary_id, rating, previous_interval, next_interval, course)
           select vocabulary_id, $2, prev_i, i, (select course from p) from n)
     select * from u`, [id, q]]]);
  if (!rows[0]) throw new HttpError(404, 'not_found', 'Not in your vocabulary');
  send(res, 200, { item: rows[0] });
}

async function remove(req, res, user) {
  await db.tx(user.id, [['delete from delf50.user_vocabulary where vocabulary_id = $1', [str(req.query.id, 'id', { max: 36, pattern: UUID })]]]);
  send(res, 200, { ok: true });
}

module.exports = { list, add, review, remove };
