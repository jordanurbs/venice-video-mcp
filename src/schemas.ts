import { z } from 'zod';

const Project = z.string().min(1).describe('Series slug or absolute path to a series output directory');
const toNumber = (value: unknown): unknown => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return value;
};
const coercePositiveInt = (opts: { min?: number; max?: number } = {}) => {
  let schema = z.number().int().positive().finite();
  if (opts.min !== undefined) schema = schema.min(opts.min);
  if (opts.max !== undefined) schema = schema.max(opts.max);
  return z.preprocess(toNumber, schema);
};
const coerceFiniteNumber = (opts: { min?: number; max?: number } = {}) => {
  let schema = z.number().finite();
  if (opts.min !== undefined) schema = schema.min(opts.min);
  if (opts.max !== undefined) schema = schema.max(opts.max);
  return z.preprocess(toNumber, schema);
};
const Episode = coercePositiveInt().describe('Episode number (1-based)');
const Shot = coercePositiveInt().describe('Shot number (1-based)');

export const SeriesNew = z.object({
  action: z.literal('new'),
  name: z.string().min(1),
  concept: z.string().min(1),
  genre: z.string().default('drama'),
  setting: z.string().default(''),
  // ── Upfront questionnaire (W3 / production-audit follow-up) ──
  // Ask the operator BEFORE calling series.new. The two answers persist on
  // the series and steer model selection + audio routing for the whole
  // series, eliminating the double-narration / lip-sync-mismatch / wrong-
  // family classes of bugs we hit producing the PNW field-guide.
  // The pipeline skill enforces the ask-first contract.
  audioStrategy: z.enum(['native', 'lip-sync', 'narrator-vo']).optional().describe(
    'How dialogue reaches the final mix. Ask BEFORE calling series.new. ' +
    '"native" — the video model speaks dialogue in-frame (default; best when characters speak only once or twice; assemble-episode keeps dialogueReplace=false). ' +
    '"lip-sync" — Venice TTS renders each line, Wan 2.7 i2v lip-syncs the mouth (best when a character speaks many times so a single voice persists; assemble-episode defaults dialogueReplace=true). ' +
    '"narrator-vo" — the speaker is a NARRATOR / voice-over only, no on-camera mouth movement (auto-sets audioMix.suppressModelNarration=true; assemble-episode defaults dialogueReplace=true and nativeVolume=0 so a competing AI narrator can\'t fight the TTS).',
  ),
  videoFamilyPreference: z.enum(['auto', 'seedance', 'happyhorse', 'grok-imagine', 'kling-o3']).optional().describe(
    'Preferred video model family for action/atmosphere/character shots. Ask BEFORE calling series.new. ' +
    'Swaps actionModel/atmosphereModel/characterConsistencyModel; lipSyncModel stays on Wan 2.7 regardless. ' +
    '"auto" (default) — Seedance 2.0 across the board. ' +
    '"seedance" — explicit Seedance 2.0 (same as auto, but persisted). ' +
    '"happyhorse" — HappyHorse 1.0 for livelier hand-camera realism / cinematic grain. ' +
    '"grok-imagine" — Grok Imagine i2v (no R2V variant; character consistency falls back to Kling O3 R2V — pick when atmosphere matters more than precise identity locks). ' +
    '"kling-o3" — Kling O3 Standard for stylized / illustrated aesthetics.',
  ),
}).strict();

export const SeriesList = z.object({
  action: z.literal('list'),
}).strict();

export const SeriesSetAesthetic = z.object({
  action: z.literal('set_aesthetic'),
  project: Project,
  style: z.string().min(1),
  palette: z.string().min(1),
  lighting: z.string().min(1),
  lens: z.string().default('cinematic depth of field'),
  film: z.string().default('digital illustration'),
}).strict();

export const SeriesExploreAesthetic = z.object({
  action: z.literal('explore_aesthetic'),
  project: Project,
  count: coercePositiveInt({ min: 1, max: 7 }).default(5),
}).strict();

export const SeriesInput = z.discriminatedUnion('action', [
  SeriesNew,
  SeriesList,
  SeriesSetAesthetic,
  SeriesExploreAesthetic,
]);

export const CharacterAdd = z.object({
  action: z.literal('add'),
  project: Project,
  name: z.string().min(1),
  gender: z.enum(['male', 'female', 'other']),
  age: z.string().default('mid 20s'),
  description: z.string().optional(),
  wardrobe: z.string().default('stylish contextual attire'),
  voiceDesc: z.string().optional(),
  baseTraits: z.string().optional(),
  skipImages: z.boolean().default(false),
}).strict();

export const CharacterAuditionVoices = z.object({
  action: z.literal('audition_voices'),
  project: Project,
  character: z.string().min(1),
  sampleText: z.string().optional(),
  count: coercePositiveInt({ min: 1, max: 10 }).default(5),
}).strict();

export const CharacterLock = z.object({
  action: z.literal('lock'),
  project: Project,
  character: z.string().min(1),
  voiceId: z.string().min(1),
  voiceName: z.string().optional(),
}).strict();

export const CharacterInput = z.discriminatedUnion('action', [
  CharacterAdd,
  CharacterAuditionVoices,
  CharacterLock,
]);

export const EpisodeNew = z.object({
  action: z.literal('new'),
  project: Project,
  title: z.string().min(1),
}).strict();

export const EpisodeWorkshop = z.object({
  action: z.literal('workshop'),
  project: Project,
  episode: Episode,
  concept: z.string().min(1),
  model: z.string().default('llama-3.3-70b'),
}).strict();

export const EpisodeApprove = z.object({
  action: z.literal('approve'),
  project: Project,
  episode: Episode,
  notes: z.string().optional(),
}).strict();

export const EpisodeStoryboard = z.object({
  action: z.literal('storyboard'),
  project: Project,
  episode: Episode,
  refine: z.boolean().default(true),
  editModel: z.string().default('seedream-v5-lite-edit'),
  cfgScale: coerceFiniteNumber({ min: 1, max: 10 }).optional(),
  debug: z.boolean().default(false),
  skipApproval: z.boolean().default(false),
  force: z.boolean().default(false),
}).strict();

export const EpisodeQa = z.object({
  action: z.literal('qa'),
  project: Project,
  episode: Episode,
  model: z.string().default('qwen3-6-27b'),
  shots: z.string().optional(),
}).strict();

export const EpisodeQaApprove = z.object({
  action: z.literal('qa_approve'),
  project: Project,
  episode: Episode,
  notes: z.string().optional(),
}).strict();

export const EpisodeFixPanel = z.object({
  action: z.literal('fix_panel'),
  project: Project,
  episode: Episode,
  shot: Shot,
  characters: z.string().optional().describe('Comma-separated character names'),
  editModel: z.string().default('seedream-v5-lite-edit'),
  prompt: z.string().optional(),
}).strict();

export const EpisodeInsertShot = z.object({
  action: z.literal('insert_shot'),
  project: Project,
  episode: Episode,
  after: z.string().min(1).describe('Shot id to insert after; number ("5") or suffixed string ("5b")'),
  description: z.string().min(1).describe('Description of the new shot (drives panel + video prompt)'),
  shotType: z.string().default('action').describe('Shot type, default "action"'),
  duration: z.string().default('15s').describe('Shot duration, e.g. "15s". DEFAULT IS 15s — the longest natively-supported length on Seedance 2.0 (4-15s) and HappyHorse 1.0 (3-15s). Prefer 15s and stitch fewer long clips together (2x15s for a 30s beat) over many short clips: identity stays locked longer, transitions are fewer, cost is lower, and motion has room to breathe. Only drop below 15s for genuine quick beats (sight gag, hard cut, deliberate stinger).'),
  motion: z.enum(['low', 'medium', 'high']).default('medium'),
  characters: z.string().optional().describe('Comma-separated character names'),
  dialogue: z.string().optional().describe('Dialogue line; omit for action/insert shots. Native model audio is preferred for dialogue (the assembler\'s `dialogueReplace` default is `false`). Don\'t pass dialogue here unless the shot actually has spoken lines.'),
  speaker: z.string().optional().describe('Dialogue speaker name (required if dialogue is set)'),
  transition: z.string().default('CUT').describe('Transition into the next shot'),
}).strict();

export const EpisodeInput = z.discriminatedUnion('action', [
  EpisodeNew,
  EpisodeWorkshop,
  EpisodeApprove,
  EpisodeStoryboard,
  EpisodeQa,
  EpisodeQaApprove,
  EpisodeFixPanel,
  EpisodeInsertShot,
]);

export const MediaGenerateVideos = z.object({
  action: z.literal('generate_videos'),
  project: Project,
  episode: Episode,
  skipQa: z.boolean().default(false),
}).strict();

export const MediaOverrideAudio = z.object({
  action: z.literal('override_audio'),
  project: Project,
  episode: Episode,
  dialogue: z.boolean().default(false),
  sfx: z.boolean().default(false),
}).strict();

export const MediaGenerateMusic = z.object({
  action: z.literal('generate_music'),
  project: Project,
  episode: Episode,
  prompt: z.string().optional(),
  duration: coercePositiveInt({ min: 1, max: 600 }).default(60),
}).strict();

export const MediaValidate = z.object({
  action: z.literal('validate'),
  project: Project,
  episode: Episode,
  videoOutputs: z.boolean().default(false).describe('Run validate-video-outputs instead of validate-episode'),
}).strict();

export const AMBIENT_LAYERS = ['rain-heavy', 'rain', 'crowd', 'quiet-night'] as const;

export const MediaGenerateAmbient = z.object({
  action: z.literal('generate_ambient'),
  project: Project,
  episode: Episode,
  layer: z.enum(AMBIENT_LAYERS).describe(
    'Which ambient slot to fill. Drives the output filename ambient-<layer>.mp3 and matches the four layers the harness assembler recognises.',
  ),
  prompt: z.string().min(1).describe('Sound-effect prompt describing the ambient bed (e.g. "Steady gentle rain on a city street at night, no thunder, no music, continuous ambient loop")'),
  duration: coercePositiveInt({ min: 3, max: 120 }).default(22).describe('Seconds, default 22'),
}).strict();

export const MediaInput = z.discriminatedUnion('action', [
  MediaGenerateVideos,
  MediaOverrideAudio,
  MediaGenerateMusic,
  MediaValidate,
  MediaGenerateAmbient,
]);

export const AssembleAssemble = z.object({
  action: z.literal('assemble'),
  project: Project,
  episode: Episode,
  subtitles: z.boolean().default(true),
  music: z.boolean().default(true),
  ambient: z.boolean().default(true),
  ambientVolume: coerceFiniteNumber({ min: 0, max: 1 }).default(0.3),
  dialogueReplace: z.boolean().default(false),
  // nativeVolume default is intentionally undefined here; the harness CLI
  // resolves the default itself: 0 when dialogueReplace is true (so Venice
  // TTS doesn't fight a competing model-native narrator track), 1.0
  // otherwise. Operators who want to keep a soft ambient bed under the TTS
  // can pass `nativeVolume: 0.2` explicitly. Per-shot script.json
  // shot.nativeAudio ('mute' | 'duck' | 'keep') overrides this. The
  // tool handler enforces "dialogueReplace=true + nativeVolume>0.5"
  // safety check (discriminated unions don't compose with superRefine).
  nativeVolume: coerceFiniteNumber({ min: 0, max: 1 }).optional(),
}).strict();

export const AssembleProduce = z.object({
  action: z.literal('produce'),
  project: Project,
  episode: Episode,
  withTts: z.boolean().default(false),
  skipMusic: z.boolean().default(false),
}).strict();

export const AssembleEditTranscribe = z.object({
  action: z.literal('edit_transcribe'),
  dir: z.string().min(1).describe('Directory of source media files'),
  out: z.string().min(1).describe('Output path for takes_packed.md'),
  model: z.enum(['tiny', 'base', 'small', 'medium', 'large', 'tiny.en', 'base.en', 'small.en', 'medium.en']).default('base.en'),
  language: z.string().default('auto'),
  include: z.string().optional().describe('Comma-separated glob patterns'),
  alignedFrom: z.string().optional().describe('Path to a config file exporting VO_TEXT for aligned mode'),
  speakerMap: z.string().optional(),
  wordsOutDir: z.string().optional(),
  label: z.string().optional(),
}).strict();

export const AssembleEditRender = z.object({
  action: z.literal('edit_render'),
  manifest: z.string().min(1).describe('Overlay manifest JSON path'),
  font: z.string().optional(),
  skipArchive: z.boolean().default(false),
  dryRun: z.boolean().default(false),
}).strict();

export const AssembleEditTimeline = z.object({
  action: z.literal('edit_timeline'),
  video: z.string().min(1),
  out: z.string().min(1),
  start: coerceFiniteNumber({ min: 0 }),
  end: coerceFiniteNumber({ min: 0 }),
  width: coercePositiveInt({ max: 8192 }).default(1600),
  frames: coercePositiveInt({ max: 64 }).default(8),
  silenceDb: coerceFiniteNumber({ min: -100, max: 0 }).default(-30),
  silenceMin: coerceFiniteNumber({ min: 0, max: 10 }).default(0.18),
  wordsJson: z.string().optional(),
}).strict();

export const AssembleExportTimeline = z.object({
  action: z.literal('export_timeline'),
  project: Project,
  episode: Episode,
  format: z.enum(['fcpxml', 'premiere', 'davinci']).default('fcpxml').describe('Editor format: fcpxml (Final Cut Pro X), premiere (xmeml), davinci (DaVinci-tuned FCPXML)'),
  fps: coercePositiveInt({ min: 1, max: 240 }).default(24),
  width: coercePositiveInt({ max: 8192 }).default(1920),
  height: coercePositiveInt({ max: 8192 }).default(1080),
}).strict();

export const AssembleMixAudio = z.object({
  action: z.literal('mix_audio'),
  project: Project,
  episode: Episode,
}).strict();

export const AssembleInput = z.discriminatedUnion('action', [
  AssembleAssemble,
  AssembleProduce,
  AssembleEditTranscribe,
  AssembleEditRender,
  AssembleEditTimeline,
  AssembleExportTimeline,
  AssembleMixAudio,
]);

export const InspectInput = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('series'),
    project: Project,
  }).strict(),
  z.object({
    action: z.literal('episode'),
    project: Project,
    episode: Episode,
  }).strict(),
  z.object({
    action: z.literal('shot'),
    project: Project,
    episode: Episode,
    shot: Shot,
  }).strict(),
  z.object({
    action: z.literal('models'),
    category: z.enum(['video', 'image', 'edit', 'tts', 'music', 'sfx', 'vision', 'all']).default('all'),
    live: z.boolean().default(false).describe('Fetch the live Venice /api/v1/models registry instead of scraping the harness\'s local src/venice/models.ts. Required for `vision` category. Surfaces traits (default_vision, etc.) and any pending deprecation.date so callers can migrate before a model 404s.'),
  }).strict(),
  z.object({
    action: z.literal('voices'),
    provider: z.enum(['kokoro', 'qwen3', 'all']).default('all'),
  }).strict(),
  z.object({
    action: z.literal('list'),
  }).strict(),
]);

export type SeriesInputT = z.infer<typeof SeriesInput>;
export type CharacterInputT = z.infer<typeof CharacterInput>;
export type EpisodeInputT = z.infer<typeof EpisodeInput>;
export type MediaInputT = z.infer<typeof MediaInput>;
export type AssembleInputT = z.infer<typeof AssembleInput>;
export type InspectInputT = z.infer<typeof InspectInput>;

export const SeriesShape = z.object({
  action: z.enum(['new', 'list', 'set_aesthetic', 'explore_aesthetic'])
    .describe('Action: new=create series, list=list all, set_aesthetic=lock aesthetic, explore_aesthetic=generate samples'),
  name: z.string().optional().describe('(new) series name'),
  concept: z.string().optional().describe('(new) series concept/premise'),
  genre: z.string().optional().describe('(new) genre, default "drama"'),
  setting: z.string().optional().describe('(new) general setting description'),
  project: Project.optional().describe('(set_aesthetic, explore_aesthetic) series slug or path'),
  style: z.string().optional().describe('(set_aesthetic) visual style'),
  palette: z.string().optional().describe('(set_aesthetic) color palette'),
  lighting: z.string().optional().describe('(set_aesthetic) lighting approach'),
  lens: z.string().optional().describe('(set_aesthetic) lens characteristics'),
  film: z.string().optional().describe('(set_aesthetic) film stock/texture'),
  count: z.coerce.number().int().min(1).max(7).optional().describe('(explore_aesthetic) number of variants, default 5'),
}).shape;

export const CharacterShape = z.object({
  action: z.enum(['add', 'audition_voices', 'lock'])
    .describe('Action: add=create character, audition_voices=audition Venice voices, lock=lock chosen voice'),
  project: Project.describe('series slug or path'),
  name: z.string().optional().describe('(add) character name'),
  gender: z.enum(['male', 'female', 'other']).optional().describe('(add) gender'),
  age: z.string().optional().describe('(add) age description, default "mid 20s"'),
  description: z.string().optional().describe('(add) physical description'),
  wardrobe: z.string().optional().describe('(add) default wardrobe'),
  voiceDesc: z.string().optional().describe('(add) voice description'),
  baseTraits: z.string().optional().describe('(add) custom base traits override'),
  skipImages: z.boolean().optional().describe('(add) skip reference image generation'),
  character: z.string().optional().describe('(audition_voices, lock) character name'),
  sampleText: z.string().optional().describe('(audition_voices) sample line'),
  count: z.coerce.number().int().min(1).max(10).optional().describe('(audition_voices) candidate count, default 5'),
  voiceId: z.string().optional().describe('(lock) Venice voice ID'),
  voiceName: z.string().optional().describe('(lock) display name'),
}).shape;

export const EpisodeShape = z.object({
  action: z.enum(['new', 'workshop', 'approve', 'storyboard', 'qa', 'qa_approve', 'fix_panel', 'insert_shot'])
    .describe('Action: new, workshop (LLM-generate script), approve, storyboard (generate panels), qa (vision QA), qa_approve, fix_panel (multi-edit refine), insert_shot (add a new shot mid-script)'),
  project: Project.describe('series slug or path'),
  episode: Episode.optional().describe('episode number (required for all actions except new where it is auto-assigned)'),
  title: z.string().optional().describe('(new) episode title'),
  concept: z.string().optional().describe('(workshop) episode concept. Include guidance for the script LLM: prefer FEWER, LONGER shots (target 15s each, which is the native max on Seedance 2.0 and HappyHorse 1.0). For a 30-second episode, 2x15s beats 5x6s — identity stays anchored, costs are lower, and pacing has room to breathe. Also instruct: native dialogue from the video model is preferred over TTS, so include detailed voice/delivery descriptions per dialogue shot; no music or SFX from the video model (the harness adds those in post).'),
  model: z.string().optional().describe('(workshop) chat model, default llama-3.3-70b; (qa) vision model, default qwen3-6-27b. Use `inspect.models { category: "vision", live: true }` to see current vision options and any pending Venice deprecations.'),
  notes: z.string().optional().describe('(approve, qa_approve) approval notes'),
  refine: z.boolean().optional().describe('(storyboard) run multi-edit refinement, default true'),
  editModel: z.string().optional().describe('(storyboard, fix_panel) edit model, default seedream-v5-lite-edit'),
  cfgScale: z.coerce.number().optional().describe('(storyboard) prompt adherence 1-10'),
  debug: z.boolean().optional().describe('(storyboard) save prompt payloads'),
  skipApproval: z.boolean().optional().describe('(storyboard) skip script approval check'),
  force: z.boolean().optional().describe('(storyboard) regenerate all panels'),
  shots: z.string().optional().describe('(qa) shot range like "3-7" or "3,5,7"'),
  shot: Shot.optional().describe('(fix_panel) shot number'),
  characters: z.string().optional().describe('(fix_panel, insert_shot) comma-separated character names'),
  prompt: z.string().optional().describe('(fix_panel) custom edit prompt'),
  after: z.string().optional().describe('(insert_shot) shot id to insert after, number or suffixed string like "5b"'),
  description: z.string().optional().describe('(insert_shot) description of the new shot'),
  shotType: z.string().optional().describe('(insert_shot) shot type, default "action"'),
  duration: z.string().optional().describe('(insert_shot) shot duration, e.g. "15s". DEFAULT IS 15s — Seedance 2.0 / HappyHorse 1.0 both support up to 15s natively. Prefer 15s; stitch 2x15s for a 30s beat instead of 5x6s. Drop below 15s only for deliberate short beats.'),
  motion: z.enum(['low', 'medium', 'high']).optional().describe('(insert_shot) motion intensity, default medium'),
  dialogue: z.string().optional().describe('(insert_shot) dialogue line; omit for action/insert shots'),
  speaker: z.string().optional().describe('(insert_shot) dialogue speaker name; required if dialogue is set'),
  transition: z.string().optional().describe('(insert_shot) transition into the next shot, default "CUT"'),
}).shape;

export const MediaShape = z.object({
  action: z.enum(['generate_videos', 'override_audio', 'generate_music', 'validate', 'generate_ambient'])
    .describe('Action: generate_videos (long-running), override_audio (Venice TTS or SFX), generate_music, validate, generate_ambient (Venice SFX → ambient-<layer>.mp3 in episode audio dir)'),
  project: Project.describe('series slug or path'),
  episode: Episode.describe('episode number'),
  skipQa: z.boolean().optional().describe('(generate_videos) skip QA approval check'),
  dialogue: z.boolean().optional().describe('(override_audio) override dialogue with Venice TTS'),
  sfx: z.boolean().optional().describe('(override_audio) generate SFX overrides'),
  prompt: z.string().optional().describe('(generate_music, generate_ambient) prompt for the model'),
  duration: z.union([z.string(), z.coerce.number()]).optional().describe('(generate_music) seconds (string ok), default 60; (generate_ambient) seconds, default 22'),
  videoOutputs: z.boolean().optional().describe('(validate) run validate-video-outputs instead of validate-episode'),
  layer: z.enum(AMBIENT_LAYERS).optional().describe('(generate_ambient) ambient slot: rain-heavy | rain | crowd | quiet-night'),
}).shape;

export const AssembleShape = z.object({
  action: z.enum(['assemble', 'produce', 'edit_transcribe', 'edit_render', 'edit_timeline', 'export_timeline', 'mix_audio'])
    .describe('Action: assemble (mix audio + burn subs), produce (full pipeline), edit_transcribe, edit_render (overlays), edit_timeline (filmstrip+waveform PNG), export_timeline (XML for FCPX/Premiere/DaVinci), mix_audio (script-aware per-shot ambient mix; overrides assemble for episodes with ambient beds)'),
  project: Project.optional().describe('(assemble, produce, export_timeline) series slug or path'),
  episode: Episode.optional().describe('(assemble, produce, export_timeline) episode number'),
  format: z.enum(['fcpxml', 'premiere', 'davinci']).optional().describe('(export_timeline) editor format, default fcpxml'),
  fps: z.coerce.number().int().positive().optional().describe('(export_timeline) frames per second, default 24'),
  height: z.coerce.number().int().positive().optional().describe('(export_timeline) sequence height, default 1080'),
  subtitles: z.boolean().optional().describe('(assemble) burn-in subtitles, default true'),
  music: z.boolean().optional().describe('(assemble) mix music, default true'),
  ambient: z.boolean().optional().describe('(assemble) mix ambient bed, default true'),
  ambientVolume: z.coerce.number().optional().describe('(assemble) ambient volume 0-1, default 0.3'),
  dialogueReplace: z.boolean().optional().describe('(assemble) Venice dialogue replacement. DEFAULT IS `false` — prefer the video model\'s native dialogue (Seedance / Wan 2.7 / HappyHorse generate in-character speech with the right voiceDesc prompt and a strong character ref). Set to `true` only when the user explicitly wants Venice TTS to replace the native dialogue (e.g. accent control, non-English voice, NARRATOR voice-over). When `true`, `nativeVolume` automatically defaults to 0 so the model-native audio (which may include a competing generated narrator) is fully muted.'),
  nativeVolume: z.coerce.number().optional().describe('(assemble) native audio volume in the final mix. Resolved server-side: when `dialogueReplace: true` the default is 0 (mute the model-native track entirely; Venice TTS owns the dialogue lane); otherwise 1.0. Pass `nativeVolume: 0.2` explicitly to keep a soft ambient bed under the TTS. Per-shot `shot.nativeAudio: \'mute\' | \'duck\' | \'keep\'` in `script.json` overrides this default on individual shots.'),
  withTts: z.boolean().optional().describe('(produce) add Venice TTS replacement'),
  skipMusic: z.boolean().optional().describe('(produce) skip background music'),
  dir: z.string().optional().describe('(edit_transcribe) source media directory'),
  out: z.string().optional().describe('(edit_transcribe, edit_timeline) output path'),
  model: z.enum(['tiny', 'base', 'small', 'medium', 'large', 'tiny.en', 'base.en', 'small.en', 'medium.en']).optional().describe('(edit_transcribe) whisper model, default base.en'),
  language: z.string().optional().describe('(edit_transcribe) language, default auto'),
  include: z.string().optional().describe('(edit_transcribe) glob patterns'),
  alignedFrom: z.string().optional().describe('(edit_transcribe) path to config exporting VO_TEXT'),
  speakerMap: z.string().optional().describe('(edit_transcribe) speaker map JSON path'),
  wordsOutDir: z.string().optional().describe('(edit_transcribe) words.json output dir'),
  label: z.string().optional().describe('(edit_transcribe) source label'),
  manifest: z.string().optional().describe('(edit_render) overlay manifest JSON path'),
  font: z.string().optional().describe('(edit_render) font path'),
  skipArchive: z.boolean().optional().describe('(edit_render) skip archive of existing'),
  dryRun: z.boolean().optional().describe('(edit_render) print ffmpeg command without executing'),
  video: z.string().optional().describe('(edit_timeline) video file'),
  start: z.coerce.number().optional().describe('(edit_timeline) start sec'),
  end: z.coerce.number().optional().describe('(edit_timeline) end sec'),
  width: z.coerce.number().int().positive().optional().describe('(edit_timeline) PNG width, default 1600; (export_timeline) sequence width, default 1920'),
  frames: z.coerce.number().int().positive().optional().describe('(edit_timeline) filmstrip frame count, default 8'),
  silenceDb: z.coerce.number().optional().describe('(edit_timeline) silence dB threshold, default -30'),
  silenceMin: z.coerce.number().optional().describe('(edit_timeline) min silence sec, default 0.18'),
  wordsJson: z.string().optional().describe('(edit_timeline) words.json for word labels'),
}).shape;

export const InspectShape = z.object({
  action: z.enum(['list', 'series', 'episode', 'shot', 'models', 'voices'])
    .describe('Action: list (all series), series (state), episode (status + scripts), shot (files), models (registry), voices (catalog)'),
  project: Project.optional().describe('(series, episode, shot)'),
  episode: Episode.optional().describe('(episode, shot)'),
  shot: Shot.optional().describe('(shot)'),
  category: z.enum(['video', 'image', 'edit', 'tts', 'music', 'sfx', 'vision', 'all']).optional().describe('(models) filter category, default all. `vision` requires `live: true`.'),
  live: z.boolean().optional().describe('(models) fetch Venice /api/v1/models live instead of scraping harness src/venice/models.ts. Required for `vision` category; surfaces traits and pending deprecations.'),
  provider: z.enum(['kokoro', 'qwen3', 'all']).optional().describe('(voices) filter provider, default all'),
}).shape;
