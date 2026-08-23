# Text to speech without a provider's servers

How to stop sending user text to a third party for narration — what the options
actually are in 2026, what each costs, and what "private" really requires.

Companion to [TEXT-TO-SPEECH.md](./TEXT-TO-SPEECH.md), which describes the
current cloud pipeline.

---

## Read this first

**Making TTS local does not make an app private.** It makes narration private.

In this app, document text is also sent to Gemini for article cleaning,
summarising, PDF reading, study-pack generation and explanation grading. Swap
the TTS and four of five paths still leave the device. Anyone promising users
"your documents never leave your device" needs a local LLM too, which is a
different order of project.

Be precise about the claim you are making. "Narration happens on your device" is
true and worth saying. "Your data never leaves your device" would not be.

---

## Three routes, not two

| | Commercial cloud | Open weights, self-hosted | On-device |
|---|---|---|---|
| **Examples** | Gemini TTS, ElevenLabs, OpenAI | Chatterbox, Orpheus, Fish OpenAudio | Kokoro, Piper, Web Speech API |
| **Quality** | Best | Near-best | Good → fair |
| **Text leaves device** | Yes, to a vendor | Yes, to *your* server | **No** |
| **Cost** | Per character | GPU rental, ~always-on | **Zero** |
| **Works offline** | No | No | **Yes** |
| **Rate limits** | Yes | Your own capacity | **None** |
| **Setup** | An API key | GPU host, model serving, ops | A model file |

Route 2 is the one people reach for when they hear "open model", and it does not
solve the privacy question — it moves the recipient from Google to you. That is
a real gain for *control* and none at all for *data locality*. Choose it if you
want to own the stack; do not choose it if the goal is that text stays on the
device.

---

## On-device: the ones that actually work

### Kokoro — the recommendation

| | |
|---|---|
| Size | 82M params · **~92 MB** as q8 ONNX |
| Licence | **Apache 2.0** — commercial use fine, keep the attribution |
| Runs in | The browser, via `kokoro-js` + Transformers.js |
| Acceleration | WebGPU (~10s of audio in ~1s); WASM/CPU fallback |
| Voices | 54 presets across accents; **no cloning** |
| Architecture | StyleTTS2-based |

Punches far above its weight — blind tests reportedly prefer it to Microsoft's
9-billion-parameter VibeVoice, and it is said to run on a twelve-year-old CPU.

```bash
npm i kokoro-js
```

```js
import { KokoroTTS } from 'kokoro-js';

const tts = await KokoroTTS.from_pretrained(
  'onnx-community/Kokoro-82M-v1.0-ONNX',
  { dtype: 'q8', device: 'webgpu' },   // 'wasm' on CPU
);

const audio = await tts.generate('Text to read.', { voice: 'af_heart' });
```

**Be honest about quality.** Kokoro is *clearly natural*, not *expressive*.
Gemini's TTS is LLM-based and gets prosody, emphasis and pacing that an 82M
model does not. For a paragraph you will not care. For an hour of listening you
will.

### Piper

Tiny, fast, CPU-only, MIT. Built for Raspberry Pi and screen-reader use. Quality
is below Kokoro — recognisably synthetic — but it is the smallest credible
option and runs anywhere. Good when the download budget is tens of megabytes,
not ninety.

### Web Speech API — the zero-cost floor

Already in every browser. No download, no dependency, no key.

```js
speechSynthesis.speak(new SpeechSynthesisUtterance('Text to read.'));
```

Two caveats that matter:

- Quality is whatever the OS ships. Usually noticeably robotic.
- **It is not reliably on-device.** On desktop Chrome, some voices are Google
  *cloud* voices. If the point is data locality, filter
  `speechSynthesis.getVoices()` to entries where `voice.localService === true`
  and refuse the rest.

Worth wiring up regardless as an always-available fallback: it costs almost
nothing to implement and it is the only option that works with no model
download and no network.

---

## Self-hosted open weights

Reach for these when you want quality parity with commercial APIs and are
willing to run a GPU.

**Chatterbox** (Resemble AI, MIT) is the current quality leader. A blind test
had listeners prefer Chatterbox-Turbo **65.3%** of the time against ElevenLabs
at 24.5% — that figure comes from the people who built it, so treat it as
directional rather than settled, but it is genuinely top-tier. 350M params, 23
languages, zero-shot voice cloning from about five seconds of reference audio.

**Orpheus** (Canopy Labs) — a 3B speech-LLM, wants roughly 8–12 GB of VRAM.

**Fish Audio OpenAudio S1** — multilingual, strong cloning.

At low volume these cost **more** than a commercial API, because you are paying
for a GPU that is idle most of the time. The economics only invert at scale.

---

## Choosing

```
Must text stay on the device?
├── Yes ──────────► Kokoro (in-browser)
│                       + Web Speech API as the no-download floor
└── No
    ├── Want to own the stack, have GPU budget, need cloning?
    │        └────────► Chatterbox self-hosted
    └── Want best quality for least effort?
             └────────► Commercial API (what this app does)
```

The question that decides it is not "open or closed". It is **where the text is
allowed to go**.

---

## What a swap looks like here

Both sides of the pipeline sit behind a port:

```ts
// src/client/application/ports/speechGateway.ts
interface SpeechGateway {
  synthesize(text: string, voiceName: string): Promise<Uint8Array>;
}
```

A Kokoro implementation satisfies that signature without anything above it
changing — chunking, prefetching, caching, playback and the card speaker all
depend on this and nothing else. The swap is one line in
`src/client/config/container.ts`.

Three things to check before committing:

1. **Sample rate.** `WebAudioOutput` is constructed with
   `NARRATION_SAMPLE_RATE` (24 000) and interprets the bytes accordingly. Get
   this wrong and audio plays at the wrong pitch *without failing*. Confirm what
   Kokoro emits and make the two agree.
2. **Output format.** The current path expects **headerless 16-bit PCM** and
   converts to float by hand in `pcm16ToAudioBuffer`. If a replacement returns
   `Float32Array` or a WAV container, that conversion changes.
3. **Where it runs.** Model inference on the main thread will block the UI. Put
   it in a Web Worker.

### Suggested shape: fallback, not replacement

Do not rip out the cloud path. Chain it:

```
Gemini  →  (quota exhausted, or offline, or user opted out)  →  Kokoro
        →  (no WebGPU, no download)                          →  Web Speech API
```

This is the same pattern the server already uses for model fallback, and it
gets you three things at once: the good voice when it is available, a working
app when it is not, and a genuine privacy mode for users who ask for it.

The chunking, retry and caching machinery already built around the port is
reusable as-is — with one adjustment worth making. Chunk size exists because
cloud calls are billed and rate-limited per request; neither applies locally, so
a local backend can use larger chunks and get **better prosody across seams**.

---

## Design notes

For whoever is building the interface around this:

- **Time-to-first-audio is the experience**, not throughput. A model that
  streams the first sentence in 300 ms beats one that is twice as good and takes
  four seconds.
- **The wait must be designed.** A cold server, a first chunk and a model
  download are all silence to a user. Say what is happening.
- **A first-run model download needs its own state.** Ninety megabytes on mobile
  data is a decision the user should make, not discover.
- **Chunk seams are audible.** Prosody resets at every call boundary. Split on
  sentences and the seams sound like breaths; split on character counts and they
  sound like faults.
- **Never signal "disabled" by making a floating control translucent.** Element
  opacity dims the surface as well as the contents, so a transport bar that
  overlaps content becomes a window onto it. Dim the controls inside an opaque
  panel. *(This one was a real bug here — see `PlayerControls.tsx`.)*
- **Offline and quota states are product states, not error text.** They are
  where a local fallback earns its keep.

---

## Sources

- [BentoML — open-source TTS in 2026](https://www.bentoml.com/blog/exploring-the-world-of-open-source-text-to-speech-models)
- [Speakeasy — Kokoro, Chatterbox and Fish compared](https://www.tryspeakeasy.io/blog/open-source-text-to-speech-2026)
- [FindSkill — Chatterbox blind-test result](https://findskill.ai/blog/best-open-source-tts-2026/)
- [Xenova — Kokoro.js announcement](https://huggingface.co/posts/Xenova/503648859052804)
- [Kokoro running on WebGPU in the browser](https://digialps.com/kokoro-webgpu-real-time-text-to-speech-running-100-locally-in-your-browser/)
- [onnx-community/Kokoro-82M-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-ONNX)
- [kokoro-js on npm](https://www.npmjs.com/package/kokoro-js)
- [Local AI Master — sizes and quantizations](https://localaimaster.com/blog/kokoro-tts-local-setup)

Model names, sizes and rankings were current in August 2026 and move fast.
Re-check before committing to one.
