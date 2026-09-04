import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getHarnessConfig, getHarnessRoot, getVeniceApiKey } from './config.js';
import { LineBuffer } from './line-buffer.js';

export interface HarnessRunOptions {
  onProgress?: (line: string, stream: 'stdout' | 'stderr') => void;
  cwd?: string;
  env?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface HarnessResult {
  ok: boolean;
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  command: string;
  durationMs: number;
}

/**
 * Invoke a user-supplied progress callback without letting a thrown error
 * escape into the stdio `'data'` / `'close'` event handlers. Used by both
 * `runHarness` and `runHarnessScript` so they have identical robustness
 * guarantees — historically `runHarnessScript` invoked `onProgress` directly,
 * so a throwing callback would propagate out of the stream handler.
 */
export function invokeProgressSafely(
  onProgress: ((line: string, stream: 'stdout' | 'stderr') => void) | undefined,
  line: string,
  stream: 'stdout' | 'stderr',
): void {
  if (!onProgress) return;
  try {
    onProgress(line, stream);
  } catch {
  }
}

const SAFE_ENV_KEYS = [
  'ALL_PROXY',
  'CI',
  'COLORTERM',
  'FORCE_COLOR',
  'HARNESS_BIN',
  'HARNESS_PATH',
  'HARNESS_WORKSPACE',
  'HOME',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'LOGNAME',
  'NODE_EXTRA_CA_CERTS',
  'NO_COLOR',
  'NO_PROXY',
  'PATH',
  'SHELL',
  'SSL_CERT_DIR',
  'SSL_CERT_FILE',
  'TEMP',
  'TERM',
  'TMP',
  'TMPDIR',
  'TZ',
  'USER',
  'VENICE_API_KEY',
  'XDG_CACHE_HOME',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_RUNTIME_DIR',
] as const;

export async function runHarness(
  args: string[],
  opts: HarnessRunOptions = {},
): Promise<HarnessResult> {
  const cfg = getHarnessConfig();
  const fullArgs = [...cfg.args, ...args];
  const start = Date.now();

  const env = buildHarnessEnv(opts.env);

  return new Promise<HarnessResult>((resolvePromise, reject) => {
    const child = spawn(cfg.bin, fullArgs, {
      cwd: opts.cwd ?? cfg.cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const MAX_CAPTURE_CHARS = 200_000;
    let stdoutText = '';
    let stderrText = '';
    const stdoutBuf = new LineBuffer();
    const stderrBuf = new LineBuffer();
    let timedOut = false;
    const appendBounded = (existing: string, chunk: string): string => {
      if (chunk.length >= MAX_CAPTURE_CHARS) return chunk.slice(-MAX_CAPTURE_CHARS);
      const combined = existing + chunk;
      if (combined.length <= MAX_CAPTURE_CHARS) return combined;
      return combined.slice(combined.length - MAX_CAPTURE_CHARS);
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdoutText = appendBounded(stdoutText, chunk);
      for (const line of stdoutBuf.push(chunk)) invokeProgressSafely(opts.onProgress, line, 'stdout');
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderrText = appendBounded(stderrText, chunk);
      for (const line of stderrBuf.push(chunk)) invokeProgressSafely(opts.onProgress, line, 'stderr');
    });

    let timeoutHandle: NodeJS.Timeout | null = null;
    if (opts.timeoutMs && opts.timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5000).unref();
      }, opts.timeoutMs);
    }

    if (opts.signal) {
      if (opts.signal.aborted) child.kill('SIGTERM');
      opts.signal.addEventListener('abort', () => child.kill('SIGTERM'), { once: true });
    }

    child.on('error', (err) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reject(err);
    });

    child.on('close', (code, sig) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      const trailingStdout = stdoutBuf.flush();
      if (trailingStdout) invokeProgressSafely(opts.onProgress, trailingStdout, 'stdout');
      const trailingStderr = stderrBuf.flush();
      if (trailingStderr) invokeProgressSafely(opts.onProgress, trailingStderr, 'stderr');

      const result: HarnessResult = {
        ok: code === 0 && !timedOut,
        code,
        signal: sig,
        stdout: stdoutText,
        stderr: stderrText,
        command: `${cfg.bin} ${fullArgs.join(' ')}`,
        durationMs: Date.now() - start,
      };
      resolvePromise(result);
    });
  });
}

export function harnessRoot(): string | null {
  return getHarnessRoot();
}

/**
 * Persistent harness servers (currently only `loop`) launched via MCP. Held in
 * a module-level set so they are not garbage-collected and so their lifecycle
 * is tied to THIS MCP process: they are ordinary attached children (not
 * detached), so when the MCP server stops — e.g. the client closes — they stop
 * too. No orphaned web server keeps spending on a port the user forgot about.
 */
const liveServers = new Set<ChildProcess>();

/** Best-effort SIGTERM to every server this process launched. */
export function stopLiveServers(): void {
  for (const child of liveServers) {
    try { child.kill('SIGTERM'); } catch { /* already gone */ }
  }
  liveServers.clear();
}

export interface ServerLaunch {
  /** OS pid of the running server (so a human can `kill` it if they want). */
  pid: number;
  /** The stdout substring that matched `readyRegex` (usually carries the URL). */
  matched: string;
  stdout: string;
  stderr: string;
  command: string;
}

function tailLines(s: string, lines: number): string {
  const arr = s.split('\n');
  return arr.slice(Math.max(0, arr.length - lines)).join('\n').trim();
}

/**
 * Launch a harness command that starts a PERSISTENT server (e.g. `loop`, which
 * boots the local web UI and then blocks forever) and resolve as soon as it
 * reports ready — rather than waiting for it to exit, which never happens.
 *
 * The child is left running, attached to this process, so it lives for the
 * session and is cleaned up with the MCP server (see `liveServers`). Rejects if
 * the process exits before readiness, errors, or the startup window elapses.
 */
export async function launchHarnessServer(
  args: string[],
  opts: {
    readyRegex: RegExp;
    startupTimeoutMs?: number;
    env?: Record<string, string>;
    cwd?: string;
  },
): Promise<ServerLaunch> {
  const cfg = getHarnessConfig();
  const fullArgs = [...cfg.args, ...args];
  const env = buildHarnessEnv(opts.env);
  const startupTimeoutMs = opts.startupTimeoutMs ?? 30_000;
  const command = `${cfg.bin} ${fullArgs.join(' ')}`;

  return new Promise<ServerLaunch>((resolvePromise, reject) => {
    const child = spawn(cfg.bin, fullArgs, {
      cwd: opts.cwd ?? cfg.cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const MAX_CAPTURE_CHARS = 200_000;
    let stdoutText = '';
    let stderrText = '';
    let settled = false;
    const appendBounded = (existing: string, chunk: string): string => {
      const combined = existing + chunk;
      return combined.length <= MAX_CAPTURE_CHARS ? combined : combined.slice(-MAX_CAPTURE_CHARS);
    };

    const timeoutHandle = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 3000).unref();
      reject(new Error(
        `server did not report ready within ${Math.round(startupTimeoutMs / 1000)}s\n`
        + tailLines(stderrText || stdoutText, 20),
      ));
    }, startupTimeoutMs);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      // After readiness we keep the listener attached purely to drain the pipe
      // (a full OS buffer would block the child); we just stop inspecting it.
      if (settled) return;
      stdoutText = appendBounded(stdoutText, chunk);
      const match = opts.readyRegex.exec(stdoutText);
      if (!match) return;
      settled = true;
      clearTimeout(timeoutHandle);
      liveServers.add(child);
      child.once('exit', () => liveServers.delete(child));
      resolvePromise({
        pid: child.pid ?? -1,
        matched: match[0],
        stdout: stdoutText,
        stderr: stderrText,
        command,
      });
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      if (settled) return;
      stderrText = appendBounded(stderrText, chunk);
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      reject(err);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      reject(new Error(
        `server exited before reporting ready (exit ${code ?? 'null'})\n`
        + tailLines(stderrText || stdoutText, 30),
      ));
    });
  });
}

export function buildHarnessEnv(extraEnv: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of SAFE_ENV_KEYS) {
    const value = process.env[key];
    if (typeof value === 'string' && value.length > 0) out[key] = value;
  }
  for (const [k, v] of Object.entries(extraEnv)) {
    if (typeof v === 'string') out[k] = v;
  }
  const apiKey = getVeniceApiKey();
  if (apiKey && !out.VENICE_API_KEY) out.VENICE_API_KEY = apiKey;
  return out;
}

/**
 * Run an arbitrary `scripts/*.ts` file inside the harness repo through the
 * harness's own local `tsx`. Used by tools that need to invoke utility
 * scripts that aren't part of the main mini-drama CLI (transcription,
 * overlay render, timeline view, ambient-bed gen, scripted audio mix).
 *
 * Returns `null` when the harness root or tsx binary can't be located, so
 * callers can surface a "set HARNESS_PATH" error instead of crashing.
 */
export async function runHarnessScript(
  rel: string,
  args: string[],
  opts: HarnessRunOptions = {},
): Promise<HarnessResult | null> {
  const root = harnessRoot();
  if (!root) return null;
  const scriptPath = join(root, rel);
  if (!existsSync(scriptPath)) return null;

  const tsxBin = resolveTsx(root);
  if (!tsxBin) return null;

  const start = Date.now();
  const env = buildHarnessEnv(opts.env ?? {});

  return new Promise<HarnessResult>((resolvePromise, reject) => {
    const child = spawn(tsxBin, [scriptPath, ...args], {
      cwd: opts.cwd ?? root,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const MAX_CAPTURE_CHARS = 200_000;
    let stdoutText = '';
    let stderrText = '';
    const stdoutBuf = new LineBuffer();
    const stderrBuf = new LineBuffer();
    let timedOut = false;
    const appendBounded = (existing: string, chunk: string): string => {
      if (chunk.length >= MAX_CAPTURE_CHARS) return chunk.slice(-MAX_CAPTURE_CHARS);
      const combined = existing + chunk;
      if (combined.length <= MAX_CAPTURE_CHARS) return combined;
      return combined.slice(combined.length - MAX_CAPTURE_CHARS);
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdoutText = appendBounded(stdoutText, chunk);
      for (const line of stdoutBuf.push(chunk)) invokeProgressSafely(opts.onProgress, line, 'stdout');
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderrText = appendBounded(stderrText, chunk);
      for (const line of stderrBuf.push(chunk)) invokeProgressSafely(opts.onProgress, line, 'stderr');
    });

    let timeoutHandle: NodeJS.Timeout | null = null;
    if (opts.timeoutMs && opts.timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5000).unref();
      }, opts.timeoutMs);
    }
    if (opts.signal) {
      if (opts.signal.aborted) child.kill('SIGTERM');
      opts.signal.addEventListener('abort', () => child.kill('SIGTERM'), { once: true });
    }

    child.on('error', (cause) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reject(cause);
    });
    child.on('close', (code, sig) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      const trailingStdout = stdoutBuf.flush();
      if (trailingStdout) invokeProgressSafely(opts.onProgress, trailingStdout, 'stdout');
      const trailingStderr = stderrBuf.flush();
      if (trailingStderr) invokeProgressSafely(opts.onProgress, trailingStderr, 'stderr');
      resolvePromise({
        ok: code === 0 && !timedOut,
        code,
        signal: sig,
        stdout: stdoutText,
        stderr: stderrText,
        command: `${tsxBin} ${scriptPath} ${args.join(' ')}`,
        durationMs: Date.now() - start,
      });
    });
  });
}

function resolveTsx(harnessDir: string): string | null {
  const local = join(harnessDir, 'node_modules', '.bin', 'tsx');
  if (existsSync(local)) return local;
  return null;
}
