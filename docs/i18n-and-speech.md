# Interface languages and read-aloud

## Decisions

1. **Records are language-neutral.** Whatever the interface language, a learner's answers are stored exactly as the course wrote them (question stems and explanations in the course's source language, grammar points by their French names). Switching language never rewrites, duplicates or orphans a record. `scripts/verify.js` answers the same day in Chinese and in English and requires the two states to be identical.
2. **Translations are overlays, not copies.** `course/…/i18n/<locale>/<file>` has the same shape as the material it translates but holds only the learner-language strings. `localize()` replaces a string only if it contains Chinese, so French material cannot be altered by a translation. Originals stay reachable through `canonical()`.
3. **One source of truth for the course.** Day titles and phases come from the translated course map; day files never restate them. Plans, quotas and question order are computed from the source material and are identical in every language (checked for every day × intensity × locale).
4. **Fidelity is checked mechanically.** `scripts/check-i18n.js` requires complete coverage and flags any translation that drops or changes a French token, a number or a markup tag present in the original.
5. **Preferences belong to the account.** Locale, theme, voice and rate live in `delf50.user_settings` (migration 0007, additive) and follow the learner across devices. Nothing is kept in browser storage. Without the migration the API reports `available: false` and the app keeps working with defaults.
6. **Language resolution order:** `?lang=` → the account's choice → Chinese for accounts that studied before the choice existed → the device's preferred languages.

## Listening recordings

- Listening never uses the browser's or the system's voices: each script has a pre-generated recording (`audio/<b1|b2>/<id>.mp3`, constant-bitrate MP3) read by native French (France) voices — Piper's fr_FR *upmc* (Pierre, male; Jessica, female) and *siwis* (female) — made by `scripts/listening-audio.py`. Credits: `audio/CREDITS.md`.
- `<id>.json` holds the start of each sentence; the sentences are `speech.segments()` of the script, so the transcript's highlight follows the audio. `app/recording.js` plays it with one `<audio>` element, started inside the tap: pause and resume, previous / next / repeat, a sentence of the transcript, and the speed (`playbackRate`, pitch kept).
- A dialogue alternates a man and a woman; who is who comes from the script (the agreement a speaker uses for themself, "Madame" / "Monsieur" addressed to the other, the genre such as "interview d'une restauratrice"), else Pierre then Siwis.
- After changing a listening script, run the generator again; `verify.js` fails while a script has no recording or its sentences differ.

## Read-aloud (Web Speech API) — vocabulary chunks and examples

- Scripts are split into sentences with `Intl.Segmenter('fr')`; `segments()` is pure and shared by the player and the transcript, so the sentence being read is the one highlighted.
- Dialogue turns (lines starting with a dash) alternate between two French voices when the device has two; otherwise the second speaker is pitched lower. Short pauses mark changes of speaker and paragraph.
- Pause/resume restarts the current sentence (engines' own `pause()` is unreliable); previous / next / repeat step by sentence.
- Voices are ranked: on-device voices before network ones (Chrome's "Google français" and Edge's online voices are synthesised on a server — Google's cannot be reached from mainland China, and an unreachable voice is silent); then premium / neural / enhanced, standard French (fr-FR) before other French, novelty voices last, other languages never. A voice chosen in settings wins while it works; settings mark network voices as online.
- A voice that reports an error, ends without having spoken, or has not started after 5 s is set aside for the session, and the same sentence is read by the next voice. After three voices fail in a row (or with no voice left) the reading stops and the player says why (`tts.error`), rather than running on in silence.
- iOS only speaks when speech starts inside a tap, and drops every utterance after one it refused: the first sentence is spoken synchronously in the tap when nothing is playing. Chrome drops an utterance spoken in the same tick as `cancel()`, so a cancel happens only when something is playing, and the next utterance follows 100 ms later; there is no silent "unlock" utterance (Chrome never finishes a blank one and every utterance after it waits behind it). iPhones also mute read-aloud in Silent mode, which the player mentions on iOS.
- Long sentences are spoken in clause-sized parts (network voices stop after ~15 s); the utterance being spoken is held so it cannot be garbage-collected before its end; a watchdog advances if an engine never reports the end. No regular-expression lookbehind (Safari before 16.4 cannot parse it).

## Toward native apps

The pure modules (`state.js`, `progress.js`, `sync-core.js`, `content.js`, `course.js` plan logic, `speech.segments`) hold no DOM or storage dependencies and define the behaviour a native iOS / iPadOS / macOS client must match. The JSON course data, the overlays and the `/api/v1` contract (including `settings`) are shared as-is; `AVSpeechSynthesizer` can implement the same sentence and voice rules.
