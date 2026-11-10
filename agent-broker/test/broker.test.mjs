// node --test agent-broker/test (after `node agent-broker/build.mjs`). No network: only offline behaviour.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const { redact, safeEnvName, commandAllowed, handle, TOOLS } = await import(pathToFileURL(join(dist, 'broker.mjs')).href);

test('redacts every occurrence, longest first', () => {
  assert.equal(redact('user=bob pass=s3cr3t-long s3cr3t', ['s3cr3t', 's3cr3t-long']), 'user=bob pass=[REDACTED] [REDACTED]');
  assert.equal(redact('abc', ['ab']), 'abc', 'secrets shorter than 4 chars are not redacted (too many false hits)');
});

test('env var names: safe identifiers only, reserved names refused', () => {
  assert.equal(safeEnvName(undefined, 'SV_PASSWORD'), 'SV_PASSWORD');
  assert.equal(safeEnvName('DB_PASS', 'X'), 'DB_PASS');
  assert.throws(() => safeEnvName('PATH', 'X'));
  assert.throws(() => safeEnvName('NODE_OPTIONS', 'X'));
  assert.throws(() => safeEnvName('a b', 'X'));
});

test('command allowlist matches the executable name', () => {
  assert.equal(commandAllowed('psql', ''), true);
  assert.equal(commandAllowed('C:/tools/psql.exe', 'psql,git'), true);
  assert.equal(commandAllowed('/usr/bin/curl', 'psql,git'), false);
});

test('MCP: initialize, tools/list, notifications and unknown methods', async () => {
  const init = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.equal(init.result.serverInfo.name, 'securevault-agent-broker');
  const list = await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(list.result.tools.map((t) => t.name), TOOLS.map((t) => t.name));
  assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  const unknown = await handle({ jsonrpc: '2.0', id: 3, method: 'resources/list' });
  assert.equal(unknown.error.code, -32601);
});

test('reveal is refused unless the operator enabled it (no network needed)', async () => {
  const r = await handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'reveal_credential', arguments: { credential_id: 'x' } } }, {});
  assert.equal(r.result.isError, true);
  assert.match(r.result.content[0].text, /disabled/);
});

test('missing configuration is reported as a tool error, not a crash', async () => {
  const r = await handle({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'list_credentials', arguments: {} } }, {});
  assert.equal(r.result.isError, true);
  assert.match(r.result.content[0].text, /Missing SV_SUPABASE_URL/);
});

test('stdio server answers line-delimited JSON-RPC', async () => {
  const child = spawn(process.execPath, [join(dist, 'securevault-mcp.mjs')], { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = [];
  child.stdout.on('data', (b) => lines.push(...b.toString().split('\n').filter(Boolean)));
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`);
  child.stdin.write('not json\n');
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
  await new Promise((r) => setTimeout(r, 1500));
  child.kill();
  const msgs = lines.map((l) => JSON.parse(l));
  assert.ok(msgs.some((m) => m.id === 1 && m.result?.serverInfo));
  assert.ok(msgs.some((m) => m.error?.code === -32700));
  assert.ok(msgs.some((m) => m.id === 2 && m.result?.tools?.length === TOOLS.length));
});
