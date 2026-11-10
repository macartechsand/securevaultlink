/**
 * SecureVault agent broker (docs/product/innovation.md 9.6): an MCP server (stdio) that lets an AI agent
 * use a credential WITHOUT standing access and, by default, without the secret ever entering the model's
 * context.
 *
 * Model: the agent is an ordinary SecureVault account (a dedicated "robot" account) that the owner makes
 * eligible for JIT access (9.1). Every use is a JIT request with a justification; the owner (and, with
 * dual control, the approvers) approve on their own devices, which seal the item key to the agent's
 * public key with a server-enforced deadline. The broker unlocks the agent's own vault locally (zero
 * knowledge: the server never sees a key), opens the item, injects it as environment variables into ONE
 * command it runs (no shell), redacts the secret from the output and ends the access right after.
 *
 * Revealing the secret to the model (tool reveal_credential) is OFF unless SV_ALLOW_REVEAL=1.
 *
 * Config (environment): SV_SUPABASE_URL, SV_SUPABASE_ANON_KEY, SV_AGENT_EMAIL, SV_AGENT_PASSWORD,
 * SV_AGENT_MASTER_PASSWORD, optional SV_AGENT_TOTP (base32, if the agent account uses MFA),
 * SV_ALLOW_REVEAL=1, SV_RUN_TIMEOUT_MS (default 120000), SV_ALLOWED_COMMANDS (comma-separated allowlist of
 * executables; empty = any).
 */
import { spawn } from 'node:child_process';
import { basename } from 'node:path';
import { createInterface } from 'node:readline';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { decryptItem, openSealedItemKey, unlockWithPassword, unwrapUserPrivateKey, type VaultProfile } from '../../web-saas/src/lib/crypto';
import { JIT_REASON_MIN, openJitLabel, sealJitReason } from '../../web-saas/src/lib/jit';
import { normalizeItem } from '../../web-saas/src/lib/items';
import { parseOtp, totpCode } from '../../web-saas/src/lib/totp';

export const SERVER_INFO = { name: 'securevault-agent-broker', version: '0.1.0' };
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

/* ------------------------------------------------------------------ redaction */

/** Replaces every occurrence of each secret (4+ chars) in the text. Longest first, so overlaps go too. */
export function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const s of [...new Set(secrets.filter((x) => x && x.length >= 4))].sort((a, b) => b.length - a.length)) {
    out = out.split(s).join('[REDACTED]');
  }
  return out;
}

/** Env var names must be safe identifiers; reserved names are refused so PATH etc. cannot be hijacked. */
export function safeEnvName(name: string | undefined, fallback: string): string {
  const n = (name ?? '').trim() || fallback;
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(n)) throw new Error(`Invalid env var name: ${n}`);
  if (['PATH', 'HOME', 'USERPROFILE', 'NODE_OPTIONS', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES', 'COMSPEC', 'SHELL'].includes(n)) {
    throw new Error(`Reserved env var name: ${n}`);
  }
  return n;
}

export function commandAllowed(command: string, allowlist: string): boolean {
  const allowed = allowlist
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return true;
  const name = basename(command).toLowerCase().replace(/\.(exe|cmd|bat)$/, '');
  return allowed.includes(name);
}

/* ------------------------------------------------------------------ vault session */

type Session = { client: SupabaseClient; userId: string; publicKey: string; privateKey: CryptoKey };
type Env = Record<string, string | undefined>;

let sessionPromise: Promise<Session> | null = null;

function need(env: Env, key: string): string {
  const v = env[key];
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

async function connect(env: Env): Promise<Session> {
  const client = createClient(need(env, 'SV_SUPABASE_URL'), need(env, 'SV_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: true },
  });
  const { data, error } = await client.auth.signInWithPassword({ email: need(env, 'SV_AGENT_EMAIL'), password: need(env, 'SV_AGENT_PASSWORD') });
  if (error || !data.user) throw new Error(`Sign-in failed: ${error?.message ?? 'no user'}`);
  // Agent account with MFA: reach aal2 with its TOTP (RLS hides the vault at aal1).
  const level = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (level.data?.nextLevel === 'aal2' && level.data.currentLevel !== 'aal2') {
    const secret = need(env, 'SV_AGENT_TOTP');
    const factors = await client.auth.mfa.listFactors();
    const factor = factors.data?.totp?.[0];
    if (!factor) throw new Error('MFA required but no TOTP factor');
    const { code } = await totpCode(parseOtp(secret));
    const verified = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (verified.error) throw new Error(`MFA failed: ${verified.error.message}`);
  }
  const userId = data.user.id;
  const profile = await client.from('vault_profiles').select('version, kdf, wrapped_dek_password').maybeSingle();
  if (profile.error || !profile.data) throw new Error('The agent account has no vault yet: sign in once in the app and create one.');
  const p = profile.data as { version: number; kdf: VaultProfile['kdf']; wrapped_dek_password: string };
  const dek = await unlockWithPassword({ version: p.version, kdf: p.kdf, wrappedDekPassword: p.wrapped_dek_password }, need(env, 'SV_AGENT_MASTER_PASSWORD'));
  const keys = await client.from('user_keys').select('public_key, wrapped_private_key').maybeSingle();
  if (keys.error || !keys.data) throw new Error('The agent account has no sharing keys yet: open its vault once in the app.');
  const k = keys.data as { public_key: string; wrapped_private_key: string };
  const privateKey = await unwrapUserPrivateKey(dek, userId, k.wrapped_private_key);
  return { client, userId, publicKey: k.public_key, privateKey };
}

function session(env: Env) {
  sessionPromise ??= connect(env).catch((err) => {
    sessionPromise = null;
    throw err;
  });
  return sessionPromise;
}

type Eligibility = { id: string; item_id: string; owner_id: string; owner_email: string | null; owner_public_key: string; sealed_label: string; max_minutes: number; approvals_required?: number };
type Request = { id: string; eligibility_id: string; item_id: string; status: string; minutes: number; created_at: string; expires_at: string | null; approvals?: number };

function stateOf(r: Request, now = Date.now()): string {
  if (r.status === 'approved') return r.expires_at && Date.parse(r.expires_at) > now ? 'active' : 'expired';
  return r.status;
}

async function eligibility(s: Session): Promise<Eligibility[]> {
  const { data, error } = await s.client.from('jit_eligibility').select('*').eq('member_id', s.userId);
  if (error) throw new Error(`Could not list credentials: ${error.message}`);
  return (data ?? []) as Eligibility[];
}

async function requests(s: Session): Promise<Request[]> {
  const { data, error } = await s.client.from('jit_requests').select('*').eq('requester_id', s.userId).order('created_at', { ascending: false }).limit(100);
  if (error) throw new Error(`Could not list requests: ${error.message}`);
  return (data ?? []) as Request[];
}

/** Opens the item behind an ACTIVE access: username, password/secret, URL and current OTP code. */
async function openCredential(s: Session, e: Eligibility) {
  const share = await s.client.from('item_shares').select('sealed_key, expires_at, jit_request_id').eq('item_id', e.item_id).eq('recipient_id', s.userId).maybeSingle();
  if (share.error || !share.data) throw new Error('No active access to this credential. Request it and wait for approval.');
  const row = await s.client.from('vault_entries').select('id, user_id, ciphertext, iv, version').eq('id', e.item_id).maybeSingle();
  if (row.error || !row.data) throw new Error('The credential is not visible (access expired or item removed).');
  const sh = share.data as { sealed_key: string; jit_request_id: string | null };
  const key = await openSealedItemKey(s.privateKey, s.publicKey, sh.sealed_key, e.item_id, s.userId);
  const entry = row.data as { id: string; user_id: string; ciphertext: string; iv: string; version: number };
  const data = normalizeItem(await decryptItem(key, entry.user_id, entry.id, entry));
  const otp = data.otp ? (await totpCode(parseOtp(data.otp))).code : '';
  return { requestId: sh.jit_request_id, username: data.username, password: data.password, url: data.url, otp };
}

/* ------------------------------------------------------------------ tools */

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };
const text = (t: string, isError = false): ToolResult => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError } : {}) });

export const TOOLS = [
  {
    name: 'list_credentials',
    description:
      'Lists the credentials this agent may REQUEST (title, user, site, owner, limits) and the state of the latest request. Never returns secrets.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'request_credential_access',
    description:
      'Asks the credential owner for time-limited access. A human must approve on their device. Give a specific reason (who/what/why, at least 20 characters).',
    inputSchema: {
      type: 'object',
      properties: {
        credential_id: { type: 'string', description: 'id from list_credentials' },
        minutes: { type: 'integer', minimum: 15, maximum: 480 },
        reason: { type: 'string', minLength: JIT_REASON_MIN, maxLength: 1000 },
      },
      required: ['credential_id', 'minutes', 'reason'],
      additionalProperties: false,
    },
  },
  {
    name: 'check_access',
    description: 'State of the latest request for a credential: pending, active (with deadline), denied, expired, revoked or cancelled.',
    inputSchema: { type: 'object', properties: { credential_id: { type: 'string' } }, required: ['credential_id'], additionalProperties: false },
  },
  {
    name: 'run_with_credential',
    description:
      'Runs ONE command (no shell) with the approved credential injected as environment variables (default SV_USERNAME, SV_PASSWORD, SV_URL, SV_OTP). The secret is redacted from the output and never returned. By default the access is ended right after the command.',
    inputSchema: {
      type: 'object',
      properties: {
        credential_id: { type: 'string' },
        command: { type: 'string', description: 'Executable (no shell syntax)' },
        args: { type: 'array', items: { type: 'string' }, maxItems: 64 },
        cwd: { type: 'string' },
        username_env: { type: 'string' },
        password_env: { type: 'string' },
        end_access_after: { type: 'boolean', default: true },
      },
      required: ['credential_id', 'command'],
      additionalProperties: false,
    },
  },
  {
    name: 'end_access',
    description: 'Gives the access back before the deadline (recommended when done).',
    inputSchema: { type: 'object', properties: { credential_id: { type: 'string' } }, required: ['credential_id'], additionalProperties: false },
  },
  {
    name: 'reveal_credential',
    description: 'Returns the secret itself to the model. Disabled unless the operator set SV_ALLOW_REVEAL=1. Prefer run_with_credential.',
    inputSchema: { type: 'object', properties: { credential_id: { type: 'string' } }, required: ['credential_id'], additionalProperties: false },
  },
] as const;

async function findEligibility(s: Session, id: unknown): Promise<Eligibility> {
  const e = (await eligibility(s)).find((x) => x.id === id);
  if (!e) throw new Error('Unknown credential_id (use list_credentials).');
  return e;
}

async function latest(s: Session, e: Eligibility) {
  return (await requests(s)).find((r) => r.eligibility_id === e.id) ?? null;
}

function runCommand(command: string, args: string[], cwd: string | undefined, env: NodeJS.ProcessEnv, timeoutMs: number) {
  return new Promise<{ code: number | null; out: string; timedOut: boolean }>((resolve) => {
    const child = spawn(command, args, { cwd, env, shell: false, windowsHide: true });
    let out = '';
    const add = (b: Buffer) => {
      if (out.length < 200_000) out += b.toString('utf8');
    };
    child.stdout.on('data', add);
    child.stderr.on('data', add);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: null, out: `${out}\n${err.message}`, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out, timedOut });
    });
  });
}

export async function callTool(name: string, args: Record<string, unknown>, env: Env = process.env): Promise<ToolResult> {
  try {
    if (name === 'reveal_credential' && env.SV_ALLOW_REVEAL !== '1') {
      return text('reveal_credential is disabled by the operator. Use run_with_credential: the secret goes to the command, not to the model.', true);
    }
    const s = await session(env);
    if (name === 'list_credentials') {
      const [es, rs] = await Promise.all([eligibility(s), requests(s)]);
      const rows = [];
      for (const e of es) {
        let label = { title: 'Protected item', username: '', host: '' };
        try {
          label = await openJitLabel(s.privateKey, s.publicKey, e.sealed_label, e.item_id, s.userId);
        } catch {
          /* unreadable label */
        }
        const last = rs.find((r) => r.eligibility_id === e.id);
        rows.push({
          credential_id: e.id,
          ...label,
          owner: e.owner_email,
          max_minutes: e.max_minutes,
          approvals_required: e.approvals_required ?? 1,
          state: last ? stateOf(last) : 'none',
          active_until: last && stateOf(last) === 'active' ? last.expires_at : null,
        });
      }
      return text(JSON.stringify(rows, null, 2));
    }
    if (name === 'request_credential_access') {
      const e = await findEligibility(s, args.credential_id);
      const minutes = Number(args.minutes);
      const reason = String(args.reason ?? '').trim();
      if (reason.length < JIT_REASON_MIN) return text(`The reason must have at least ${JIT_REASON_MIN} characters.`, true);
      const sealed = await sealJitReason(e.owner_public_key, e.id, e.owner_id, `[agente de IA] ${reason}`);
      const { data, error } = await s.client.rpc('jit_request', { p_eligibility: e.id, p_minutes: minutes, p_sealed_reason: sealed });
      if (error) return text(`Request refused: ${error.message}`, true);
      return text(
        `Request ${data} sent. A human must approve it on their device${(e.approvals_required ?? 1) > 1 ? ` (${e.approvals_required} approvals)` : ''}. Call check_access later; do not retry in a loop.`,
      );
    }
    if (name === 'check_access') {
      const e = await findEligibility(s, args.credential_id);
      const r = await latest(s, e);
      if (!r) return text('No request yet.');
      return text(JSON.stringify({ state: stateOf(r), minutes: r.minutes, approvals: r.approvals ?? null, active_until: r.expires_at }, null, 2));
    }
    if (name === 'end_access') {
      const e = await findEligibility(s, args.credential_id);
      const r = await latest(s, e);
      if (!r || !['pending', 'active'].includes(stateOf(r))) return text('Nothing to end.');
      const { error } = await s.client.rpc('jit_end', { p_request: r.id });
      if (error) return text(`Could not end: ${error.message}`, true);
      return text('Access ended.');
    }
    if (name === 'reveal_credential') {
      const e = await findEligibility(s, args.credential_id);
      const c = await openCredential(s, e);
      return text(JSON.stringify({ username: c.username, password: c.password, url: c.url, otp: c.otp || undefined }));
    }
    if (name === 'run_with_credential') {
      const e = await findEligibility(s, args.credential_id);
      const command = String(args.command ?? '');
      if (!command || /[\s;&|<>`$]/.test(basename(command))) return text('Give a single executable name or path (no shell syntax).', true);
      if (!commandAllowed(command, env.SV_ALLOWED_COMMANDS ?? '')) return text('This command is not in the operator allowlist (SV_ALLOWED_COMMANDS).', true);
      const argv = Array.isArray(args.args) ? args.args.map(String).slice(0, 64) : [];
      const userVar = safeEnvName(args.username_env as string | undefined, 'SV_USERNAME');
      const passVar = safeEnvName(args.password_env as string | undefined, 'SV_PASSWORD');
      const c = await openCredential(s, e);
      const childEnv: NodeJS.ProcessEnv = { ...process.env, [userVar]: c.username, [passVar]: c.password, SV_URL: c.url };
      if (c.otp) childEnv.SV_OTP = c.otp;
      // The broker's own secrets never reach the child.
      for (const k of Object.keys(childEnv)) if (k.startsWith('SV_AGENT_') || k === 'SV_SUPABASE_ANON_KEY') delete childEnv[k];
      const result = await runCommand(command, argv, typeof args.cwd === 'string' ? args.cwd : undefined, childEnv, Number(env.SV_RUN_TIMEOUT_MS ?? 120_000));
      let ended = '';
      if (args.end_access_after !== false && c.requestId) {
        const { error } = await s.client.rpc('jit_end', { p_request: c.requestId });
        ended = error ? `\n(access NOT ended: ${error.message})` : '\n(access ended)';
      }
      const output = redact(result.out, [c.password, c.otp]).slice(-20_000);
      return text(`exit code: ${result.code}${result.timedOut ? ' (timed out)' : ''}${ended}\n--- output (secrets redacted) ---\n${output}`, result.code !== 0);
    }
    return text(`Unknown tool: ${name}`, true);
  } catch (err) {
    return text(err instanceof Error ? err.message : 'Error', true);
  }
}

/* ------------------------------------------------------------------ MCP over stdio (JSON-RPC 2.0, one message per line) */

type RpcMessage = { jsonrpc: '2.0'; id?: string | number | null; method?: string; params?: Record<string, unknown> };

export async function handle(message: RpcMessage, env: Env = process.env): Promise<object | null> {
  const { id, method, params } = message;
  const reply = (result: unknown) => ({ jsonrpc: '2.0', id, result });
  const fail = (code: number, msg: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message: msg } });
  if (!method) return null;
  if (id === undefined || id === null) return null; // notifications (e.g. notifications/initialized)
  switch (method) {
    case 'initialize': {
      const asked = String(params?.protocolVersion ?? '');
      return reply({
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          'Credentials are released only after a human approves a time-limited request. Prefer run_with_credential: the secret is injected into the command and redacted from the output.',
      });
    }
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: TOOLS });
    case 'tools/call': {
      const name = String(params?.name ?? '');
      if (!TOOLS.some((t) => t.name === name)) return fail(-32602, `Unknown tool: ${name}`);
      return reply(await callTool(name, (params?.arguments as Record<string, unknown>) ?? {}, env));
    }
    default:
      return fail(-32601, `Method not found: ${method}`);
  }
}

export function serve(input = process.stdin, output = process.stdout) {
  const rl = createInterface({ input, crlfDelay: Infinity });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let message: RpcMessage;
    try {
      message = JSON.parse(line) as RpcMessage;
    } catch {
      output.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
      return;
    }
    void handle(message).then((response) => {
      if (response) output.write(`${JSON.stringify(response)}\n`);
    });
  });
}
