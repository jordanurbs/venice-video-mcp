---
name: venice-mcp-cookbook
description: Use when calling any of the venice-video-mcp tools and you need a concrete, copyable example of the tool arguments. Provides one example per action across all 6 tools, with every argument spelled out and reasonable defaults explained.
---

# venice-mcp-cookbook

Concrete, copy-paste examples for every action across the six MCP tools. Every example shows the full args object the agent should pass to the tool call.

Conventions:
- `project` accepts a slug like `"the-audacity"` (resolved against `$HARNESS_WORKSPACE/output/`) or an absolute path.
- All booleans are real booleans, not strings.
- `episode` and `shot` are integers (1-based).
- Coercion is enabled: passing `"1"` for a number works, but prefer real numbers.

Defaults reflect venice-video-harness v2.1.x: video defaults are Seedance 2.0 i2v / R2V with auto-fallback to Kling O3 for 3+ character scenes; dialogue shots with `motion: 'low' | 'medium'` and a visible face route to `wan-2-7-image-to-video` for exact lip-sync, but only when the series was created with `audioStrategy: 'lip-sync'` — otherwise they stay on the R2V family and Seedance speaks the line itself. Image + edit defaults are `nano-banana-2` / `nano-banana-2-edit` for ALL panels — the old seedream-only requirement for face-bearing Seedance inputs was removed (2026-07). `gpt-image-2` / `nano-banana-pro` (and their `-edit` variants) are valid alternatives.

---

## series

### `series.new`

**Always ask the upfront questionnaire (see pipeline skill STEP 0) before calling this.** The two optional fields below — `audioStrategy` and `videoFamilyPreference` — persist to `series.json` and steer model selection and audio routing for the whole series. Getting them right at this step prevents the double-narration / lip-sync-mismatch / wrong-family classes of bugs.

```json
{
  "action": "new",
  "name": "The Audacity",
  "concept": "A wildly sarcastic talk show host interviews guests and dispenses weaponized life advice.",
  "genre": "comedy",
  "setting": "An absurdly lavish talk show studio with gold accents, velvet chairs, dramatic backlighting, and a live audience that gasps on cue.",
  "audioStrategy": "native",
  "videoFamilyPreference": "seedance"
}
```

`audioStrategy` (optional, ask first):
- `"native"` — Seedance generates the dialogue in-frame, holding each character's voice steady through a voice-donor clip (`reference_audio_urls` / `@AudioN`). Default, and the right answer for most work: shots stay on R2V and dialogue beats can still bundle into native multi-shot generations. `assemble.assemble` keeps `dialogueReplace: false`.
- `"lip-sync"` — Venice TTS renders each line and Wan 2.7 drives the mouth from that exact file. The **only** strategy that routes anything to Wan. Pick it when the delivery must match a specific recording (cloned voice, scripted read, localized dub); it costs roughly double per shot and forces those beats to render as singles. `assemble.assemble` defaults `dialogueReplace: true`.
- `"narrator-vo"` — voice-over only (NARRATOR), no on-camera mouths. Auto-sets `audioMix.suppressModelNarration: true` so Seedance gets `audio: false` for every dialogue shot, and `assemble.assemble` defaults `dialogueReplace: true` + `nativeVolume: 0`.

`videoFamilyPreference` (optional, ask first):
- `"auto"` / unset — Seedance 2.0 across the board (current default).
- `"seedance"` — explicit Seedance 2.0 (persisted).
- `"happyhorse"` — HappyHorse 1.1 i2v + R2V (Alibaba, #1 blind-preference T2V + I2V). Joint single-pass video+audio, 7-language phoneme lip-sync, R2V up to 9 refs. Best for talking characters + multilingual localization; SFW-leaning. Same provenance gate as Seedance. (1.0 IDs remain in the registry for back-compat.)
- `"minimax-h3"` — MiniMax H3 i2v + R2V (open-weight omni-modal). 2K with native stereo audio at ~1/3 the per-second cost, R2V up to 9 refs. 2K is the only resolution (no draft tier) and durations run 5-15s, so script the beats on a 5s floor.
- `"minimax-h3-max"` — MiniMax H3 Max i2v + R2V. Shares the name with MiniMax H3 and little else: **768P** (2K is rejected — the inverse of H3), `private` rather than anonymized, and it wants a **plain one- or two-sentence prompt** because it stages its own framing, coverage, and cutting. The harness strips blocking, locked location descriptions, and geography-hold clauses from its prompts automatically, so don't hand-write them back in. That instinct makes it the montage family: describe the sequence and let the model tell it. 5-15s ladder, $0.024/s.
- `"minimax-h3-max-turbo"` — the same model at $0.012/s, the cheapest lane in the registry, so 15s takes are cheap enough to render several and pick. No R2V lane exists, so character-consistency and lip-sync shots route to `minimax-h3-max-reference-to-video`.
- `"grok-imagine"` — Grok Imagine i2v + R2V (R2V durations stepped at 5s / 8s / 10s only). Family stays in-family for character consistency.
- `"kling-o3"` — Kling O3 Standard everywhere. Best for stylized / illustrated aesthetics.

`lipSyncModel` goes unused unless `audioStrategy` is `"lip-sync"`. Families whose own R2V lane takes a top-level `audio_url` stay in-family (Seedance, MiniMax H3, MiniMax H3 Max — always the `-reference-to-video` lane); the rest fall back to Wan 2.7 i2v, which syncs a mouth to a supplied recording but forfeits reference anchoring.

### `series.list`
```json
{ "action": "list" }
```

### `series.set_aesthetic`
Always include style + palette + lighting. lens and film have sensible defaults but specifying them locks in tighter consistency.
```json
{
  "action": "set_aesthetic",
  "project": "the-audacity",
  "style": "Hyper-stylized cinematic illustration, glossy editorial drama, late-night talk show glamour",
  "palette": "Rich golds, deep burgundy, midnight black, hot studio whites, occasional electric teal accents",
  "lighting": "Dramatic three-point studio lighting with rim glow, volumetric haze, warm key light",
  "lens": "Shallow depth of field, medium close-ups with bokeh background",
  "film": "Clean high-end digital with subtle film grain, cinematic color grading"
}
```

### `series.explore_aesthetic`
```json
{ "action": "explore_aesthetic", "project": "the-audacity", "count": 5 }
```

---

## character

### `character.add` (human)
`voiceDesc` is the primary lever for dialogue quality now that the recommended pipeline uses **native model dialogue** instead of Venice TTS. Spec it like you're directing a voice actor — timbre, accent, pacing, emotional default state, idiolect, breath placement, signature delivery quirks. The richer the description, the more in-character the video model's generated dialogue will be when it's referenced in shot prompts. (The Venice voice you later `character.lock` is only used by Venice TTS — i.e. when `media.override_audio { dialogue: true }` is invoked as a rescue, not on the default path.)
```json
{
  "action": "add",
  "project": "the-audacity",
  "name": "VIVIENNE",
  "gender": "female",
  "age": "late 30s",
  "description": "Strikingly beautiful Black woman with high cheekbones, perfectly arched eyebrows, warm brown skin, sleek shoulder-length black hair, full lips, fierce dark brown eyes, statuesque presence",
  "wardrobe": "Tailored designer power suit in deep burgundy with gold statement earrings, killer heels, lapel microphone clipped to her collar",
  "voiceDesc": "Rich warm contralto, mid-low register with a velvety chest resonance. Honeyed Mid-Atlantic diction layered over a faint Louisiana drawl on vowels. Deliberate pacing — she takes one full beat before every punchline, then drops the joke at half-volume so you have to lean in. Sarcasm sits underneath warmth, never on top of it; she sounds amused, never bitter. Breath is unhurried, slightly audible before key phrases. Laughs are dry chuckles, never giggles. No vocal fry. No uptalk.",
  "skipImages": false
}
```

### `character.add` (non-human --- e.g. an animal or creature)
Use `baseTraits` to override the default human anatomy hints.
```json
{
  "action": "add",
  "project": "rugrat-saga",
  "name": "PIMON",
  "gender": "male",
  "age": "young adult",
  "description": "Sleek silver-tabby cat with intelligent green eyes, a slight nick in the left ear, expressive whiskers",
  "wardrobe": "Worn leather collar with a brass key charm",
  "baseTraits": "tabby cat, feline, four legs, no thumbs, fur"
}
```

### `character.audition_voices`
Generates 5 candidate voices. Sample text defaults to a generic line; pass one that captures the character's typical cadence for better picks.
```json
{
  "action": "audition_voices",
  "project": "the-audacity",
  "character": "VIVIENNE",
  "sampleText": "Bless your heart, but you absolutely do NOT have the audacity for what you're about to ask me.",
  "count": 5
}
```

### `character.lock`
`voiceReference` is optional: pass a path to an operator-supplied voice-donor clip (wav/mp3) to import it as this character's `reference_audio_urls` donor (normalized to 2-15s). Omit it to let the harness auto-generate one from `voiceDescription` on the first dialogue shot that routes to a reference-audio-capable model.
```json
{
  "action": "lock",
  "project": "the-audacity",
  "character": "VIVIENNE",
  "voiceId": "Serena",
  "voiceName": "Serena"
}
```

### `character.generate_voice_reference`
Make (or import) the voice-donor clip used as `reference_audio_urls` (@AudioN) so a character's voice stays consistent across shots on Seedance 2.0 R2V / HappyHorse 1.1 R2V. Default source is `seed-audio-1-0` steered by the character's `voiceDescription`; the clip is normalized to 2-15s and written to `characters/<slug>/voice-reference.mp3`. This is optional — the harness auto-generates a missing clip inline during `media.generate_videos`. Call it explicitly to pre-bake, override the spoken text/voice/speed, or import a real recording via `file`.
```json
{
  "action": "generate_voice_reference",
  "project": "the-audacity",
  "character": "VIVIENNE",
  "voice": "Serena",
  "speed": 1
}
```
Import an operator recording instead of generating:
```json
{
  "action": "generate_voice_reference",
  "project": "the-audacity",
  "character": "VIVIENNE",
  "file": "/abs/path/to/vivienne-voice.mp3"
}
```

---

## location

First-class environment entities with generated reference images (wide / medium / detail), used to anchor the setting across storyboard panels and video the way characters anchor identity. Tag shots with `location: <slug>` (workshop-episode does this automatically). On Kling O3 R2V the location fills `scene_image_urls`; on Seedance / HappyHorse the wide ref folds into `reference_image_urls` with a matching `@ImageN` env tag.

### `location.add`
Defines a location and generates its 3 faceless reference angles (`nano-banana-pro`, `hasFace:false`). `lighting` carries into every panel prompt for the place (lighting-consistency).
```json
{
  "action": "add",
  "project": "the-audacity",
  "name": "Sietch Workshop",
  "description": "a cramped underground workshop of copper pipes, salvaged consoles, and warm lamplight",
  "lighting": "warm amber lamplight, deep shadows, single overhead work lamp"
}
```

### `location.generate_references`
(Re)generate a location's reference angles. `force: true` archives prior versions and regenerates.
```json
{
  "action": "generate_references",
  "project": "the-audacity",
  "location": "sietch-workshop",
  "force": true
}
```

### `location.list`
Read-only list of the series' locations (slug, description, whether refs exist). No spawn.
```json
{ "action": "list", "project": "the-audacity" }
```

---

## episode

### `episode.new`
```json
{
  "action": "new",
  "project": "the-audacity",
  "title": "The Audacity of Hustle Culture"
}
```

### `episode.workshop`
LLM-drafts the shot-by-shot script via Venice chat completions. Stop and let the user review/edit the output before approving.

**Always include shot-duration and voice guidance in the `concept`.** The script LLM defaults to many short shots and to letting the video model add music/SFX — both are wrong for the current pipeline:

- Tell it to **prefer 15s shots** (the native max on Seedance 2.0 and HappyHorse 1.0). For a 30-second beat, 2x15s beats 5x6s.
- Tell it to **include detailed voice direction per dialogue shot** (timbre, accent, pacing, emotional register, breath placement) so the video model generates good native dialogue.
- Tell it to **add a no-music / no-SFX negative** to every shot prompt — the harness adds music and ambient in post.

```json
{
  "action": "workshop",
  "project": "the-audacity",
  "episode": 1,
  "concept": "Vivienne demolishes the modern hustle-culture gospel after Chad pitches her his crypto-coaching empire. Target ~60 seconds total: 4 shots at 15s each. Per-shot voice direction must be precise (Vivienne: warm contralto, deliberate pacing, dry sarcasm; Chad: nasal tenor, breathless overconfidence). Every shot's video prompt must include the negative `no background music, no sound effects, no soundtrack, dry recording` — the harness adds music and ambient in post.",
  "model": "llama-3.3-70b"
}
```

#### Directed `concept` (with the venice-mcp-directing bridge)

Load **venice-mcp-directing** and shape the concept before you send it. A *directed* concept names one intention per beat and a single directorial voice — so the draft comes back directed, not decorated. The harness's in-code workshop prompt already carries the "direct, don't decorate" instruction; a directed `concept` is what makes it land. Note it directs **intention/camera/light/blocking/performance/sound only** — never exhaustive character-identity descriptions or `[Image1]`-style reference tags (the harness owns identity via R2V + the Wan keyframe pass).

```json
{
  "action": "workshop",
  "project": "the-audacity",
  "episode": 1,
  "concept": "One directorial voice for the whole episode: patient predator vs. flailing prey — the camera stays calm while Chad unravels. ~60s, 4 shots at 15s. Give each shot ONE intention and derive the craft from it, don't stack 'cinematic' adjectives:\n- Shot 1 (the pitch): intention = Chad's overconfidence outruns the room. Locked-off medium two-shot, flat even key so nothing flatters him; he leans in, Vivienne stays still. Chad breathless nasal tenor, no pauses.\n- Shot 2 (the turn): intention = she lets him hang himself. Slow push-in to Vivienne's medium close-up, warm side light, she says nothing for a beat then lands one dry line at half volume — deliberate contralto, breath audible before the punchline.\n- Shot 3 (the kill): intention = the power flips. Hold on Chad's close-up as his confidence cracks; no camera move, let the stillness do it.\n- Shot 4 (button): intention = she's already moved on. Wide, she stands and exits frame; he's left small in the composition.\nEvery shot description must end with: No background music, no sound effects, no soundtrack, dry recording. The harness adds music and ambient in post.",
  "model": "llama-3.3-70b"
}
```

#### Directed per-shot prompt (what a good `description` looks like)

When you edit `script.json` by hand or pass a `description` to `episode.insert_shot`, direct the shot — one intention, coherent craft, character named but not physically re-described:

```text
Medium close-up, eye-level; Vivienne lowers her glass and her hands go still as a slow push-in arrives. Warm side light keeps her face plain, not glamorous. She holds a full beat, then delivers the line at half volume so Chad has to lean in. VIVIENNE: "Bless your heart, Chad." Delivery: deliberate warm contralto, honeyed sarcasm sitting under warmth not on top of it, one audible breath before the line. No background music, no sound effects, no soundtrack, dry recording.
```

Contrast with the decorated version to avoid: `epic cinematic close-up of a stunning woman, dramatic beautiful lighting, emotional, 4k, masterpiece`. Same shot, no direction — the model has nothing to serve.

### `episode.approve`
```json
{ "action": "approve", "project": "the-audacity", "episode": 1, "notes": "Locked --- ship it." }
```

### `episode.storyboard`
Generates panels for every shot in the approved script. Refinement is on by default (multi-edit pass to fix character drift). Set `force: true` to regenerate panels that already exist.
```json
{
  "action": "storyboard",
  "project": "the-audacity",
  "episode": 1,
  "refine": true,
  "editModel": "nano-banana-2-edit",
  "cfgScale": 10,
  "skipApproval": false,
  "force": false,
  "debug": false
}
```

### `episode.qa`
Vision-based QA against character references. Optional `shots` filter for re-checking specific shots. The default `model` is `qwen3-6-27b` (well-priced Qwen 3.6 27B vision model on Venice as of 2026-05). If Venice deprecates it, run `inspect.models { category: "vision", live: true }` to find the current recommended replacement.
```json
{
  "action": "qa",
  "project": "the-audacity",
  "episode": 1,
  "model": "qwen3-6-27b",
  "shots": "3-7"
}
```

### `episode.qa_approve`
```json
{ "action": "qa_approve", "project": "the-audacity", "episode": 1 }
```

### `episode.fix_panel`
Multi-edit a single panel to correct drift. Pass `characters` if only specific characters need correction; pass `prompt` to override the auto-generated edit prompt.
```json
{
  "action": "fix_panel",
  "project": "the-audacity",
  "episode": 1,
  "shot": 5,
  "characters": "VIVIENNE,CHAD",
  "editModel": "nano-banana-2-edit"
}
```

### `episode.insert_shot`
Add a new shot to an approved script after a specific shot id. The harness assigns a suffix-letter id (`5b`, `5c`, ...) so existing shot numbers stay stable for already-rendered panels and clips. After inserting, re-run `episode.storyboard` and `media.generate_videos` to materialize the new shot only — existing shots are not regenerated.

**Default duration is `15s`** (the native max on Seedance 2.0 and HappyHorse 1.0). **Omit `duration` to take the default** — prefer one long shot to two short ones. Only specify a smaller value for deliberate short beats (hard cut, sight gag, reaction stinger).

```json
{
  "action": "insert_shot",
  "project": "the-audacity",
  "episode": 1,
  "after": "5",
  "description": "Wide reaction shot: studio audience erupts in laughter; Vivienne smirks while Chad's confidence visibly cracks. Long single take so the laughter lands and reverberates. No music, no sound effects, no soundtrack — dry recording, room tone only.",
  "shotType": "action",
  "motion": "high",
  "characters": "VIVIENNE,CHAD",
  "transition": "CUT"
}
```

With dialogue (speaker is required when dialogue is set). Include detailed delivery direction in the `description` so the video model's native dialogue track has direction to follow:

```json
{
  "action": "insert_shot",
  "project": "the-audacity",
  "episode": 1,
  "after": "5b",
  "description": "Vivienne leans into the camera, deadpan close-up. Slow, deliberate pacing; warm contralto with honeyed sarcasm; long beat before the punchline. No music, no sound effects, no soundtrack — dry recording, room tone only.",
  "shotType": "close-up",
  "motion": "low",
  "characters": "VIVIENNE",
  "dialogue": "Bless your heart, Chad.",
  "speaker": "VIVIENNE",
  "transition": "FADE"
}
```

Deliberate short beat (override the 15s default only when the shot is *meant* to be quick):

```json
{
  "action": "insert_shot",
  "project": "the-audacity",
  "episode": 1,
  "after": "5c",
  "description": "Hard cut to a single frame of Chad's frozen, mortified expression. No music, no sound effects.",
  "shotType": "close-up",
  "duration": "3s",
  "motion": "low",
  "characters": "CHAD",
  "transition": "CUT"
}
```

---

## media

### `media.generate_videos`
Long-running. Set a `progressToken` in `_meta` to receive shot-by-shot updates. Use `skipQa: true` only if you've already manually verified the storyboard.
```json
{
  "action": "generate_videos",
  "project": "the-audacity",
  "episode": 1,
  "skipQa": false
}
```

### `media.override_audio`
Replace the model-native audio with Venice TTS dialogue and/or generated SFX. **This is now an exception path, not a default.** The recommended pipeline keeps the video model's native dialogue (Seedance / Wan 2.7 / HappyHorse all generate in-character audio when the panel prompt is detailed enough). Only call `override_audio { dialogue: true }` when the user explicitly wants Venice TTS — for example to swap accents, switch to a non-English voice, render a documentary NARRATOR voice-over, or repair a shot where the model botched a specific line. If you do call it, also flip `assemble.assemble { dialogueReplace: true }` and let `nativeVolume` default to **0** (harness ≥ 2.3.0) so the TTS owns the dialogue lane cleanly. Pass `nativeVolume: 0.2` only when you want to mix a soft ambient bed (room tone, paper rustle) under the TTS.

Reasonable use case (single-shot Venice TTS rescue):
```json
{
  "action": "override_audio",
  "project": "the-audacity",
  "episode": 1,
  "dialogue": true,
  "sfx": false
}
```

The `sfx: true` flag is independent and stays useful — it generates short SFX cues per shot from `script.json` SFX entries.

### `media.generate_music`
Generates a single background bed. If `script.json` defines a `musicCues[]` array (per-act cues with crossfade + `musicHold` automation), prefer authoring those cues directly --- the assembler will render and crossfade them during `assemble.assemble` / `produce`. The single-bed `generate_music` path is still useful for episodes that want one uniform mood.

```json
{
  "action": "generate_music",
  "project": "the-audacity",
  "episode": 1,
  "prompt": "Late-night talk show theme: brassy, confident, slightly sarcastic, with a wink. 110 BPM.",
  "duration": "60"
}
```

### `media.validate`
Default validates the assembled episode. Set `videoOutputs: true` to check raw shot orientation/duration before assembly.
```json
{ "action": "validate", "project": "the-audacity", "episode": 1, "videoOutputs": true }
```

### `media.generate_ambient`
Generates a Venice SFX ambient bed and writes it to `<episodeDir>/audio/ambient-<layer>.mp3`. `layer` is constrained to the four slots the harness recognises (`rain-heavy`, `rain`, `crowd`, `quiet-night`); the basic `assemble.assemble` path picks up the first matching file, and `assemble.mix_audio` blends all of them per-shot according to `script.json`. Idempotent: re-running overwrites the layer (archive yourself first if you need to keep the prior take).

```json
{
  "action": "generate_ambient",
  "project": "the-audacity",
  "episode": 1,
  "layer": "rain-heavy",
  "prompt": "Steady gentle rain on a city street at night, distant urban hum, wet pavement reflections, no thunder, no music, continuous ambient loop",
  "duration": 22
}
```

A crowd bed for the studio interior:
```json
{
  "action": "generate_ambient",
  "project": "the-audacity",
  "episode": 1,
  "layer": "crowd",
  "prompt": "Late-night talk-show studio audience: low murmurs, occasional polite laughter, ambient room tone, no music, no clear speech",
  "duration": 30
}
```

### `media.loop`
Start **loop mode** — a gate-skipping live browser loop that renders the whole shot script continuously and hot-swaps fresh takes as they finish. It skips the storyboard/QA gates (the only prerequisite is a shot script from `episode.workshop`) and writes only under `episodes/episode-NNN/loop/`, never touching the canonical cut. **Unlike every other media action it returns fast** — as soon as the local web server reports its URL — and leaves the server running in the background; it does not wait for a render to finish. The response carries `data.url` (open it in a browser to watch) and `data.pid` (kill it to stop early; it also stops when the MCP session ends).

`mode` is **required** and never defaulted — it's a deliberate quality-vs-flow decision, so ask the user which one they want:

Looping (creative flow, lower quality — Turbo @480P, t2v then i2v chaining, identity NOT locked; a disposable draft to riff on):
```json
{
  "action": "loop",
  "project": "the-audacity",
  "episode": 1,
  "mode": "looping"
}
```

Production (gather usable takes, higher quality — Max R2V @768P with the full reference stack + voice-donor audio, identity locked), with a raised spend cap:
```json
{
  "action": "loop",
  "project": "the-audacity",
  "episode": 1,
  "mode": "production",
  "budget": 5,
  "maxTakes": 4
}
```

Other optional flags: `duration` (per-take, default `"15s"`), `resolution` (`"480P"`/`"768P"`, defaults per mode), `chain` (i2v last-frame chaining — on for looping, off for production; pass `false` to force independent shots), `once` (one take per shot then stop), `unbounded` (remove the budget cap), `port` (default 3000).

**How it evolves (why it can look "pre-generated").** Loop mode plays AND renders at the same time — it does not pre-generate the whole thing. The browser loops the takes that already exist while the worker keeps generating new ones and swaps each shot's newer take in on the loop's NEXT pass (never mid-clip). If the user says "it seems generated in advance," it's almost always one of: (1) it's **paused** — the default `budget` of $2 was hit (or Pause was clicked) and it's now just replaying what's on disk; raise `budget` or set `unbounded: true` and Resume; or (2) it's in **`production`** mode, whose slow Max R2V renders can't keep up with a short loop cycle, so evolution lags — use `looping` (Turbo renders faster than it plays) for a visibly-evolving watch. `maxTakes` is a per-shot ring buffer (default 3), not a total, so once every shot hits the cap the per-cycle change is subtle.

### i2v (image-to-video): what it is and how to reach it
"i2v" means the model animates a **supplied start image** (`image_url` — the first frame), as opposed to **R2V** (identity anchored to `reference_image_urls`, no start frame) or **t2v** (prompt only). Don't conflate i2v with R2V: a start frame is one image the motion flows out of; a reference stack is identity the model holds throughout. On the MCP surface you don't pick the lane by hand — the harness router does it per shot:
- **`media.generate_videos`** auto-routes each shot: character shots → R2V (reference stack), establishing/atmosphere/no-character shots → i2v off the storyboard panel, and loop mode chains i2v off the previous shot's last frame. So the normal way to get i2v is to author an establishing/atmosphere shot (no `characters`) and let the router pick it.
- **Loop mode** (`media.loop`) leans on i2v directly for continuous playback (looping mode: first shot t2v, every later shot i2v-chained).
- To **animate a single arbitrary image you already have** (plain i2v, outside a project), there is no MCP tool for it today — use the harness's bundled `scripts/venice-video.py --image <file> --model <...-image-to-video> --prompt "<motion>"` from the `venice-video-model-routing` skill. (A first-class `animate` action is a tracked follow-up.)

---

## assemble

### `assemble.assemble`
Final mix. Layer flags (`subtitles`, `music`, `ambient`) default to `true` — pass `false` to skip a layer. The assembler runs a final-pass LUFS normalisation (-16 LUFS / -1 dBTP) and trims SFX clips to ≤2s with a 0.3s fade by default. Per-episode overrides go in `script.audioMix`.

**Dialogue defaults (current behavior):**
- `dialogueReplace` defaults to **`false`** — the video model's native dialogue plays as-is. This is the right default until Venice ships better TTS voices.
- `nativeVolume` is **optional**. The harness resolves it: **0** when `dialogueReplace: true` (so the model-native track can't double up with the Venice TTS), **1.0** otherwise.
- Pass `nativeVolume: 0.2` explicitly only when you want a soft ambient bed (room tone, paper rustle, distant rain) mixed under the TTS.
- The MCP rejects `dialogueReplace: true` + `nativeVolume > 0.5` at validation time — that combo was the root cause of the field-guide's double-narration bug.
- Per-shot script.json `shot.nativeAudio: 'mute' | 'duck' | 'keep'` overrides the global default on individual shots.

```json
{
  "action": "assemble",
  "project": "the-audacity",
  "episode": 1,
  "subtitles": true,
  "music": true,
  "ambient": true,
  "ambientVolume": 0.3,
  "dialogueReplace": false
}
```

If you've called `media.override_audio { dialogue: true }` upstream and want the TTS to win the mix:
```json
{
  "action": "assemble",
  "project": "the-audacity",
  "episode": 1,
  "dialogueReplace": true
}
```

Add `"nativeVolume": 0.2` only when you want a soft ambient bed under the Venice TTS (room tone, faint rain, paper rustle). Default is 0 — the safe choice for narrator-driven episodes.

### `assemble.produce`
One-shot: videos -> music -> assemble. Only use after script approval and (ideally) QA approval.
```json
{
  "action": "produce",
  "project": "the-audacity",
  "episode": 1,
  "withTts": true,
  "skipMusic": false
}
```

### `assemble.mix_audio`
Script-aware per-shot audio mixer. Reads `script.json` to derive native-audio volume, ambient layer weights, and shot-boundary fades; produces `episode-NNN-final-nosubs.mp4` and (if `subtitles.srt` is present) `episode-NNN-final.mp4`. Use this **instead of** `assemble.assemble` when an episode has ambient beds and benefits from per-shot mix automation. Requires `media.generate_videos` to have run already, and at least one `ambient-*.mp3` layer (otherwise it falls back to mostly-native audio).

```json
{ "action": "mix_audio", "project": "the-audacity", "episode": 1 }
```

The two assemblers overlap intentionally: `assemble.assemble` is the simple, deterministic path; `mix_audio` is the script-aware path that varies the mix per shot. Pick one per episode — they both write the same `episode-NNN-final.mp4`, so the last one wins.

For any dialogue or narrator VO episode, verify the assembled cut has no overlapping spoken clips at shot boundaries. Harness rule 35 uses one global spoken-audio cursor from measured clip durations; if a line runs longer than its shot, hold the picture or shorten/split the line rather than letting it bleed into the next shot.

### `assemble.edit_transcribe`
Always run this before any cut. `--aligned-from` is for content with a ground-truth script (Venice TTS, scripted reads).
```json
{
  "action": "edit_transcribe",
  "dir": "output/raw-takes/2026-05-04",
  "out": "output/raw-takes/edit/takes_packed.md",
  "model": "base.en",
  "language": "en",
  "include": "*.mp4,*.mov,*.m4a,*.wav,*.mp3",
  "alignedFrom": "scripts/raw-takes/config.ts",
  "speakerMap": "scripts/raw-takes/speaker-map.json"
}
```

### `assemble.edit_render`
Composites overlays (drawtext + WebM/PNG sequences) onto a base video using a manifest. Always preserves prior renders via versioned filenames.
```json
{
  "action": "edit_render",
  "manifest": "output/raw-takes/edit/overlays.json",
  "font": "/Library/Fonts/Arial Unicode.ttf",
  "skipArchive": false,
  "dryRun": false
}
```

### `assemble.edit_timeline`
Single PNG (filmstrip + waveform + optional word labels) for one segment of a video. Used at decision points during cut review --- not for blanket frame dumping.
```json
{
  "action": "edit_timeline",
  "video": "output/raw-takes/edit/final-edit.mp4",
  "start": 12.3,
  "end": 16.1,
  "out": "/tmp/cut-review-12-16.png",
  "width": 1600,
  "frames": 8,
  "silenceDb": -30,
  "silenceMin": 0.18,
  "wordsJson": "output/raw-takes/edit/final.words.json"
}
```

### `assemble.export_timeline`
Export a finished episode as an XML timeline you can import into Final Cut Pro X, Premiere Pro, or DaVinci Resolve and continue cutting. Requires `media.generate_videos` to have completed — there's nothing to lay onto a timeline otherwise. The output filename uses a format-specific extension so multiple exports can coexist:

| `format`   | Output                                          | Editor              |
|------------|-------------------------------------------------|---------------------|
| `fcpxml`   | `episode-NNN.fcpxml`                            | Final Cut Pro X     |
| `premiere` | `episode-NNN.premiere.xml` (xmeml v5)           | Adobe Premiere Pro  |
| `davinci`  | `episode-NNN.resolve.fcpxml` (DaVinci-tuned)    | DaVinci Resolve     |

```json
{
  "action": "export_timeline",
  "project": "the-audacity",
  "episode": 1,
  "format": "fcpxml",
  "fps": 24,
  "width": 1920,
  "height": 1080
}
```

For Premiere:
```json
{ "action": "export_timeline", "project": "the-audacity", "episode": 1, "format": "premiere" }
```

For DaVinci Resolve:
```json
{ "action": "export_timeline", "project": "the-audacity", "episode": 1, "format": "davinci" }
```

---

## inspect

### `inspect.list`
```json
{ "action": "list" }
```

### `inspect.series`
```json
{ "action": "series", "project": "the-audacity" }
```

### `inspect.episode`
```json
{ "action": "episode", "project": "the-audacity", "episode": 1 }
```

### `inspect.shot`
```json
{ "action": "shot", "project": "the-audacity", "episode": 1, "shot": 5 }
```

### `inspect.models`
```json
{ "action": "models", "category": "video" }
```
Categories: `video`, `image`, `edit`, `tts`, `music`, `sfx`, `vision`, `all`. The default ("offline") list reflects whatever's compiled into the harness's `src/venice/models.ts`. In v2.1.x that includes Wan 2.7 (lip-sync via `audio_url`), Kling O3 4K, HappyHorse 1.0, and the GPT Image 2 family.

Pass `"live": true` to fetch Venice's live `/api/v1/models` registry instead. The live mode is required for the `vision` category (vision-capable LLMs aren't in the harness's video-model file) and is the canonical way to see which model IDs are currently active, which carry the `default_vision` / `default_code` / `most_intelligent` traits, and which have a pending `deprecation.date`:
```json
{ "action": "models", "category": "vision", "live": true }
```
The response includes a `deprecated[]` list of any retiring models so you can migrate before they 404.

### `inspect.voices`
```json
{ "action": "voices", "provider": "kokoro" }
```
Providers: `kokoro`, `qwen3`, `all`.

---

## Response shape — successes can carry warnings too

The MCP scans harness stdout/stderr for known warning patterns (silent-rejection retries, duration auto-snaps, Wan keyframe fallbacks, deprecation notices, rate-limits, etc.) and surfaces them in **both** success and failure responses. A successful run with warnings looks like:

```json
{
  "ok": true,
  "message": "ran QA on episode 1 (with 2 warnings — see warnings[])",
  "command": "venice-video qa-storyboard -p ... -e 1 --model ...",
  "warnings": [
    "silent rejection detected, retry 1/3",
    "x-venice-model-deprecation-warning: model X retires 2026-09-01"
  ],
  "stderrTail": "...up to 15 lines of stderr...",
  "durationMs": 8742
}
```

**When `warnings[]` is non-empty, treat `ok: true` with caution.** Read the warnings before reporting success to the user. Common patterns and what to do about them are in `venice-mcp-troubleshooting` (Production anti-patterns A1–A27 and the failure-mode list).

A failed call looks like:
```json
{
  "ok": false,
  "message": "harness command failed (exit 1)",
  "command": "venice-video storyboard-episode -p ... -e 1 ...",
  "code": 1,
  "stdoutTail": "...last 30 lines of stdout...",
  "stderrTail": "...last 30 lines of stderr...",
  "warnings": ["...detected warning lines, if any..."]
}
```

Read `stderrTail` first --- the harness writes structured errors there. `warnings[]` is the quick-skim view of what the harness already flagged in-band.
