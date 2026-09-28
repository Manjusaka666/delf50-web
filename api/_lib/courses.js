'use strict';
/**
 * Courses (CEFR levels). One Neon Auth account can study several courses;
 * every learning record and each course's study state carry the course id,
 * so levels never share progress, plans or content ids (see
 * docs/multi-level-architecture.md).
 *
 * To open a new level, add its entry here (and its content bundle); no schema
 * change is needed.
 */
const { HttpError } = require('./http');

const COURSES = {
  'delf-b1': { level: 'B1', exam: 'DELF', days: 50, title: 'DELF B1 · 50 天冲刺' }
  // 'delf-b2': { level: 'B2', exam: 'DELF', days: …, title: … },
  // 'dalf-c1': { level: 'C1', exam: 'DALF', days: …, title: … },
  // 'dalf-c2': { level: 'C2', exam: 'DALF', days: …, title: … },
};

const DEFAULT_COURSE = 'delf-b1';

/** The course a request addresses; requests without one address the default course. */
function courseOf(value) {
  const id = value == null || value === '' ? DEFAULT_COURSE : String(value);
  if (!Object.prototype.hasOwnProperty.call(COURSES, id)) throw new HttpError(400, 'unknown_course', `Unknown course: ${id.slice(0, 40)}`);
  return id;
}

const list = () => Object.keys(COURSES).map((id) => Object.assign({ id }, COURSES[id]));

module.exports = { COURSES, DEFAULT_COURSE, courseOf, list };
