#!/usr/bin/env node
import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  SeriesInput,
  CharacterInput,
  LocationInput,
  EpisodeInput,
  MediaInput,
  AssembleInput,
  InspectInput,
  SeriesShape,
  CharacterShape,
  LocationShape,
  EpisodeShape,
  MediaShape,
  AssembleShape,
  InspectShape,
} from './schemas.js';
import { handleSeries } from './tools/series.js';
import { handleCharacter } from './tools/character.js';
import { handleLocation } from './tools/location.js';
import { handleEpisode } from './tools/episode.js';
import { handleMedia } from './tools/media.js';
import { handleAssemble } from './tools/assemble.js';
import { handleInspect } from './tools/inspect.js';
import { stopLiveServers } from './harness.js';
import { err } from './responses.js';
import type { ProgressCtx } from './progress.js';
import {
  formatNoticeForInstructions,
  formatNoticeOneLine,
  isUpdateCheckDisabled,
  loadCachedNotice,
  runUpdateCheck,
} from './update-check.js';

const BASE_INSTRUCTIONS =
  'venice-video-mcp wraps the venice-video-harness CLI for consistency-first AI video creation. ' +
  'Use the venice-mcp-pipeline skill for natural-language workflows and venice-mcp-cookbook for per-action argument examples.';

const cachedNotice = isUpdateCheckDisabled() ? null : loadCachedNotice();
const cachedInstructions = cachedNotice && cachedNotice.hasUpdates ? formatNoticeForInstructions(cachedNotice) : '';
const initialInstructions = cachedInstructions
  ? `${BASE_INSTRUCTIONS}\n\n${cachedInstructions}`
  : BASE_INSTRUCTIONS;

const server = new McpServer(
  { name: 'venice-video-mcp', version: readPackageVersion() },
  {
    capabilities: {
      tools: {},
      logging: {},
    },
    instructions: initialInstructions,
  },
);

function readPackageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      resolve(here, '..', 'package.json'),
      resolve(here, '..', '..', 'package.json'),
    ];
    for (const candidate of candidates) {
      if (!existsSync(candidate)) continue;
      const pkg = JSON.parse(readFileSync(candidate, 'utf8'));
      if (pkg && pkg.name === 'venice-video-mcp' && typeof pkg.version === 'string') {
        return pkg.version;
      }
    }
  } catch {
  }
  return '0.0.0';
}

const SKILL_HINT = 'See skill venice-mcp-pipeline for usage; venice-mcp-cookbook for examples.';

function progressCtx(extra: any): ProgressCtx {
  return {
    progressToken: extra?._meta?.progressToken,
    send: extra?.sendNotification,
    signal: extra?.signal,
  };
}

server.registerTool(
  'series',
  {
    description: `Manage Venice series state (create / list / set or explore aesthetic). ${SKILL_HINT}`,
    inputSchema: SeriesShape,
  },
  async (args: any) => {
    const parsed = SeriesInput.safeParse(args);
    if (!parsed.success) return err('invalid args for series', { stderrTail: formatZodError(parsed.error) });
    return handleSeries(parsed.data);
  },
);

server.registerTool(
  'character',
  {
    description: `Manage characters in a series (add / audition voices / lock voice). ${SKILL_HINT}`,
    inputSchema: CharacterShape,
  },
  async (args: any) => {
    const parsed = CharacterInput.safeParse(args);
    if (!parsed.success) return err('invalid args for character', { stderrTail: formatZodError(parsed.error) });
    return handleCharacter(parsed.data);
  },
);

server.registerTool(
  'location',
  {
    description: `Manage first-class locations in a series (add / generate_references / list). Locations anchor the environment across storyboard panels and video generations the way characters anchor identity. ${SKILL_HINT}`,
    inputSchema: LocationShape,
  },
  async (args: any) => {
    const parsed = LocationInput.safeParse(args);
    if (!parsed.success) return err('invalid args for location', { stderrTail: formatZodError(parsed.error) });
    return handleLocation(parsed.data);
  },
);

server.registerTool(
  'episode',
  {
    description: `Episode workflow: new / workshop / approve / storyboard / qa / qa_approve / fix_panel / insert_shot. ${SKILL_HINT}`,
    inputSchema: EpisodeShape,
  },
  async (args: any) => {
    const parsed = EpisodeInput.safeParse(args);
    if (!parsed.success) return err('invalid args for episode', { stderrTail: formatZodError(parsed.error) });
    return handleEpisode(parsed.data);
  },
);

server.registerTool(
  'media',
  {
    description: `Generate or override media: videos / dialogue / sfx / music / ambient beds, validate, plus loop (start loop mode — a gate-skipping live browser loop that renders the shot script continuously and hot-swaps fresh takes; returns a URL + pid and keeps running in the background). Long-running; supports progress. ${SKILL_HINT}`,
    inputSchema: MediaShape,
  },
  async (args: any, extra: any) => {
    const parsed = MediaInput.safeParse(args);
    if (!parsed.success) return err('invalid args for media', { stderrTail: formatZodError(parsed.error) });
    return handleMedia(parsed.data, progressCtx(extra));
  },
);

server.registerTool(
  'assemble',
  {
    description: `Final assembly and editing: assemble / produce / mix_audio / edit_transcribe / edit_render / edit_timeline / export_timeline. Long-running; supports progress. ${SKILL_HINT}`,
    inputSchema: AssembleShape,
  },
  async (args: any, extra: any) => {
    const parsed = AssembleInput.safeParse(args);
    if (!parsed.success) return err('invalid args for assemble', { stderrTail: formatZodError(parsed.error) });
    return handleAssemble(parsed.data, progressCtx(extra));
  },
);

server.registerTool(
  'inspect',
  {
    description: `Read-only state inspection (list / series / episode / shot / models / voices). Cheap, no spawn. ${SKILL_HINT}`,
    inputSchema: InspectShape,
  },
  async (args: any) => {
    const parsed = InspectInput.safeParse(args);
    if (!parsed.success) return err('invalid args for inspect', { stderrTail: formatZodError(parsed.error) });
    return handleInspect(parsed.data);
  },
);

function formatZodError(error: any): string {
  if (error?.issues && Array.isArray(error.issues)) {
    return error.issues
      .map((i: any) => `${i.path?.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
  }
  return String(error);
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[venice-video-mcp] connected on stdio\n');
  // Loop mode launches persistent background web servers (see media.loop /
  // harness.launchHarnessServer). Tie their lifecycle to this process so they
  // never outlive the session as orphans on their port.
  process.once('exit', stopLiveServers);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.once(sig, () => { stopLiveServers(); process.exit(0); });
  }
  scheduleUpdateCheck();
}

function scheduleUpdateCheck(): void {
  if (isUpdateCheckDisabled()) {
    process.stderr.write('[venice-video-mcp] update check disabled (VENICE_MCP_UPDATE_CHECK=0)\n');
    return;
  }
  setImmediate(() => {
    runUpdateCheck()
      .then(async (notice) => {
        if (!notice || !notice.hasUpdates) return;
        const oneLine = formatNoticeOneLine(notice);
        if (oneLine) process.stderr.write(`[venice-video-mcp] ${oneLine}\n`);
        try {
          await server.server.sendLoggingMessage({
            level: 'info',
            logger: 'venice-video-mcp',
            data: {
              kind: 'update-available',
              message: oneLine,
              components: notice.components,
              checkedAt: notice.checkedAt,
              docs: 'https://github.com/jordanurbs/venice-video-mcp#staying-up-to-date',
            },
          });
        } catch {
        }
      })
      .catch((cause) => {
        process.stderr.write(
          `[venice-video-mcp] update check failed: ${cause instanceof Error ? cause.message : String(cause)}\n`,
        );
      });
  });
}

main().catch((e) => {
  process.stderr.write(`[venice-video-mcp] fatal: ${e?.stack ?? e}\n`);
  process.exit(1);
});
