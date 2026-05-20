---
name: venice-mcp-pipeline
description: Use when the user asks the agent to drive the venice-video-mcp server end-to-end --- creating a series, adding characters, workshopping an episode, generating videos, or producing a final cut. Maps natural-language requests to the right sequence of MCP tool calls.
---

# venice-mcp-pipeline

This skill is the workflow brain for the **venice-video-mcp** server. It tells you which of the six tools to call, in what order, for the most common requests.

## STEP 0 — Upfront questionnaire (ask BEFORE `series.new`)

A 30-second conversation at series-creation time eliminates an entire class of expensive bugs. **Always ask these two questions before calling `series.new`**, unless the user has already volunteered the answers. Persist them via the new `audioStrategy` and `videoFamilyPreference` fields on `series.new`.

### Question 1 — How does dialogue reach the final mix?

Ask the user:

> "How will characters talk in this episode?
>   - **(a) Native voices** — let the video model speak the lines on-camera. Best when characters speak only once or twice each.
>   - **(b) Lip-sync** — render the dialogue with Venice TTS, then lip-sync each character's mouth to the audio (Wan 2.7). Best when a character speaks many times so a single voice persists across the episode, or when you need accent / language control.
>   - **(c) Narrator voice-over** — a single narrator speaks over the visuals; no character mouths move. (Nature documentaries, mock-Audubon, true-crime-style)."

Map their answer to `series.new audioStrategy`:
- (a) → `audioStrategy: 'native'`
- (b) → `audioStrategy: 'lip-sync'`
- (c) → `audioStrategy: 'narrator-vo'`

What this controls automatically:
- `'native'` keeps `assemble.assemble dialogueReplace: false` and lets Seedance speak.
- `'lip-sync'` flips `assemble.assemble dialogueReplace` default to `true` (Venice TTS) and routes face-visible low/medium-motion dialogue shots through Wan 2.7 for actual lip-sync. Character `voiceDesc` becomes the TTS voice spec, not just a hint to Seedance.
- `'narrator-vo'` sets `audioMix.suppressModelNarration: true` so Seedance is queued with `audio: false` on every dialogue shot (no competing AI narrator); flips `dialogueReplace` default to `true` and `nativeVolume` default to `0`. This is the configuration that would have prevented every double-narration version of the PNW field-guide.

### Question 2 — Which video model family?

Ask the user:

> "Which video model family fits the look you want?
>   - **(a) Seedance 2.0** (default) — strong R2V identity anchoring, 4-15s native durations, mature audio generation, photoreal-leaning. The `seedance-2-0-fast-*` variants are cheaper / quicker for the same family.
>   - **(b) HappyHorse 1.0** — strong R2V like Seedance, but livelier hand-camera realism and more cinematic grain. Good for documentary / vérité aesthetics.
>   - **(c) Grok Imagine** — atmosphere-rich, in-family R2V (added 2026-05). R2V durations are stepped at 5s / 8s / 10s only; the duration preflight will catch any shot scripted outside that ladder.
>   - **(d) Kling O3** — best for stylized, illustrated, anime, or non-photoreal aesthetics. Accepts non-seedream input images.
>   - **(?) Not sure** — pick `auto` and decide later."

Map their answer to `series.new videoFamilyPreference`:
- (a) → `'seedance'` (or omit / `'auto'`)
- (b) → `'happyhorse'`
- (c) → `'grok-imagine'`
- (d) → `'kling-o3'`
- (?) → `'auto'`

This swaps the series's default `actionModel` / `atmosphereModel` / `characterConsistencyModel`. `lipSyncModel` stays on Wan 2.7 regardless — it's the only Venice model with proper lip-sync today, so the answer to Q1 still works.

**Other families in the registry** that the questionnaire intentionally doesn't expose (override via direct edit of `series.json videoDefaults` if needed):

- `runway-gen4-5` / `runway-gen4-turbo` / `runway-gen4-aleph` — Runway Gen-4.5 family. Strong motion physics, 7 aspect ratios, but silent (no audio, not configurable) and no R2V. Pick for music videos / atmosphere reels where dialogue isn't a factor.
- `davinci-magihuman-image-to-video` — talking-head specialist, 5-30s lip-sync via `audio_url`. Longer max duration than Wan 2.7 (30s vs 15s), but 16:9 only. Consider as an alternative `lipSyncModel` for documentary / interview formats.
- `sora-2-pro-image-to-video` — now 20s + `true_1080p` (refreshed 2026-05). Pick when delivery quality matters more than R2V identity locking (Sora has no R2V).
- `pixverse-c1-*` — new PixVerse C1 line. Replaces v5.6 for new projects: same four resolutions but 15s ladder + new R2V variant.
- `kling-v3-4k-*` — 4K variants of the Kling V3 family.
- `wan-2-7-spicy-image-to-video` — uncensored Wan 2.7 i2v variant.
- `wan-2.6-reference-to-video` — Wan 2.6 R2V (10s max), accepts `audio_url` input.

### Question 3 (optional, only when uncertain) — Aspect ratio

If the user hasn't told you the platform / aspect ratio, ask whether the episode is **16:9 (widescreen / YouTube / cinema)**, **9:16 (TikTok / Reels / Shorts)**, or **1:1 (Instagram feed)**. Persist via `series.set_aesthetic` (set `storyboardAspectRatio` in `series.json` separately). The harness defaults to 9:16 if nothing is set, which is wrong for most narrative work.

### When to skip the questionnaire

- The user has already specified both answers in the same message.
- The user is iterating on an existing series and explicitly says "use the existing config".
- The user opts out ("just pick reasonable defaults"). In that case use `audioStrategy: 'native'` and `videoFamilyPreference: 'auto'` — and **say** that's what you're doing.

If the user only answers one of the two, ask the other before proceeding. Don't guess.

## The 6 tools (always-loaded surface)

| Tool | Actions | Long-running? |
|---|---|---|
| `series` | `new`, `list`, `set_aesthetic`, `explore_aesthetic` | no |
| `character` | `add`, `audition_voices`, `lock` | sometimes (image gen) |
| `episode` | `new`, `workshop`, `approve`, `storyboard`, `qa`, `qa_approve`, `fix_panel`, `insert_shot` | sometimes (storyboard, qa) |
| `media` | `generate_videos`, `override_audio`, `generate_music`, `generate_ambient`, `validate` | **yes** |
| `assemble` | `assemble`, `produce`, `mix_audio`, `edit_transcribe`, `edit_render`, `edit_timeline`, `export_timeline` | **yes** (except `export_timeline`, which is cheap XML write) |
| `inspect` | `list`, `series`, `episode`, `shot`, `models`, `voices` | no |

For full per-action argument shapes see the **venice-mcp-cookbook** skill.
For failures, gotchas, and anti-patterns see **venice-mcp-troubleshooting**.

## What the underlying harness now does for you (v2.1.x)

Several behaviours the MCP relied on the agent to orchestrate are now automatic inside the harness. You don't have to script them — but you should know they're running so you can interpret stdout:

- **Seedance scene-level multi-shot.** When adjacent shots share the same characters and location, the harness now plans them as a single Seedance multi-shot generation by default. You won't see "shot 5 of 12" — you'll see "unit 3 of 8 (covers shots 5-6)". This is fine; identity stays anchored across the unit.
- **Motion-classified video routing.** Each shot's `motion` field (`low | medium | high`) drives the planner. Low/medium-motion dialogue shots with a visible face route to `wan-2-7-image-to-video` for lip-sync; high-motion or face-occluded shots stay on the R2V model. `episode.insert_shot` lets you set `motion` directly. To change motion on an existing shot, edit `script.json`. **Automatic identity lock (harness ≥ 2.2.0):** Wan 2.7 i2v has no `reference_image_urls`, so its single keyframe is its only identity anchor. `media.generate_videos` now auto-renders a Seedance R2V identity-lock pass first, extracts frame 1, and uses it as the Wan 2.7 keyframe + the dialogue MP3 (auto-TTS-generated if missing) as `audio_url`. ~$0.85/shot for matching shots, reported in the start-of-run summary. See troubleshooting **A27** for opt-out levers (`videoDefaults.seedanceKeyframeForWan: false` series-wide, `disableSeedanceKeyframe: true` per shot).
- **Per-act music cues with crossfade.** If the episode script has a `musicCues[]` array (manually authored or via `episode.workshop` for series that opt in), `assemble.assemble` / `produce` will render and crossfade them automatically. The single-bed `media.generate_music` path still works — when both exist, the cues win.
- **LUFS audio mix.** The assembler now runs a final-pass to -16 LUFS integrated / -1 dBTP true peak by default. SFX clips are trimmed to ≤2s with a 0.3s fade-out. Episode-level overrides go in `script.audioMix`.
- **Wan 2.7 audio pre-flight.** When a shot's `audioUrl` is shorter than 3 seconds, the harness pads it to 3s automatically (Wan 2.7 returns 400 otherwise). You'll see a "padded audio_url N.NNs -> 3.00s" line in stdout.
- **Silent-rejection guard.** Every Venice response is checked for the "no output produced" pattern that occasionally slips past a 200 OK. The harness retries up to 3 times and surfaces a structured error instead of returning a zero-byte file.

## Shot duration strategy — prefer 15s, stitch fewer long clips

**Default to 15-second shots.** Seedance 2.0 and HappyHorse 1.0 both accept any integer 3–15s natively, and 15s is the maximum. Wan 2.7 also generates at long durations. For a 30-second beat, **2x15s beats 5x6s**, and it's not even close:

- **Identity stays locked longer.** Each new shot is a fresh R2V/i2v generation; the more transitions, the more places character likeness can drift.
- **Cost is lower.** Per-shot Venice billing is a fixed setup plus a per-second component; fewer shots = lower total.
- **Motion has room to breathe.** Many of the "AI video looks twitchy" tells come from cutting before a gesture/expression has time to complete.
- **Fewer panel renders.** Every shot needs a storyboard panel; halving shot count halves the storyboard cost too.
- **Fewer transitions to hand-edit.** A 5-shot version has 4 cut points to police for continuity; a 2-shot version has 1.

Only drop below 15s for **deliberate** short beats: a hard cut, a 1-second sight gag, a reaction stinger. Default everything else to 15s.

When you call `episode.workshop`, include this guidance in the `concept` (the harness's script LLM defaults to short shots otherwise). When you call `episode.insert_shot`, **omit `duration` to take the new 15s default** rather than passing a smaller value out of habit.

You can verify after the fact via `inspect.episode` (returns `shotCount`) and by reading `script.json` — if a 30s episode has 5+ shots, the workshop produced too many beats.

## Voice strategy — native dialogue, post-production music & SFX

Venice's TTS voices (Kokoro, Qwen3) are usable but limited in range and emotion. Until Venice ships better voice options, the recommended pipeline is:

1. **Let the video gen model speak the dialogue.** Seedance 2.0, Wan 2.7, and HappyHorse 1.0 all generate in-character audio when the panel prompt includes a detailed voice/delivery description. Quality is highly prompt-dependent; spec it precisely (timbre, accent, pacing, emotional register, idiolect, breath placement).
2. **Suppress the model from adding music or SFX.** Include negatives like "no background music, no sound effects, no soundtrack, dry recording" in every dialogue shot's prompt. The harness adds music (`musicCues[]` or `media.generate_music`) and ambient/SFX (`media.generate_ambient`, `assemble.mix_audio`) in post.
3. **Keep `dialogueReplace: false` on `assemble.assemble`.** This is the default. The native dialogue track plays at full volume (`nativeVolume` resolves to 1.0), with music and ambient mixed underneath.
4. **Use `media.override_audio { dialogue: true }` only as a deliberate corrective** — accent control, language swap, NARRATOR voice-over, or when the model botched a specific take. Default to NOT replacing dialogue.

### Narrator / voice-over episodes (`dialogueReplace: true` paths)

Documentary-style episodes with a NARRATOR character driving most shots are the main exception. For these:

- Harness ≥ 2.3.0 auto-passes `audio: false` to Seedance for every shot whose dialogue character is `NARRATOR` (or whenever `script.audioMix.suppressModelNarration: true` is set). Seedance i2v aggressively generates a competing English narrator whenever the prompt mentions `narrator` / `documentary` / `naturalist`; this stops it from happening at the source.
- Run `media.override_audio { dialogue: true }` to render Venice TTS for every shot's dialogue line, then `assemble.assemble { dialogueReplace: true }`. `nativeVolume` resolves to 0 automatically — no need to pass it.
- For shots that DO have real ambient audio worth preserving (paper rustle, room tone, faint rain, foley) while the narrator's voice is muted everywhere else: set `shot.nativeAudio: 'keep'` on those shots in `script.json` to override the global mute. `'duck'` keeps the ambient at 20%; `'mute'` is the default for NARRATOR shots and is explicit-equivalent to the auto behaviour.

What this means for `character.add`: the `voiceDesc` field is now the primary lever for dialogue quality. Spec it like you're directing a voice actor — see the cookbook's `character.add` example. The Venice voice you `character.lock` is the fallback for Venice TTS only; it doesn't affect the native model dialogue.

What this means for `episode.workshop`: instruct the script LLM to include per-shot voice direction in dialogue beats (delivery, subtext, energy) AND to add the no-music/no-SFX negative to every shot prompt.

## Reading harness output — warnings surface even on success

The MCP's `fromHarness` wrapper now extracts known warning patterns from harness stdout/stderr and surfaces them in the response — even when the harness exited 0. When a tool returns `ok: true` but `warnings: [...]` is non-empty, **read the warnings before assuming the output is clean**. Common ones:

- `silent rejection detected, retry N/3` — Venice returned 200 OK with no actual output; the harness retried. If you see the final retry succeed, the output is real; if you see `silent rejection persisted after 3 retries`, the upstream model is degraded.
- `duration auto-snapped` — the requested shot duration wasn't in the model's allowed set and was rounded. With the new 15s default this should stop happening, but if it does, the script has a stale duration.
- `padded audio_url N.NNs -> 3.00s` — Wan 2.7 audio pre-flight padded a sub-3s dialogue clip.
- `falling back to panel-anchored single-pass render` — Wan 2.7 keyframe pipeline (rule A27) failed and fell back. Identity may drift on that shot; consider `disableSeedanceKeyframe: false` + retry, or accept the drift.
- `deprecation` / `x-venice-model-deprecation-warning` — Venice flagged a deprecated model; migrate before the sunset date.

A successful run with warnings reads like: `"<original message> (with N warnings — see warnings[])"`. The response also includes a short `stderrTail` so you have context.

## Mental model

The MCP shells out to the Venice Video Harness CLI. State lives on the local filesystem under the workspace's `output/<series-slug>/` directory. You're orchestrating a multi-stage creative pipeline:

```mermaid
flowchart LR
    A[series.new] --> B[series.set_aesthetic]
    B --> C[character.add]
    C --> D[character.audition_voices]
    D --> E[character.lock]
    E --> F[episode.new]
    F --> G[episode.workshop]
    G --> H[episode.approve]
    H --> I[episode.storyboard]
    I --> J[episode.qa]
    J -->|good| K[episode.qa_approve]
    J -->|bad shot| L[episode.fix_panel]
    L --> J
    K --> M[media.generate_videos]
    M --> N[media.generate_music]
    N --> O[assemble.assemble]
    O --> P[final mp4]
```

`assemble.produce` is a one-shot path that runs `media.generate_videos` -> `media.generate_music` -> `assemble.assemble` in sequence. Use `produce` only when the user explicitly says "do everything," and never before QA approval.

## Recipes

### Recipe 1: New series from scratch
The user says: "Make a new series about X."

1. `series.new { name, concept, genre?, setting? }` --- creates the series directory.
2. `series.set_aesthetic { project, style, palette, lighting, lens?, film? }` --- locks the visual rule. Required before any image generation.
3. (Optional) `series.explore_aesthetic { project, count: 5 }` --- only if the user is undecided about aesthetic direction.

Stop here. Confirm with the user before adding characters.

### Recipe 2: Add and lock a character
The user says: "Add character Vivienne to the series."

1. `character.add { project, name, gender, age?, description?, wardrobe?, voiceDesc?, baseTraits?, skipImages? }`
   - This generates 4-angle reference images by default (front, profile, three-quarter, full-body).
   - For non-human characters set `baseTraits` (see venice-mcp-cookbook example).
2. `character.audition_voices { project, character, count: 5, sampleText? }` --- generates Venice TTS samples.
3. After the user picks a voice: `character.lock { project, character, voiceId, voiceName? }`.

A character must be added AND locked before generating an episode that uses them.

### Recipe 3: Workshop, storyboard, QA, generate
The user says: "Make episode 3 about Y."

1. `episode.new { project, title }` --- scaffolds the episode dir + empty script.json.
2. `episode.workshop { project, episode, concept, model? }` --- LLM-drafts a shot-by-shot script.
3. Stop and let the user review/edit `script.json` directly. Then:
4. `episode.approve { project, episode, notes? }`.
5. `episode.storyboard { project, episode, refine: true, editModel?, force? }` --- generates panels (slow, supports progress notifications).
6. `episode.qa { project, episode, model?, shots? }` --- vision-based consistency check.
7. For each flagged shot: `episode.fix_panel { project, episode, shot, characters?, prompt? }`. Re-run QA after.
8. `episode.qa_approve { project, episode, notes? }`.
9. `media.generate_videos { project, episode }` --- LONG. Stream progress.
10. (Optional) `media.generate_music { project, episode, prompt?, duration? }` --- only needed if the script has no `musicCues[]`; per-act cues render automatically during assembly.
11. `assemble.assemble { project, episode, ... }` --- final mp4 with subtitles + music + ambient bed, mixed to -16 LUFS.

If the user said "just produce it from approved script" jump from step 8 to `assemble.produce` instead of running 9-11 separately.

### Recipe 3b: Add a beat to an already-rendered episode
The user says: "Insert a reaction shot after shot 5 of episode 3."

1. `episode.insert_shot { project, episode, after: "5", description, shotType?, duration?, motion?, characters?, dialogue?, speaker?, transition? }` --- assigns a suffix id like `5b` so existing shot numbers (and their already-rendered panels/clips) stay stable.
2. `episode.storyboard { project, episode, force: false }` --- only the new shot's panel is generated; existing panels are left in place.
3. `episode.qa { project, episode, shots: "5b" }` then `episode.qa_approve` after fixes.
4. `media.generate_videos { project, episode }` --- generates the missing clip only; existing clips are kept.
5. `assemble.assemble { project, episode, ... }` --- re-stitches with the new shot in place.

### Recipe 4: Generate ambient beds + run the script-aware mixer
The user says: "Add a rain bed to episode 2 and re-mix it." or "Mix this episode with ambient layering instead of the basic assembler."

Ambient beds and the script-aware mixer are an alternative to the plain `assemble.assemble` path:

1. Confirm via `inspect.episode { project, episode }` that the episode is QA-approved and `media.generate_videos` has produced clips. Inspect also reports the `ambientLayers[]` already on disk.
2. For each layer you want, call `media.generate_ambient { project, episode, layer, prompt, duration? }`. Pick `layer` from `rain-heavy | rain | crowd | quiet-night`; the filename / discovery layer is fixed to those four.
3. (Optional) `media.generate_music { project, episode, prompt?, duration? }` — or rely on `script.musicCues[]` if defined.
4. `assemble.mix_audio { project, episode }` — script-aware per-shot mix. Writes `episode-NNN-final-nosubs.mp4` then burns subtitles to `episode-NNN-final.mp4` if `subtitles.srt` exists. This **replaces** `assemble.assemble` for the episode (same output filename).

Use `assemble.assemble` for the simple, deterministic path; use `assemble.mix_audio` when you've authored ambient beds and want the harness to vary the mix per shot (e.g. dialogue shots get less ambient, action shots get more, fades at scene boundaries).

### Recipe 5: Hand off to a non-linear editor (FCP X / Premiere / DaVinci)
The user says: "Open episode 2 in [Resolve | Premiere | Final Cut]."

After `media.generate_videos` has produced clips:

1. `assemble.export_timeline { project, episode, format: 'fcpxml' | 'premiere' | 'davinci', fps?, width?, height? }`
2. Tell the user the output path. The extension makes the target editor unambiguous:
   - `fcpxml`   → `episode-NNN.fcpxml`         (Final Cut Pro X — File ▸ Import ▸ XML…)
   - `premiere` → `episode-NNN.premiere.xml`   (Premiere Pro — File ▸ Import…)
   - `davinci`  → `episode-NNN.resolve.fcpxml` (DaVinci Resolve — File ▸ Import ▸ Timeline…)
3. You can export multiple formats from the same episode — they coexist on disk because of the format-specific extensions.

### Recipe 4: Edit existing footage (no Venice generation)
The user says: "Cut down this footage / trim filler words / re-cut this episode."

This path does NOT use the harness's series/episode model. It operates on raw media files.

1. `assemble.edit_transcribe { dir, out, model?, language?, alignedFrom? }` --- writes `takes_packed.md` (text transcript, the primary editing surface) and per-source `*.words.json` files.
2. **READ the takes_packed.md and propose a cut strategy in plain text. STOP and wait for user confirmation.** Never render without approval (anti-pattern A15 in troubleshooting).
3. The actual EDL build + ffmpeg cut is outside the MCP surface today --- the agent invokes the harness's editing library directly via tsx (see `.claude/commands/edit-footage.md` in the harness for the playbook).
4. After the cut lands: `assemble.edit_render { manifest, font?, skipArchive?, dryRun? }` --- composites overlays from a manifest JSON.
5. `assemble.edit_timeline { video, start, end, out, ... }` --- generates a single PNG (filmstrip + waveform + word labels) for visual decisions during cut review.

**Read .claude/skills/video-editing/SKILL.md and .claude/commands/edit-footage.md from the harness repo before driving an edit.** They define the EDL format, the ask-confirm-execute-self-eval loop, and the filler-word handling rules.

## State discovery

When you need to know what exists before acting, use `inspect`:
- `inspect { action: 'list' }` --- enumerate all series in the workspace
- `inspect { action: 'series', project }` --- read series.json (aesthetic, characters, episode list, `videoDefaults` incl. `lipSyncModel` / `seedanceCompatibility` / `imageDefaults`, `storyboardAspectRatio`)
- `inspect { action: 'episode', project, episode }` --- script versions, approval state, final video path, shot count, `musicCueCount`, `audioMix` flag, `ambientLayers[]` (rain-heavy / rain / crowd / quiet-night on disk), `hasMusic`, `timelineExports[]` (FCPXML/Premiere/DaVinci files on disk)
- `inspect { action: 'shot', project, episode, shot }` --- list shot-NNN.* files
- `inspect { action: 'models', category? }` --- model registry from the harness (includes the v2.1 additions: Wan 2.7, Kling O3 4K, HappyHorse 1.0, GPT Image 2)
- `inspect { action: 'voices', provider? }` --- TTS voice catalog

`inspect` is cheap (no spawn). Call it freely before mutating tools.

## Long-running operations and progress

`media.generate_videos`, `media.generate_music`, `assemble.assemble`, `assemble.produce`, and `assemble.edit_render` can take many minutes. The MCP server emits `notifications/progress` for each. If you set a `progressToken` in the request `_meta`, you'll receive unit/shot N-of-M, ffmpeg time codes, and queue/poll status updates.

Heads-up on stdout patterns the harness emits in v2.1.x that you should NOT mistake for failures:

- `unit X of Y (covers shots A-B)` — scene-level multi-shot generation; one Venice call covers multiple consecutive shots.
- `padded audio_url N.NNs -> 3.00s` — Wan 2.7 audio pre-flight padded a short clip.
- `routing shot N to wan-2-7-image-to-video` — motion classifier picked the lip-sync model for that shot.
- `LUFS final pass: integrated -X.X / true-peak -Y.Y` — assembler is normalising to -16 LUFS.

Don't poll `inspect` during a long-running call --- you already get progress notifications.

## When to use `produce` vs explicit steps

Prefer explicit steps unless the user is in "just do it all" mode. Explicit gives you:
- A QA gate before video generation (which is the most expensive step).
- The chance to override audio (`media.override_audio { dialogue: true }`) for character voice consistency.
- Per-step progress that you can summarize for the user.

Use `assemble.produce { withTts?, skipMusic? }` only when:
- The script is already approved.
- The QA pass has already happened (or the user explicitly says "skip QA").
- The user is fine with all defaults.

## Conventions you must follow

1. **Always confirm before destructive operations.** `episode.storyboard --force` regenerates ALL panels. `episode.fix_panel` versions the prior panel automatically (archive-first --- never just overwrites).
2. **Never group shots with different characters** into multi-shot units. The harness handles this internally; if you ever bypass it, you'll lose R2V identity anchoring. (See troubleshooting A1.)
3. **Set the workspace explicitly** if your project lives outside the cwd. The MCP resolves `project: "the-audacity"` against `$HARNESS_WORKSPACE/output/the-audacity/` first.
4. **Never auto-trim filler words without confirmation** in edits. (See troubleshooting A16.)
5. **Read the cookbook** for exact arg names. The flat input schemas use action-keyed optional fields, so the cookbook examples are the source of truth for which fields belong to which action.
