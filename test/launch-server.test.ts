// Tests for launchHarnessServer — the persistent-server launch path used by
// `media.loop`. Loop mode boots a web server that blocks forever, so the helper
// must resolve as soon as the server reports its URL (never wait for exit),
// reject cleanly when the process dies before readiness, and time out rather
// than hang. We point HARNESS_BIN at a tiny fake "server" so none of this
// touches Venice or spends money.

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A fake harness whose behavior is chosen by an argv keyword:
//   READY  → print a --json-style envelope with a url, then block (a live server)
//   FAIL   → print an error envelope and exit 1 (startup failure)
//   SILENT → block forever without ever printing a url (hung startup)
const FAKE = `
const mode = process.argv.includes('FAIL') ? 'fail'
  : process.argv.includes('SILENT') ? 'silent' : 'ready';
if (mode === 'fail') {
  process.stdout.write(JSON.stringify({ ok: false, error: 'boom' }, null, 2) + '\\n');
  process.exit(1);
} else if (mode === 'silent') {
  setInterval(() => {}, 1 << 30);
} else {
  process.stdout.write(JSON.stringify({ ok: true, url: 'http://127.0.0.1:3999/?tab=Loop' }, null, 2) + '\\n');
  setInterval(() => {}, 1 << 30);
}
`;

const dir = mkdtempSync(join(tmpdir(), 'vvm-launch-'));
const fakeBin = join(dir, 'fake-harness.mjs');
writeFileSync(fakeBin, FAKE, 'utf8');

// Must be set before the config module resolves/caches the harness binary.
process.env.HARNESS_BIN = fakeBin;
process.env.HARNESS_WORKSPACE = dir;

const { launchHarnessServer } = await import('../src/harness.js');
const URL_RE = /"url":\s*"([^"]+)"/;

test.after(() => rmSync(dir, { recursive: true, force: true }));

test('resolves as soon as the server reports its URL (does not wait for exit)', async () => {
  const launch = await launchHarnessServer(['READY'], { readyRegex: URL_RE, startupTimeoutMs: 5000 });
  try {
    assert.ok(launch.pid > 0, 'a real pid is returned');
    assert.match(launch.matched, /http:\/\/127\.0\.0\.1:3999/);
    assert.equal(URL_RE.exec(launch.stdout)?.[1], 'http://127.0.0.1:3999/?tab=Loop');
  } finally {
    // The server is intentionally still running; stop it so the test exits.
    try { process.kill(launch.pid); } catch { /* already gone */ }
  }
});

test('rejects when the process exits before reporting ready', async () => {
  await assert.rejects(
    launchHarnessServer(['FAIL'], { readyRegex: URL_RE, startupTimeoutMs: 5000 }),
    /exited before reporting ready/,
  );
});

test('rejects (and kills the child) when startup exceeds the timeout', async () => {
  await assert.rejects(
    launchHarnessServer(['SILENT'], { readyRegex: URL_RE, startupTimeoutMs: 800 }),
    /did not report ready/,
  );
});
