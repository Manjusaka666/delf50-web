# Listening recordings

The recordings in `audio/b1/` and `audio/b2/` read the course's listening
scripts in French from France. They were generated once with
`scripts/listening-audio.py`; nothing is synthesised in the browser.

- Speech synthesis: [Piper](https://github.com/rhasspy/piper) (MIT licence).
- Voices ([rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices), fr_FR):
  - **upmc** (medium), speakers *Pierre* (male) and *Jessica* (female), trained on the
    [UPMC French speech data](https://github.com/marytts/upmc-pierre-data) of the Université
    Pierre-et-Marie-Curie, licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
  - **siwis** (medium), female, trained on the
    [SIWIS French Speech Synthesis Database](https://datashare.is.ed.ac.uk/handle/10283/2353),
    licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

The recordings are shared under the same terms (CC BY-SA 4.0).
