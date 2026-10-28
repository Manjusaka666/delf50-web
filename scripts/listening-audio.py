#!/usr/bin/env python3
"""
Pre-generates the listening recordings: one audio file per script, read by
native French (France) voices, so that playback never depends on the voices
of the learner's browser or system (Chrome on a Mac read some dialogues in
Canadian French or American English).

Voices: Piper (https://github.com/rhasspy/piper, MIT), fr_FR models from
https://huggingface.co/rhasspy/piper-voices —
  upmc (medium): Pierre (male) and Jessica (female), Université Pierre-et-Marie-Curie,
                 dataset CC BY-SA 4.0;
  siwis (medium): female, SIWIS French speech database, CC BY 4.0.
The audio is generated once, here, and served with the site; nothing is
synthesised in the browser and no service is called.

Each script is read sentence by sentence exactly as the player cuts it
(app/speech.js segments(), via scripts/listening-segments.mjs), with the
player's pauses between turns and paragraphs. Output, per recording:
  audio/<b1|b2>/<id>.mp3   MP3, constant 32 kb/s, mono, 22.05 kHz (every browser plays it; seeking is exact)
  audio/<b1|b2>/<id>.json  {"v": 1, "voices": [...], "t": [start of each sentence, s], "d": duration, "texts": [...]}

Speakers: a dialogue alternates two voices, a man and a woman. Who is who
comes from the script where it says so — the agreement a speaker uses for
themself (je suis arrivée / arrivé), "Madame" / "Monsieur" addressed to the
other, the genre ("interview d'une restauratrice") — otherwise the first
speaker is Pierre and the second Siwis. Two women: Siwis and Jessica; two
men: Pierre and Pierre a little lower. Monologues alternate Siwis and Pierre
unless the script says otherwise.

Run (Python 3.10+, ffmpeg):
  python3 -m venv .venv && .venv/bin/pip install piper-tts
  download fr_FR-upmc-medium.onnx(.json) and fr_FR-siwis-medium.onnx(.json) into VOICES_DIR
  VOICES_DIR=… .venv/bin/python scripts/listening-audio.py [--only b1:L01-1,…]
"""
import json, os, re, subprocess, sys
import numpy as np
from piper import PiperVoice, SynthesisConfig

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
VOICES_DIR = os.environ.get('VOICES_DIR', '.')
RATE = 22050

# ── who speaks ──
APOS = "['’]"
SELF = re.compile(r"\b(?:je\s+(?:suis|me\s+suis|serai|serais|reste|restais|me\s+sens|me\s+sentais|étais)|j" + APOS + r"(?:étais|ai\s+été))\s+"
                  r"(?:(?:très|vraiment|tellement|assez|plutôt|si|trop|bien|pas|plus|jamais|encore|déjà|toujours|un\s+peu|sûrement)\s+){0,2}(\w+)", re.I)
FEM = re.compile(r"(?:ée|ées|ie|ue|ise|ite|ète|ête|ente|ante|euse|ive|elle|ienne|onne|ère|ouse|aine|ine|trice)$", re.I)
MASC = re.compile(r"(?:é|és|i|u|is|it|et|êt|ent|ant|eux|if|el|ien|on|er|oux|ain|in|eur)$", re.I)
NOT_ADJ = {'là', 'en', 'au', 'aux', 'de', 'du', 'des', 'le', 'la', 'les', 'un', 'une', 'ici', 'chez', 'dans', 'sur', 'pour', 'sans', 'avec',
           'qui', 'que', 'ce', 'cette', 'encore', 'toujours', 'contre', 'entre', 'comme', 'pas', 'plus', 'aussi', 'très', 'fan', 'prof', 'fier'}
GENDERED = {'sûr': 'm', 'sûre': 'f', 'né': 'm', 'née': 'f', 'fier': 'm', 'fière': 'f'}
ADDR_F = re.compile(r"\b(?:madame|mademoiselle)\b", re.I)
ADDR_M = re.compile(r"\bmonsieur\b", re.I)
# The genre names the speaker: "interview d'une restauratrice", "entretien avec un médecin", "récit d'un accompagnateur".
GENRE = re.compile(r"(?:d" + APOS + r"|avec\s+|par\s+)(une|un)\s+(\w+)", re.I)
PERSON = re.compile(r"(?:eur|euse|trice|ien|ienne|ier|ière|iste|ante|ant|ent|ente|ogue|ecin|isan|isane|ami|amie|aire|able|ice|habitante?|cin|rice)$", re.I)


def self_gender(text):
    f = m = 0
    for w in SELF.findall(text):
        w = w.lower()
        if w in GENDERED: f += GENDERED[w] == 'f'; m += GENDERED[w] == 'm'; continue
        if w in NOT_ADJ or len(w) < 3: continue
        if FEM.search(w): f += 1
        elif MASC.search(w): m += 1
    return f, m


def genders(rec):
    """The gender of speaker 0 and speaker 1: 'f', 'm' or None (not said)."""
    segs, votes = rec['segs'], {0: [0, 0], 1: [0, 0]}
    dialogue = any(s['dialogue'] for s in segs)
    for s in segs:
        f, m = self_gender(s['text'])
        votes[s['speaker']][0] += f; votes[s['speaker']][1] += m
        if s['dialogue']:
            other = 1 - s['speaker']
            votes[other][0] += bool(ADDR_F.search(s['text'])); votes[other][1] += bool(ADDR_M.search(s['text']))
    g = GENRE.search(rec['genre'] or '')
    if g and PERSON.search(g.group(2)):
        who = 0
        if dialogue:  # the person named answers: the speaker who asks fewer questions
            asks = {k: sum(s['text'].rstrip().endswith('?') for s in segs if s['speaker'] == k) for k in (0, 1)}
            who = 1 if asks[0] > asks[1] else 0
        votes[who][0 if g.group(1).lower() == 'une' else 1] += 2
    pick = lambda v: 'f' if v[0] > v[1] else 'm' if v[1] > v[0] else None
    return pick(votes[0]), pick(votes[1]), dialogue


def cast(rec, index):
    """The voice of speaker 0 and speaker 1."""
    g0, g1, dialogue = genders(rec)
    if not dialogue:
        g0 = g0 or ('f' if index % 2 == 0 else 'm')
        return ['pierre' if g0 == 'm' else 'siwis', 'siwis']
    if g0 is None and g1 is None: g0, g1 = 'm', 'f'
    elif g0 is None: g0 = 'm' if g1 == 'f' else 'f'
    elif g1 is None: g1 = 'm' if g0 == 'f' else 'f'
    if g0 == g1 == 'f': return ['siwis', 'jessica']
    if g0 == g1 == 'm': return ['pierre', 'pierre-low']
    return ['pierre' if g == 'm' else 'siwis' for g in (g0, g1)]


# ── sound ──
_models = {}
def model(name):
    if name not in _models: _models[name] = PiperVoice.load(os.path.join(VOICES_DIR, name + '.onnx'))
    return _models[name]

VOICES = {'pierre': ('fr_FR-upmc-medium', 1), 'jessica': ('fr_FR-upmc-medium', 0), 'siwis': ('fr_FR-siwis-medium', None), 'pierre-low': ('fr_FR-upmc-medium', 1)}


def lower(a):
    """The same voice a little lower (same pace), for a second man."""
    p = subprocess.run(['ffmpeg', '-loglevel', 'error', '-f', 's16le', '-ar', str(RATE), '-ac', '1', '-i', '-',
                        '-af', f'asetrate={RATE * 0.92:.0f},aresample={RATE},atempo={1 / 0.92:.6f}', '-f', 's16le', '-'],
                       input=a.tobytes(), capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype=np.int16)


def say(voice, text):
    name, sid = VOICES[voice]
    a = np.concatenate([c.audio_int16_array for c in model(name).synthesize(text, SynthesisConfig(speaker_id=sid))])
    if voice == 'pierre-low': a = lower(a)
    # Trim the model's own leading and trailing silence, so that the pauses are the player's.
    loud = np.nonzero(np.abs(a.astype(np.int32)) > 400)[0]
    if len(loud): a = a[max(0, loud[0] - int(0.03 * RATE)): loud[-1] + int(0.06 * RATE)]
    return a


def gap(prev, s):
    """The player's pauses: a new paragraph, a new speaker, the next sentence of the same turn."""
    if prev is None: return 0.25
    if s['para'] != prev['para']: return 0.55
    if s['turn'] != prev['turn']: return 0.38
    return 0.16


def build(rec, index, out_dir):
    voices = cast(rec, index)
    pcm, starts, prev = [], [], None
    for s in rec['segs']:
        pcm.append(np.zeros(int(gap(prev, s) * RATE), dtype=np.int16))
        starts.append(round(sum(len(x) for x in pcm) / RATE, 3))
        pcm.append(say(voices[s['speaker']], s['text']))
        prev = s
    pcm.append(np.zeros(int(0.4 * RATE), dtype=np.int16))
    a = np.concatenate(pcm)
    base = os.path.join(out_dir, rec['id'])
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 's16le', '-ar', str(RATE), '-ac', '1', '-i', '-',
                    '-c:a', 'libmp3lame', '-b:a', '32k', base + '.mp3'], input=a.tobytes(), check=True)
    used = sorted({voices[s['speaker']] for s in rec['segs']})
    with open(base + '.json', 'w', encoding='utf-8') as f:
        json.dump({'v': 1, 'voices': used, 't': starts, 'd': round(len(a) / RATE, 3), 'texts': [s['text'] for s in rec['segs']]},
                  f, ensure_ascii=False, separators=(',', ':'))
    return voices, len(a) / RATE


def main():
    recs = json.loads(subprocess.run(['node', os.path.join(ROOT, 'scripts/listening-segments.mjs')], capture_output=True, check=True).stdout)
    only = set(sys.argv[sys.argv.index('--only') + 1].split(',')) if '--only' in sys.argv else None
    count = {'b1': 0, 'b2': 0}
    for rec in recs:
        index = count[rec['level']]; count[rec['level']] += 1
        if only and f"{rec['level']}:{rec['id']}" not in only: continue
        out = os.path.join(ROOT, 'audio', rec['level'])
        os.makedirs(out, exist_ok=True)
        voices, d = build(rec, index, out)
        print(f"{rec['level']} {rec['id']}: {d:6.1f} s  {' + '.join(dict.fromkeys(voices)) if any(s['dialogue'] for s in rec['segs']) else voices[0]}", flush=True)


if __name__ == '__main__':
    main()
