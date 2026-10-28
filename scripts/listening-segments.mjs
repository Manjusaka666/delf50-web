#!/usr/bin/env node
/**
 * Prints every listening script of both courses as the player reads it:
 * [{level, id, genre, segs: [{text, para, turn, speaker, dialogue}]}], with
 * the sentences cut by app/speech.js segments() — the same cut as the
 * transcript, so that the pre-generated audio (scripts/listening-audio.py)
 * has one timed sentence per highlighted sentence.
 *
 * Run: node scripts/listening-segments.mjs > segments.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { segments } from '../app/speech.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = [];
for (const [level, dir] of [['b1', 'course/days'], ['b2', 'course/b2/days']]) {
  for (const f of fs.readdirSync(path.join(ROOT, dir)).filter((x) => /^\d+\.json$/.test(x)).sort()) {
    const day = JSON.parse(fs.readFileSync(path.join(ROOT, dir, f), 'utf8'));
    for (const it of day.items.listening) {
      out.push({ level, id: it.id, genre: it.meta ? it.meta.genre : '', segs: segments(it.script).map(({ text, para, turn, speaker, dialogue }) => ({ text, para, turn, speaker, dialogue })) });
    }
  }
}
process.stdout.write(JSON.stringify(out));
