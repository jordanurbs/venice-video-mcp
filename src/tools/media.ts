import { runHarness, runHarnessScript, launchHarnessServer } from '../harness.js';
import { resolveProjectPath } from '../config.js';
import { fromHarness, ok, err, type ToolContent } from '../responses.js';
import type { MediaInputT } from '../schemas.js';
import { makeProgressEmitter, type ProgressCtx } from '../progress.js';

export async function handleMedia(input: MediaInputT, ctx: ProgressCtx = {}): Promise<ToolContent> {
  try {
    const project = resolveProjectPath(input.project);
    const epArgs = ['-e', String(input.episode)];

    switch (input.action) {
      case 'generate_videos': {
        const args = ['generate-videos', '-p', project, ...epArgs];
        if (input.skipQa) args.push('--skip-qa');
        const emitter = makeProgressEmitter(ctx);
        const r = await runHarness(args, { onProgress: emitter.onLine, signal: ctx.signal, timeoutMs: 45 * 60 * 1000 });
        return fromHarness(r, `generated videos for episode ${input.episode}`, {
          paths: {
            shotsDir: `${project}/episodes/episode-${pad(input.episode)}/scene-001`,
          },
        });
      }
      case 'override_audio': {
        const args = ['override-audio', '-p', project, ...epArgs];
        if (input.dialogue) args.push('--dialogue');
        if (input.sfx) args.push('--sfx');
        const r = await runHarness(args, { signal: ctx.signal, timeoutMs: 20 * 60 * 1000 });
        return fromHarness(r, `audio overrides applied for episode ${input.episode}`);
      }
      case 'generate_music': {
        const args = ['generate-music', '-p', project, ...epArgs, '--duration', String(input.duration)];
        if (input.prompt) args.push('--prompt', input.prompt);
        if (input.model) args.push('--model', input.model);
        if (input.voice) args.push('--voice', input.voice);
        if (input.speed !== undefined) args.push('--speed', String(input.speed));
        const r = await runHarness(args, { signal: ctx.signal, timeoutMs: 15 * 60 * 1000 });
        return fromHarness(r, `music generated for episode ${input.episode}`, {
          paths: {
            musicPath: `${project}/episodes/episode-${pad(input.episode)}/audio/music.mp3`,
          },
        });
      }
      case 'validate': {
        const cmd = input.videoOutputs ? 'validate-video-outputs' : 'validate-episode';
        const args = [cmd, '-p', project, ...epArgs];
        const r = await runHarness(args, { signal: ctx.signal, timeoutMs: 10 * 60 * 1000 });
        return fromHarness(r, `validated episode ${input.episode}`, { data: { tool: cmd } });
      }
      case 'generate_ambient': {
        const episodeDir = `${project}/episodes/episode-${pad(input.episode)}`;
        const audioDir = `${episodeDir}/audio`;
        const outputPath = `${audioDir}/ambient-${input.layer}.mp3`;
        const emitter = makeProgressEmitter(ctx);
        const r = await runHarnessScript(
          'scripts/generate-ambient-bed.ts',
          [input.prompt, outputPath, String(input.duration)],
          {
            onProgress: emitter.onLine,
            signal: ctx.signal,
            timeoutMs: 15 * 60 * 1000,
          },
        );
        if (!r) return err('cannot locate harness root; set HARNESS_PATH or HARNESS_BIN');
        return fromHarness(r, `generated ambient bed "${input.layer}" for episode ${input.episode}`, {
          paths: { ambientPath: outputPath, audioDir },
          data: { layer: input.layer, durationSec: input.duration },
        });
      }
      case 'loop': {
        // Loop mode boots a persistent local web server and blocks forever, so
        // it can't go through runHarness (which waits for exit). Launch it, wait
        // only until it reports the URL, and hand that back — the server keeps
        // running in the background for the rest of the session. Pass --json so
        // the harness emits a machine-readable envelope with the URL, and
        // --no-open so it never tries to spawn a browser from the MCP host.
        const args = ['--json', 'loop', '-p', project, ...epArgs, '--mode', input.mode, '--no-open'];
        if (input.port !== undefined) args.push('--port', String(input.port));
        if (input.resolution) args.push('--resolution', input.resolution);
        if (input.duration) args.push('--duration', input.duration);
        if (input.budget !== undefined) args.push('--budget', String(input.budget));
        if (input.maxTakes !== undefined) args.push('--max-takes', String(input.maxTakes));
        if (input.chain === false) args.push('--no-chain');
        if (input.once) args.push('--once');
        if (input.unbounded) args.push('--unbounded');

        const urlRe = /"url":\s*"([^"]+)"/;
        try {
          const launch = await launchHarnessServer(args, { readyRegex: urlRe, startupTimeoutMs: 60_000 });
          const url = urlRe.exec(launch.stdout)?.[1];
          const purpose = input.mode === 'production'
            ? 'gather usable shots, higher quality (Max R2V @768P, references + voice-donor audio, identity locked)'
            : 'creative flow, lower quality (Turbo 480P, first shot t2v then i2v last-frame chaining, identity NOT locked)';
          return ok(
            `loop mode running (${input.mode}) for episode ${input.episode}. Open ${url ?? 'the URL in data.url'} in a browser to watch — it renders the whole shot script and regenerates fresh takes continuously (money-capped by --budget). It skips the storyboard/QA gates and writes only under the episode's loop/ dir. The web server runs in the background (pid ${launch.pid}); it stops when this MCP session ends, or stop it now with \`kill ${launch.pid}\`.`,
            {
              data: { url, pid: launch.pid, mode: input.mode, purpose, episode: input.episode },
              paths: { loopDir: `${project}/episodes/episode-${pad(input.episode)}/loop` },
            },
          );
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : String(cause);
          return err(`loop failed to start: ${message}`);
        }
      }
      default: {
        const exhaustive: never = input;
        return err(`unknown media action: ${(exhaustive as { action?: string }).action ?? 'unknown'}`);
      }
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return err(`media command rejected: ${message}`);
  }
}

function pad(n: number): string {
  return n.toString().padStart(3, '0');
}
