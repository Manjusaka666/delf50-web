# Interface languages and read-aloud

## Decisions

1. **Records are language-neutral.** Whatever the interface language, a learner's answers are stored exactly as the course wrote them (question stems and explanations in the course's source language, grammar points by their French names). Switching language never rewrites, duplicates or orphans a record. `scripts/verify.js` answers the same day in Chinese and in English and requires the two states to be identical.
2. **Translations are overlays, not copies.** `course/…/i18n/<locale>/<file>` has the same shape as the material it translates but holds only the learner-language strings. `localize()` replaces a string only if it contains Chinese, so French material cannot be altered by a translation. Originals stay reachable through `canonical()`.
3. **One source of truth for the course.** Day titles and phases come from the translated course map; day files never restate them. Plans, quotas and question order are computed from the source material and are identical in every language (checked for every day × intensity × locale).
4. **Fidelity is checked mechanically.** `scripts/check-i18n.js` requires complete coverage and flags any translation that drops or changes a French token, a number or a markup tag present in the original.
5. **Preferences belong to the account.** Locale, theme, voice and rate live in `delf50.user_settings` (migration 0007, additive) and follow the learner across devices. Nothing is kept in browser storage. Without the migration the API reports `available: false` and the app keeps working with defaults.
6. **Language resolution order:** `?lang=` → the account's choice → Chinese for accounts that studied before the choice existed → the device's preferred languages.

## Read-aloud (Web Speech API)

- Scripts are split into sentences with `Intl.Segmenter('fr')`; `segments()` is pure and shared by the player and the transcript, so the sentence being read is the one highlighted.
- Dialogue turns (lines starting with a dash) alternate between two French voices when the device has two; otherwise the second speaker is pitched lower. Short pauses mark changes of speaker and paragraph.
- Pause/resume restarts the current sentence (engines' own `pause()` is unreliable); previous / next / repeat step by sentence.
- Voices are ranked: premium / neural / enhanced first, standard French (fr-FR) before other French, novelty voices last, other languages never. A voice chosen in settings wins.
- Robustness: waits for `voiceschanged`; keeps network voices alive; a watchdog advances if an engine never reports the end of an utterance.

## Toward native apps

The pure modules (`state.js`, `progress.js`, `sync-core.js`, `content.js`, `course.js` plan logic, `speech.segments`) hold no DOM or storage dependencies and define the behaviour a native iOS / iPadOS / macOS client must match. The JSON course data, the overlays and the `/api/v1` contract (including `settings`) are shared as-is; `AVSpeechSynthesizer` can implement the same sentence and voice rules.
